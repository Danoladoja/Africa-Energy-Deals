import app from "./app";
import cron from "node-cron";
import { runSourceGroup, getSourceGroups } from "./services/scraper.js";
import { startNewsletterScheduler } from "./services/newsletter-scheduler.js";
import { runStartupMigrations } from "./migrate.js";
import { ADAPTER_REGISTRY, runAdapter } from "./scraper/adapter-runner.js";

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
  // This ensures that columns added to the Drizzle schema are always present
  // in PostgreSQL — on both the local dev DB and the Railway production DB.
  await runStartupMigrations();

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
  });
}

start().catch((err) => {
  console.error("[Startup] FATAL:", err);
  process.exit(1);
});
