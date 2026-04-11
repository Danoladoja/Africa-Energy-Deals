import { Router } from "express";
import crypto from "crypto";
import {
  db,
  reviewersTable,
  reviewerMagicTokensTable,
  reviewerSessionsTable,
  reviewerAuditLogTable,
} from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { adminAuthMiddleware } from "../middleware/adminAuth.js";
import { sendEmail } from "../services/email.js";

const router = Router();

router.use("/admin/reviewers", adminAuthMiddleware);

function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function welcomeEmail(link: string, displayName: string | null): string {
  const name = displayName ? ` ${displayName}` : "";
  return `<div style="font-family:Arial,sans-serif;background:#0b0f1a;color:#e2e8f0;padding:32px;max-width:520px;margin:0 auto;border-radius:12px;">
  <h1 style="color:#00e676;font-size:22px;margin:0 0 8px;">Welcome to AfriEnergy Review Portal</h1>
  <p style="color:#94a3b8;margin:0 0 8px;">Hi${name},</p>
  <p style="color:#94a3b8;margin:0 0 24px;">You've been added as a reviewer on AfriEnergy Tracker. Click below to sign in and start reviewing energy investment deals.</p>
  <a href="${link}" style="display:inline-block;background:#00e676;color:#0b0f1a;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">Access Review Portal →</a>
  <p style="color:#475569;font-size:12px;margin:24px 0 0;">Or copy this link:<br/><span style="color:#64748b;word-break:break-all;">${link}</span></p>
  <p style="color:#475569;font-size:11px;margin:16px 0 0;">This link expires in 24 hours. If you need a new link later, you can request one from the review portal sign-in page.</p>
</div>`;
}

function signInEmail(link: string, displayName: string | null): string {
  const name = displayName ? ` ${displayName}` : "";
  return `<div style="font-family:Arial,sans-serif;background:#0b0f1a;color:#e2e8f0;padding:32px;max-width:520px;margin:0 auto;border-radius:12px;">
  <h1 style="color:#00e676;font-size:22px;margin:0 0 8px;">Sign in to Review Portal</h1>
  <p style="color:#94a3b8;margin:0 0 8px;">Hi${name},</p>
  <p style="color:#94a3b8;margin:0 0 24px;">An admin has sent you a sign-in link for the AfriEnergy Review Portal. Click below to access it.</p>
  <a href="${link}" style="display:inline-block;background:#00e676;color:#0b0f1a;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">Sign In →</a>
  <p style="color:#475569;font-size:12px;margin:24px 0 0;">Or copy: <span style="color:#64748b;word-break:break-all;">${link}</span></p>
  <p style="color:#475569;font-size:11px;margin:16px 0 0;">This link expires in 15 minutes. If you didn't expect this, ignore it.</p>
</div>`;
}

