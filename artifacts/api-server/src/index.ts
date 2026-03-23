import app from "./app";
import cron from "node-cron";
import { runSourceGroup, getSourceGroups } from "./services/scraper.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);

  // Stagger source group scrapes throughout the day (2 groups per hour starting at 06:00 UTC)
  // Groups: 11 total — 6 pairs, last group solo at 11:00 UTC
  const groups = getSourceGroups().map((g) => g.name);

  groups.forEach((groupName, i) => {
    const hour = 6 + Math.floor(i / 2);
    const minute = (i % 2) * 30; // 0 or 30 past the hour
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
});
