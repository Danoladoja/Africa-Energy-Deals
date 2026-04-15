/**
 * Completeness Scorer — scores how complete a candidate's data is (0–100).
 *
 * Used in writeCandidate() before the final routing decision.
 *  - Score >= 60 → proceed normally
 *  - Score 40–59 → route to review with a note
 *  - Score < 40  → reject
 */

import type { CandidateDraft } from "../scraper/base.js";
import { isEnergySector } from "@workspace/shared";

interface CompletenessResult {
  score: number;
  missing: string[];
}

const WEIGHTS = {
  projectName:  15,
  country:      15,
  technology:   15,
  capacityMw:   12,
  dealSizeUsdMn: 12,
  developer:    10,
  status:        8,
  newsUrl:       8,
  newsUrl2:      5,
} as const;

function isValidUrl(u: string | null | undefined): boolean {
  if (!u) return false;
  try { return /^https?:\/\//i.test(u); } catch { return false; }
}

export function scoreCompleteness(c: CandidateDraft): CompletenessResult {
  let score = 0;
  const missing: string[] = [];

  if (c.projectName && c.projectName.trim().length >= 3) {
    score += WEIGHTS.projectName;
  } else {
    missing.push("projectName");
  }

  if (c.country && c.country.trim()) {
    score += WEIGHTS.country;
  } else {
    missing.push("country");
  }

  if (c.technology && isEnergySector(c.technology)) {
    score += WEIGHTS.technology;
  } else {
    missing.push("technology");
  }

  if (c.capacityMw !== null && c.capacityMw !== undefined && c.capacityMw > 0) {
    score += WEIGHTS.capacityMw;
  } else {
    missing.push("capacityMw");
  }

  if (
    c.dealSizeUsdMn !== null &&
    c.dealSizeUsdMn !== undefined &&
    c.dealSizeUsdMn >= 0.05 &&
    c.dealSizeUsdMn <= 5000
  ) {
    score += WEIGHTS.dealSizeUsdMn;
  } else {
    missing.push("dealSizeUsdMn");
  }

  if (c.developer && c.developer.trim()) {
    score += WEIGHTS.developer;
  } else {
    missing.push("developer");
  }

  if (c.status && c.status.trim()) {
    score += WEIGHTS.status;
  } else {
    missing.push("status");
  }

  if (isValidUrl(c.newsUrl)) {
    score += WEIGHTS.newsUrl;
  } else {
    missing.push("newsUrl");
  }

  if (isValidUrl((c as any).newsUrl2)) {
    score += WEIGHTS.newsUrl2;
  } else {
    missing.push("newsUrl2");
  }

  return { score, missing };
}
