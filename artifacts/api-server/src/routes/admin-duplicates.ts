import { Router } from "express";
import {
  db,
  projectsTable,
  urlAuditTable,
  contributorSubmissionsTable,
  reviewerAuditLogTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { adminAuthMiddleware } from "../middleware/adminAuth.js";

const router = Router();

router.use("/admin/duplicates", adminAuthMiddleware);
router.use("/admin/projects/merge", adminAuthMiddleware);

// GET /api/admin/duplicates — scan for likely duplicate project pairs using pg_trgm
router.get("/admin/duplicates", async (req, res) => {
  try {
    const threshold = Math.max(0.3, Math.min(0.95, parseFloat(String(req.query.threshold ?? "0.6"))));
    // Use sql.raw for the threshold literal to avoid any type-inference issues
    // that can arise when node-postgres sends $1 without an explicit type OID
    const thresholdLiteral = sql.raw(threshold.toFixed(4));

    const results = await db.execute(sql`
      SELECT
        a.id            AS id_a,
        a.project_name  AS name_a,
        a.country       AS country_a,
        a.developer     AS developer_a,
        a.capacity_mw   AS capacity_a,
        a.deal_size_usd_mn AS deal_size_a,
        a.review_status AS status_a,
        b.id            AS id_b,
        b.project_name  AS name_b,
        b.country       AS country_b,
        b.developer     AS developer_b,
        b.capacity_mw   AS capacity_b,
        b.deal_size_usd_mn AS deal_size_b,
        b.review_status AS status_b,
        ROUND((similarity(
          COALESCE(a.normalized_name, lower(a.project_name)),
          COALESCE(b.normalized_name, lower(b.project_name))
        ) * 100)::numeric, 1) AS score
      FROM energy_projects a
      JOIN energy_projects b
        ON a.id < b.id
        AND lower(a.country) = lower(b.country)
      WHERE similarity(
        COALESCE(a.normalized_name, lower(a.project_name)),
        COALESCE(b.normalized_name, lower(b.project_name))
      ) > ${thresholdLiteral}
      ORDER BY similarity(
        COALESCE(a.normalized_name, lower(a.project_name)),
        COALESCE(b.normalized_name, lower(b.project_name))
      ) DESC
      LIMIT 200
    `);

    res.json({ pairs: results.rows, count: results.rows.length, threshold });
  } catch (err: any) {
    const message = err?.cause?.message ?? err?.message ?? String(err);
    console.error("[DuplicateScanner] Query failed:", message);
    res.status(500).json({ error: `Duplicate scan failed: ${message}` });
  }
});

// POST /api/admin/projects/merge — merge removeId into keepId
// (a) gap-fill: copy non-null remove fields → keep where keep is null
// (b) update FK references: contributor_submissions + url_audit
// (c) delete removeId
// (d) audit log
router.post("/admin/projects/merge", async (req, res) => {
  try {
    const { keepId, removeId } = req.body as { keepId?: number; removeId?: number };
    if (!keepId || !removeId || keepId === removeId) {
      return res.status(400).json({ error: "keepId and removeId are required and must differ" });
    }

    const [keep] = await db.select().from(projectsTable).where(eq(projectsTable.id, keepId)).limit(1);
    const [remove] = await db.select().from(projectsTable).where(eq(projectsTable.id, removeId)).limit(1);
    if (!keep) return res.status(404).json({ error: `Project ${keepId} not found` });
    if (!remove) return res.status(404).json({ error: `Project ${removeId} not found` });

    // Gap-fill: copy non-null values from remove → keep only when keep column is null
    const fillableColumns = [
      "region", "technology", "dealSizeUsdMn", "investors", "status",
      "description", "latitude", "longitude", "capacityMw", "announcedYear",
      "closedYear", "sourceUrl", "newsUrl", "newsUrl2", "dealStage", "developer",
      "financiers", "dfiInvolvement", "offtaker", "financialCloseDate",
      "commissioningDate", "announcementDate", "debtEquitySplit", "grantComponent",
      "financingType", "financingSubTypes", "concessionalTerms", "ppaTermYears",
      "ppaTariffUsdKwh", "guarantor", "climateFinanceTag", "confidenceScore",
      "extractionSource", "submittedByContributorId", "communitySubmissionId",
      "approvedBy", "normalizedName",
    ] as const;

    const fillUpdates: Record<string, unknown> = {};
    for (const col of fillableColumns) {
      if ((keep as any)[col] === null && (remove as any)[col] !== null) {
        fillUpdates[col] = (remove as any)[col];
      }
    }

    if (Object.keys(fillUpdates).length > 0) {
      await db.update(projectsTable).set(fillUpdates).where(eq(projectsTable.id, keepId));
    }

    // Update FK references: contributor_submissions.linked_project_id
    await db.execute(sql`
      UPDATE contributor_submissions
      SET linked_project_id = ${keepId}
      WHERE linked_project_id = ${removeId}
    `);

    // Update FK references: url_audit.deal_id
    await db.execute(sql`
      UPDATE url_audit
      SET deal_id = ${keepId}
      WHERE deal_id = ${removeId}
    `);

    // Delete the duplicate
    await db.delete(projectsTable).where(eq(projectsTable.id, removeId));

    // Audit log
    await db.insert(reviewerAuditLogTable).values({
      action: "project_merge",
      actor: "admin",
      metadata: {
        keepId,
        removeId,
        keptName: keep.projectName,
        removedName: remove.projectName,
        country: keep.country,
        fieldsGapFilled: Object.keys(fillUpdates),
      },
    });

    res.json({
      success: true,
      keepId,
      removedId: removeId,
      keptName: keep.projectName,
      removedName: remove.projectName,
      fieldsGapFilled: Object.keys(fillUpdates),
    });
  } catch (err) {
    console.error("[Merge]", err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
