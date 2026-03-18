import app from "./app";
import cron from "node-cron";
import { runScraper } from "./services/scraper.js";

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

  // Run scraper daily at 06:00 UTC
  cron.schedule("0 6 * * *", async () => {
    console.log("[Scraper] Starting scheduled run...");
    try {
      const result = await runScraper();
      console.log(`[Scraper] Completed: ${result.discovered} new projects found from ${result.processed} articles`);
    } catch (err) {
      console.error("[Scraper] Error:", err);
    }
  });

  console.log("[Scraper] Scheduled to run daily at 06:00 UTC");
});
