/**
 * The ONE ingestion pipeline. Every candidate from every adapter flows through
 * `ingestBatch()`. Five gates: hard requirements → normalize → dedup → score/route → insert.
 *
 * Optimizations over the original per-candidate approach:
 * 1. Batch URL lookups — single query for all URLs in the batch
 * 2. In-memory dedup within a batch (same URL or normalized name won't hit DB twice)
 * 3. Single pool connection reused across the entire batch (no per-candidate churn)
 * 4. Gap-fill diff check — only writes when fields actually change
 * 5. pg_trgm GIN index migration included for fuzzy match performance
 */

import { db, pool, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type pg from "pg";

type PoolClient = pg.PoolClient;
import {
  isRecognizedCountry,
  inferRegion,
  normalizeProjectName,
  normalizeCountry,
} from "./shared/countries.js";
import {
  isRecognizedTechnology,
  normalizeTechnology,
  climateTagForTechnology,
  estimateDealSize,
} from "./shared/technologies.js";
import { normalizeDealStage } from "./shared/deal-stages.js";
import type { CandidateDraft } from "./adapters/types.js";

export interface PipelineResult {
  inserted: boolean;
  updated: boolean;
  flagged: boolean;
  reason?: string;
}

// ── In-memory dedup cache (reset per adapter run) ──────────────────────────

class BatchDedupCache {
  private seenUrls = new Set<string>();
  private seenNames = new Map<string, string>(); // "country::normalizedName" → first projectName

  hasUrl(url: string): boolean {
    return this.seenUrls.has(url);
  }

  addUrl(url: string): void {
    this.seenUrls.add(url);
  }

  hasName(normalizedName: string, country: string): boolean {
    return this.seenNames.has(`${country}::${normalizedName}`);
  }

  addName(normalizedName: string, country: string): void {
    this.seenNames.set(`${country}::${normalizedName}`, normalizedName);
  }

  clear(): void {
    this.seenUrls.clear();
    this.seenNames.clear();
  }
}

// Module-level cache — cleared at the start of each adapter run via resetBatchCache()
const batchCache = new BatchDedupCache();

export function resetBatchCache(): void {
  batchCache.clear();
}

// ── Batch URL pre-lookup ───────────────────────────────────────────────────

interface UrlLookupResult {
  url: string;
  id: number;
}

/**
 * Pre-fetch existing project IDs for a batch of URLs in a single query.
 * Returns a Map from URL → existing project ID.
 */
async function batchUrlLookup(urls: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (urls.length === 0) return map;

  // Query in chunks of 200 to avoid parameter limit issues
  const CHUNK_SIZE = 200;
  for (let i = 0; i < urls.length; i += CHUNK_SIZE) {
    const chunk = urls.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(", ");

    const client = await pool.connect();
    try {
      await client.query("SET search_path TO public");
      const r = await client.query(
        `SELECT id, news_url, news_url_2 FROM energy_projects
         WHERE news_url IN (${placeholders}) OR news_url_2 IN (${placeholders})`,
        [...chunk, ...chunk],
      );
      for (const row of r.rows as Array<{ id: number; news_url: string | null; news_url_2: string | null }>) {
        if (row.news_url && chunk.includes(row.news_url)) map.set(row.news_url, row.id);
        if (row.news_url_2 && chunk.includes(row.news_url_2)) map.set(row.news_url_2, row.id);
      }
    } finally {
      client.release();
    }
  }

  return map;
}

/**
 * Batch ingestion entry point. Call this instead of individual `ingest()` calls.
 * Pre-fetches URL matches for the entire batch, then processes sequentially
 * with a shared connection for fuzzy queries.
 */
export async function ingestBatch(
  candidates: CandidateDraft[],
  adapterKey: string,
): Promise<PipelineResult[]> {
  // Reset in-memory cache for this batch
  resetBatchCache();

  // Phase 1: Collect all URLs for batch lookup
  const allUrls = candidates
    .map((c) => c.newsUrl)
    .filter((url): url is string => !!url);
  const urlCache = await batchUrlLookup(allUrls);

  // Phase 2: Process each candidate with shared connection for fuzzy queries
  const results: PipelineResult[] = [];
  const client = await pool.connect();
  try {
    await client.query("SET search_path TO public");

    for (const candidate of candidates) {
      try {
        const r = await ingestWithClient(candidate, adapterKey, urlCache, client);
        results.push(r);
      } catch (e) {
        results.push(skip(`ingest error: ${e instanceof Error ? e.message : String(e)}`));
      }
    }
  } finally {
    client.release();
  }

  return results;
}

/**
 * Single-candidate ingestion (legacy API preserved for backward compat).
 * Prefer ingestBatch() for adapter runs.
 */
export async function ingest(
  candidate: CandidateDraft,
  adapterKey: string,
): Promise<PipelineResult> {
  const results = await ingestBatch([candidate], adapterKey);
  return results[0];
}

// ── Core ingestion logic (shared connection variant) ───────────────────────

async function ingestWithClient(
  candidate: CandidateDraft,
  adapterKey: string,
  urlCache: Map<string, number>,
  client: PoolClient,
): Promise<PipelineResult> {

  // ── Gate 1: Hard requirements ─────────────────────────────
  const name = (candidate.projectName ?? "").trim();
  if (!name || name.length < 5) return skip("Name too short");
  if (candidate.confidence < 0.60) return skip("Below confidence floor");

  const canonicalCountry = normalizeCountry(candidate.country);
  if (!canonicalCountry || !isRecognizedCountry(canonicalCountry)) {
    return skip("Unrecognized country");
  }

  // Normalize free-text technology names (e.g. "Biomass" → "Bioenergy",
  // "Battery Storage" → "Battery & Storage") instead of silently dropping them.
  const canonicalTechnology = normalizeTechnology(candidate.technology ?? "");
  if (!canonicalTechnology) {
    return skip(`Unrecognized technology: ${candidate.technology ?? "(none)"}`);
  }

  // ── Gate 2: Normalize ─────────────────────────────────────
  const normalizedName = normalizeProjectName(name);
  const region = inferRegion(canonicalCountry);
  const disclosedSize = candidate.dealSizeUsdMn ?? null;
  const dealSize = disclosedSize ?? estimateDealSize(candidate.capacityMw, canonicalTechnology);
  // A size is "estimated" if the adapter flagged it, or if we derived it here
  // from capacity benchmarks because no disclosed value existed.
  const isEstimated = candidate.isEstimated === true || (disclosedSize === null && dealSize !== null);

  // ── In-memory dedup (within this batch) ───────────────────
  if (candidate.newsUrl && batchCache.hasUrl(candidate.newsUrl)) {
    return skip("Duplicate URL within batch");
  }
  if (batchCache.hasName(normalizedName, canonicalCountry)) {
    return skip("Duplicate name within batch");
  }

  // Mark as seen for subsequent candidates
  if (candidate.newsUrl) batchCache.addUrl(candidate.newsUrl);
  batchCache.addName(normalizedName, canonicalCountry);

  // ── Gate 3: Dedup (3 strategies, ordered by cost) ─────────
  // 3a. Exact URL match (batch pre-fetched — O(1) Map lookup)
  if (candidate.newsUrl) {
    const existingId = urlCache.get(candidate.newsUrl);
    if (existingId != null) return gapFillSmart(existingId, candidate, adapterKey, client);
  }

  // 3b. Source URL + fuzzy name (structured sources like GEM with no newsUrl)
  if (!candidate.newsUrl && candidate.sourceUrl) {
    const sourceMatch = await findBySourceAndNameWithClient(
      candidate.sourceUrl, normalizedName, canonicalCountry, client,
    );
    if (sourceMatch !== null) return gapFillSmart(sourceMatch, candidate, adapterKey, client);
  }

  // 3c. Fuzzy name match within same country (pg_trgm — uses GIN index)
  const fuzzyMatch = await findFuzzyMatchWithClient(normalizedName, canonicalCountry, client);
  if (fuzzyMatch && fuzzyMatch.similarity > 0.65) {
    return gapFillSmart(fuzzyMatch.id, candidate, adapterKey, client);
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
      technology: canonicalTechnology,
      dealSizeUsdMn: dealSize,
      isEstimated,
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
      dealStage: normalizeDealStage(candidate.dealStage),
      financialCloseDate: candidate.financialCloseDate,
      financingType: candidate.financingType ?? null,
      ppaTermYears: candidate.ppaTermYears ?? null,
      ppaTariffUsdKwh: candidate.ppaTariffUsdKwh ?? null,
      grantComponent: candidate.grantComponent ?? null,
      climateFinanceTag: climateTagForTechnology(canonicalTechnology),
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

// ── Dedup queries (shared connection variants) ─────────────────────────────

async function findBySourceAndNameWithClient(
  sourceUrl: string,
  normalizedName: string,
  country: string,
  client: PoolClient,
): Promise<number | null> {
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
}

interface FuzzyHit { id: number; name: string; similarity: number; }

async function findFuzzyMatchWithClient(
  normalizedName: string,
  country: string,
  client: PoolClient,
): Promise<FuzzyHit | null> {
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
}

// ── Smart gap-fill (only writes when fields actually differ) ───────────────

async function gapFillSmart(
  existingId: number,
  c: CandidateDraft,
  adapterKey: string,
  client: PoolClient,
): Promise<PipelineResult> {
  // Fetch current values for the fields we might update
  const r = await client.query(
    `SELECT developer, financiers, dfi_involvement, news_url,
            deal_size_usd_mn, capacity_mw, latitude, longitude,
            confidence_score, extraction_source,
            financing_type, ppa_term_years, ppa_tariff_usd_kwh, grant_component
     FROM energy_projects WHERE id = $1`,
    [existingId],
  );

  if (r.rows.length === 0) {
    return skip("Gap-fill target not found");
  }

  const existing = r.rows[0] as Record<string, unknown>;

  // Build update payload — only include fields where candidate has a non-null value
  // AND the existing value is either null or the candidate value is different
  const updates: Record<string, unknown> = {};

  if (c.developer && !existing.developer) updates.developer = c.developer;
  if (c.financiers && !existing.financiers) {
    updates.financiers = c.financiers;
    updates.investors = c.financiers;
  }
  if (c.dfiInvolvement && !existing.dfi_involvement) updates.dfiInvolvement = c.dfiInvolvement;
  if (c.newsUrl && !existing.news_url) updates.newsUrl = c.newsUrl;
  if (c.dealSizeUsdMn != null && existing.deal_size_usd_mn == null) {
    updates.dealSizeUsdMn = c.dealSizeUsdMn;
    // Carry the estimate flag with the value so gap-filled sizes stay honest.
    updates.isEstimated = c.isEstimated === true;
  }
  if (c.capacityMw != null && existing.capacity_mw == null) updates.capacityMw = c.capacityMw;
  if (c.latitude != null && existing.latitude == null) updates.latitude = c.latitude;
  if (c.longitude != null && existing.longitude == null) updates.longitude = c.longitude;
  if (c.financingType && !existing.financing_type) updates.financingType = c.financingType;
  if (c.ppaTermYears != null && existing.ppa_term_years == null) updates.ppaTermYears = c.ppaTermYears;
  if (c.ppaTariffUsdKwh != null && existing.ppa_tariff_usd_kwh == null) updates.ppaTariffUsdKwh = c.ppaTariffUsdKwh;
  if (c.grantComponent != null && existing.grant_component == null) updates.grantComponent = c.grantComponent;

  // Always update confidence + source if higher confidence
  const existingConfidence = typeof existing.confidence_score === "number" ? existing.confidence_score : 0;
  if (c.confidence > existingConfidence) {
    updates.confidenceScore = c.confidence;
    updates.extractionSource = adapterKey;
  }

  // Skip DB write entirely if nothing to change
  if (Object.keys(updates).length === 0) {
    return { inserted: false, updated: false, flagged: false, reason: "No new fields to gap-fill" };
  }

  await db.update(projectsTable).set(updates).where(eq(projectsTable.id, existingId));
  return { inserted: false, updated: true, flagged: false };
}

// ── Helpers ─────────────────────────────────────────────────

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
