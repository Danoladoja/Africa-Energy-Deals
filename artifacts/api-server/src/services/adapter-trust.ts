/**
 * Adapter Trust Scoring (Idea 7)
 *
 * Tracks each adapter's historical accuracy — what % of its candidates
 * get approved vs. reviewed vs. rejected. Uses this to dynamically adjust
 * the adapter's confidence weight in the composite scoring formula.
 *
 * Trust factor:
 *  - New adapters start at 1.0 (neutral)
 *  - After 5+ runs, trust adjusts based on approval rate:
 *    - >70% approval rate → trust increases toward 1.2
 *    - 40-70% approval rate → trust stays near 1.0
 *    - <40% approval rate → trust decreases toward 0.6
 *
 * The trust factor multiplies the adapter's raw confidence before it enters
 * the composite scoring formula (routing-engine.ts).
 *
 * Storage: In-memory with DB-backed aggregation from scraper_runs.
 * No new tables needed — reads from the existing scraper_runs table.
 */

import { db, scraperRunsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

export interface AdapterTrustScore {
  adapterKey: string;
  trustFactor: number;      // 0.6 – 1.2
  approvalRate: number;     // 0.0 – 1.0
  reviewRate: number;       // 0.0 – 1.0
  rejectionRate: number;    // 0.0 – 1.0
  totalRuns: number;
  totalCandidates: number;
  lastComputedAt: Date;
}

// In-memory cache of trust scores — refreshed periodically
const _trustCache = new Map<string, AdapterTrustScore>();
let _lastRefresh = 0;
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const MIN_RUNS_FOR_ADJUSTMENT = 5;
const DEFAULT_TRUST = 1.0;
const MAX_TRUST = 1.2;
const MIN_TRUST = 0.6;

/**
 * Get trust factor for a specific adapter.
 * Returns 1.0 if insufficient data or not yet computed.
 */
export async function getAdapterTrustFactor(adapterKey: string): Promise<number> {
  await refreshTrustCacheIfNeeded();
  return _trustCache.get(adapterKey)?.trustFactor ?? DEFAULT_TRUST;
}

/**
 * Get all adapter trust scores. Useful for the admin stats API.
 */
export async function getAllTrustScores(): Promise<AdapterTrustScore[]> {
  await refreshTrustCacheIfNeeded();
  return Array.from(_trustCache.values());
}

/**
 * Force refresh of trust scores (call after a scraper run completes).
 */
export async function refreshTrustScores(): Promise<void> {
  await computeTrustScores();
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function refreshTrustCacheIfNeeded(): Promise<void> {
  if (Date.now() - _lastRefresh < REFRESH_INTERVAL_MS) return;
  await computeTrustScores();
}

async function computeTrustScores(): Promise<void> {
  try {
    // Fetch the last 200 runs (covers all adapters with recent history)
    const runs = await db
      .select()
      .from(scraperRunsTable)
      .orderBy(desc(scraperRunsTable.startedAt))
      .limit(200);

    // Group by adapter key
    const byAdapter = new Map<string, typeof runs>();
    for (const run of runs) {
      const key = run.adapterKey ?? run.sourceName;
      const existing = byAdapter.get(key);
      if (existing) {
        existing.push(run);
      } else {
        byAdapter.set(key, [run]);
      }
    }

    for (const [adapterKey, adapterRuns] of byAdapter) {
      const totalRuns = adapterRuns.length;

      // Sum up outcomes across runs
      let totalInserted = 0;
      let totalFlagged = 0;
      let totalRejected = 0;
      let totalFound = 0;

      for (const run of adapterRuns) {
        totalInserted += run.recordsInserted;
        totalFlagged += run.flaggedForReview;
        totalRejected += run.rejectedNonEnergyCount ?? 0;
        totalFound += run.recordsFound;
      }

      // "Approved" = inserted and not flagged for review
      // This is approximate — recordsInserted includes both approved and review-routed
      // A more precise calculation would need the actual review status breakdown
      const totalProcessed = totalInserted + totalFlagged + totalRejected;
      if (totalProcessed === 0) continue;

      // Approval rate = (inserted - flagged) / total processed
      // Note: recordsInserted includes flagged items (they're inserted with pending status)
      const approvedCount = Math.max(0, totalInserted - totalFlagged);
      const approvalRate = approvedCount / totalProcessed;
      const reviewRate = totalFlagged / totalProcessed;
      const rejectionRate = totalRejected / totalProcessed;

      // Compute trust factor
      let trustFactor = DEFAULT_TRUST;
      if (totalRuns >= MIN_RUNS_FOR_ADJUSTMENT) {
        // Linear interpolation:
        //   approvalRate >= 0.70 → trust → MAX_TRUST (1.2)
        //   approvalRate 0.40–0.70 → trust stays near 1.0
        //   approvalRate < 0.40 → trust → MIN_TRUST (0.6)
        if (approvalRate >= 0.70) {
          // Scale from 1.0 to 1.2 as approval rate goes from 0.70 to 1.0
          const t = (approvalRate - 0.70) / 0.30;
          trustFactor = DEFAULT_TRUST + t * (MAX_TRUST - DEFAULT_TRUST);
        } else if (approvalRate < 0.40) {
          // Scale from 1.0 to 0.6 as approval rate goes from 0.40 to 0.0
          const t = (0.40 - approvalRate) / 0.40;
          trustFactor = DEFAULT_TRUST - t * (DEFAULT_TRUST - MIN_TRUST);
        }
        // Between 0.40 and 0.70 → stays at 1.0
      }

      _trustCache.set(adapterKey, {
        adapterKey,
        trustFactor: Math.round(trustFactor * 100) / 100, // Round to 2 decimal places
        approvalRate: Math.round(approvalRate * 100) / 100,
        reviewRate: Math.round(reviewRate * 100) / 100,
        rejectionRate: Math.round(rejectionRate * 100) / 100,
        totalRuns,
        totalCandidates: totalProcessed,
        lastComputedAt: new Date(),
      });
    }

    _lastRefresh = Date.now();
  } catch (err) {
    console.error("[AdapterTrust] Failed to compute trust scores:", err);
    // Don't update _lastRefresh so it tries again soon
  }
}
