import { Router, type IRouter } from "express";
import { db, projectsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { runScraper, getScraperStatus, getFeedList } from "../services/scraper.js";

const router: IRouter = Router();

router.get("/scraper/feeds", (_req, res) => {
  res.json(getFeedList());
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

router.get("/scraper/queue", async (_req, res) => {
  try {
    const pending = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.reviewStatus, "pending"))
      .orderBy(desc(projectsTable.discoveredAt));
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

router.post("/scraper/review/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { action } = req.body as { action: "approve" | "reject" };

    if (!["approve", "reject"].includes(action)) {
      res.status(400).json({ error: "action must be approve or reject" });
      return;
    }

    await db
      .update(projectsTable)
      .set({ reviewStatus: action === "approve" ? "approved" : "rejected" })
      .where(eq(projectsTable.id, id));

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

export default router;
