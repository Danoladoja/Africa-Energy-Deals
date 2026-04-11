/**
 * Adapter API routes — admin-only endpoints for the new adapter system.
 *
 * GET    /api/adapters                      — list all registered adapters
 * POST   /api/adapters/:key/run             — trigger a single adapter run (SSE)
 * GET    /api/scraper/runs                  — recent scraper runs with rejection telemetry
 * GET    /api/scraper/status                — pipeline status summary
 * GET    /api/scraper/sources               — source groups list
 * GET    /api/scraper/rejection-telemetry   — rejection summary from most recent runs
 * GET    /api/scraper/source-feeds          — list scraper_sources table
 * POST   /api/scraper/source-feeds          — add a new feed
 * DELETE /api/scraper/source-feeds/:id      — delete a feed
 * PATCH  /api/scraper/source-feeds/:id      — toggle active
 * POST   /api/scraper/source-feeds/:id/run  — run an ad-hoc source feed
 */

import { Router, type IRouter } from "express";
import { db, scraperSourcesTable, scraperRunsTable, projectsTable } from "@workspace/db";
import { eq, desc, sql, count } from "drizzle-orm";
import { adminAuthMiddleware } from "../middleware/adminAuth.js";
import { getAdapterMeta, runAdapter } from "../scraper/adapter-runner.js";
import { llmScoreCandidate, writeCandidate } from "../scraper/adapter-runner-helpers.js";
import { buildGoogleAlertsAdapterFromFeedUrl } from "../scraper/adapters/google-alerts.js";
import { slugify } from "../scraper/base.js";

const router: IRouter = Router();

router.use(adminAuthMiddleware);

// ── Adapter registry ──────────────────────────────────────────────────────────

router.get("/adapters", (_req, res) => {
  res.json(getAdapterMeta());
});

router.post("/adapters/:key/run", async (req, res) => {
  const key = decodeURIComponent(req.params.key);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    send({ stage: "start", message: `Starting adapter run: ${key}` });
    const report = await runAdapter(key, "manual");
    send({ stage: "complete", report });
  } catch (err) {
    send({ stage: "error", message: String(err) });
  } finally {
    res.end();
  }
});

// ── Source feeds CRUD ─────────────────────────────────────────────────────────

