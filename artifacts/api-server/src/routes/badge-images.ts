import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";
import { db, contributorsTable, contributorBadgesTable, contributorSubmissionsTable } from "@workspace/db";
import { eq, and, count, countDistinct } from "drizzle-orm";
import {
  renderBadgePng,
  renderBadgeSvgOutput,
  buildStatLine,
  buildOgHtml,
  invalidateBadgeCache,
} from "../services/badge-image.js";

const router = Router();

const SITE_URL = process.env["SITE_URL"] ?? "https://afrienergytracker.io";
const BASE_PATH = process.env["NODE_ENV"] === "production" ? "" : "/energy-tracker";

// ── Helper: get contributor + badge info from DB ──────────────────────────────
async function getContributorBadgeData(contributorId: number, badgeSlug: string) {
  const [contributor] = await db
    .select({
      id: contributorsTable.id,
      displayName: contributorsTable.displayName,
      slug: contributorsTable.slug,
      country: contributorsTable.country,
      isPublic: contributorsTable.isPublic,
      currentTier: contributorsTable.currentTier,
    })
    .from(contributorsTable)
    .where(eq(contributorsTable.id, contributorId))
    .limit(1);

  if (!contributor) return null;

  const [badge] = await db
    .select()
    .from(contributorBadgesTable)
    .where(
      and(
        eq(contributorBadgesTable.contributorId, contributorId),
        eq(contributorBadgesTable.badgeSlug, badgeSlug)
      )
    )
    .limit(1);

  if (!badge) return null;

  // Get approved count and stats for stat line
  const [stats] = await db
    .select({
      approvedCount: count(),
      distinctCountries: countDistinct(contributorSubmissionsTable.country),
      distinctSectors: countDistinct(contributorSubmissionsTable.subSector),
    })
    .from(contributorSubmissionsTable)
    .where(
      and(
        eq(contributorSubmissionsTable.contributorId, contributorId),
        eq(contributorSubmissionsTable.status, "approved")
      )
    );

  const awardedAt = new Date(badge.awardedAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const statLine = buildStatLine(badgeSlug, {
    approvedCount: stats?.approvedCount ?? 0,
    distinctCountries: stats?.distinctCountries ?? 0,
    distinctSectors: stats?.distinctSectors ?? 0,
    country: contributor.country ?? undefined,
  });

  const cacheVersion = createHash("md5")
    .update(`${contributor.displayName}|${statLine}|${awardedAt}`)
    .digest("hex")
    .slice(0, 8);

  return {
    contributor,
    badge,
    stats,
    statLine,
    awardedAt,
    renderParams: {
      contributorId,
      badgeSlug,
      displayName: contributor.displayName,
      statLine,
      awardedAt,
      cacheVersion,
    },
  };
}

// ── Badge PNG ─────────────────────────────────────────────────────────────────
// GET /api/badges/:contributorId/:badgeSlug.png?format=social|square
router.get("/badges/:contributorId/:badgeSlug.png", async (req: Request, res: Response) => {
  try {
    const contributorId = parseInt(req.params["contributorId"]);
    const badgeSlug = req.params["badgeSlug"];
    const format = req.query["format"] === "square" ? "square" : "social";

    if (isNaN(contributorId)) { res.status(400).json({ error: "Invalid contributor ID" }); return; }

    const data = await getContributorBadgeData(contributorId, badgeSlug);
    if (!data) { res.status(404).json({ error: "Contributor or badge not found" }); return; }

    const png = await renderBadgePng(data.renderParams, format);
    res.set({
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      "X-Cache-Key": data.renderParams.cacheVersion,
    });
    res.send(png);
  } catch (err) {
    console.error("[BadgeImage] PNG render error:", err);
    res.status(500).json({ error: "Image rendering failed" });
  }
});

// ── Badge SVG ─────────────────────────────────────────────────────────────────
router.get("/badges/:contributorId/:badgeSlug.svg", async (req: Request, res: Response) => {
  try {
    const contributorId = parseInt(req.params["contributorId"]);
    const badgeSlug = req.params["badgeSlug"];
    const format = req.query["format"] === "square" ? "square" : "social";

    if (isNaN(contributorId)) { res.status(400).json({ error: "Invalid contributor ID" }); return; }

    const data = await getContributorBadgeData(contributorId, badgeSlug);
    if (!data) { res.status(404).json({ error: "Contributor or badge not found" }); return; }

    const svg = await renderBadgeSvgOutput(data.renderParams, format);
    res.set({ "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" });
    res.send(svg);
  } catch (err) {
    console.error("[BadgeImage] SVG render error:", err);
    res.status(500).json({ error: "SVG rendering failed" });
  }
});

// ── Badge download ────────────────────────────────────────────────────────────
// GET /api/badges/:contributorId/:badgeSlug/download?format=png&size=social|square
router.get("/badges/:contributorId/:badgeSlug/download", async (req: Request, res: Response) => {
  try {
    const contributorId = parseInt(req.params["contributorId"]);
    const badgeSlug = req.params["badgeSlug"];
    const fmt = req.query["format"] === "svg" ? "svg" : "png";
    const size = req.query["size"] === "square" ? "square" : "social";

    if (isNaN(contributorId)) { res.status(400).json({ error: "Invalid contributor ID" }); return; }

    const data = await getContributorBadgeData(contributorId, badgeSlug);
    if (!data) { res.status(404).json({ error: "Contributor or badge not found" }); return; }

    const safeName = data.contributor.displayName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const filename = `afrienergy-${badgeSlug}-${safeName}.${fmt}`;

    res.set("Content-Disposition", `attachment; filename="${filename}"`);

    if (fmt === "svg") {
      const svg = await renderBadgeSvgOutput(data.renderParams, size);
      res.set("Content-Type", "image/svg+xml");
      res.send(svg);
    } else {
      const png = await renderBadgePng(data.renderParams, size);
      res.set("Content-Type", "image/png");
      res.send(png);
    }
  } catch (err) {
    console.error("[BadgeImage] Download error:", err);
    res.status(500).json({ error: "Download failed" });
  }
});

// ── Contributor OG image redirect ─────────────────────────────────────────────
// GET /api/contributors/:slug/og-image → 302 to highest-tier badge image
router.get("/contributors/:slug/og-image", async (req: Request, res: Response) => {
  try {
    const [contributor] = await db
      .select({ id: contributorsTable.id, currentTier: contributorsTable.currentTier })
      .from(contributorsTable)
      .where(eq(contributorsTable.slug, req.params["slug"]))
      .limit(1);

    if (!contributor) { res.status(404).json({ error: "Not found" }); return; }

    const tierOrder = ["platinum", "gold", "silver", "bronze"];
    const slug = tierOrder.find((t) => t === contributor.currentTier) ?? "bronze";
    res.redirect(302, `/api/badges/${contributor.id}/${slug}.png?format=social`);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── OG preview pages (for bots/crawlers) ─────────────────────────────────────
// GET /api/contributors/:slug/preview → HTML with OG meta
router.get("/contributors/:slug/preview", async (req: Request, res: Response) => {
  try {
    const [contributor] = await db
      .select({
        id: contributorsTable.id,
        displayName: contributorsTable.displayName,
        slug: contributorsTable.slug,
        currentTier: contributorsTable.currentTier,
        isPublic: contributorsTable.isPublic,
      })
      .from(contributorsTable)
      .where(eq(contributorsTable.slug, req.params["slug"]))
      .limit(1);

    if (!contributor || !contributor.isPublic) { res.status(404).send("Not found"); return; }

    const [stats] = await db
      .select({ approvedCount: count(), distinctCountries: countDistinct(contributorSubmissionsTable.country) })
      .from(contributorSubmissionsTable)
      .where(and(eq(contributorSubmissionsTable.contributorId, contributor.id), eq(contributorSubmissionsTable.status, "approved")));

    const n = stats?.approvedCount ?? 0;
    const countries = stats?.distinctCountries ?? 0;
    const tierSlug = contributor.currentTier ?? "bronze";
    const imageUrl = `${SITE_URL}/api/badges/${contributor.id}/${tierSlug}.png?format=social`;
    const canonicalUrl = `${SITE_URL}/api/contributors/${contributor.slug}/preview`;
    const redirectUrl = `${SITE_URL}${BASE_PATH}/contributors/${contributor.slug}`;

    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(buildOgHtml({
      title: `${contributor.displayName} — Contributor to AfriEnergy Tracker`,
      description: `${n} approved energy investment ${n === 1 ? "deal" : "deals"} contributed across ${countries} African ${countries === 1 ? "country" : "countries"}.`,
      imageUrl,
      canonicalUrl,
      redirectUrl,
    }));
  } catch (err) {
    res.status(500).send("Error");
  }
});

// GET /api/contributors/:slug/badges/:badgeSlug/preview → HTML with badge-specific OG meta
router.get("/contributors/:slug/badges/:badgeSlug/preview", async (req: Request, res: Response) => {
  try {
    const [contributor] = await db
      .select({ id: contributorsTable.id, displayName: contributorsTable.displayName, slug: contributorsTable.slug, isPublic: contributorsTable.isPublic })
      .from(contributorsTable)
      .where(eq(contributorsTable.slug, req.params["slug"]))
      .limit(1);

    if (!contributor || !contributor.isPublic) { res.status(404).send("Not found"); return; }

    const badgeSlug = req.params["badgeSlug"];
    const data = await getContributorBadgeData(contributor.id, badgeSlug);
    if (!data) { res.status(404).send("Badge not found"); return; }

    const imageUrl = `${SITE_URL}/api/badges/${contributor.id}/${badgeSlug}.png?format=social`;
    const canonicalUrl = `${SITE_URL}/api/contributors/${contributor.slug}/badges/${badgeSlug}/preview`;
    const redirectUrl = `${SITE_URL}${BASE_PATH}/contributors/${contributor.slug}/badges/${badgeSlug}`;

    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(buildOgHtml({
      title: `${contributor.displayName} earned the ${badgeSlug.replace(/_/g, " ")} badge on AfriEnergy Tracker`,
      description: data.statLine,
      imageUrl,
      canonicalUrl,
      redirectUrl,
    }));
  } catch (err) {
    res.status(500).send("Error");
  }
});

export default router;
