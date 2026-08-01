/**
 * Unified job scheduler — the single place all recurring jobs are registered.
 *
 * IMPORTANT: production boots via railway-server.mjs → app.ts (index.ts never
 * runs on Railway), so this module is initialized from app.ts. index.ts also
 * calls initSchedules() for local dev; the singleton guard prevents any job
 * from being registered twice.
 *
 * Cadence (deliberately lean — solo project, LLM budget matters):
 *   • GEM (CSV parsing, no LLM cost)              → monthly, 1st at 02:00 UTC
 *   • World Bank / multilateral / government      → bi-weekly, 1st & 15th at 03:00 UTC
 *   • News RSS + LLM extraction                   → bi-weekly, 1st & 15th at 04:00 UTC
 *   • URL health sweep (no LLM cost)              → daily at 05:00 UTC
 *   • Newsletter                                  → every other Monday at 07:00 UTC
 *     (see newsletter-scheduler.ts — deep-dive when it falls on the month's
 *      first Monday, quick Brief otherwise)
 *
 * Estimated LLM spend on this cadence: roughly $1–3/month. The DAILY_BUDGET_USD
 * cap in scraper/llm.ts (default $3/day) remains as a hard circuit-breaker.
 *
 * Set DISABLE_SCHEDULES=true to turn all recurring jobs off without a code change.
 */

import cron from "node-cron";
import { ADAPTERS, runAdapter } from "./scraper/runner.js";
import { runUrlCheckSweep } from "./scraper/url-checker.js";
import { runFinancingEnrichment } from "./scraper/financing-enrichment.js";
import { startNewsletterScheduler } from "./services/newsletter-scheduler.js";
import { db, projectsTable, scraperRunsTable } from "@workspace/db";
import { lt, sql } from "drizzle-orm";
import { PURGE_RETENTION_DAYS } from "@workspace/shared";

let started = false;

// Cron expression per adapter group (see cadence table above).
const GROUP_CRON: Record<string, string> = {
  "gem": "0 2 1 * *",
  "world-bank": "0 3 1,15 * *",
  "multilateral": "0 3 1,15 * *",
  "government": "0 3 1,15 * *",
  "news": "0 4 1,15 * *",
};

export function initSchedules(): void {
  if (started) return;
  started = true;

  if (process.env["DISABLE_SCHEDULES"] === "true") {
    console.log("[Scheduler] DISABLE_SCHEDULES=true — no recurring jobs registered.");
    return;
  }

  console.log("[Scheduler] Registering recurring jobs (bi-weekly lean cadence)…");

  // ── Scraper adapters ────────────────────────────────────────────────────────
  for (const adapter of ADAPTERS) {
    const cronExpr = GROUP_CRON[adapter.config.group];
    if (!cronExpr) {
      console.warn(`[Adapter] No cadence defined for group "${adapter.config.group}" — "${adapter.config.key}" not scheduled.`);
      continue;
    }
    try {
      cron.schedule(cronExpr, async () => {
        console.log(`[Adapter] Scheduled run: ${adapter.config.key}`);
        try {
          const r = await runAdapter(adapter, "schedule");
          console.log(`[Adapter] ${adapter.config.key} complete — inserted:${r.inserted} updated:${r.updated} flagged:${r.flagged} rejected:${r.rejected}`);
        } catch (err) {
          console.error(`[Adapter] ${adapter.config.key} error:`, err);
        }
      }, { timezone: "UTC" });
      console.log(`[Adapter] "${adapter.config.key}" scheduled (${adapter.config.group} → ${cronExpr})`);
    } catch (err) {
      console.warn(`[Adapter] Could not schedule "${adapter.config.key}": ${err}`);
    }
  }

  // ── Daily URL re-check sweep (HTTP only, no LLM cost) ──────────────────────
  cron.schedule("0 5 * * *", async () => {
    console.log("[UrlCheck] Starting daily sweep…");
    try {
      const r = await runUrlCheckSweep({ batchSize: 200, maxAgeDays: 30, delayMs: 500 });
      console.log(`[UrlCheck] Done — checked:${r.checked} valid:${r.valid} broken:${r.broken} blocked:${r.blocked} timeout:${r.timeout}`);
    } catch (err) {
      console.error("[UrlCheck] Sweep error:", err);
    }
  }, { timezone: "UTC" });
  console.log("[UrlCheck] Daily sweep scheduled at 05:00 UTC");

  // ── Monthly financing enrichment sweep (3rd of month, 05:30 UTC) ───────────
  // Revisits source pages of the largest disclosed deals missing financing data.
  // ~60 LLM calls/month ≈ well under $1; guarded by the daily budget cap.
  cron.schedule("30 5 3 * *", async () => {
    console.log("[Enrichment] Starting monthly financing enrichment sweep…");
    try {
      const r = await runFinancingEnrichment({ limit: 60 });
      console.log(`[Enrichment] Monthly sweep done — enriched:${r.enriched} fields:${r.fieldsWritten}`);
    } catch (err) {
      console.error("[Enrichment] Sweep error:", err);
    }
  }, { timezone: "UTC" });
  console.log("[Enrichment] Monthly financing sweep scheduled (3rd, 05:30 UTC)");

  // ── Newsletter (every other Monday) ─────────────────────────────────────────
  startNewsletterScheduler();

  // ── Optional auto-purge of old rejected records ─────────────────────────────
  if (process.env["PURGE_ENABLED"] === "true") {
    cron.schedule("0 3 * * *", async () => {
      console.log("[Purge] Running daily auto-purge…");
      try {
        const rejectedCutoff = new Date(Date.now() - PURGE_RETENTION_DAYS.rejected * 24 * 60 * 60 * 1000);
        const needsSourceCutoff = new Date(Date.now() - PURGE_RETENTION_DAYS.needsSource * 24 * 60 * 60 * 1000);
        const scraperRunsCutoff = new Date(Date.now() - PURGE_RETENTION_DAYS.scraperRunsDays * 24 * 60 * 60 * 1000);

        const { count: rejCount } = await db.delete(projectsTable)
          .where(sql`${projectsTable.reviewStatus} = 'rejected' AND ${projectsTable.discoveredAt} < ${rejectedCutoff}`)
          .returning({ count: sql<number>`count(*)` })
          .then((rows) => rows[0] ?? { count: 0 });

        const { count: nsCount } = await db.delete(projectsTable)
          .where(sql`${projectsTable.reviewStatus} = 'needs_source' AND ${projectsTable.discoveredAt} < ${needsSourceCutoff}`)
          .returning({ count: sql<number>`count(*)` })
          .then((rows) => rows[0] ?? { count: 0 });

        const { count: runCount } = await db.delete(scraperRunsTable)
          .where(lt(scraperRunsTable.startedAt, scraperRunsCutoff))
          .returning({ count: sql<number>`count(*)` })
          .then((rows) => rows[0] ?? { count: 0 });

        console.log(`[Purge] Done — rejected:${rejCount} needs_source:${nsCount} old_scraper_runs:${runCount}`);
      } catch (err) {
        console.error("[Purge] Error during daily purge:", err);
      }
    }, { timezone: "UTC" });
    console.log(`[Purge] Auto-purge enabled — daily at 03:00 UTC (rejected>${PURGE_RETENTION_DAYS.rejected}d, needs_source>${PURGE_RETENTION_DAYS.needsSource}d)`);
  } else {
    console.log("[Purge] Auto-purge disabled (set PURGE_ENABLED=true to enable)");
  }

  console.log("[Scheduler] All recurring jobs registered.");
}
