import type { Request, Response, NextFunction } from "express";
import { db, sessionsTable } from "@workspace/db";
import { eq, gt } from "drizzle-orm";

export interface AuthenticatedRequest extends Request {
  userEmail?: string;
  sessionToken?: string;
}

export async function sessionAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required." });
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
      res.status(401).json({ error: "Session expired or invalid. Please sign in again." });
      return;
    }

    req.userEmail = session.userEmail;
    req.sessionToken = token;
    next();
  } catch (err) {
    console.error("[Auth] Session lookup error:", err);
    res.status(500).json({ error: "Authentication error." });
  }
}

export async function optionalSessionAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const [session] = await db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.token, token))
        .limit(1);
      if (session && session.expiresAt >= new Date()) {
        (req as AuthenticatedRequest).userEmail = session.userEmail;
        (req as AuthenticatedRequest).sessionToken = token;
      }
    } catch {
    }
  }
  next();
}
