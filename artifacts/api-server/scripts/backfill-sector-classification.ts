#!/usr/bin/env tsx
/**
 * Backfill script: sector classification pass over existing energy_projects rows.
 *
 * Allowed mutations (the ONLY changes made to the DB):
 *   1. technology = 'Bioenergy'          → 'Biomass'
 *   2. technology = 'Grid Expansion'     → 'Transmission & Distribution'
 *   3. technology = 'Battery & Storage'  → 'Battery Storage'
 *   4. technology = 'Hydrogen'           → 'Green Hydrogen'
 *   5. DELETE energy_projects WHERE reviewStatus = 'rejected'
 *      AND classifyEnergySector returns null (existing junk from WB adapter)
 *
 * Everything else is review-only — rows are written to /tmp/sector-backfill-report.json
 * for Daniel to inspect before any manual cleanup.
 *
 * Run: pnpm --filter @workspace/api-server tsx scripts/backfill-sector-classification.ts
 */

import { db, projectsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { classifyEnergySector } from "../src/services/sector-classifier.js";
import { isEnergySector } from "@workspace/shared";
import * as fs from "node:fs/promises";
import * as path from "node:path";

interface BackfillRow {
  id: number;
  projectName: string;
  technology: string | null;
  description: string | null;
  reviewStatus: string;
}

interface ReportEntry {
  id: number;
  projectName: string;
  existingTechnology: string | null;
  classifierSector: string | null;
  rejectionReason?: string;
  verdict: "confirmed_match" | "mismatch" | "rejected" | "name_normalized" | "hard_deleted";
}

async function main() {
  console.log("[Backfill] Starting sector classification backfill…");

  // ── Step 1: Name normalization (the only write mutations besides deletes) ──
  const NORMALIZATIONS: Array<{ from: string; to: string }> = [
    { from: "Bioenergy",        to: "Biomass" },
    { from: "Grid Expansion",   to: "Transmission & Distribution" },
    { from: "Battery & Storage", to: "Battery Storage" },
    { from: "Hydrogen",         to: "Green Hydrogen" },
  ];

  let totalNormalized = 0;
  for (const { from, to } of NORMALIZATIONS) {
    const rows = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.technology, from));

    if (rows.length > 0) {
      await db.update(projectsTable).set({ technology: to }).where(eq(projectsTable.technology, from));
      console.log(`[Backfill] Normalized '${from}' → '${to}': ${rows.length} rows`);
      totalNormalized += rows.length;
    }
  }

  // ── Step 2: Load all rows for classification pass ─────────────────────────
  const allRows = await db
    .select({
      id: projectsTable.id,
      projectName: projectsTable.projectName,
      technology: projectsTable.technology,
      description: projectsTable.description,
      reviewStatus: projectsTable.reviewStatus,
    })
    .from(projectsTable);

  console.log(`[Backfill] Loaded ${allRows.length} rows for classification pass`);

  // ── Step 3: Run each row through the classifier ───────────────────────────
  const report: ReportEntry[] = [];
  const deletionCandidates: number[] = [];
  const reasonCounts: Record<string, number> = {};

  for (const row of allRows as BackfillRow[]) {
    const gateResult = classifyEnergySector({
      title: row.projectName,
      description: row.description ?? undefined,
      extractedTechnology: row.technology ?? undefined,
    });

    if (gateResult.sector === null) {
      const reason = gateResult.rejectionReason ?? "no_sector_signal";
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;

      if (row.reviewStatus === "rejected") {
        // Mark for hard deletion — these are the junk World Bank rows
        deletionCandidates.push(row.id);
        report.push({
          id: row.id,
          projectName: row.projectName,
          existingTechnology: row.technology,
          classifierSector: null,
          rejectionReason: reason,
          verdict: "hard_deleted",
        });
      } else {
        report.push({
          id: row.id,
          projectName: row.projectName,
          existingTechnology: row.technology,
          classifierSector: null,
          rejectionReason: reason,
          verdict: "rejected",
        });
      }
    } else if (row.technology && isEnergySector(row.technology) && gateResult.sector === row.technology) {
      report.push({
        id: row.id,
        projectName: row.projectName,
        existingTechnology: row.technology,
        classifierSector: gateResult.sector,
        verdict: "confirmed_match",
      });
    } else {
      report.push({
        id: row.id,
        projectName: row.projectName,
        existingTechnology: row.technology,
        classifierSector: gateResult.sector,
        verdict: "mismatch",
      });
    }
  }

  // ── Step 4: Hard-delete rejected-status junk rows ─────────────────────────
  let hardDeletedCount = 0;
  if (deletionCandidates.length > 0) {
    console.log(`[Backfill] Hard-deleting ${deletionCandidates.length} rejected-status non-energy rows…`);
    for (const id of deletionCandidates) {
      await db.delete(projectsTable).where(eq(projectsTable.id, id));
      hardDeletedCount++;
    }
    console.log(`[Backfill] Hard-deleted ${hardDeletedCount} rows`);
  }

  // ── Step 5: Duplicate detection (by projectName, case-insensitive) ────────
  const nameCounts: Record<string, number[]> = {};
  for (const row of allRows as BackfillRow[]) {
    const key = row.projectName.toLowerCase().trim();
    if (!nameCounts[key]) nameCounts[key] = [];
    nameCounts[key].push(row.id);
  }
  const duplicates = Object.entries(nameCounts)
    .filter(([, ids]) => ids.length > 1)
    .map(([name, ids]) => ({ name, ids, count: ids.length }));

  // ── Step 6: Write report ──────────────────────────────────────────────────
  const reviewOnly = report.filter((r) => r.verdict === "mismatch" || r.verdict === "rejected");
  const fullReport = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalRows: allRows.length,
      nameDriftFixed: totalNormalized,
      confirmedMatch: report.filter((r) => r.verdict === "confirmed_match").length,
      mismatch: report.filter((r) => r.verdict === "mismatch").length,
      gateRejected: report.filter((r) => r.verdict === "rejected").length,
      hardDeleted: hardDeletedCount,
      duplicateGroups: duplicates.length,
      rejectionReasonBreakdown: reasonCounts,
    },
    reviewEntries: reviewOnly,
    duplicates,
    hardDeletedLog: report.filter((r) => r.verdict === "hard_deleted"),
  };

  const reportPath = "/tmp/sector-backfill-report.json";
  await fs.writeFile(reportPath, JSON.stringify(fullReport, null, 2), "utf8");

  // ── Step 7: Print summary ─────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║           Backfill Summary                          ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Total rows processed:     ${fullReport.summary.totalRows}`);
  console.log(`  Name-drift fixes applied: ${fullReport.summary.nameDriftFixed}`);
  console.log(`  Confirmed matches:        ${fullReport.summary.confirmedMatch}`);
  console.log(`  Mismatches (review):      ${fullReport.summary.mismatch}`);
  console.log(`  Gate-rejected (review):   ${fullReport.summary.gateRejected}`);
  console.log(`  Hard-deleted (junk):      ${fullReport.summary.hardDeleted}`);
  console.log(`  Duplicate groups found:   ${fullReport.summary.duplicateGroups}`);
  console.log("\n  Rejection reason breakdown:");
  for (const [reason, cnt] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${reason}: ${cnt}`);
  }
  if (duplicates.length > 0) {
    console.log(`\n  Notable duplicate groups (flag for deduplication):`);
    duplicates.slice(0, 5).forEach(({ name, ids }) =>
      console.log(`    "${name}" — ids: ${ids.join(", ")}`),
    );
  }
  console.log(`\n  Full report written to: ${reportPath}`);
  console.log("\n[Backfill] Done.\n");
}

main().catch((err) => {
  console.error("[Backfill] FATAL:", err);
  process.exit(1);
});
