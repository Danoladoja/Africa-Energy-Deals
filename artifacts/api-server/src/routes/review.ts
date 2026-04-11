import { Router } from "express";
import { db, projectsTable, urlAuditTable, contributorSubmissionsTable } from "@workspace/db";
import { eq, and, desc, count, or, isNull, inArray } from "drizzle-orm";
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
    ] = await Promise.all([
      db.select({ count: count() }).from(projectsTable).where(eq(projectsTable.reviewStatus, "pending")),
      db.select({ count: count() }).from(projectsTable).where(eq(projectsTable.reviewStatus, "needs_source")),
      db.select({ count: count() }).from(projectsTable).where(eq(projectsTable.reviewStatus, "approved")),
      db.select({ count: count() }).from(projectsTable).where(eq(projectsTable.reviewStatus, "rejected")),
    ]);

    res.json({
      pending: pendingCount?.count ?? 0,
      needs_source: needsSourceCount?.count ?? 0,
      approved: approvedCount?.count ?? 0,
      rejected: rejectedCount?.count ?? 0,
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

    const validStatuses = ["pending", "needs_source", "approved", "rejected", "all"];
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
      confidenceScore: projectsTable.confidenceScore,
      sourceUrl: projectsTable.sourceUrl,
      newsUrl: projectsTable.newsUrl,
      description: projectsTable.description,
      developer: projectsTable.developer,
      investors: projectsTable.investors,
      extractionSource: projectsTable.extractionSource,
      discoveredAt: projectsTable.discoveredAt,
      createdAt: projectsTable.createdAt,
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
    const validStatuses = ["approved", "pending", "needs_source", "rejected"];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ error: "Invalid status. Must be: approved, pending, needs_source, rejected" });
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

    await db
      .update(projectsTable)
      .set({ reviewStatus: status })
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
