/**
 * Badge awarding service.
 * Called after every contributor_submissions approval.
 * Idempotent — existing badges are never re-awarded.
 */

import { db, contributorsTable, contributorSubmissionsTable, contributorBadgesTable } from "@workspace/db";
import { eq, and, count, countDistinct, sql } from "drizzle-orm";

const TIER_RULES: { slug: string; threshold: number }[] = [
  { slug: "bronze",   threshold: 1   },
  { slug: "silver",   threshold: 10  },
  { slug: "gold",     threshold: 50  },
  { slug: "platinum", threshold: 200 },
];

const TIER_ORDER = ["bronze", "silver", "gold", "platinum"];

async function hasBadge(contributorId: number, badgeSlug: string): Promise<boolean> {
  const rows = await db
    .select({ id: contributorBadgesTable.id })
    .from(contributorBadgesTable)
    .where(
      and(
        eq(contributorBadgesTable.contributorId, contributorId),
        eq(contributorBadgesTable.badgeSlug, badgeSlug),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function award(contributorId: number, badgeSlug: string, metadata?: Record<string, unknown>): Promise<void> {
  if (await hasBadge(contributorId, badgeSlug)) return;
  await db.insert(contributorBadgesTable).values({ contributorId, badgeSlug, metadata: metadata ?? null });
  console.log(`[Badges] Awarded ${badgeSlug} to contributor ${contributorId}`);
}

export async function awardBadges(contributorId: number): Promise<void> {
  try {
    const [stats] = await db
      .select({ approvedCount: count() })
      .from(contributorSubmissionsTable)
      .where(
        and(
          eq(contributorSubmissionsTable.contributorId, contributorId),
          eq(contributorSubmissionsTable.status, "approved"),
        ),
      );

    const approvedCount = stats?.approvedCount ?? 0;

    // ── Tier badges ─────────────────────────────────────────────────────────
    let highestTier: string | null = null;
    for (const rule of TIER_RULES) {
      if (approvedCount >= rule.threshold) {
        await award(contributorId, rule.slug, { approvedCount });
        highestTier = rule.slug;
      }
    }

    if (highestTier) {
      await db
        .update(contributorsTable)
        .set({ currentTier: highestTier })
        .where(eq(contributorsTable.id, contributorId));
    }

    // ── first_light — first community approval ever ─────────────────────────
    if (approvedCount >= 1) {
      const [firstEver] = await db
        .select({ id: contributorSubmissionsTable.id })
        .from(contributorSubmissionsTable)
        .where(eq(contributorSubmissionsTable.status, "approved"))
        .orderBy(contributorSubmissionsTable.reviewedAt)
        .limit(1);

      const [myFirst] = await db
        .select({ id: contributorSubmissionsTable.id })
        .from(contributorSubmissionsTable)
        .where(
          and(
            eq(contributorSubmissionsTable.contributorId, contributorId),
            eq(contributorSubmissionsTable.status, "approved"),
          ),
        )
        .orderBy(contributorSubmissionsTable.reviewedAt)
        .limit(1);

      if (firstEver && myFirst && firstEver.id === myFirst.id) {
        await award(contributorId, "first_light");
      }
    }

    // ── country_specialist_<cc> — 10 approved in same country ───────────────
    const countryCounts = await db
      .select({
        country: contributorSubmissionsTable.country,
        cnt: count(),
      })
      .from(contributorSubmissionsTable)
      .where(
        and(
          eq(contributorSubmissionsTable.contributorId, contributorId),
          eq(contributorSubmissionsTable.status, "approved"),
        ),
      )
      .groupBy(contributorSubmissionsTable.country);

    for (const row of countryCounts) {
      if (row.cnt >= 10) {
        const cc = row.country.toLowerCase();
        await award(contributorId, `country_specialist_${cc}`, { country: row.country, count: row.cnt });
      }
    }

    // ── multi_sector — 3+ distinct sub-sectors ──────────────────────────────
    const [sectorStats] = await db
      .select({ distinctSectors: countDistinct(contributorSubmissionsTable.subSector) })
      .from(contributorSubmissionsTable)
      .where(
        and(
          eq(contributorSubmissionsTable.contributorId, contributorId),
          eq(contributorSubmissionsTable.status, "approved"),
        ),
      );

    if ((sectorStats?.distinctSectors ?? 0) >= 3) {
      await award(contributorId, "multi_sector", { sectors: sectorStats.distinctSectors });
    }

    // ── cross_border — 5+ distinct countries ────────────────────────────────
    const [countryStats] = await db
      .select({ distinctCountries: countDistinct(contributorSubmissionsTable.country) })
      .from(contributorSubmissionsTable)
      .where(
        and(
          eq(contributorSubmissionsTable.contributorId, contributorId),
          eq(contributorSubmissionsTable.status, "approved"),
        ),
      );

    if ((countryStats?.distinctCountries ?? 0) >= 5) {
      await award(contributorId, "cross_border", { countries: countryStats.distinctCountries });
    }

  } catch (err) {
    console.error(`[Badges] Error awarding badges for contributor ${contributorId}:`, err);
  }
}

export function highestTierLabel(tier: string | null): string {
  if (!tier) return "";
  const idx = TIER_ORDER.indexOf(tier);
  return idx >= 0 ? TIER_ORDER[idx] : tier;
}
