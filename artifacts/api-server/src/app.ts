import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import router from "./routes";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// In production: serve the built React frontend from the same process
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.join(process.cwd(), "artifacts/energy-tracker/dist/public");

  app.use(express.static(frontendDist));

  // SPA catch-all — serve index.html for all non-API routes so client-side routing works
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      res.status(404).json({ error: "Not found" });
    } else {
      res.sendFile(path.join(frontendDist, "index.html"));
    }
  });
}

export default app;
