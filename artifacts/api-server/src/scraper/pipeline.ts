/**
 * The ONE ingestion pipeline. Every candidate from every adapter flows through
 * `ingest()`. Five gates: hard requirements → normalize → dedup → score/route → insert.
 *
 * Replaces the old 9-step writeCandidate() that was spread across 7 service files.
 */

import { db, pool, projectsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  isRecognizedCountry,
  inferRegion,
  normalizeProjectName,
  normalizeCountry,
} from "./shared/countries.js";
import {
  isRecognizedTechnology,
  estimateDealSize,
} from "./shared/technologies.js";
import type { CandidateDraft } from "./adapters/types.js";

export interface PipelineResult {
  inserted: boolean;
  updated: boolean;
  flagged: boolean;
  reason?: string;
}

export async function ingest(
  candidate: CandidateDraft,
  adapterKey: string,
): Promise<PipelineResult> {

  // ── Gate 1: Hard requirements ─────────────────────────────
  const name = (candidate.projectName ?? "").trim();
  if (!name || name.length < 5) return skip("Name too short");
  if (candidate.confidence < 0.60) return skip("Below confidence floor");

  const canonicalCountry = normalizeCountry(candidate.country);
  if (!canonicalCountry || !isRecognizedCountry(canonicalCountry)) {
    return skip("Unrecognized country");
  }

  if (!candidate.technology || !isRecognizedTechnology(candidate.technology)) {
    return skip("Unrecognized technology");
  }

  // ── Gate 2: Normalize ─────────────────────────────────────
  const normalizedName = normalizeProjectName(name);
  const region = inferRegion(canonicalCountry);
  const dealSize = candidate.dealSizeUsdMn ?? estimateDealSize(candidate.capacityMw, candidate.technology);

  // ── Gate 3: Dedup (3 strategies, ordered by cost) ─────────
  // 3a. Exact URL match (cheapest — index lookup)
  if (candidate.newsUrl) {
    const urlMatch = await findByUrl(candidate.newsUrl);
    if (urlMatch !== null) return gapFill(urlMatch, candidate, adapterKey);
  }

  // 3b. Source URL + fuzzy name (structured sources like GEM with no newsUrl)
  if (!candidate.newsUrl && candidate.sourceUrl) {
    const sourceMatch = await findBySourceAndName(
      candidate.sourceUrl, normalizedName, canonicalCountry,
    );
    if (sourceMatch !== null) return gapFill(sourceMatch, candidate, adapterKey);
  }

  // 3c. Fuzzy name match within same country (most expensive — pg_trgm)
  const fuzzyMatch = await findFuzzyMatch(normalizedName, canonicalCountry);
  if (fuzzyMatch && fuzzyMatch.similarity > 0.65) {
    return gapFill(fuzzyMatch.id, candidate, adapterKey);
  }

  // ── Gate 4: Score & Route ─────────────────────────────────
  const completeness = scoreCompleteness(candidate, dealSize);
  const reviewNotes: string[] = [];
  let reviewStatus: "approved" | "pending" = "approved";

  if (fuzzyMatch && fuzzyMatch.similarity >= 0.5) {
    reviewStatus = "pending";
    const pct = Math.round(fuzzyMatch.similarity * 100);
    reviewNotes.push(`Possible duplicate of "${fuzzyMatch.name}" (#${fuzzyMatch.id}) — ${pct}%`);
  }

  if (completeness.score < 50) {
    reviewStatus = "pending";
    reviewNotes.push(`Low completeness (${completeness.score}%) — missing: ${completeness.missing.join(", ")}`);
  }

  if (candidate.confidence < 0.75) {
    reviewStatus = "pending";
    reviewNotes.push(`Low adapter confidence: ${candidate.confidence}`);
  }

  // ── Gate 5: Insert ────────────────────────────────────────
  try {
    await db.insert(projectsTable).values({
      projectName: name,
      normalizedName,
      country: canonicalCountry,
      region,
      technology: candidate.technology,
      dealSizeUsdMn: dealSize,
      capacityMw: candidate.capacityMw,
      status: candidate.status ?? "announced",
      description: candidate.description,
      announcedYear: candidate.announcedYear ?? new Date().getFullYear(),
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      sourceUrl: candidate.sourceUrl,
      newsUrl: candidate.newsUrl,
      developer: candidate.developer,
      financiers: candidate.financiers,
      investors: candidate.financiers,       // legacy column — mirror financiers
      dfiInvolvement: candidate.dfiInvolvement,
      offtaker: candidate.offtaker,
      dealStage: candidate.dealStage,
      financialCloseDate: candidate.financialCloseDate,
      isAutoDiscovered: true,
      reviewStatus,
      discoveredAt: new Date(),
      confidenceScore: candidate.confidence,
      extractionSource: adapterKey,
      completenessScore: completeness.score,
      reviewNotes: reviewNotes.length > 0 ? reviewNotes : [],
      urlStatus: "unchecked",
    });
    return { inserted: true, updated: false, flagged: reviewStatus === "pending" };
  } catch (err) {
    return skip(`Insert failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Dedup queries ───────────────────────────────────────────

async function findByUrl(newsUrl: string): Promise<number | null> {
  const res = await db.execute(sql`
    SELECT id FROM energy_projects
    WHERE news_url = ${newsUrl} OR news_url_2 = ${newsUrl}
    LIMIT 1
  `);
  if (res.rows.length === 0) return null;
  return (res.rows[0] as { id: number }).id;
}

async function findBySourceAndName(
  sourceUrl: string,
  normalizedName: string,
  country: string,
): Promise<number | null> {
  const client = await pool.connect();
  try {
    await client.query("SET search_path TO public");
    const r = await client.query(
      `SELECT id,
              similarity(COALESCE(normalized_name, lower(project_name)), $1) AS sim
       FROM energy_projects
       WHERE source_url = $2 AND country = $3
         AND similarity(COALESCE(normalized_name, lower(project_name)), $1) > 0.4
       ORDER BY sim DESC
       LIMIT 1`,
      [normalizedName, sourceUrl, country],
    );
    if (r.rows.length === 0) return null;
    return (r.rows[0] as { id: number }).id;
  } finally {
    client.release();
  }
}

interface FuzzyHit { id: number; name: string; similarity: number; }

async function findFuzzyMatch(
  normalizedName: string,
  country: string,
): Promise<FuzzyHit | null> {
  const client = await pool.connect();
  try {
    await client.query("SET search_path TO public");
    const r = await client.query(
      `SELECT id, project_name AS name,
              similarity(COALESCE(normalized_name, lower(project_name)), $1) AS similarity
       FROM energy_projects
       WHERE country = $2
         AND similarity(COALESCE(normalized_name, lower(project_name)), $1) > 0.5
       ORDER BY similarity DESC
       LIMIT 1`,
      [normalizedName, country],
    );
    if (r.rows.length === 0) return null;
    const row = r.rows[0] as { id: number; name: string; similarity: number };
    return { id: row.id, name: row.name, similarity: Number(row.similarity) };
  } finally {
    client.release();
  }
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Gap-fill update: only write fields where the candidate has a non-null value.
 * Never overwrites existing data with null.
 */
async function gapFill(
  existingId: number,
  c: CandidateDraft,
  adapterKey: string,
): Promise<PipelineResult> {
  await db.update(projectsTable).set({
    ...(c.developer && { developer: c.developer }),
    ...(c.financiers && { financiers: c.financiers, investors: c.financiers }),
    ...(c.dfiInvolvement && { dfiInvolvement: c.dfiInvolvement }),
    ...(c.newsUrl && { newsUrl: c.newsUrl }),
    ...(c.dealSizeUsdMn != null && { dealSizeUsdMn: c.dealSizeUsdMn }),
    ...(c.capacityMw != null && { capacityMw: c.capacityMw }),
    ...(c.latitude != null && { latitude: c.latitude }),
    ...(c.longitude != null && { longitude: c.longitude }),
    confidenceScore: c.confidence,
    extractionSource: adapterKey,
  }).where(eq(projectsTable.id, existingId));
  return { inserted: false, updated: true, flagged: false };
}

interface Completeness { score: number; missing: string[]; }

function scoreCompleteness(c: CandidateDraft, dealSize: number | null): Completeness {
  const fields: Array<[string, boolean]> = [
    ["country", !!c.country],
    ["technology", !!c.technology],
    ["dealSize", dealSize != null],
    ["capacityMw", c.capacityMw != null],
    ["developer", !!c.developer],
    ["financiers", !!c.financiers],
    ["dealStage", !!c.dealStage],
    ["newsUrl", !!c.newsUrl],
    ["description", !!c.description],
    ["coordinates", c.latitude != null && c.longitude != null],
  ];
  const present = fields.filter(([, v]) => v).length;
  const missing = fields.filter(([, v]) => !v).map(([k]) => k);
  return { score: Math.round((present / fields.length) * 100), missing };
}

function skip(reason: string): PipelineResult {
  return { inserted: false, updated: false, flagged: false, reason };
}
