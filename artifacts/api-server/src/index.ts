import app from "./app";
import cron from "node-cron";
import { runSourceGroup, getSourceGroups } from "./services/scraper.js";
import { startNewsletterScheduler } from "./services/newsletter-scheduler.js";
import { runStartupMigrations } from "./migrate.js";
import { ADAPTER_REGISTRY, runAdapter } from "./scraper/adapter-runner.js";
import { db, projectsTable, scraperRunsTable } from "@workspace/db";
import { lt, sql } from "drizzle-orm";
import { PURGE_RETENTION_DAYS } from "@workspace/shared";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  // Run idempotent schema migrations before accepting connections.
  // A failed migration must NOT crash the server — it would cause Railway to
  // enter an infinite crash-loop.  We log loudly and continue; the affected
  // endpoints will 500 until the column is present, but every other endpoint
  // keeps working and the column error is clearly visible in Railway logs.
  try {
    await runStartupMigrations();
  } catch (migrationErr) {
    console.error("[Migrate] FATAL migration error — server will still start but some endpoints may 500:", migrationErr);
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);

    // Stagger source group scrapes throughout the day (2 groups per hour starting at 06:00 UTC)
    const groups = getSourceGroups().map((g) => g.name);

    groups.forEach((groupName, i) => {
      const hour = 6 + Math.floor(i / 2);
      const minute = (i % 2) * 30;
      const cronExpr = `${minute} ${hour} * * *`;

      cron.schedule(cronExpr, async () => {
        console.log(`[Scraper] Starting scheduled run for "${groupName}"...`);
        try {
          const result = await runSourceGroup(groupName, "schedule");
          console.log(`[Scraper] "${groupName}" complete: ${result.discovered} new, ${result.updated} updated, ${result.flagged} flagged`);
        } catch (err) {
          console.error(`[Scraper] "${groupName}" error:`, err);
        }
      });

      console.log(`[Scraper] "${groupName}" scheduled daily at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} UTC`);
    });

    // Schedule new DFI / RSS adapters — each has its own cron expression
    for (const adapter of ADAPTER_REGISTRY) {
      try {
        cron.schedule(adapter.schedule, async () => {
          console.log(`[Adapter] Scheduled run: ${adapter.key}`);
          try {
            const r = await runAdapter(adapter.key, "schedule");
            console.log(`[Adapter] ${adapter.key} complete — inserted:${r.rowsInserted} updated:${r.rowsUpdated} flagged:${r.rowsFlagged}`);
          } catch (err) {
            console.error(`[Adapter] ${adapter.key} error:`, err);
          }
        });
        console.log(`[Adapter] "${adapter.key}" scheduled: ${adapter.schedule}`);
      } catch (err) {
        console.warn(`[Adapter] Could not schedule "${adapter.key}": ${err}`);
      }
    }

    startNewsletterScheduler();

    // ── Daily auto-purge (03:00 UTC) ────────────────────────────────────────
    // Enabled only when PURGE_ENABLED=true. Kill-switch lets us disable
    // instantly if something looks wrong in the first 48 hours after deploy.
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
