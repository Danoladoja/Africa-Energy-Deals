/**
 * Simple in-memory per-IP rate limiter for abuse-prone public endpoints
 * (email senders, subscriptions, key requests).
 *
 * Relies on `app.set("trust proxy", 1)` so `req.ip` reflects the real client
 * IP behind Railway's proxy — never trust raw X-Forwarded-For parsing.
 *
 * In-memory is fine here: limits reset on redeploy, which only ever makes the
 * limiter MORE permissive for a moment, and the app runs as a single instance.
 */

import type { Request, Response, NextFunction } from "express";

interface Bucket { count: number; resetAt: number; }

export function makeRateLimiter(options: { windowMs: number; max: number; label: string }) {
  const { windowMs, max, label } = options;
  const buckets = new Map<string, Bucket>();

  // Periodic cleanup so the map can't grow unbounded.
  setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(key);
    }
  }, Math.max(windowMs, 60_000)).unref?.();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip ?? "unknown";
    const now = Date.now();
    const bucket = buckets.get(ip);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count++;
    if (bucket.count > max) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({ error: `Too many ${label} requests. Please try again later.` });
      return;
    }
    next();
  };
}
