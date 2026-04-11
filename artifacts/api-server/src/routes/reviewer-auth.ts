import { Router } from "express";
import crypto from "crypto";
import {
  db,
  reviewersTable,
  reviewerMagicTokensTable,
  reviewerSessionsTable,
  reviewerAuditLogTable,
} from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { sendEmail } from "../services/email.js";

const router = Router();

const COOKIE_NAME = "rv_sess";
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000;

const emailRequests = new Map<string, number[]>();
const ipRequests = new Map<string, number[]>();

function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isRateLimited(email: string, ip: string): boolean {
  const now = Date.now();
  const hourAgo = now - 3_600_000;
  const emailTs = (emailRequests.get(email) ?? []).filter((t) => t > hourAgo);
  if (emailTs.length >= 5) return true;
  const ipTs = (ipRequests.get(ip) ?? []).filter((t) => t > hourAgo);
  if (ipTs.length >= 20) return true;
  return false;
}

function recordRequest(email: string, ip: string) {
  const now = Date.now();
  const hourAgo = now - 3_600_000;
  emailRequests.set(email, [...(emailRequests.get(email) ?? []).filter((t) => t > hourAgo), now]);
  ipRequests.set(ip, [...(ipRequests.get(ip) ?? []).filter((t) => t > hourAgo), now]);
}

function magicLinkEmail(link: string, displayName: string | null): string {
  const name = displayName ? ` ${displayName}` : "";
  return `<div style="font-family:Arial,sans-serif;background:#0b0f1a;color:#e2e8f0;padding:32px;max-width:520px;margin:0 auto;border-radius:12px;">
  <h1 style="color:#00e676;font-size:22px;margin:0 0 8px;">Sign in to Review Portal</h1>
  <p style="color:#94a3b8;margin:0 0 8px;">Hi${name},</p>
  <p style="color:#94a3b8;margin:0 0 24px;">Click below to sign in. This link expires in <strong>15 minutes</strong> and can only be used once.</p>
  <a href="${link}" style="display:inline-block;background:#00e676;color:#0b0f1a;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">Sign In to Review Portal →</a>
  <p style="color:#475569;font-size:12px;margin:24px 0 0;">Or copy this link:<br/><span style="color:#64748b;word-break:break-all;">${link}</span></p>
  <p style="color:#475569;font-size:11px;margin:16px 0 0;">If you didn't request this, you can safely ignore this email.</p>
</div>`;
}

// POST /api/reviewer-auth/request — send magic link
router.post("/reviewer-auth/request", async (req, res) => {
  const { email } = req.body as { email?: string };
  const clientIp = (req.ip ?? "unknown").replace(/^::ffff:/, "");
  const ok = { message: "If that email is registered, you'll receive a sign-in link shortly." };

  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.json(ok);
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  if (isRateLimited(normalizedEmail, clientIp)) {
    res.json(ok);
    return;
  }

  try {
    const [reviewer] = await db
      .select()
      .from(reviewersTable)
      .where(
        and(
          eq(reviewersTable.email, normalizedEmail),
          eq(reviewersTable.isActive, true),
          isNull(reviewersTable.deletedAt),
        ),
      )
      .limit(1);

    if (!reviewer) {
      res.json(ok);
      return;
    }

    recordRequest(normalizedEmail, clientIp);

    const plainToken = generateToken();
    const tokenHash = hashToken(plainToken);
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS);

    await db.insert(reviewerMagicTokensTable).values({ reviewerId: reviewer.id, tokenHash, expiresAt });

    const appUrl = process.env.APP_URL ?? "https://afrienergytracker.io";
    const link = `${appUrl}/review/auth?token=${plainToken}`;
    await sendEmail(reviewer.email, "Your AfriEnergy Review Portal sign-in link", magicLinkEmail(link, reviewer.displayName));

    await db
      .insert(reviewerAuditLogTable)
      .values({ reviewerId: reviewer.id, action: "magic_link_requested", actor: `reviewer:${reviewer.email}`, ipAddress: clientIp, userAgent: req.headers["user-agent"] ?? null })
      .catch(() => {});

    res.json(ok);
  } catch (err) {
    console.error("[Reviewer Auth] request error:", err);
    res.json(ok);
  }
});

