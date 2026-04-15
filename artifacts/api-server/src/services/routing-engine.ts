/**
 * Routing Engine — composite confidence scoring for the scraper self-validation pipeline.
 *
 * Replaces the simple `confidence >= 0.85 → approve` gate with a multi-dimensional
 * score that factors in:
 *  - Adapter/LLM confidence
 *  - Completeness score (Enhancement 3)
 *  - Fuzzy duplicate proximity (Enhancement 2)
 *  - URL issues (Enhancement 4)
 *  - Field auto-correction issues (Enhancement 5)
 *
 * Tracks:
 *  - 'approve' → reviewStatus = 'approved'
 *  - 'review'  → reviewStatus = 'pending', attach reasons
 *  - 'reject'  → do NOT insert, log as dropped
 */

export interface RoutingInput {
  adapterConfidence: number;        // 0.0–1.0 from adapter/LLM
  completenessScore: number;        // 0–100 from completeness-scorer
  duplicateSimilarity: number | null; // 0.0–1.0, null if no fuzzy match found
  urlIssues: string[];              // from url-validator
  fieldIssues: string[];            // from field-validator (auto-corrections)
}

export interface RoutingResult {
  finalScore: number;
  track: "approve" | "review" | "reject";
  reasons: string[];
}

export function computeFinalScore(input: RoutingInput): RoutingResult {
  let score = input.adapterConfidence * 100; // Start with adapter confidence (0–100)
  const reasons: string[] = [];

  // Hard reject: too incomplete
  if (input.completenessScore < 40) {
    return {
      finalScore: 0,
      track: "reject",
      reasons: [`Too incomplete (${input.completenessScore}%)`],
    };
  }

  // Soft downgrade: low completeness
  if (input.completenessScore < 60) {
    score -= 20;
    reasons.push(`Low completeness (${input.completenessScore}%)`);
  }

  // Duplicate proximity penalty (only when in the "possible" zone — definite dups are already
  // handled as upserts before computeFinalScore is called)
  if (input.duplicateSimilarity !== null && input.duplicateSimilarity >= 0.5) {
    score -= 30;
    reasons.push(`Possible duplicate (${Math.round(input.duplicateSimilarity * 100)}% similar)`);
  }

  // URL issues penalty (10 pts each)
  if (input.urlIssues.length > 0) {
    score -= 10 * input.urlIssues.length;
    reasons.push(...input.urlIssues);
  }

  // Field auto-correction issues penalty (5 pts each — softer, these are helpful corrections)
  if (input.fieldIssues.length > 0) {
    score -= 5 * input.fieldIssues.length;
    reasons.push(...input.fieldIssues);
  }

  const finalScore = Math.max(0, Math.min(100, score));

  // Track determination:
  // Auto-approve only if score is high AND no review-worthy issues
  let track: "approve" | "review" | "reject";
  if (finalScore >= 75 && reasons.length === 0) {
    track = "approve";
  } else if (finalScore >= 40) {
    track = "review";
  } else {
    track = "reject";
  }

  return { finalScore, track, reasons };
}
