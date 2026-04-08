import { Request, Response, NextFunction } from "express";
import { db, sessionsTable, userEmailsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isValidAdminToken } from "./adminAuth.js";

export interface ReviewerRequest extends Request {
  reviewerEmail?: string;
  reviewerRole?: string;
}

export async function reviewerAuthMiddleware(
  req: ReviewerRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);

  // Allow admin tokens to access the review portal
  if (isValidAdminToken(token)) {
    req.reviewerEmail = "admin";
    req.reviewerRole = "admin";
    next();
    return;
  }

  try {
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.token, token))
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