// POST /api/reviewer-auth/callback — consume token, set cookie
router.post("/reviewer-auth/callback", async (req, res) => {
  const { token } = req.body as { token?: string };

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token required" });
    return;
  }

  try {
    const tokenHash = hashToken(token);
    const now = new Date();

    const [magicToken] = await db
      .select()
      .from(reviewerMagicTokensTable)
      .where(and(eq(reviewerMagicTokensTable.tokenHash, tokenHash), isNull(reviewerMagicTokensTable.consumedAt)))
      .limit(1);

    if (!magicToken) {
      res.status(401).json({ error: "Invalid or already-used link" });
      return;
    }

    if (magicToken.expiresAt < now) {
      res.status(401).json({ error: "Link has expired. Please request a new one." });
      return;
    }

    const [reviewer] = await db
      .select()
      .from(reviewersTable)
      .where(and(eq(reviewersTable.id, magicToken.reviewerId), eq(reviewersTable.isActive, true), isNull(reviewersTable.deletedAt)))
      .limit(1);

    if (!reviewer) {
      res.status(401).json({ error: "Account not found or suspended" });
      return;
    }

    await db.update(reviewerMagicTokensTable).set({ consumedAt: now }).where(eq(reviewerMagicTokensTable.id, magicToken.id));

    const sessionToken = generateToken();
    const sessionHash = hashToken(sessionToken);
    const expiresAt = new Date(Date.now() + COOKIE_MAX_AGE_MS);

    await db.insert(reviewerSessionsTable).values({ reviewerId: reviewer.id, tokenHash: sessionHash, expiresAt });

    await db
      .insert(reviewerAuditLogTable)
      .values({ reviewerId: reviewer.id, action: "login", actor: `reviewer:${reviewer.email}`, ipAddress: (req.ip ?? "").replace(/^::ffff:/, ""), userAgent: req.headers["user-agent"] ?? null })
      .catch(() => {});

    res.cookie(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE_MS,
      path: "/",
    });

    res.json({ success: true, reviewer: { email: reviewer.email, displayName: reviewer.displayName } });
  } catch (err) {
    console.error("[Reviewer Auth] callback error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// GET /api/reviewer-auth/me — return current reviewer from cookie
router.get("/reviewer-auth/me", async (req, res) => {
  const token = (req as any).cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ authenticated: false });
    return;
  }

  try {
    const tokenHash = hashToken(token);
    const now = new Date();

    const rows = await db
      .select({ session: reviewerSessionsTable, reviewer: reviewersTable })
      .from(reviewerSessionsTable)
      .innerJoin(reviewersTable, eq(reviewerSessionsTable.reviewerId, reviewersTable.id))
      .where(and(eq(reviewerSessionsTable.tokenHash, tokenHash), isNull(reviewerSessionsTable.revokedAt)))
      .limit(1);

    const row = rows[0];

    if (!row || row.session.expiresAt < now || !row.reviewer.isActive || row.reviewer.deletedAt !== null) {
      res.clearCookie(COOKIE_NAME, { path: "/" });
      res.status(401).json({ authenticated: false });
      return;
    }

    res.json({
      authenticated: true,
      reviewer: { id: row.reviewer.id, email: row.reviewer.email, displayName: row.reviewer.displayName },
    });
  } catch (err) {
    console.error("[Reviewer Auth] me error:", err);
    res.status(500).json({ error: "Auth check failed" });
  }
});

// POST /api/reviewer-auth/logout — revoke session
router.post("/reviewer-auth/logout", async (req, res) => {
  const token = (req as any).cookies?.[COOKIE_NAME];
  if (token) {
    try {
      const tokenHash = hashToken(token);
      await db.update(reviewerSessionsTable).set({ revokedAt: new Date() }).where(eq(reviewerSessionsTable.tokenHash, tokenHash));
    } catch {}
  }
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ success: true });
});

export default router;
