import { Router } from "express";
import crypto from "crypto";
import { db, userEmailsTable, magicLinkTokensTable, sessionsTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";
import { sendEmail, magicLinkEmail } from "../services/email.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

const APP_URL = process.env.APP_URL ?? "http://localhost:22663/energy-tracker";
const SESSION_DAYS = 30;
const TOKEN_HOURS = 1;

function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

async function pruneExpired() {
  const now = new Date();
  await db.delete(magicLinkTokensTable).where(lt(magicLinkTokensTable.expiresAt, now));
  await db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, now));
}

async function upsertUserEmail(email: string) {
  const existing = await db
    .select({ id: userEmailsTable.id })
    .from(userEmailsTable)
    .where(eq(userEmailsTable.email, email))
    .limit(1);

  if (existing.length > 0) {
    await db.update(userEmailsTable).set({ lastSeenAt: new Date() }).where(eq(userEmailsTable.email, email));
  } else {
    await db.insert(userEmailsTable).values({ email });
  }
}

router.post("/auth/email", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }

  try {
    await upsertUserEmail(trimmed);

    const token = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_HOURS * 60 * 60 * 1000);
    await db.insert(magicLinkTokensTable).values({ token, userEmail: trimmed, expiresAt, used: false });

    const verifyUrl = `${APP_URL}/auth/verify?token=${token}`;
    await sendEmail(trimmed, "Sign in to AfriEnergy Tracker", magicLinkEmail(verifyUrl, APP_URL));

    const devLink = process.env.NODE_ENV !== "production" ? verifyUrl : undefined;
    res.json({ success: true, devLink });
  } catch (err) {
    console.error("[Auth] Login error:", err);
    res.status(500).json({ error: "Failed to send sign-in link." });
  }
});

router.post("/auth/login", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }

  try {
    await upsertUserEmail(trimmed);

    const token = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_HOURS * 60 * 60 * 1000);
    await db.insert(magicLinkTokensTable).values({ token, userEmail: trimmed, expiresAt, used: false });

    const verifyUrl = `${APP_URL}/auth/verify?token=${token}`;
    await sendEmail(trimmed, "Sign in to AfriEnergy Tracker", magicLinkEmail(verifyUrl, APP_URL));

    const devLink = process.env.NODE_ENV !== "production" ? verifyUrl : undefined;
    res.json({ success: true, devLink });
  } catch (err) {
    console.error("[Auth] Login error:", err);
    res.status(500).json({ error: "Failed to send sign-in link." });
  }
});

router.get("/auth/verify", async (req, res) => {
  const { token } = req.query as { token?: string };
  if (!token) {
    res.status(400).json({ error: "Token is required." });
    return;
  }

  try {
    const [linkRow] = await db
      .select()
      .from(magicLinkTokensTable)
      .where(eq(magicLinkTokensTable.token, token))
      .limit(1);

    if (!linkRow) {
      res.status(400).json({ error: "Invalid or expired link." });
      return;
    }
    if (linkRow.used) {
      res.status(400).json({ error: "This link has already been used." });
      return;
    }
    if (linkRow.expiresAt < new Date()) {
      res.status(400).json({ error: "This link has expired. Please request a new one." });
      return;
    }

    await db
      .update(magicLinkTokensTable)
      .set({ used: true })
      .where(eq(magicLinkTokensTable.token, token));

    const sessionToken = generateToken(48);
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await db.insert(sessionsTable).values({
      token: sessionToken,
      userEmail: linkRow.userEmail,
      expiresAt,
    });

    await upsertUserEmail(linkRow.userEmail);

    pruneExpired().catch(() => {});

    res.json({ success: true, sessionToken, email: linkRow.userEmail });
  } catch (err) {
    console.error("[Auth] Verify error:", err);
    res.status(500).json({ error: "Verification failed." });
  }
});

router.get("/auth/me", async (req: AuthenticatedRequest, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.json({ authenticated: false });
    return;
  }
  const token = authHeader.slice(7);

  try {
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.token, token))
      .limit(1);

    if (!session || session.expiresAt < new Date()) {
      res.json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, email: session.userEmail });
  } catch {
    res.json({ authenticated: false });
  }
});

router.post("/auth/logout", async (req: AuthenticatedRequest, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
    } catch {}
  }
  res.json({ success: true });
});

export default router;
