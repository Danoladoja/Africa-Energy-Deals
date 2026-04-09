import { Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";
import { db, sessionsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const ADMIN_USER = "__admin__";

// In-memory cache for hot-path validation (populated from DB on miss)
const cache = new Map<string, number>();

export function createAdminToken(): string {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  cache.set(token, expiresAt.getTime());
  // Persist to DB (fire-and-forget — cache keeps things fast in the same process)
  db.insert(sessionsTable)
    .values({ token, userEmail: ADMIN_USER, expiresAt, createdAt: new Date() })
    .catch((err: Error) => console.error("[AdminAuth] Failed to persist session:", err.message));
  return token;
}

export async function isValidAdminTokenAsync(token: string): Promise<boolean> {
  // Fast path: in-memory cache (valid in current process lifetime)
  const cached = cache.get(token);
  if (cached) {
    if (Date.now() < cached) return true;
    cache.delete(token);
  }

  // Slow path: check DB (survives server restarts / Railway redeploys)
  try {
    const [row] = await db
      .select({ expiresAt: sessionsTable.expiresAt })
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.token, token),
          eq(sessionsTable.userEmail, ADMIN_USER),
          gt(sessionsTable.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (row) {
      // Repopulate cache from DB hit
      cache.set(token, row.expiresAt.getTime());
      return true;
    }
  } catch (err: any) {
    console.error("[AdminAuth] DB session check failed:", err.message);
  }
  return false;
}

export function isValidAdminToken(token: string): boolean {
  // Synchronous fast-path only (used by inline requireAdmin helpers in route files)
  const cached = cache.get(token);
  if (cached) {
    if (Date.now() < cached) return true;
    cache.delete(token);
  }
  return false;
}

export function revokeAdminToken(token: string): void {
  cache.delete(token);
  db.delete(sessionsTable)
    .where(and(eq(sessionsTable.token, token), eq(sessionsTable.userEmail, ADMIN_USER)))
    .catch((err: Error) => console.error("[AdminAuth] Failed to revoke session:", err.message));
}

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);

  // Try synchronous cache first
  if (isValidAdminToken(token)) {
    next();
    return;
  }

  // Fall through to async DB check (returns a Promise — Express handles this correctly
  // by catching the rejection, but we need to call next ourselves)
  isValidAdminTokenAsync(token).then(valid => {
    if (valid) {
      next();
    } else {
      res.status(401).json({ error: "Invalid or expired session" });
    }
  }).catch(() => {
    res.status(401).json({ error: "Invalid or expired session" });
  });
}
