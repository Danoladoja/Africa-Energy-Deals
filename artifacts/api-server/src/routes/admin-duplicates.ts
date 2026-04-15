import { Router } from "express";
import {
  db,
  pool,
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
router.use("/admin/projects/delete", adminAuthMiddleware);
router.use("/admin/projects/patch", adminAuthMiddleware);
router.use("/admin/setup-extensions", adminAuthMiddleware);

// POST /api/admin/setup-extensions — idempotently install pg_trgm and its indexes
// Use this to fix a fresh database (e.g. Railway) that has never had pg_trgm created.
router.post("/admin/setup-extensions", async (_req, res) => {
  const results: { step: string; status: string; detail?: string }[] = [];

  async function run(step: string, sql: string) {
    const client = await pool.connect();
    try {
      await client.query("SET search_path TO public");
      await client.query(sql);
      results.push({ step, status: "ok" });
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      if (msg.includes("already exists")) {
        results.push({ step, status: "ok", detail: "already exists" });
      } else {
        results.push({ step, status: "error", detail: msg });
      }
    } finally {
      client.release();
    }
  }

  await run("pg_trgm extension", "CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await run("idx_ep_name_trgm GIN index",
    "CREATE INDEX IF NOT EXISTS idx_ep_name_trgm ON energy_projects USING GIN (project_name gin_trgm_ops)");
  await run("idx_ep_normalized_name_trgm GIN index",
    "CREATE INDEX IF NOT EXISTS idx_ep_normalized_name_trgm ON energy_projects USING GIN (normalized_name gin_trgm_ops)");

  // Verify similarity() is callable
  const client = await pool.connect();
  try {
    await client.query("SET search_path TO public");
    await client.query("SELECT similarity('test', 'test')");
    results.push({ step: "similarity() function check", status: "ok" });
  } catch (err: any) {
    results.push({ step: "similarity() function check", status: "error", detail: err?.message });
  } finally {
    client.release();
  }

  const hasError = results.some(r => r.status === "error");
  res.status(hasError ? 500 : 200).json({ results });
});

// GET /api/admin/duplicates — scan for likely duplicate project pairs using pg_trgm
router.get("/admin/duplicates", async (req, res) => {
  try {
    const threshold = Math.max(0.3, Math.min(0.95, parseFloat(String(req.query.threshold ?? "0.6"))));

    // Use a dedicated pool client so we can explicitly SET search_path before
    // running the similarity query. Drizzle's db.execute() has an intermittent
    // issue locating pg_trgm functions; raw pool.query() is reliable.
    const client = await pool.connect();
    let rows: unknown[];
    try {
      await client.query("SET search_path TO public");
      const result = await client.query(
        `SELECT
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
        ) > $1
        ORDER BY similarity(
          COALESCE(a.normalized_name, lower(a.project_name)),
          COALESCE(b.normalized_name, lower(b.project_name))
        ) DESC
        LIMIT 200`,
        [threshold],
      );
      rows = result.rows;
    } finally {
      client.release();
    }

    res.json({ pairs: rows, count: rows.length, threshold });
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

// POST /api/admin/projects/patch — update arbitrary numeric/text fields on a project
// Accepts any subset of: dealSizeUsdMn, capacityMw, announcedYear, closedYear, developer, description
router.post("/admin/projects/patch", async (req, res) => {
  try {
    const { id, ...fields } = req.body as Record<string, unknown>;
    if (!id || typeof id !== "number") {
      return res.status(400).json({ error: "id (number) is required" });
    }

    const ALLOWED_FIELDS: Record<string, string> = {
      dealSizeUsdMn: "dealSizeUsdMn",
      capacityMw: "capacityMw",
      announcedYear: "announcedYear",
      closedYear: "closedYear",
      developer: "developer",
      description: "description",
      technology: "technology",
      sourceUrl: "sourceUrl",
    };

    const updates: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(fields)) {
      if (key in ALLOWED_FIELDS && val !== undefined && val !== "") {
        updates[ALLOWED_FIELDS[key]] = val;
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "No patchable fields provided" });
    }

    const [project] = await db.select({ id: projectsTable.id }).from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    if (!project) return res.status(404).json({ error: `Project ${id} not found` });

    await db.update(projectsTable).set(updates).where(eq(projectsTable.id, id));

    await db.insert(reviewerAuditLogTable).values({
      action: "project_patch",
      actor: "admin",
      metadata: { id, fields: Object.keys(updates) },
    });

    res.json({ success: true, id, patched: Object.keys(updates) });
  } catch (err) {
    console.error("[Patch]", err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/admin/projects/delete — permanently delete a single project by ID
// Intended for rejected projects or entries that should never have been in the tracker.
router.post("/admin/projects/delete", async (req, res) => {
  try {
    const { id, reason } = req.body as { id?: number; reason?: string };
    if (!id || typeof id !== "number") {
      return res.status(400).json({ error: "id (number) is required" });
    }

    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    if (!project) return res.status(404).json({ error: `Project ${id} not found` });

    // Null-out FK references before deleting so constraints don't block the delete
    await db.execute(sql`
      UPDATE contributor_submissions SET linked_project_id = NULL WHERE linked_project_id = ${id}
    `);
    await db.execute(sql`DELETE FROM url_audit WHERE deal_id = ${id}`);

    await db.delete(projectsTable).where(eq(projectsTable.id, id));

    await db.insert(reviewerAuditLogTable).values({
      action: "project_delete",
      actor: "admin",
      metadata: {
        deletedId: id,
        deletedName: project.projectName,
        country: project.country,
        reviewStatus: project.reviewStatus,
        reason: reason ?? "admin decision",
      },
    });

    res.json({ success: true, deletedId: id, deletedName: project.projectName });
  } catch (err) {
    console.error("[Delete]", err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
