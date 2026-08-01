import app from "./app";
import { runStartupMigrations, runDataRepairs } from "./migrate.js";
import { initSchedules } from "./scheduler.js";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

async function start() {
  try {
    await runStartupMigrations();
  } catch (migrationErr) {
    console.error("[Migrate] FATAL migration error — server will still start but some endpoints may 500:", migrationErr);
  }
  try {
    await runDataRepairs();
  } catch (repairErr) {
    console.error("[Repair] data repairs failed:", repairErr);
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    // All recurring jobs live in scheduler.ts (singleton — safe even though
    // app.ts also initializes it in the production boot path).
    initSchedules();
  });
}

start().catch((err) => {
  console.error("[Startup] FATAL:", err);
  process.exit(1);
});
