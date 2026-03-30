import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { createRequire } from "module";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import router from "./routes";
import { db, projectsTable } from "@workspace/db";
import { isNotNull } from "drizzle-orm";

const require = createRequire(import.meta.url);
const swaggerUi = require("swagger-ui-express") as typeof import("swagger-ui-express");
const yaml = require("js-yaml") as typeof import("js-yaml");

const app: Express = express();

// CORS: restrict to known origins
const allowedOrigins = [
  "https://afrienergytracker.io",
  "http://afrienergytracker.io",
  "https://africa-energy-deals-production.up.railway.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5000",
];

function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins.includes(origin)) return true;
  // Allow production + any Railway preview domains
  if (origin.endsWith(".up.railway.app")) return true;
  // Allow all Replit dev/preview domains
  if (origin.endsWith(".replit.dev") || origin.endsWith(".repl.co") || origin.endsWith(".picard.replit.dev")) return true;
  // Allow any localhost origin (dev environment Ã¢ÂÂ port may vary)
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

// Security headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

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
    res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX);
    res.setHeader("X-RateLimit-Remaining", RATE_LIMIT_MAX - 1);
    res.setHeader("X-RateLimit-Reset", Math.ceil((now + RATE_LIMIT_WINDOW) / 1000));
    next();
    return;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    res.setHeader("Retry-After", Math.ceil(RATE_LIMIT_WINDOW / 1000));
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }

  entry.count++;
  res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, RATE_LIMIT_MAX - entry.count));
  res.setHeader("X-RateLimit-Reset", Math.ceil((entry.timestamp + RATE_LIMIT_WINDOW) / 1000));
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

// Dynamic sitemap.xml Ã¢ÂÂ must come BEFORE static files and SPA fallback
app.get("/sitemap.xml", async (_req: Request, res: Response) => {
  const BASE = "https://afrienergytracker.io";
  const now = new Date().toISOString().split("T")[0];

  try {
    const [countryRows, developerRows, projectRows] = await Promise.all([
      db
        .selectDistinct({ country: projectsTable.country })
        .from(projectsTable)
        .where(isNotNull(projectsTable.country)),
      db
        .selectDistinct({ developer: projectsTable.developer })
        .from(projectsTable)
        .where(isNotNull(projectsTable.developer)),
      db
        .select({ id: projectsTable.id })
        .from(projectsTable)
        .limit(2000),
    ]);

    const staticPages = [
      { loc: `${BASE}/`, priority: "1.0", freq: "daily" },
      { loc: `${BASE}/deals`, priority: "0.9", freq: "daily" },
      { loc: `${BASE}/countries`, priority: "0.9", freq: "weekly" },
      { loc: `${BASE}/developers`, priority: "0.8", freq: "weekly" },
      { loc: `${BASE}/insights`, priority: "0.7", freq: "weekly" },
    ];

    const countryPages = countryRows
      .filter((r) => r.country)
      .map((r) => ({
        loc: `${BASE}/countries/${encodeURIComponent(r.country!)}`,
        priority: "0.8",
        freq: "weekly",
      }));

    const developerPages = developerRows
      .filter((r) => r.developer)
      .map((r) => ({
        loc: `${BASE}/developers/${encodeURIComponent(r.developer!)}`,
        priority: "0.7",
        freq: "monthly",
      }));

    const dealPages = projectRows.map((r) => ({
      loc: `${BASE}/deals/${r.id}`,
      priority: "0.6",
      freq: "monthly",
    }));

    const allPages = [...staticPages, ...countryPages, ...developerPages, ...dealPages];

    const urls = allPages
      .map(
        (p) =>
          `  <url>\n    <loc>${p.loc}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${p.freq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
      )
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=43200"); // 12 h
    res.send(xml);
  } catch (err) {
    console.error("[Sitemap] Error generating sitemap:", err);
    res.status(500).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"></urlset>");
  }
});

// Mount API routes
app.use("/api", router);

// Serve the built frontend and SPA fallback for /energy-tracker/*
// This enables client-side routing on direct URL access and page refresh.
const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDistPath = resolve(__dirname, "../../energy-tracker/dist/public");
const clientIndexHtml = join(clientDistPath, "index.html");

if (existsSync(clientDistPath)) {
  // Serve static assets (JS, CSS, images, etc.)
  app.use("/energy-tracker", express.static(clientDistPath, { index: false }));

  // Catch-all: return index.html for any /energy-tracker/* path not matched above
  app.get("/energy-tracker/*splat", (_req: Request, res: Response) => {
    res.sendFile(clientIndexHtml);
  });
}

export default app;
