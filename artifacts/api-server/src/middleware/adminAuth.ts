import { Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";

const sessions = new Map<string, number>();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function createAdminToken(): string {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

export function isValidAdminToken(token: string): boolean {
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function revokeAdminToken(token: string): void {
  sessions.delete(token);
}

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  if (!isValidAdminToken(token)) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  next();
}
