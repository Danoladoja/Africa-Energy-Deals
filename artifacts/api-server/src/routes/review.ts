import { Router } from "express";
import { db, pool, projectsTable, urlAuditTable, contributorSubmissionsTable, reviewerAuditLogTable } from "@workspace/db";
import { eq, and, desc, count, or, isNull, inArray, sql } from "drizzle-orm";
import { reviewerAuthMiddleware, type ReviewerRequest } from "../middleware/reviewAuth.js";
import { awardBadges } from "../services/badges.js";

const router = Router();

router.use("/review", reviewerAuthMiddleware);

// GET /api/review/stats — queue stats
router.get("/review/stats", async (_req, res) => {
  try {
    const [
      [pendingCount],
      [needsSourceCount],
      [approvedCount],
      [rejectedCount],
      [binnedCount],
    ] = await Promise.all([
      db.select({ count: count() }).from(projectsTable).where(eq(projectsTable.reviewStatus, "pending")),
      db.select({ count: count() }).from(projectsTable).where(eq(projectsTable.reviewStatus, "needs_source")),
      db.select({ count: count() }).from(projectsTable).where(eq(projectsTable.reviewStatus, "approved")),
      db.select({ count: count() }).from(projectsTable).where(eq(projectsTable.reviewStatus, "rejected")),
      db.select({ count: count() }).from(projectsTable).where(eq(projectsTable.reviewStatus, "binned")),
    ]);

    res.json({
      pending: pendingCount?.count ?? 0,
      needs_source: needsSourceCount?.count ?? 0,
      approved: approvedCount?.count ?? 0,
      rejected: rejectedCount?.count ?? 0,
      binned: binnedCount?.count ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/review/queue — paginated list filtered by reviewStatus
// status param: "pending" | "needs_source" | "approved" | "rejected" | "all"
// "all" returns pending + needs_source + rejected (everything not yet approved)
router.get("/review/queue", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
    const limit = 25;
    const offset = (page - 1) * limit;
    const statusFilter = String(req.query.status ?? "pending");

    const validStatuses = ["pending", "needs_source", "approved", "rejected", "binned", "all"];
    const statusToUse = validStatuses.includes(statusFilter) ? statusFilter : "pending";

    const whereClause = statusToUse === "all"
      ? inArray(projectsTable.reviewStatus, ["pending", "needs_source", "rejected"])
      : eq(projectsTable.reviewStatus, statusToUse);

    const selectFields = {
      id: projectsTable.id,
      projectName: projectsTable.projectName,
      country: projectsTable.country,
      technology: projectsTable.technology,
      dealSizeUsdMn: projectsTable.dealSizeUsdMn,
      capacityMw: projectsTable.capacityMw,
      status: projectsTable.status,
      reviewStatus: projectsTable.reviewStatus,
      approvedBy: projectsTable.approvedBy,
      confidenceScore: projectsTable.confidenceScore,
      sourceUrl: projectsTable.sourceUrl,
      newsUrl: projectsTable.newsUrl,
      description: projectsTable.description,
      developer: projectsTable.developer,
      investors: projectsTable.investors,
      extractionSource: projectsTable.extractionSource,
      discoveredAt: projectsTable.discoveredAt,
      createdAt: projectsTable.createdAt,
      reviewNotes: projectsTable.reviewNotes,
    };

    const [projects, [totalRow]] = await Promise.all([
      db.select(selectFields).from(projectsTable).where(whereClause).orderBy(desc(projectsTable.createdAt)).limit(limit).offset(offset),
      db.select({ count: count() }).from(projectsTable).where(whereClause),
    ]);

    res.json({
      projects,
      total: totalRow?.count ?? 0,
      page,
      pages: Math.ceil((totalRow?.count ?? 0) / limit),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/review/:id — single project detail
router.get("/review/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id))
      .limit(1);

    if (!project) { res.status(404).json({ error: "Not found" }); return; }

    const auditLog = await db
      .select()
      .from(urlAuditTable)
      .where(eq(urlAuditTable.dealId, id))
      .orderBy(desc(urlAuditTable.createdAt));

    res.json({ project, auditLog });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/review/:id/status — approve, reject, reopen, or set needs_source
// Writes an audit trail entry for every status change.
router.patch("/review/:id/status", async (req: ReviewerRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { status } = req.body as { status?: string };
    const validStatuses = ["approved", "pending", "needs_source", "rejected", "binned"];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ error: "Invalid status. Must be: approved, pending, needs_source, rejected, binned" });
      return;
    }

    const [current] = await db
      .select({ reviewStatus: projectsTable.reviewStatus })
      .from(projectsTable)
      .where(eq(projectsTable.id, id))
      .limit(1);

    if (!current) { res.status(404).json({ error: "Not found" }); return; }

    const [project] = await db
      .select({
        reviewStatus: projectsTable.reviewStatus,
        extractionSource: projectsTable.extractionSource,
        communitySubmissionId: projectsTable.communitySubmissionId,
        submittedByContributorId: projectsTable.submittedByContributorId,
      })
      .from(projectsTable)
      .where(eq(projectsTable.id, id))
      .limit(1);

    const reviewerEmail = req.reviewerEmail ?? "unknown";
    await db
      .update(projectsTable)
      .set({
        reviewStatus: status,
        approvedBy: status === "approved" ? reviewerEmail : null,
        binnedAt: status === "binned" ? new Date() : null,
      })
      .where(eq(projectsTable.id, id));

    if (project?.extractionSource === "community" && project.communitySubmissionId) {
      const submissionStatus = status === "approved" ? "approved"
        : status === "rejected" ? "rejected"
        : null;

      if (submissionStatus) {
        db.update(contributorSubmissionsTable)
          .set({
            status: submissionStatus,
            reviewedAt: new Date(),
            reviewedBy: req.reviewerEmail ?? "reviewer",
          })
          .where(eq(contributorSubmissionsTable.id, project.communitySubmissionId))
          .catch(() => {});

        if (submissionStatus === "approved" && project.submittedByContributorId) {
          awardBadges(project.submittedByContributorId).catch(() => {});
        }
      }
    }

    // Audit trail — non-blocking; never fails the request
    db.insert(urlAuditTable).values({
      dealId: id,
      action: "status_changed",
      note: `${current.reviewStatus} → ${status}`,
      reviewerEmail: req.reviewerEmail ?? "unknown",
    }).catch(() => {});

    res.json({ success: true, id, status });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/review/:id/url — update sourceUrl and log it
router.patch("/review/:id/url", async (req: ReviewerRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { newUrl, note } = req.body as { newUrl?: string; note?: string };
    if (!newUrl || typeof newUrl !== "string") {
      res.status(400).json({ error: "newUrl is required" });
      return;
    }

    const [current] = await db
      .select({ sourceUrl: projectsTable.sourceUrl })
      .from(projectsTable)
      .where(eq(projectsTable.id, id))
      .limit(1);

    if (!current) { res.status(404).json({ error: "Not found" }); return; }

    await db.update(projectsTable).set({ sourceUrl: newUrl }).where(eq(projectsTable.id, id));

    await db.insert(urlAuditTable).values({
      dealId: id,
      oldUrl: current.sourceUrl ?? null,
      newUrl,
      action: "edited",
      note: note ?? null,
      reviewerEmail: req.reviewerEmail!,
    });

    res.json({ success: true, id, newUrl });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/review/:id/details — update editable project fields
router.patch("/review/:id/details", async (req: ReviewerRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const allowed = [
      "projectName", "country", "region", "technology",
      "dealSizeUsdMn", "capacityMw", "status", "dealStage",
      "developer", "investors", "financiers", "description",
    ] as const;

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) {
        const val = body[key];
        // Empty string → null for nullable fields; keep 0 for numbers
        updates[key] = val === "" ? null : val;
      }
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields provided" });
      return;
    }

    const [existing] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, id))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(projectsTable).set(updates as any).where(eq(projectsTable.id, id));

    // Audit trail — non-blocking
    db.insert(urlAuditTable).values({
      dealId: id,
      action: "details_edited",
      note: `Fields updated: ${Object.keys(updates).join(", ")}`,
      reviewerEmail: req.reviewerEmail ?? "unknown",
    }).catch(() => {});

    const [updated] = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    res.json({ success: true, project: updated });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/review/test-url — test if a URL is reachable
router.post("/review/test-url", async (req: ReviewerRequest, res) => {
  try {
    const { url, dealId } = req.body as { url?: string; dealId?: number };
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "url is required" });
      return;
    }

    const start = Date.now();
    let reachable = false;
    let httpStatus: number | null = null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        headers: { "User-Agent": "AfricaEnergyTracker/1.0 (link-checker)" },
      });
      clearTimeout(timer);
      httpStatus = response.status;
      reachable = response.ok || response.status === 301 || response.status === 302;
    } catch {
      reachable = false;
    }

    const responseTime = Date.now() - start;

    if (dealId) {
      try {
        const [current] = await db
          .select({ sourceUrl: projectsTable.sourceUrl })
          .from(projectsTable)
          .where(eq(projectsTable.id, dealId))
          .limit(1);

        if (current) {
          await db.insert(urlAuditTable).values({
            dealId,
            oldUrl: current.sourceUrl ?? null,
            newUrl: null,
            action: "tested",
            testedStatus: httpStatus,
            responseTime,
            reviewerEmail: req.reviewerEmail!,
          });
        }
      } catch {}
    }

    res.json({ url, reachable, httpStatus, responseTime });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/review/:id/flag-duplicate — bin current project as duplicate of another
router.post("/review/:id/flag-duplicate", async (req: ReviewerRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { duplicateOfId } = req.body as { duplicateOfId?: number };
    if (!duplicateOfId || isNaN(Number(duplicateOfId))) {
      res.status(400).json({ error: "duplicateOfId is required" });
      return;
    }

    const [current] = await db
      .select({ projectName: projectsTable.projectName, reviewStatus: projectsTable.reviewStatus })
      .from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    if (!current) { res.status(404).json({ error: "Project not found" }); return; }

    const [dupOf] = await db
      .select({ projectName: projectsTable.projectName })
      .from(projectsTable).where(eq(projectsTable.id, duplicateOfId)).limit(1);
    if (!dupOf) { res.status(404).json({ error: "Target project not found" }); return; }

    const reviewerEmail = req.reviewerEmail ?? "unknown";
    const note = `Flagged as duplicate of #${duplicateOfId} (${dupOf.projectName})`;

    await db.update(projectsTable)
      .set({ reviewStatus: "binned", binnedAt: new Date() })
      .where(eq(projectsTable.id, id));

    // Audit trail entries — non-blocking
    db.insert(urlAuditTable).values({
      dealId: id,
      action: "flag_duplicate",
      note,
      reviewerEmail,
    }).catch(() => {});

    db.insert(reviewerAuditLogTable).values({
      action: "flag_duplicate",
      actor: reviewerEmail,
      metadata: {
        projectId: id,
        projectName: current.projectName,
        duplicateOfId,
        duplicateOfName: dupOf.projectName,
        previousStatus: current.reviewStatus,
      },
    }).catch(() => {});

    res.json({ success: true, note });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/review/:id/duplicates — fuzzy-similar projects (deduplication aid)
router.get("/review/:id/duplicates", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [project] = await db
      .select({ projectName: projectsTable.projectName, country: projectsTable.country })
      .from(projectsTable)
      .where(eq(projectsTable.id, id))
      .limit(1);
    if (!project) { res.status(404).json({ error: "Not found" }); return; }

    const client = await pool.connect();
    let dupRows: unknown[];
    try {
      await client.query("SET search_path TO public");
      const result = await client.query(
        `SELECT id, project_name, country, technology, deal_size_usd_mn, review_status,
                ROUND((similarity(project_name, $1) * 100)::numeric, 0) AS name_sim
         FROM energy_projects
         WHERE id != $2
           AND similarity(project_name, $1) > 0.4
         ORDER BY similarity(project_name, $1) DESC
         LIMIT 5`,
        [project.projectName, id],
      );
      dupRows = result.rows;
    } finally {
      client.release();
    }

    res.json({ duplicates: dupRows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/review/:id/url-history — URL audit log for a deal
router.get("/review/:id/url-history", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const auditLog = await db
      .select()
      .from(urlAuditTable)
      .where(eq(urlAuditTable.dealId, id))
      .orderBy(desc(urlAuditTable.createdAt));

    res.json({ auditLog });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
