/**
 * Orchestrator — runs an adapter, pipes every candidate through the pipeline,
 * records the run to scraper_runs, and triggers a post-run URL check sweep.
 */

import { db, scraperRunsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ingest } from "./pipeline.js";
import { runUrlCheckSweep } from "./url-checker.js";
import type { RegisteredAdapter } from "./adapters/types.js";

import { gemAdapter } from "./adapters/gem.js";
import { worldBankAdapter } from "./adapters/world-bank.js";
import { afdbAdapter } from "./adapters/afdb.js";
import { ifcAdapter } from "./adapters/ifc.js";
import { dfcAdapter } from "./adapters/dfc.js";
import { gcfAdapter } from "./adapters/gcf.js";
import { aidDataAdapter } from "./adapters/aiddata.js";
import { newsAdapter } from "./adapters/news.js";
import { GOV_ADAPTERS } from "./adapters/gov/index.js";

export const ADAPTERS: RegisteredAdapter[] = [
  // GEM group
  gemAdapter,
  // World Bank group
  worldBankAdapter,
  // Multilateral group
  afdbAdapter,
  ifcAdapter,
  dfcAdapter,
  gcfAdapter,
  aidDataAdapter,
  // Government group (11 country-specific adapters)
  ...GOV_ADAPTERS,
  // News group
  newsAdapter,
];

export function getAdapter(key: string): RegisteredAdapter | undefined {
  return ADAPTERS.find((a) => a.config.key === key);
}

export interface RunReport {
  adapter: string;
  recordsFound: number;
  inserted: number;
  updated: number;
  flagged: number;
  rejected: number;
  errors: string[];
  durationMs: number;
}

export type ProgressFn = (msg: string) => void;

export async function runAdapter(
  adapter: RegisteredAdapter,
  triggeredBy: "manual" | "schedule" = "manual",
  onProgress?: ProgressFn,
): Promise<RunReport> {
  const startedAt = new Date();
  onProgress?.(`[${adapter.config.key}] Starting ${adapter.config.label}…`);

  const [runRow] = await db.insert(scraperRunsTable).values({
    sourceName: adapter.config.key,
    adapterKey: adapter.config.key,
    startedAt,
    triggeredBy,
  }).returning();

  let inserted = 0;
  let updated = 0;
  let flagged = 0;
  let rejected = 0;
  let recordsFound = 0;
  let errors: string[] = [];

  try {
    const result = await adapter.run();
    recordsFound = result.candidates.length;
    errors = result.errors;
    onProgress?.(`[${adapter.config.key}] Fetched ${recordsFound} candidates (filtered ${result.meta.filteredOut})`);

    for (const candidate of result.candidates) {
      try {
        const r = await ingest(candidate, adapter.config.key);
        if (r.inserted) inserted++;
        if (r.updated) updated++;
        if (r.flagged) flagged++;
        if (!r.inserted && !r.updated) rejected++;
      } catch (e) {
        errors.push(`ingest "${candidate.projectName}": ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    errors.push(`run: ${e instanceof Error ? e.message : String(e)}`);
  }

  const completedAt = new Date();

  await db.update(scraperRunsTable).set({
    completedAt,
    recordsFound,
    recordsInserted: inserted,
    recordsUpdated: updated,
    flaggedForReview: flagged,
    errors: errors.length > 0 ? errors.slice(0, 50).join("\n") : null,
  }).where(eq(scraperRunsTable.id, runRow.id));

  // ── Post-run URL sweep (fire-and-forget would be nice, but await so the
  // report includes accurate progress for SSE consumers). Cap small.
  if (inserted > 0) {
    try {
      const sweep = await runUrlCheckSweep({ batchSize: 50, delayMs: 300 });
      onProgress?.(`[${adapter.config.key}] URL sweep: ${sweep.valid}/${sweep.checked} valid, ${sweep.broken} broken, ${sweep.blocked} blocked`);
    } catch (e) {
      errors.push(`url sweep: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const report: RunReport = {
    adapter: adapter.config.key,
    recordsFound,
    inserted,
    updated,
    flagged,
    rejected,
    errors,
    durationMs: completedAt.getTime() - startedAt.getTime(),
  };
  onProgress?.(`[${adapter.config.key}] Done: ${inserted} new, ${updated} updated, ${flagged} flagged, ${rejected} rejected`);
  return report;
}

export async function runAllAdapters(
  triggeredBy: "manual" | "schedule" = "manual",
  onProgress?: ProgressFn,
): Promise<RunReport[]> {
  const reports: RunReport[] = [];
  for (const adapter of ADAPTERS) {
    try {
      reports.push(await runAdapter(adapter, triggeredBy, onProgress));
    } catch (e) {
      onProgress?.(`[${adapter.config.key}] FATAL: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return reports;
}
