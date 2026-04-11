/**
 * Community contributions — submissions, profiles, admin management.
 *
 * Public:
 *   GET  /api/contributors/:slug          — public contributor profile
 *
 * Authenticated (cb_sess cookie):
 *   POST /api/contributions               — submit a deal
 *   GET  /api/contributions/me            — list own submissions
 *   PATCH /api/contributions/me/profile   — update profile settings
 *
 * Admin (Bearer token):
 *   GET  /api/admin/contributors          — list all contributors
 *   POST /api/admin/contributors/:id/ban  — ban a contributor
 *   POST /api/admin/contributors/:id/unban
 *   GET  /api/admin/contributors/recent-submissions
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  db,
  contributorsTable,
  contributorSessionsTable,
  contributorSubmissionsTable,
  contributorBadgesTable,
  projectsTable,
} from "@workspace/db";
import { eq, and, isNull, desc, or, count, countDistinct, sql } from "drizzle-orm";
import { adminAuthMiddleware } from "../middleware/adminAuth.js";
import { awardBadges } from "../services/badges.js";
import { isTrustedDomain, registeredDomain } from "../config/trusted-domains.js";

const router = Router();

const COOKIE_NAME = "cb_sess";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ── Per-user + per-IP in-memory rate limiters ─────────────────────────────────

const submissionsByUser = new Map<number, number[]>();
const submissionsByIp = new Map<string, number[]>();

function getDayWindow(): number {
  return Date.now() - 86_400_000;
}

async function getContributorFromCookie(req: Request): Promise<typeof contributorsTable.$inferSelect | null> {
  const token = (req as any).cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const tokenHash = hashToken(token);
    const now = new Date();
    const rows = await db
      .select({ session: contributorSessionsTable, contributor: contributorsTable })
      .from(contributorSessionsTable)
      .innerJoin(contributorsTable, eq(contributorSessionsTable.contributorId, contributorsTable.id))
      .where(and(eq(contributorSessionsTable.tokenHash, tokenHash), isNull(contributorSessionsTable.revokedAt)))
      .limit(1);
    const row = rows[0];
    if (!row || row.session.expiresAt < now || row.contributor.isBanned) return null;
    return row.contributor;
  } catch {
    return null;
  }
}

async function contributorDailyLimit(contributor: typeof contributorsTable.$inferSelect): Promise<number> {
  const [stats] = await db
    .select({
      total: count(),
      approved: count(sql`CASE WHEN ${contributorSubmissionsTable.status} = 'approved' THEN 1 END`),
    })
    .from(contributorSubmissionsTable)
    .where(eq(contributorSubmissionsTable.contributorId, contributor.id));

  const total = stats?.total ?? 0;
  const approved = stats?.approved ?? 0;

  if (total >= 10 && approved / total < 0.2) return 1;
  if (approved >= 5) return 10;
  return 3;
}

function checkUserRateLimit(contributorId: number, dailyLimit: number): boolean {
  const dayAgo = getDayWindow();
  const timestamps = (submissionsByUser.get(contributorId) ?? []).filter((t) => t > dayAgo);
  return timestamps.length >= dailyLimit;
}

function checkIpRateLimit(ip: string): boolean {
  const dayAgo = getDayWindow();
  const timestamps = (submissionsByIp.get(ip) ?? []).filter((t) => t > dayAgo);
  return timestamps.length >= 10;
}

function recordSubmission(contributorId: number, ip: string): void {
  const now = Date.now();
  const dayAgo = getDayWindow();
  submissionsByUser.set(contributorId, [...(submissionsByUser.get(contributorId) ?? []).filter((t) => t > dayAgo), now]);
  submissionsByIp.set(ip, [...(submissionsByIp.get(ip) ?? []).filter((t) => t > dayAgo), now]);
}

async function checkUrlReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "AfricaEnergyTracker/1.0 (link-checker)" },
    });
    clearTimeout(timer);
    return response.ok || response.status === 301 || response.status === 302 || response.status === 403;
  } catch {
    return false;
  }
}

// ── POST /api/contributions — submit a deal ───────────────────────────────────

router.post("/contributions", async (req: Request, res: Response) => {
  const contributor = await getContributorFromCookie(req);
  if (!contributor) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }

  if (contributor.isBanned) {
    res.status(403).json({ error: "Account suspended" });
    return;
  }

  const clientIp = (req.ip ?? "unknown").replace(/^::ffff:/, "");

  const {
    projectName,
    country,
    subSector,
    description,
    newsUrl,
    newsUrl2,
    investmentAmountUsdMn,
    submitterNote,
    website: honeypot,
  } = req.body as {
    projectName?: string;
    country?: string;
    subSector?: string;
    description?: string;
    newsUrl?: string;
    newsUrl2?: string;
    investmentAmountUsdMn?: number;
    submitterNote?: string;
    website?: string;
  };

  if (honeypot) {
    res.json({ success: true, id: "sim_" + crypto.randomBytes(4).toString("hex") });
    return;
  }

  if (!projectName || projectName.trim().length < 3 || projectName.trim().length > 120) {
    res.status(400).json({ error: "Project name must be 3–120 characters" });
    return;
  }
  if (!country) { res.status(400).json({ error: "Country required" }); return; }
  if (!subSector) { res.status(400).json({ error: "Sub-sector required" }); return; }
  if (!description || description.trim().length < 20 || description.trim().length > 500) {
    res.status(400).json({ error: "Description must be 20–500 characters" });
    return;
  }
  if (!newsUrl || !newsUrl.startsWith("http")) {
    res.status(400).json({ error: "Primary news URL required (must start with http/https)" });
    return;
  }
  if (!newsUrl2 || !newsUrl2.startsWith("http")) {
    res.status(400).json({ error: "Corroborating URL required" });
    return;
  }

  const domain1 = registeredDomain(newsUrl);
  const domain2 = registeredDomain(newsUrl2);

  if (!domain1 || !domain2) {
    res.status(400).json({ error: "Invalid URL format" });
    return;
  }

  if (domain1 === domain2) {
    res.status(400).json({ error: "We require two different publications as sources. Both URLs are from the same domain." });
    return;
  }

  const dailyLimit = await contributorDailyLimit(contributor);
  if (checkUserRateLimit(contributor.id, dailyLimit)) {
    res.status(429).json({ error: `You've reached your daily submission limit of ${dailyLimit}. Come back tomorrow!` });
    return;
  }

  if (checkIpRateLimit(clientIp)) {
    res.status(429).json({ error: "Too many submissions from your location today. Please try again tomorrow." });
    return;
  }

  const existingProject = await db
    .select({ id: projectsTable.id, projectName: projectsTable.projectName })
    .from(projectsTable)
    .where(
      or(
        eq(projectsTable.newsUrl, newsUrl),
        eq(projectsTable.newsUrl2, newsUrl),
        eq(projectsTable.newsUrl, newsUrl2),
        eq(projectsTable.newsUrl2, newsUrl2),
      ),
    )
    .limit(1);

  if (existingProject.length > 0) {
    res.status(409).json({
      error: "duplicate",
      message: `This project already exists in our database: "${existingProject[0].projectName}"`,
      existingProjectId: existingProject[0].id,
    });
    return;
  }

  const existingSub = await db
    .select({ id: contributorSubmissionsTable.id })
    .from(contributorSubmissionsTable)
    .where(
      and(
        or(
          eq(contributorSubmissionsTable.newsUrl, newsUrl),
          eq(contributorSubmissionsTable.newsUrl2, newsUrl),
          eq(contributorSubmissionsTable.newsUrl, newsUrl2),
          eq(contributorSubmissionsTable.newsUrl2, newsUrl2),
        ),
        or(
          eq(contributorSubmissionsTable.status, "pending"),
          eq(contributorSubmissionsTable.status, "approved"),
        ),
      ),
    )
    .limit(1);

  if (existingSub.length > 0) {
    res.status(409).json({
      error: "duplicate",
      message: "A submission with one of these URLs is already pending review.",
    });
    return;
  }

  const trusted1 = isTrustedDomain(newsUrl);
  const trusted2 = isTrustedDomain(newsUrl2);
  const needsExtraScrutiny = !trusted1 || !trusted2;

  const [reachable1, reachable2] = await Promise.all([
    checkUrlReachable(newsUrl),
    checkUrlReachable(newsUrl2),
  ]);

  if (!reachable1) {
    res.status(400).json({ error: "Primary URL does not appear to be reachable. Please check the link and try again." });
    return;
  }
  if (!reachable2) {
    res.status(400).json({ error: "Corroborating URL does not appear to be reachable. Please check the link and try again." });
    return;
  }

  try {
    const [submission] = await db
      .insert(contributorSubmissionsTable)
      .values({
        contributorId: contributor.id,
        projectName: projectName.trim(),
        country,
        subSector,
        description: description.trim(),
        newsUrl,
        newsUrl2,
        investmentAmountUsdMn: investmentAmountUsdMn ?? null,
        submitterNote: submitterNote?.trim().slice(0, 300) ?? null,
        needsExtraScrutiny,
      })
      .returning();

    const [project] = await db
      .insert(projectsTable)
      .values({
        projectName: projectName.trim(),
        country,
        region: "Africa",
        technology: subSector,
        status: "Announced",
        description: description.trim(),
        newsUrl,
        newsUrl2,
        dealSizeUsdMn: investmentAmountUsdMn ?? null,
        isAutoDiscovered: true,
        reviewStatus: "pending",
        extractionSource: "community",
        submittedByContributorId: contributor.id,
        communitySubmissionId: submission.id,
        discoveredAt: new Date(),
      })
      .returning();

    await db
      .update(contributorSubmissionsTable)
      .set({ linkedProjectId: project.id })
      .where(eq(contributorSubmissionsTable.id, submission.id));

    await db
      .update(contributorsTable)
      .set({ lastSubmissionAt: new Date() })
      .where(eq(contributorsTable.id, contributor.id));

    recordSubmission(contributor.id, clientIp);

    res.json({ success: true, submissionId: submission.id, projectId: project.id });
  } catch (err) {
    console.error("[Contributions] Submit error:", err);
    res.status(500).json({ error: "Failed to save submission. Please try again." });
  }
});

// ── GET /api/contributions/me ────────────────────────────────────────────────

router.get("/contributions/me", async (req: Request, res: Response) => {
  const contributor = await getContributorFromCookie(req);
  if (!contributor) { res.status(401).json({ error: "Sign in required" }); return; }

  try {
    const submissions = await db
      .select()
      .from(contributorSubmissionsTable)
      .where(eq(contributorSubmissionsTable.contributorId, contributor.id))
      .orderBy(desc(contributorSubmissionsTable.createdAt));

    const badges = await db
      .select()
      .from(contributorBadgesTable)
      .where(eq(contributorBadgesTable.contributorId, contributor.id))
      .orderBy(desc(contributorBadgesTable.awardedAt));

    res.json({
      contributor: {
        id: contributor.id,
        email: contributor.email,
        displayName: contributor.displayName,
        slug: contributor.slug,
        country: contributor.country,
        bio: contributor.bio,
        isPublic: contributor.isPublic,
        currentTier: contributor.currentTier,
        createdAt: contributor.createdAt,
      },
      submissions,
      badges,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── PATCH /api/contributions/me/profile ──────────────────────────────────────

router.patch("/contributions/me/profile", async (req: Request, res: Response) => {
  const contributor = await getContributorFromCookie(req);
  if (!contributor) { res.status(401).json({ error: "Sign in required" }); return; }

  const { displayName, bio, country, isPublic } = req.body as {
    displayName?: string;
    bio?: string;
    country?: string;
    isPublic?: boolean;
  };

  const update: Partial<typeof contributorsTable.$inferInsert> = {};
  if (displayName !== undefined) {
    const trimmed = displayName.trim();
    if (trimmed.length < 2 || trimmed.length > 40) {
      res.status(400).json({ error: "Display name must be 2–40 characters" });
      return;
    }
    update.displayName = trimmed;
  }
  if (bio !== undefined) update.bio = bio.trim().slice(0, 280) || null;
  if (country !== undefined) update.country = country.slice(0, 2).toUpperCase() || null;
  if (isPublic !== undefined) update.isPublic = isPublic;

  await db.update(contributorsTable).set(update).where(eq(contributorsTable.id, contributor.id));
  res.json({ success: true });
});

// ── GET /api/contributors/:slug — public profile ──────────────────────────────

router.get("/contributors/:slug", async (req: Request, res: Response) => {
  try {
    const [contributor] = await db
      .select()
      .from(contributorsTable)
      .where(eq(contributorsTable.slug, req.params.slug))
      .limit(1);

    if (!contributor || !contributor.isPublic) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    const submissions = await db
      .select()
      .from(contributorSubmissionsTable)
      .where(
        and(
          eq(contributorSubmissionsTable.contributorId, contributor.id),
          eq(contributorSubmissionsTable.status, "approved"),
        ),
      )
      .orderBy(desc(contributorSubmissionsTable.reviewedAt))
      .limit(50);

    const badges = await db
      .select()
      .from(contributorBadgesTable)
      .where(eq(contributorBadgesTable.contributorId, contributor.id))
      .orderBy(desc(contributorBadgesTable.awardedAt));

    const [stats] = await db
      .select({
        totalApproved: count(),
        distinctCountries: countDistinct(contributorSubmissionsTable.country),
        distinctSectors: countDistinct(contributorSubmissionsTable.subSector),
      })
      .from(contributorSubmissionsTable)
      .where(
        and(
          eq(contributorSubmissionsTable.contributorId, contributor.id),
          eq(contributorSubmissionsTable.status, "approved"),
        ),
      );

    res.json({
      contributor: {
        displayName: contributor.displayName,
        slug: contributor.slug,
        country: contributor.country,
        bio: contributor.bio,
        currentTier: contributor.currentTier,
        createdAt: contributor.createdAt,
      },
      stats: stats ?? { totalApproved: 0, distinctCountries: 0, distinctSectors: 0 },
      submissions,
      badges,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Admin: GET /api/admin/contributors ───────────────────────────────────────

router.get("/admin/contributors", adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const contributors = await db
      .select({
        contributor: contributorsTable,
        totalSubmissions: count(contributorSubmissionsTable.id),
      })
      .from(contributorsTable)
      .leftJoin(contributorSubmissionsTable, eq(contributorSubmissionsTable.contributorId, contributorsTable.id))
      .groupBy(contributorsTable.id)
      .orderBy(desc(contributorsTable.createdAt));

    const approvalRates = await db
      .select({
        contributorId: contributorSubmissionsTable.contributorId,
        approved: count(sql`CASE WHEN ${contributorSubmissionsTable.status} = 'approved' THEN 1 END`),
        total: count(),
      })
      .from(contributorSubmissionsTable)
      .groupBy(contributorSubmissionsTable.contributorId);

    const rateMap = new Map(approvalRates.map((r) => [r.contributorId, r]));

    res.json(contributors.map(({ contributor, totalSubmissions }) => {
      const rates = rateMap.get(contributor.id);
      return {
        ...contributor,
        totalSubmissions,
        approvedCount: rates?.approved ?? 0,
        approvalRate: rates?.total ? Math.round((Number(rates.approved) / Number(rates.total)) * 100) : null,
      };
    }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Admin: GET /api/admin/contributors/recent-submissions ────────────────────

router.get("/admin/contributors/recent-submissions", adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const subs = await db
      .select({
        submission: contributorSubmissionsTable,
        contributorName: contributorsTable.displayName,
        contributorSlug: contributorsTable.slug,
      })
      .from(contributorSubmissionsTable)
      .innerJoin(contributorsTable, eq(contributorSubmissionsTable.contributorId, contributorsTable.id))
      .orderBy(desc(contributorSubmissionsTable.createdAt))
      .limit(50);

    res.json(subs.map(({ submission, contributorName, contributorSlug }) => ({
      ...submission,
      contributorName,
      contributorSlug,
    })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Admin: POST /api/admin/contributors/:id/ban ──────────────────────────────

router.post("/admin/contributors/:id/ban", adminAuthMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.update(contributorsTable).set({ isBanned: true }).where(eq(contributorsTable.id, id));
  res.json({ success: true });
});

// ── Admin: POST /api/admin/contributors/:id/unban ────────────────────────────

router.post("/admin/contributors/:id/unban", adminAuthMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.update(contributorsTable).set({ isBanned: false }).where(eq(contributorsTable.id, id));
  res.json({ success: true });
});

// ── Admin: POST /api/admin/contributor-submissions/:id/review ────────────────
// Called by admin when reviewing a community submission directly.

router.post("/admin/contributor-submissions/:id/review", adminAuthMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { action, rejectionReason, reviewerEmail } = req.body as {
    action: "approve" | "reject";
    rejectionReason?: string;
    reviewerEmail?: string;
  };

  try {
    const [sub] = await db
      .select()
      .from(contributorSubmissionsTable)
      .where(eq(contributorSubmissionsTable.id, id))
      .limit(1);

    if (!sub) { res.status(404).json({ error: "Submission not found" }); return; }

    const now = new Date();
    if (action === "approve") {
      await db.update(contributorSubmissionsTable).set({ status: "approved", reviewedAt: now, reviewedBy: reviewerEmail ?? "admin" }).where(eq(contributorSubmissionsTable.id, id));
      if (sub.linkedProjectId) {
        await db.update(projectsTable).set({ reviewStatus: "approved" }).where(eq(projectsTable.id, sub.linkedProjectId));
      }
      await awardBadges(sub.contributorId);
    } else {
      await db.update(contributorSubmissionsTable).set({ status: "rejected", reviewedAt: now, reviewedBy: reviewerEmail ?? "admin", rejectionReason: rejectionReason ?? null }).where(eq(contributorSubmissionsTable.id, id));
      if (sub.linkedProjectId) {
        await db.update(projectsTable).set({ reviewStatus: "rejected" }).where(eq(projectsTable.id, sub.linkedProjectId));
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
