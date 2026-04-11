/**
 * Contributor magic-link authentication.
 * Open self-registration: any email can request a link.
 * On first use, a contributor record is created.
 * Cookie: cb_sess (httpOnly, 30-day)
 */

import { Router } from "express";
import crypto from "crypto";
import {
  db,
  contributorsTable,
  contributorMagicTokensTable,
  contributorSessionsTable,
} from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { sendEmail } from "../services/email.js";

const router = Router();

const COOKIE_NAME = "cb_sess";
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000;

const emailRequests = new Map<string, number[]>();
const ipRequests = new Map<string, number[]>();

function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let attempts = 0;
  while (true) {
    const existing = await db
      .select({ id: contributorsTable.id })
      .from(contributorsTable)
      .where(eq(contributorsTable.slug, slug))
      .limit(1);
    if (existing.length === 0) return slug;
    attempts++;
    slug = `${base}-${attempts}`;
  }
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

function magicLinkEmail(link: string, displayName: string): string {
  return `<div style="font-family:Arial,sans-serif;background:#0b0f1a;color:#e2e8f0;padding:32px;max-width:520px;margin:0 auto;border-radius:12px;">
  <h1 style="color:#00e676;font-size:22px;margin:0 0 8px;">Sign in to AfriEnergy Tracker</h1>
  <p style="color:#94a3b8;margin:0 0 8px;">Hi ${displayName},</p>
  <p style="color:#94a3b8;margin:0 0 24px;">Click below to sign in and submit your energy deal. This link expires in <strong>15 minutes</strong> and can only be used once.</p>
  <a href="${link}" style="display:inline-block;background:#00e676;color:#0b0f1a;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">Sign In →</a>
  <p style="color:#475569;font-size:12px;margin:24px 0 0;">Or copy this link:<br/><span style="color:#64748b;word-break:break-all;">${link}</span></p>
  <p style="color:#475569;font-size:11px;margin:16px 0 0;">If you didn't request this, you can safely ignore this email.</p>
</div>`;
}

