import { Router, type IRouter } from "express";
import { db, projectsTable, scraperRunsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { runScraper, runSourceGroup, getScraperStatus, getFeedList, getSourceGroups, runSeedImport, runWorldBankAdapter } from "../services/scraper.js";
import { adminAuthMiddleware } from "../middleware/adminAuth.js";
import { checkWatchesAndNotify } from "../services/notifications.js";

const router: IRouter = Router();

router.use("/scraper", adminAuthMiddleware);

router.get("/scraper/feeds", (_req, res) => {
  res.json(getFeedList());
});

router.get("/scraper/sources", (_req, res) => {
  res.json(getSourceGroups());
});

router.get("/scraper/status", async (_req, res) => {
  try {
    const { lastRunAt, isRunning, lastResult } = getScraperStatus();

    const [pendingRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projectsTable)
      .where(eq(projectsTable.reviewStatus, "pending"));

    res.json({
      lastRunAt,
      isRunning,
      pendingCount: pendingRow?.count ?? 0,
      lastResult,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Recent scraper run history per source
router.get("/scraper/runs", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);
    const runs = await db
      .select()
      .from(scraperRunsTable)
      .orderBy(desc(scraperRunsTable.startedAt))
      .limit(limit);

    // Build per-source summary (latest run + totals)
    const bySource: Record<string, {
      lastRun: typeof runs[0] | null;
      totalInserted: number;
      totalUpdated: number;
      totalFound: number;
      totalFlagged: number;
      runCount: number;
    }> = {};

    for (const run of runs) {
      if (!bySource[run.sourceName]) {
        bySource[run.sourceName] = {
          lastRun: run,
          totalInserted: 0, totalUpdated: 0, totalFound: 0, totalFlagged: 0, runCount: 0,
        };
      }
      const s = bySource[run.sourceName];
      s.totalInserted += run.recordsInserted;
      s.totalUpdated += run.recordsUpdated;
      s.totalFound += run.recordsFound;
      s.totalFlagged += run.flaggedForReview;
      s.runCount++;
    }

    res.json({ runs, bySource });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/scraper/queue", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);
    const pending = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.reviewStatus, "pending"))
      .orderBy(desc(projectsTable.discoveredAt))
      .limit(limit);
    res.json(pending);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/scraper/reviewed", async (_req, res) => {
  try {
    const reviewed = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.isAutoDiscovered, true))
      .orderBy(desc(projectsTable.discoveredAt))
      .limit(20);
    res.json(reviewed);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Run all sources (SSE streaming)
router.post("/scraper/run", async (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await runScraper((progress) => {
      send(progress);
    });
    send({ stage: "complete", result });
  } catch (err) {
    send({ stage: "error", message: String(err) });
  } finally {
    res.end();
  }
});

// Run a single source group (SSE streaming)
router.post("/scraper/run/:source", async (req, res) => {
  const sourceName = decodeURIComponent(req.params.source);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await runSourceGroup(sourceName, "manual", (progress) => {
      send(progress);
    });
    send({ stage: "complete", result });
  } catch (err) {
    send({ stage: "error", message: String(err) });
  } finally {
    res.end();
  }
});

router.post("/scraper/review/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { action } = req.body as { action: "approve" | "reject" };

    if (!["approve", "reject"].includes(action)) {
      res.status(400).json({ error: "action must be approve or reject" });
      return;
    }

    const updated = await db
      .update(projectsTable)
      .set({ reviewStatus: action === "approve" ? "approved" : "rejected" })
      .where(eq(projectsTable.id, id))
      .returning();

    if (action === "approve" && updated.length > 0) {
      const p = updated[0];
      checkWatchesAndNotify({
        id: p.id,
        projectName: p.projectName,
        country: p.country,
        technology: p.technology,
        dealSizeUsdMn: p.dealSizeUsdMn ?? null,
        developer: p.developer,
        dealStage: p.dealStage,
      }).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/scraper/review-all", async (req, res) => {
  try {
    const { action } = req.body as { action: "approve" | "reject" };
    if (!["approve", "reject"].includes(action)) {
      res.status(400).json({ error: "action must be approve or reject" });
      return;
    }
    await db
      .update(projectsTable)
      .set({ reviewStatus: action === "approve" ? "approved" : "rejected" })
      .where(eq(projectsTable.reviewStatus, "pending"));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── SEED DATA IMPORT (SSE streaming) ─────────────────────────────────────────
router.post("/scraper/seed", async (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send({ stage: "start", message: "Starting seed data import..." });
    const result = await runSeedImport((msg) => {
      send({ stage: "progress", message: msg });
    });
    send({
      stage: "complete",
      result: {
        total: result.total,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors.length,
        log: result.log.slice(-20), // last 20 log lines
      },
    });
  } catch (err) {
    send({ stage: "error", message: String(err) });
  } finally {
    res.end();
  }
});

// ── WORLD BANK API ADAPTER (SSE streaming) ────────────────────────────────────
router.post("/scraper/world-bank", async (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send({ stage: "start", message: "Fetching World Bank Africa energy projects..." });
    const result = await runWorldBankAdapter((msg) => {
      send({ stage: "progress", message: msg });
    });
    send({
      stage: "complete",
      result: {
        total: result.total,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors.length,
        log: result.log.slice(-20),
      },
    });
  } catch (err) {
    send({ stage: "error", message: String(err) });
  } finally {
    res.end();
  }
});

export default router;
