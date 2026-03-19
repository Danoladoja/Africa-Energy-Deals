import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Try to import and mount the API app
try {
  const apiModule = await import("./artifacts/api-server/src/app.ts");
  const apiApp = apiModule.default || apiModule.app;
  if (apiApp) {
    app.use(apiApp);
    console.log("API routes mounted successfully");
  }
} catch (err) {
  console.error("Failed to import API app:", err.message);
}

// Serve frontend static files
const frontendDist = path.join(__dirname, "artifacts/energy-tracker/dist");
app.use(express.static(frontendDist));

// SPA fallback - serve index.html for all unmatched routes
app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Railway server listening on port " + PORT);
});
