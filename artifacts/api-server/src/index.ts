import app from "./app";
import cron from "node-cron";
import { startNewsletterScheduler } from "./services/newsletter-scheduler.js";
import { runStartupMigrations } from "./migrate.js";
import { ADAPTERS, runAdapter } from "./scraper/runner.js";
import { runUrlCheckSweep } from "./scraper/url-checker.js";
import { db, projectsTable, scraperRunsTable } from "@workspace/db";
import { lt, sql } from "drizzle-orm";
import { PURGE_RETENTION_DAYS } from "@workspace/shared";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

// Map our simple cadence strings to cron expressions.
const SCHEDULE_CRON: Record<"daily" | "weekly" | "monthly", string> = {
  daily: "0 4 * * *",        // 04:00 UTC daily
  weekly: "0 3 * * 0",       // 03:00 UTC Sundays
  monthly: "0 2 1 * *",      // 02:00 UTC on the 1st
};

async function start() {
  try {
    await runStartupMigrations();
  } catch (migrationErr) {
    console.error("[Migrate] FATAL migration error — server will still start but some endpoints may 500:", migrationErr);
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);

    // Schedule each adapter on its declared cadence.
    for (const adapter of ADAPTERS) {
      const cronExpr = SCHEDULE_CRON[adapter.config.schedule];
      try {
        cron.schedule(cronExpr, async () => {
          console.log(`[Adapter] Scheduled run: ${adapter.config.key}`);
          try {
            const r = await runAdapter(adapter, "schedule");
            console.log(`[Adapter] ${adapter.config.key} complete — inserted:${r.inserted} updated:${r.updated} flagged:${r.flagged} rejected:${r.rejected}`);
          } catch (err) {
            console.error(`[Adapter] ${adapter.config.key} error:`, err);
          }
        });
        console.log(`[Adapter] "${adapter.config.key}" scheduled (${adapter.config.schedule} → ${cronExpr})`);
      } catch (err) {
        console.warn(`[Adapter] Could not schedule "${adapter.config.key}": ${err}`);
      }
    }

    // Daily URL re-check sweep (catches link rot for projects older than 30 days).
    cron.schedule("0 5 * * *", async () => {
      console.log("[UrlCheck] Starting daily sweep…");
      try {
        const r = await runUrlCheckSweep({ batchSize: 200, maxAgeDays: 30, delayMs: 500 });
        console.log(`[UrlCheck] Done — checked:${r.checked} valid:${r.valid} broken:${r.broken} blocked:${r.blocked} timeout:${r.timeout}`);
      } catch (err) {
        console.error("[UrlCheck] Sweep error:", err);
      }
    });
    console.log("[UrlCheck] Daily sweep scheduled at 05:00 UTC");

    startNewsletterScheduler();

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
      });
      console.log(`[Purge] Auto-purge enabled — daily at 03:00 UTC (rejected>${PURGE_RETENTION_DAYS.rejected}d, needs_source>${PURGE_RETENTION_DAYS.needsSource}d)`);
    } else {
      console.log("[Purge] Auto-purge disabled (set PURGE_ENABLED=true to enable)");
    }
  });
}

start().catch((err) => {
  console.error("[Startup] FATAL:", err);
  process.exit(1);
});