// GET /api/admin/reviewers
router.get("/admin/reviewers", async (_req, res) => {
  try {
    const reviewers = await db
      .select()
      .from(reviewersTable)
      .where(isNull(reviewersTable.deletedAt))
      .orderBy(desc(reviewersTable.createdAt));
    res.json({ reviewers });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/admin/reviewers — add reviewer
router.post("/admin/reviewers", async (req, res) => {
  const { email, displayName } = req.body as { email?: string; displayName?: string };
  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const [existing] = await db
      .select()
      .from(reviewersTable)
      .where(eq(reviewersTable.email, normalizedEmail))
      .limit(1);

    if (existing && !existing.deletedAt) {
      res.status(409).json({ error: "A reviewer with this email already exists" });
      return;
    }

    const [reviewer] = await db
      .insert(reviewersTable)
      .values({ email: normalizedEmail, displayName: displayName?.trim() || null, isActive: true, createdBy: "admin" })
      .returning();

    try {
      const plainToken = generateToken();
      const tokenHash = hashToken(plainToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.insert(reviewerMagicTokensTable).values({ reviewerId: reviewer.id, tokenHash, expiresAt });

      const appUrl = process.env.APP_URL ?? "https://afrienergytracker.io";
      const link = `${appUrl}/review/auth?token=${plainToken}`;
      await sendEmail(reviewer.email, "Welcome to AfriEnergy Review Portal", welcomeEmail(link, reviewer.displayName));
    } catch (emailErr) {
      console.error("[Admin Reviewers] Failed to send welcome email:", emailErr);
    }

    await db
      .insert(reviewerAuditLogTable)
      .values({ reviewerId: reviewer.id, action: "added", actor: "admin" })
      .catch(() => {});

    res.json({ success: true, reviewer });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/admin/reviewers/:id/send-link — (re)send magic link
router.post("/admin/reviewers/:id/send-link", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [reviewer] = await db
      .select()
      .from(reviewersTable)
      .where(and(eq(reviewersTable.id, id), eq(reviewersTable.isActive, true), isNull(reviewersTable.deletedAt)))
      .limit(1);

    if (!reviewer) { res.status(404).json({ error: "Reviewer not found or not active" }); return; }

    const plainToken = generateToken();
    const tokenHash = hashToken(plainToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.insert(reviewerMagicTokensTable).values({ reviewerId: reviewer.id, tokenHash, expiresAt });

    const appUrl = process.env.APP_URL ?? "https://afrienergytracker.io";
    const link = `${appUrl}/review/auth?token=${plainToken}`;
    await sendEmail(reviewer.email, "Your AfriEnergy Review Portal sign-in link", signInEmail(link, reviewer.displayName));

    await db
      .insert(reviewerAuditLogTable)
      .values({ reviewerId: reviewer.id, action: "admin_sent_link", actor: "admin" })
      .catch(() => {});

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/admin/reviewers/:id/suspend
router.patch("/admin/reviewers/:id/suspend", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const now = new Date();
    const [reviewer] = await db
      .update(reviewersTable)
      .set({ isActive: false, suspendedAt: now, suspendedBy: "admin" })
      .where(and(eq(reviewersTable.id, id), isNull(reviewersTable.deletedAt)))
      .returning();

    if (!reviewer) { res.status(404).json({ error: "Reviewer not found" }); return; }

    await db.update(reviewerSessionsTable).set({ revokedAt: now }).where(and(eq(reviewerSessionsTable.reviewerId, id), isNull(reviewerSessionsTable.revokedAt)));

    await db.insert(reviewerAuditLogTable).values({ reviewerId: id, action: "suspended", actor: "admin" }).catch(() => {});

    res.json({ success: true, reviewer });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/admin/reviewers/:id/reinstate
router.patch("/admin/reviewers/:id/reinstate", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [reviewer] = await db
      .update(reviewersTable)
      .set({ isActive: true, suspendedAt: null, suspendedBy: null })
      .where(and(eq(reviewersTable.id, id), isNull(reviewersTable.deletedAt)))
      .returning();

    if (!reviewer) { res.status(404).json({ error: "Reviewer not found" }); return; }

    await db.insert(reviewerAuditLogTable).values({ reviewerId: id, action: "reinstated", actor: "admin" }).catch(() => {});

    res.json({ success: true, reviewer });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/admin/reviewers/:id — soft delete (requires confirmEmail in body)
router.delete("/admin/reviewers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { confirmEmail } = req.body as { confirmEmail?: string };
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [reviewer] = await db
      .select()
      .from(reviewersTable)
      .where(and(eq(reviewersTable.id, id), isNull(reviewersTable.deletedAt)))
      .limit(1);

    if (!reviewer) { res.status(404).json({ error: "Reviewer not found" }); return; }

    if (confirmEmail?.toLowerCase().trim() !== reviewer.email) {
      res.status(400).json({ error: "Email confirmation does not match" });
      return;
    }

    const now = new Date();
    await db.update(reviewersTable).set({ deletedAt: now, isActive: false }).where(eq(reviewersTable.id, id));
    await db.update(reviewerSessionsTable).set({ revokedAt: now }).where(and(eq(reviewerSessionsTable.reviewerId, id), isNull(reviewerSessionsTable.revokedAt)));

    await db.insert(reviewerAuditLogTable).values({ reviewerId: id, action: "deleted", actor: "admin" }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/admin/reviewers/:id/audit
router.get("/admin/reviewers/:id/audit", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const logs = await db
      .select()
      .from(reviewerAuditLogTable)
      .where(eq(reviewerAuditLogTable.reviewerId, id))
      .orderBy(desc(reviewerAuditLogTable.createdAt))
      .limit(100);

    res.json({ auditLog: logs });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
