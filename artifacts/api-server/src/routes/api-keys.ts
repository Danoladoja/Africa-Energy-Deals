import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, apiKeysTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { sendEmail } from "../services/email.js";

const router: IRouter = Router();

function generateKey(): string {
  return "aet_" + randomBytes(24).toString("hex");
}

// Per-key daily usage counter (in-memory; resets on server restart)
const dailyUsage = new Map<string, { count: number; resetAt: number }>();

function getDailyCount(key: string): number {
  const now = Date.now();
  const entry = dailyUsage.get(key);
  if (!entry || now > entry.resetAt) return 0;
  return entry.count;
}

function incrementDailyCount(key: string): void {
  const now = Date.now();
  const entry = dailyUsage.get(key);
  const resetAt = new Date().setHours(24, 0, 0, 0); // next midnight
  if (!entry || now > entry.resetAt) {
    dailyUsage.set(key, { count: 1, resetAt });
  } else {
    entry.count++;
  }
}

// Middleware: check API key and enforce rate limits
export async function apiKeyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const keyHeader = req.headers["x-api-key"] as string | undefined;

  // No key provided — allow as "anonymous" (free tier, IP-based rate limiting handles this)
  if (!keyHeader) {
    next();
    return;
  }

  // Look up key in DB
  const [keyRecord] = await db.select().from(apiKeysTable).where(eq(apiKeysTable.key, keyHeader)).limit(1);

  if (!keyRecord) {
    res.status(401).json({ error: "Invalid API key.", docs: "/api/docs" });
    return;
  }

  const used = getDailyCount(keyHeader);
  if (used >= keyRecord.rateLimit) {
    res.status(429).json({
      error: "Daily rate limit exceeded.",
      limit: keyRecord.rateLimit,
      tier: keyRecord.tier,
      resetsAt: "midnight UTC",
    });
    return;
  }

  incrementDailyCount(keyHeader);

  // Update lastUsedAt (fire and forget)
  db.update(apiKeysTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeysTable.key, keyHeader))
    .catch(() => {});

  // Attach key info to request for downstream handlers
  (req as Request & { apiKey?: typeof keyRecord }).apiKey = keyRecord;
  next();
}

// POST /api/keys/request — request a new API key
router.post("/keys/request", async (req: Request, res: Response): Promise<void> => {
  const { organization, email, tier = "free" } = req.body ?? {};

  if (!organization || typeof organization !== "string" || organization.trim().length < 2) {
    res.status(400).json({ error: "organization is required (min 2 chars)." });
    return;
  }

  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  const validTiers = ["free", "institutional"];
  if (!validTiers.includes(tier)) {
    res.status(400).json({ error: `tier must be one of: ${validTiers.join(", ")}` });
    return;
  }

  const rateLimit = tier === "institutional" ? 10000 : 100;
  const key = generateKey();

  try {
    await db.insert(apiKeysTable).values({
      key,
      organization: organization.trim(),
      email: email.trim().toLowerCase(),
      tier,
      rateLimit,
    });

    // Send the key via email
    const appUrl = process.env.APP_URL ?? "https://afrienergytracker.io";
    await sendEmail(email, "Your AfriEnergy Tracker API Key", apiKeyEmail(key, organization, tier, rateLimit, appUrl));

    res.status(201).json({
      message: "API key created. Check your email.",
      tier,
      rateLimit,
      // Return key directly in dev mode (when no SMTP)
      ...(process.env.NODE_ENV === "development" ? { key } : {}),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ error: "An API key for this email already exists. Contact support to rotate it." });
      return;
    }
    console.error("[api-keys] insert error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /api/keys/validate — validate a key (for client-side checks)
router.get("/keys/validate", async (req: Request, res: Response): Promise<void> => {
  const key = req.headers["x-api-key"] as string | undefined;
  if (!key) {
    res.status(400).json({ error: "Provide X-API-Key header." });
    return;
  }
  const [record] = await db.select({
    organization: apiKeysTable.organization,
    tier: apiKeysTable.tier,
    rateLimit: apiKeysTable.rateLimit,
    createdAt: apiKeysTable.createdAt,
  }).from(apiKeysTable).where(eq(apiKeysTable.key, key)).limit(1);

  if (!record) {
    res.status(401).json({ valid: false });
    return;
  }

  const used = getDailyCount(key);
  res.json({ valid: true, ...record, usedToday: used, remaining: record.rateLimit - used });
});

function apiKeyEmail(key: string, org: string, tier: string, limit: number, appUrl: string): string {
  const isInstitutional = tier === "institutional";
  return `
    <div style="font-family:Arial,sans-serif;background:#0b0f1a;color:#e2e8f0;padding:32px;max-width:560px;margin:0 auto;border-radius:12px;">
      <h1 style="color:#00e676;font-size:22px;margin:0 0 6px;">Your AfriEnergy API Key</h1>
      <p style="color:#94a3b8;margin:0 0 24px;font-size:14px;">Welcome aboard, ${org}. Your ${tier} API key is ready.</p>

      <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">Your API Key</p>
        <code style="color:#00e676;font-size:14px;font-family:monospace;word-break:break-all;">${key}</code>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="color:#64748b;font-size:13px;padding:6px 0;">Tier</td><td style="color:#e2e8f0;text-align:right;font-size:13px;font-weight:600;">${isInstitutional ? "🏛 Institutional" : "🆓 Free"}</td></tr>
        <tr><td style="color:#64748b;font-size:13px;padding:6px 0;">Daily Limit</td><td style="color:#e2e8f0;text-align:right;font-size:13px;">${limit.toLocaleString()} requests/day</td></tr>
        <tr><td style="color:#64748b;font-size:13px;padding:6px 0;">Docs</td><td style="color:#00e676;text-align:right;font-size:13px;"><a href="${appUrl}/api/docs" style="color:#00e676;">${appUrl}/api/docs</a></td></tr>
      </table>

      <div style="background:#00e67610;border:1px solid #00e67630;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
        <p style="color:#94a3b8;font-size:12px;margin:0;"><strong style="color:#00e676;">Quick start:</strong> Add the header <code style="color:#00e676;">X-API-Key: ${key}</code> to all your API requests.</p>
      </div>

      <a href="${appUrl}/api-docs" style="display:inline-block;background:#00e676;color:#0b0f1a;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">Read the Docs →</a>

      <p style="color:#475569;font-size:11px;margin:24px 0 0;">Keep this key private. If you need to rotate it, reply to this email.</p>
    </div>
  `;
}

export default router;
