/**
 * Badge awarding service.
 * Called after every contributor_submissions approval.
 * Idempotent — existing badges are never re-awarded.
 *
 * awardBadges(contributorId, justApprovedSubmissionId?)
 *   - justApprovedSubmissionId: the ID of the submission that was just approved.
 *     Required for scoop detection. Safe to omit — scoop check is skipped when absent.
 */

import { db, contributorsTable, contributorSubmissionsTable, contributorBadgesTable, projectsTable } from "@workspace/db";
import { eq, and, count, countDistinct } from "drizzle-orm";

const TIER_RULES: { slug: string; threshold: number }[] = [
  { slug: "bronze",   threshold: 1   },
  { slug: "silver",   threshold: 10  },
  { slug: "gold",     threshold: 50  },
  { slug: "platinum", threshold: 200 },
];

const TIER_ORDER = ["bronze", "silver", "gold", "platinum"];

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

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

export async function awardBadges(contributorId: number, justApprovedSubmissionId?: number): Promise<void> {
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

    // ── corroborator — 10+ approved with both URLs from trusted domains ──────
    // needsExtraScrutiny = false means both URLs were on the trusted domain allowlist.
    // The flag is set once at submission time and never changed.
    const [corrStats] = await db
      .select({ corroboratorCount: count() })
      .from(contributorSubmissionsTable)
      .where(
        and(
          eq(contributorSubmissionsTable.contributorId, contributorId),
          eq(contributorSubmissionsTable.status, "approved"),
          eq(contributorSubmissionsTable.needsExtraScrutiny, false),
        ),
      );

    if ((corrStats?.corroboratorCount ?? 0) >= 10) {
      await award(contributorId, "corroborator", {
        approvedCorroboratedCount: corrStats?.corroboratorCount,
      });
    }

    // ── scoop — community submission predated scraper discovery by 48h+ ──────
    // Two qualifying scenarios (checked with OR):
    //   A. The linked energy_projects row has communitySubmissionId === this submission's id.
    //      This means the community submission created the project — scrapers never found it
    //      independently. The community reporter was first by definition.
    //   B. The submission's createdAt predates the project's discoveredAt by 48+ hours.
    //      This applies when a scraper later found the same deal. In this model both would
    //      produce separate energy_projects rows; this branch handles future merge/dedup flows.
    //
    // Only one scoop badge is ever awarded per contributor (first qualifying submission wins).
    if (justApprovedSubmissionId !== undefined) {
      const [sub] = await db
        .select({
          id: contributorSubmissionsTable.id,
          linkedProjectId: contributorSubmissionsTable.linkedProjectId,
          createdAt: contributorSubmissionsTable.createdAt,
        })
        .from(contributorSubmissionsTable)
        .where(eq(contributorSubmissionsTable.id, justApprovedSubmissionId))
        .limit(1);

      if (sub?.linkedProjectId) {
        const [ep] = await db
          .select({
            id: projectsTable.id,
            communitySubmissionId: projectsTable.communitySubmissionId,
            discoveredAt: projectsTable.discoveredAt,
          })
          .from(projectsTable)
          .where(eq(projectsTable.id, sub.linkedProjectId))
          .limit(1);

        if (ep) {
          const isCommunityCreated = ep.communitySubmissionId === justApprovedSubmissionId;
          const leadMs = ep.discoveredAt && sub.createdAt
            ? ep.discoveredAt.getTime() - sub.createdAt.getTime()
            : 0;
          const isTimingScoop = !isCommunityCreated && leadMs >= FORTY_EIGHT_HOURS_MS;

          if (isCommunityCreated || isTimingScoop) {
            const leadDays = isTimingScoop ? Math.round(leadMs / (24 * 60 * 60 * 1000)) : null;
            await award(contributorId, "scoop", { projectId: ep.id, leadDays });
          }
        }
      }
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
