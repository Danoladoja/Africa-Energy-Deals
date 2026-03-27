import { Router } from "express";
import { db, projectsTable, urlAuditTable } from "@workspace/db";
import { eq, and, desc, count, or, isNull } from "drizzle-orm";
import { reviewerAuthMiddleware, type ReviewerRequest } from "../middleware/reviewAuth.js";

const router = Router();

router.use("/review", reviewerAuthMiddleware);

// GET /api/review/stats — queue stats
router.get("/review/stats", async (_req, res) => {
  try {
    const [pendingCount] = await db
      .select({ count: count() })
      .from(projectsTable)
      .where(eq(projectsTable.reviewStatus, "pending"));

    const [needsSourceCount] = await db
      .select({ count: count() })
      .from(projectsTable)
      .where(eq(projectsTable.reviewStatus, "needs_source"));

    const [approvedCount] = await db
      .select({ count: count() })
      .from(projectsTable)
      .where(eq(projectsTable.reviewStatus, "approved"));

    res.json({
      pending: pendingCount?.count ?? 0,
      needs_source: needsSourceCount?.count ?? 0,
      approved: approvedCount?.count ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/review/queue — paginated list of pending and needs_source projects
router.get("/review/queue", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
    const limit = 25;
    const offset = (page - 1) * limit;
    const statusFilter = String(req.query.status ?? "pending");

    const validStatuses = ["pending", "needs_source", "approved"];
    const statusToUse = validStatuses.includes(statusFilter) ? statusFilter : "pending";

    const projects = await db
      .select({
        id: projectsTable.id,
        projectName: projectsTable.projectName,
        country: projectsTable.country,
        technology: projectsTable.technology,
        dealSizeUsdMn: projectsTable.dealSizeUsdMn,
        status: projectsTable.status,
        reviewStatus: projectsTable.reviewStatus,
        confidenceScore: projectsTable.confidenceScore,
        sourceUrl: projectsTable.sourceUrl,
        description: projectsTable.description,
        investors: projectsTable.investors,
        extractionSource: projectsTable.extractionSource,
        createdAt: projectsTable.createdAt,
      })
      .from(projectsTable)
      .where(eq(projectsTable.reviewStatus, statusToUse))
      .orderBy(desc(projectsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db
      .select({ count: count() })
      .from(projectsTable)
      .where(eq(projectsTable.reviewStatus, statusToUse));

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

// PATCH /api/review/:id/status — approve, reject, or set needs_source
router.patch("/review/:id/status", async (req: ReviewerRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { status } = req.body as { status?: string };
    const validStatuses = ["approved", "pending", "needs_source"];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ error: "Invalid status. Must be: approved, pending, needs_source" });
      return;
    }

    await db
      .update(projectsTable)
      .set({ reviewStatus: status })
      .where(eq(projectsTable.id, id));

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
