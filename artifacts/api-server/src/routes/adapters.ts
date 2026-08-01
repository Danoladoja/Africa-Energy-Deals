/**
 * Scraper admin API — slim version.
 *
 * GET    /api/adapters                       — list registered adapters
 * POST   /api/adapters/:key/run              — run one adapter (SSE)
 * POST   /api/scraper/run-group/:group       — run all adapters in a group (SSE)
 * POST   /api/scraper/run                    — run all adapters sequentially (SSE)
 * GET    /api/scraper/runs                   — recent run history
 * GET    /api/scraper/llm-usage              — daily LLM call budget & usage
 * POST   /api/scraper/check-urls             — trigger an ad-hoc URL sweep
 */

import { Router, type IRouter } from "express";
import { runFinancingEnrichment } from "../scraper/financing-enrichment.js";
import { db, scraperRunsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { adminAuthMiddleware } from "../middleware/adminAuth.js";
import { ADAPTERS, getAdapter, runAdapter, runAllAdapters } from "../scraper/runner.js";
import { runUrlCheckSweep } from "../scraper/url-checker.js";
import { getLLMUsage } from "../scraper/llm.js";

const router: IRouter = Router();
router.use(adminAuthMiddleware);

// ── List adapters ────────────────────────────────────────────────────────────

router.get("/adapters", (_req, res) => {
  res.json(ADAPTERS.map((a) => a.config));
});

// ── Run single adapter (SSE) ─────────────────────────────────────────────────

router.post("/adapters/:key/run", async (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const adapter = getAdapter(key);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  if (!adapter) {
    send({ stage: "error", message: `Unknown adapter: ${key}` });
    res.end();
    return;
  }

  try {
    send({ stage: "start", adapter: key });
    const report = await runAdapter(adapter, "manual", (msg) => send({ stage: "progress", message: msg }));
    send({ stage: "complete", report });
  } catch (e) {
    send({ stage: "error", message: e instanceof Error ? e.message : String(e) });
  } finally {
    res.end();
  }
});

// ── Run adapters by group (SSE) ──────────────────────────────────────────────

router.post("/scraper/run-group/:group", async (req, res) => {
  const group = decodeURIComponent(req.params.group);
  const groupAdapters = ADAPTERS.filter((a) => a.config.group === group);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  if (groupAdapters.length === 0) {
    send({ stage: "error", message: `Unknown group: ${group}` });
    res.end();
    return;
  }

  try {
    send({ stage: "start", group, totalAdapters: groupAdapters.length });
    const reports = [];
    for (const adapter of groupAdapters) {
      try {
        const report = await runAdapter(adapter, "manual", (msg) => send({ stage: "progress", message: msg }));
        reports.push(report);
      } catch (e) {
        send({ stage: "error", message: `[${adapter.config.key}] ${e instanceof Error ? e.message : String(e)}` });
      }
    }
    send({ stage: "complete", reports });
  } catch (e) {
    send({ stage: "error", message: e instanceof Error ? e.message : String(e) });
  } finally {
    res.end();
  }
});

// ── Run all adapters (SSE) ───────────────────────────────────────────────────

router.post("/scraper/run", async (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    send({ stage: "start", totalAdapters: ADAPTERS.length });
    const reports = await runAllAdapters("manual", (msg) => send({ stage: "progress", message: msg }));
    send({ stage: "complete", reports });
  } catch (e) {
    send({ stage: "error", message: e instanceof Error ? e.message : String(e) });
  } finally {
    res.end();
  }
});

// ── Recent run history ───────────────────────────────────────────────────────

router.get("/scraper/runs", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 500);
    const runs = await db
      .select()
      .from(scraperRunsTable)
      .orderBy(desc(scraperRunsTable.startedAt))
      .limit(limit);
    res.json({ runs });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ── LLM usage / budget stats ────────────────────────────────────────────────

router.get("/scraper/llm-usage", (_req, res) => {
  res.json(getLLMUsage());
});

// ── URL check sweep (manual trigger) ─────────────────────────────────────────

router.post("/scraper/check-urls", async (req, res) => {
  try {
    const batchSize = Math.min(parseInt(String(req.body?.batchSize ?? "100"), 10), 500);
    const maxAgeDays = parseInt(String(req.body?.maxAgeDays ?? "30"), 10);
    const report = await runUrlCheckSweep({ batchSize, maxAgeDays });
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});



// ── Manual financing enrichment trigger ─────────────────────────────────────
// POST /api/scraper/financing-enrichment  { limit?: number }  (admin only)
// Revisits source pages of the largest disclosed deals missing financing data.
router.post("/scraper/financing-enrichment", adminAuthMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number((req.body as { limit?: number })?.limit ?? 60), 1), 150);
    const summary = await runFinancingEnrichment({ limit });
    res.json(summary);
  } catch (err) {
    console.error("[Enrichment] Manual run failed:", err);
    res.status(500).json({ error: "Enrichment run failed" });
  }
});

export default router;