// POST /api/contributor-auth/request
router.post("/contributor-auth/request", async (req, res) => {
  const { email, displayName, country } = req.body as {
    email?: string;
    displayName?: string;
    country?: string;
  };
  const clientIp = (req.ip ?? "unknown").replace(/^::ffff:/, "");
  const ok = { message: "If your details are valid, you'll receive a sign-in link shortly." };

  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.json(ok);
    return;
  }

  if (!displayName || typeof displayName !== "string" || displayName.trim().length < 2) {
    res.status(400).json({ error: "Display name required (min 2 characters)" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedName = displayName.trim().slice(0, 40);

  if (isRateLimited(normalizedEmail, clientIp)) {
    res.json(ok);
    return;
  }

  try {
    recordRequest(normalizedEmail, clientIp);

    const plainToken = generateToken();
    const tokenHash = hashToken(plainToken);
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS);

    await db.insert(contributorMagicTokensTable).values({
      email: normalizedEmail,
      displayName: normalizedName,
      country: country?.slice(0, 2).toUpperCase() ?? null,
      tokenHash,
      expiresAt,
    });

    const appUrl = process.env.APP_URL ?? "https://afrienergytracker.io";
    const link = `${appUrl}/contribute/auth?token=${plainToken}`;
    await sendEmail(
      normalizedEmail,
      "Your AfriEnergy Tracker sign-in link",
      magicLinkEmail(link, normalizedName),
    );

    res.json(ok);
  } catch (err) {
    console.error("[Contributor Auth] request error:", err);
    res.json(ok);
  }
});

// POST /api/contributor-auth/callback — consume token, create contributor if new, set cookie
router.post("/contributor-auth/callback", async (req, res) => {
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
      .from(contributorMagicTokensTable)
      .where(
        and(
          eq(contributorMagicTokensTable.tokenHash, tokenHash),
          isNull(contributorMagicTokensTable.consumedAt),
        ),
      )
      .limit(1);

    if (!magicToken) {
      res.status(401).json({ error: "Invalid or already-used link" });
      return;
    }

    if (magicToken.expiresAt < now) {
      res.status(401).json({ error: "Link has expired. Please request a new one." });
      return;
    }

    await db
      .update(contributorMagicTokensTable)
      .set({ consumedAt: now })
      .where(eq(contributorMagicTokensTable.id, magicToken.id));

    let [contributor] = await db
      .select()
      .from(contributorsTable)
      .where(eq(contributorsTable.email, magicToken.email))
      .limit(1);

    if (!contributor) {
      const slug = await uniqueSlug(slugify(magicToken.displayName ?? "contributor"));
      const [created] = await db
        .insert(contributorsTable)
        .values({
          email: magicToken.email,
          displayName: magicToken.displayName ?? "Contributor",
          slug,
          country: magicToken.country ?? null,
          emailVerifiedAt: now,
        })
        .returning();
      contributor = created;
    } else if (!contributor.emailVerifiedAt) {
      await db
        .update(contributorsTable)
        .set({ emailVerifiedAt: now })
        .where(eq(contributorsTable.id, contributor.id));
    }

    if (contributor.isBanned) {
      res.status(403).json({ error: "Account suspended" });
      return;
    }

    const sessionToken = generateToken();
    const sessionHash = hashToken(sessionToken);
    const expiresAt = new Date(Date.now() + COOKIE_MAX_AGE_MS);

    await db.insert(contributorSessionsTable).values({
      contributorId: contributor.id,
      tokenHash: sessionHash,
      expiresAt,
    });

    res.cookie(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE_MS,
      path: "/",
    });

    res.json({
      success: true,
      contributor: {
        id: contributor.id,
        email: contributor.email,
        displayName: contributor.displayName,
        slug: contributor.slug,
        currentTier: contributor.currentTier,
      },
    });
  } catch (err) {
    console.error("[Contributor Auth] callback error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// GET /api/contributor-auth/me
router.get("/contributor-auth/me", async (req, res) => {
  const token = (req as any).cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ authenticated: false });
    return;
  }

  try {
    const tokenHash = hashToken(token);
    const now = new Date();

    const rows = await db
      .select({ session: contributorSessionsTable, contributor: contributorsTable })
      .from(contributorSessionsTable)
      .innerJoin(contributorsTable, eq(contributorSessionsTable.contributorId, contributorsTable.id))
      .where(
        and(
          eq(contributorSessionsTable.tokenHash, tokenHash),
          isNull(contributorSessionsTable.revokedAt),
        ),
      )
      .limit(1);

    const row = rows[0];

    if (!row || row.session.expiresAt < now || row.contributor.isBanned) {
      res.clearCookie(COOKIE_NAME, { path: "/" });
      res.status(401).json({ authenticated: false });
      return;
    }

    res.json({
      authenticated: true,
      contributor: {
        id: row.contributor.id,
        email: row.contributor.email,
        displayName: row.contributor.displayName,
        slug: row.contributor.slug,
        country: row.contributor.country,
        bio: row.contributor.bio,
        isPublic: row.contributor.isPublic,
        currentTier: row.contributor.currentTier,
      },
    });
  } catch (err) {
    console.error("[Contributor Auth] me error:", err);
    res.status(500).json({ error: "Auth check failed" });
  }
});

// POST /api/contributor-auth/logout
router.post("/contributor-auth/logout", async (req, res) => {
  const token = (req as any).cookies?.[COOKIE_NAME];
  if (token) {
    try {
      const tokenHash = hashToken(token);
      await db
        .update(contributorSessionsTable)
        .set({ revokedAt: new Date() })
        .where(eq(contributorSessionsTable.tokenHash, tokenHash));
    } catch {}
  }
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ success: true });
});

export default router;
