/**
 * Adapter API routes — admin-only endpoints for the new adapter system.
 *
 * GET    /api/adapters                      — list all registered adapters
 * POST   /api/adapters/:key/run             — trigger a single adapter run (SSE)
 * GET    /api/scraper/source-feeds          — list scraper_sources table
 * POST   /api/scraper/source-feeds          — add a new feed
 * DELETE /api/scraper/source-feeds/:id      — delete a feed
 * PATCH  /api/scraper/source-feeds/:id      — toggle active
 * POST   /api/scraper/source-feeds/:id/run  — run an ad-hoc source feed
 */

import { Router, type IRouter } from "express";
import { db, scraperSourcesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

export default router;
