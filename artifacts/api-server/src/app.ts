import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import router from "./routes";

const require = createRequire(import.meta.url);
const swaggerUi = require("swagger-ui-express") as typeof import("swagger-ui-express");
const yaml = require("js-yaml") as typeof import("js-yaml");

const app: Express = express();

// CORS: restrict to known origins
const allowedOrigins = [
  "https://africa-energy-deals-production.up.railway.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5000",
];

function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins.includes(origin)) return true;
  // Allow all Replit dev/preview domains
  if (origin.endsWith(".replit.dev") || origin.endsWith(".repl.co") || origin.endsWith(".picard.replit.dev")) return true;
  // Allow any localhost origin (dev environment — port may vary)
  if (origin.startsWith("http://localhost:") || origin === "http://localhost") return true;
  return false;
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, mobile apps)
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-API-Key", "Authorization"],
}));

// Rate limiter (in-memory, no external deps)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per minute per IP

const rateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }

  entry.count++;
  next();
};

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

app.use(rateLimiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger UI at /api/docs
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const specPath = join(__dirname, "openapi.yaml");
  const spec = yaml.load(readFileSync(specPath, "utf8")) as Record<string, unknown>;

  app.use("/api/docs", swaggerUi.serve);
  app.get("/api/docs", swaggerUi.setup(spec, {
    customSiteTitle: "AfriEnergy Tracker API",
    customCss: `
      body { background: #0b0f1a !important; }
      .swagger-ui .topbar { background: #0b0f1a !important; border-bottom: 1px solid rgba(255,255,255,0.08); }
      .swagger-ui .topbar-wrapper .link { visibility: hidden; }
      .swagger-ui .info .title { color: #00e676 !important; }
      .swagger-ui .scheme-container { background: #0f1724 !important; }
    `,
  }));
  // Serve the raw spec
  app.get("/api/openapi.json", (_req, res) => res.json(spec));
  app.get("/api/openapi.yaml", (_req, res) => {
    res.setHeader("Content-Type", "text/yaml");
    res.send(readFileSync(specPath, "utf8"));
  });
  console.log("[Swagger] Docs at /api/docs");
} catch (err) {
  console.warn("[Swagger] Failed to load spec:", err);
}

// Mount API routes
app.use("/api", router);

export default app;
