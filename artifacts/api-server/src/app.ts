import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import router from "./routes";

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

// Mount API routes
app.use("/api", router);

export default app;
