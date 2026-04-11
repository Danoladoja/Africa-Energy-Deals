import { Request, Response, NextFunction } from "express";
import { db, sessionsTable, userEmailsTable, reviewersTable, reviewerSessionsTable } from "@workspace/db";
import { and, eq, isNull, ne } from "drizzle-orm";
import { isValidAdminTokenAsync } from "./adminAuth.js";
import crypto from "crypto";

const COOKIE_NAME = "rv_sess";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface ReviewerRequest extends Request {
  reviewerEmail?: string;
  reviewerRole?: string;
}

export async function reviewerAuthMiddleware(
  req: ReviewerRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // ── Path 1: httpOnly cookie session (new magic-link reviewers) ────────────
  const cookieToken = (req as any).cookies?.[COOKIE_NAME];
  if (cookieToken) {
    try {
      const tokenHash = hashToken(cookieToken);
      const now = new Date();

      const rows = await db
        .select({ session: reviewerSessionsTable, reviewer: reviewersTable })
        .from(reviewerSessionsTable)
        .innerJoin(reviewersTable, eq(reviewerSessionsTable.reviewerId, reviewersTable.id))
        .where(and(eq(reviewerSessionsTable.tokenHash, tokenHash), isNull(reviewerSessionsTable.revokedAt)))
        .limit(1);

      const row = rows[0];
      if (row && row.session.expiresAt >= now && row.reviewer.isActive && row.reviewer.deletedAt === null) {
        req.reviewerEmail = row.reviewer.email;
        req.reviewerRole = "reviewer";
        next();
        return;
      }
    } catch {
      // fall through to Bearer token check
    }
  }

  // ── Path 2: Bearer token (admin or legacy user_emails-role reviewer) ──────
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);

  if (await isValidAdminTokenAsync(token)) {
    req.reviewerEmail = "admin";
    req.reviewerRole = "admin";
    next();
    return;
  }

  try {
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.token, token), ne(sessionsTable.userEmail, "__admin__")))
      .limit(1);

    if (!session || session.expiresAt < new Date()) {
      res.status(401).json({ error: "Session expired or invalid" });
      return;
    }

    const [userRecord] = await db
      .select({ role: userEmailsTable.role })
      .from(userEmailsTable)
      .where(eq(userEmailsTable.email, session.userEmail))
      .limit(1);

    const role = (userRecord?.role ?? "user").toUpperCase();
    if (role !== "REVIEWER" && role !== "ADMIN-REVIEWER" && role !== "ADMIN") {
      res.status(403).json({ error: "Reviewer access required" });
      return;
    }

    req.reviewerEmail = session.userEmail;
    req.reviewerRole = role.toLowerCase();
    next();
  } catch {
    res.status(500).json({ error: "Auth check failed" });
  }
}
