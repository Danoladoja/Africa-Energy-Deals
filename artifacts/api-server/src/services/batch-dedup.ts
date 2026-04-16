/**
 * Intra-Batch Title Fingerprint Dedup (Idea 4)
 *
 * When running all adapters, multiple sources may discover the same project
 * (e.g., ESI Africa, Reuters, and AfDB all cover "Kenya 100MW Solar Plant").
 * Without intra-batch dedup, all three might get inserted because each one
 * passes the database dedup check before any of them are committed.
 *
 * This module deduplicates candidates WITHIN a single batch (before they
 * hit writeCandidate) by grouping on normalized name + country and keeping
 * the candidate with the highest completeness score.
 *
 * It also merges unique fields from duplicates into the surviving candidate
 * so no data is lost.
 */

import { type CandidateDraft } from "../scraper/base.js";
import { normalizeProjectName } from "./name-normalizer.js";
import { scoreCompleteness } from "./completeness-scorer.js";

export interface BatchDedupResult {
  deduplicated: CandidateDraft[];
  mergedCount: number;
  mergeLog: string[];
}

/**
 * Deduplicate candidates within a batch.
 *
 * Groups by (normalized project name + country). For each group:
 *  - Keeps the candidate with the highest completeness score
 *  - Merges non-null fields from other candidates into the winner
 *  - Logs what was merged
 */
export function deduplicateBatch(candidates: CandidateDraft[]): BatchDedupResult {
  if (candidates.length <= 1) {
    return { deduplicated: candidates, mergedCount: 0, mergeLog: [] };
  }

  // Group by fingerprint: normalizedName|country
  const groups = new Map<string, CandidateDraft[]>();

  for (const c of candidates) {
    const normalized = normalizeProjectName(c.projectName);
    const country = (c.country ?? "unknown").toLowerCase().trim();
    const key = `${normalized}|${country}`;

    const group = groups.get(key);
    if (group) {
      group.push(c);
    } else {
      groups.set(key, [c]);
    }
  }

  const deduplicated: CandidateDraft[] = [];
  let mergedCount = 0;
  const mergeLog: string[] = [];

  for (const [fingerprint, group] of groups) {
    if (group.length === 1) {
      deduplicated.push(group[0]);
      continue;
    }

    // Multiple candidates with same fingerprint — pick the best, merge the rest
    // Score each by completeness
    const scored = group.map((c) => ({
      candidate: c,
      completeness: scoreCompleteness(c).score,
    }));

    // Sort by completeness descending, then confidence descending
    scored.sort((a, b) => {
      if (b.completeness !== a.completeness) return b.completeness - a.completeness;
      return b.candidate.confidence - a.candidate.confidence;
    });

    const winner = { ...scored[0].candidate };
    const sources = group.map((c) => c.source).join(", ");

    // Merge non-null fields from losers into winner (never overwrite non-null)
    for (let i = 1; i < scored.length; i++) {
      const donor = scored[i].candidate;
      if (!winner.country && donor.country) winner.country = donor.country;
      if (!winner.technology && donor.technology) winner.technology = donor.technology;
      if (winner.dealSizeUsdMn === null && donor.dealSizeUsdMn !== null) winner.dealSizeUsdMn = donor.dealSizeUsdMn;
      if (!winner.developer && donor.developer) winner.developer = donor.developer;
      if (!winner.financiers && donor.financiers) winner.financiers = donor.financiers;
      if (!winner.dfiInvolvement && donor.dfiInvolvement) winner.dfiInvolvement = donor.dfiInvolvement;
      if (!winner.offtaker && donor.offtaker) winner.offtaker = donor.offtaker;
      if (!winner.dealStage && donor.dealStage) winner.dealStage = donor.dealStage;
      if (!winner.status && donor.status) winner.status = donor.status;
      if (!winner.description && donor.description) winner.description = donor.description;
      if (winner.capacityMw === null && donor.capacityMw !== null) winner.capacityMw = donor.capacityMw;
      if (winner.announcedYear === null && donor.announcedYear !== null) winner.announcedYear = donor.announcedYear;
      if (!winner.financialCloseDate && donor.financialCloseDate) winner.financialCloseDate = donor.financialCloseDate;
      // Keep the best confidence
      if (donor.confidence > winner.confidence) winner.confidence = donor.confidence;
    }

    deduplicated.push(winner);
    mergedCount += group.length - 1;
    mergeLog.push(
      `Merged ${group.length} instances of "${winner.projectName}" (${winner.country ?? "?"}) from [${sources}]`,
    );
  }

  return { deduplicated, mergedCount, mergeLog };
}

/**
 * Also provide a URL-based dedup for the batch — candidates with the same
 * newsUrl should be merged regardless of name.
 */
export function deduplicateBatchByUrl(candidates: CandidateDraft[]): CandidateDraft[] {
  const seen = new Map<string, number>(); // url → index in result
  const result: CandidateDraft[] = [];

  for (const c of candidates) {
    const url = (c.newsUrl ?? "").toLowerCase().trim();
    if (!url) {
      result.push(c);
      continue;
    }

    const existingIdx = seen.get(url);
    if (existingIdx !== undefined) {
      // Keep the one with higher confidence
      if (c.confidence > result[existingIdx].confidence) {
        result[existingIdx] = c;
      }
    } else {
      seen.set(url, result.length);
      result.push(c);
    }
  }

  return result;
}