router.get("/scraper/source-feeds", async (_req, res) => {
  try {
    const rows = await db.select().from(scraperSourcesTable).orderBy(scraperSourcesTable.createdAt);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/scraper/source-feeds", async (req, res) => {
  try {
    const { adapterType, label, feedUrl } = req.body as {
      adapterType?: string;
      label?: string;
      feedUrl?: string;
    };

    if (!adapterType || !label || !feedUrl) {
      res.status(400).json({ error: "adapterType, label, and feedUrl are required" });
      return;
    }

    const slug = slugify(label);
    const key = `rss:${adapterType}:${slug}`;

    const [row] = await db.insert(scraperSourcesTable).values({
      adapterType,
      key,
      label,
      feedUrl,
      isActive: true,
      createdBy: "admin",
    }).returning();

    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/scraper/source-feeds/:id", async (req, res) => {
  try {
    await db.delete(scraperSourcesTable).where(eq(scraperSourcesTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/scraper/source-feeds/:id", async (req, res) => {
  try {
    const { isActive } = req.body as { isActive?: boolean };
    if (typeof isActive !== "boolean") {
      res.status(400).json({ error: "isActive (boolean) is required" });
      return;
    }
    const [row] = await db
      .update(scraperSourcesTable)
      .set({ isActive })
      .where(eq(scraperSourcesTable.id, req.params.id))
      .returning();
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/scraper/source-feeds/:id/run", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const [source] = await db.select().from(scraperSourcesTable).where(eq(scraperSourcesTable.id, req.params.id));
    if (!source) {
      send({ stage: "error", message: "Source not found" });
      res.end();
      return;
    }

    send({ stage: "start", message: `Running source feed: ${source.label}` });

    const slug = source.key.replace(/^rss:[^:]+:/, "");
    const adapter = buildGoogleAlertsAdapterFromFeedUrl(slug, source.feedUrl, source.label);

    const report = await adapter.run(async (draft) => {
      const scored = await llmScoreCandidate(draft);
      if (!scored) return { inserted: false, updated: false, flagged: false };
      return writeCandidate(scored, adapter.key);
    }, "manual");

    send({ stage: "complete", report });
  } catch (err) {
    send({ stage: "error", message: String(err) });
  } finally {
    res.end();
  }
});

// ── Scraper runs — recent history with rejection telemetry ────────────────────

router.get("/scraper/runs", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100")), 500);
    const runs = await db
      .select()
      .from(scraperRunsTable)
      .orderBy(desc(scraperRunsTable.startedAt))
      .limit(limit);

    // Group by adapterKey for the bySource view expected by admin-scraper.tsx
    const bySource: Record<string, {
      lastRun: typeof runs[number] | null;
      totalInserted: number;
      totalUpdated: number;
      totalFound: number;
      totalFlagged: number;
      totalRejected: number;
      runCount: number;
    }> = {};

    for (const run of runs) {
      const key = run.adapterKey ?? run.sourceName;
      if (!bySource[key]) {
        bySource[key] = { lastRun: run, totalInserted: 0, totalUpdated: 0, totalFound: 0, totalFlagged: 0, totalRejected: 0, runCount: 0 };
      }
      bySource[key].totalInserted += run.recordsInserted;
      bySource[key].totalUpdated += run.recordsUpdated;
      bySource[key].totalFound += run.recordsFound;
      bySource[key].totalFlagged += run.flaggedForReview;
      bySource[key].totalRejected += (run.rejectedNonEnergyCount ?? 0);
      bySource[key].runCount++;
    }

    res.json({ runs, bySource });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Pipeline status ───────────────────────────────────────────────────────────

router.get("/scraper/status", async (_req, res) => {
  try {
    const [pendingRow] = await db
      .select({ pendingCount: count() })
      .from(projectsTable)
      .where(eq(projectsTable.reviewStatus, "pending"));
    res.json({ pendingCount: pendingRow?.pendingCount ?? 0 });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Source groups (legacy compatibility shape) ────────────────────────────────

router.get("/scraper/sources", async (_req, res) => {
  try {
    const rows = await db
      .select({
        name: scraperRunsTable.sourceName,
        adapterKey: scraperRunsTable.adapterKey,
      })
      .from(scraperRunsTable)
      .orderBy(desc(scraperRunsTable.startedAt))
      .limit(200);

    const seen = new Map<string, { name: string; description: string; feedCount: number; isRunning: boolean }>();
    for (const r of rows) {
      const key = r.adapterKey ?? r.name;
      if (!seen.has(key)) seen.set(key, { name: key, description: r.name, feedCount: 1, isRunning: false });
    }
    res.json(Array.from(seen.values()));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Rejection telemetry — summary of most recent runs ────────────────────────

router.get("/scraper/rejection-telemetry", async (_req, res) => {
  try {
    // Most recent run per adapter that has at least one rejection
    const recentRuns = await db
      .select()
      .from(scraperRunsTable)
      .orderBy(desc(scraperRunsTable.startedAt))
      .limit(50);

    const totalFetched = recentRuns.slice(0, 10).reduce((s, r) => s + r.recordsFound, 0);
    const totalRejected = recentRuns.slice(0, 10).reduce((s, r) => s + (r.rejectedNonEnergyCount ?? 0), 0);

    // Collect all rejection entries from the 10 most recent runs
    const allEntries: Array<{
      title: string;
      sourceUrl?: string;
      reason: string;
      matchedKeywords: string[];
      adapter: string;
      rejectedAt: string;
    }> = [];

    for (const run of recentRuns.slice(0, 10)) {
      const log = Array.isArray(run.rejectionLog) ? run.rejectionLog as typeof allEntries : [];
      allEntries.push(...log);
    }

    // Top 5 reasons
    const reasonCounts: Record<string, number> = {};
    for (const entry of allEntries) {
      reasonCounts[entry.reason] = (reasonCounts[entry.reason] ?? 0) + 1;
    }
    const topReasons = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    // Sample entries (first 10)
    const sample = allEntries.slice(0, 10);

    res.json({ totalFetched, totalRejected, topReasons, sample });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
