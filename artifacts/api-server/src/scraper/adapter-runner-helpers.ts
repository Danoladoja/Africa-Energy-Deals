/**
 * Shared helper functions extracted for use by both adapter-runner.ts
 * and the per-source-feed route in adapters.ts.
 */

import { db, pool, projectsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { type CandidateDraft } from "./base.js";
import { normalizeProjectName } from "../services/name-normalizer.js";
import { validateFields } from "../services/field-validator.js";
import { validateUrls } from "../services/url-validator.js";
import { scoreCompleteness } from "../services/completeness-scorer.js";
import { computeFinalScore } from "../services/routing-engine.js";

// Re-export so existing callers that import normalizeProjectName from this file still work
export { normalizeProjectName };

const AFRICA_COUNTRIES = new Set([
  "nigeria", "kenya", "south africa", "ethiopia", "ghana", "tanzania", "egypt",
  "morocco", "mozambique", "senegal", "zambia", "uganda", "rwanda", "cameroon",
  "angola", "namibia", "botswana", "zimbabwe", "malawi", "burkina faso",
  "côte d'ivoire", "ivory coast", "cote d'ivoire", "sudan", "tunisia", "algeria",
  "libya", "drc", "congo", "sierra leone", "gambia", "mauritania", "niger", "chad",
  "somalia", "madagascar", "benin", "togo", "mali", "guinea", "african",
  "sub-saharan", "east africa", "west africa", "north africa", "southern africa",
  "central africa", "eritrea", "djibouti", "comoros", "lesotho", "eswatini",
  "swaziland", "gabon", "equatorial guinea", "south sudan",
]);

export function isAfrican(text: string): boolean {
  const lower = text.toLowerCase();
  return [...AFRICA_COUNTRIES].some((term) => lower.includes(term));
}

function inferRegionBasic(country: string): string {
  const c = country.toLowerCase();
  if (/nigeria|ghana|senegal|mali|ivory|cote|cameroon|guinea|liberia|togo|benin|burkina|niger|gambia|sierra/.test(c)) return "West Africa";
  if (/kenya|ethiopia|tanzania|uganda|rwanda|somalia|djibouti|eritrea|south sudan/.test(c)) return "East Africa";
  if (/south africa|zimbabwe|zambia|mozambique|namibia|botswana|malawi|angola|madagascar|lesotho|eswatini/.test(c)) return "Southern Africa";
  if (/egypt|morocco|tunisia|algeria|libya|sudan|mauritania/.test(c)) return "North Africa";
  if (/drc|congo|gabon|equatorial|chad|central|sao tome/.test(c)) return "Central Africa";
  return "Africa";
}

export async function llmScoreCandidate(draft: CandidateDraft): Promise<CandidateDraft | null> {
  if (!draft.projectName || !draft.newsUrl) return null;

  const prompt = `You are an Africa energy investment deal extraction AI.
Given this news article title and description, extract the deal if it represents an energy investment project in Africa.

Title: ${draft.projectName}
Description: ${draft.description ?? "(none)"}
URL: ${draft.newsUrl}

If this IS an Africa energy deal, return a single JSON object with:
{
  "projectName": string,
  "country": string | null,
  "technology": string | null,
  "dealSizeUsdMn": number | null,
  "developer": string | null,
  "financiers": string | null,
  "dfiInvolvement": string | null,
  "dealStage": string | null,
  "capacityMw": number | null,
  "announcedYear": number | null,
  "confidence": number
}

Technology must be one of: Solar, Wind, Hydro, Geothermal, Biomass, Nuclear, Oil & Gas, Transmission & Distribution, Battery Storage, Green Hydrogen, Coal.
If NOT an Africa energy investment deal, return null.
Return ONLY valid JSON, no markdown.`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });
    const block = msg.content[0];
    const raw = block.type === "text" ? block.text.trim() : "null";
    const match = raw.match(/\{[\s\S]*\}|null/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Record<string, unknown> | null;
    if (!parsed) return null;

    return {
      ...draft,
      projectName: String(parsed.projectName ?? draft.projectName),
      country: parsed.country ? String(parsed.country) : draft.country,
      technology: parsed.technology ? String(parsed.technology) : draft.technology,
      dealSizeUsdMn: typeof parsed.dealSizeUsdMn === "number" ? parsed.dealSizeUsdMn : draft.dealSizeUsdMn,
      developer: parsed.developer ? String(parsed.developer) : draft.developer,
      financiers: parsed.financiers ? String(parsed.financiers) : draft.financiers,
      dfiInvolvement: parsed.dfiInvolvement ? String(parsed.dfiInvolvement) : draft.dfiInvolvement,
      dealStage: parsed.dealStage ? String(parsed.dealStage) : draft.dealStage,
      capacityMw: typeof parsed.capacityMw === "number" ? parsed.capacityMw : draft.capacityMw,
      announcedYear: typeof parsed.announcedYear === "number" ? parsed.announcedYear : draft.announcedYear,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : draft.confidence,
    };
  } catch {
    return draft;
  }
}

/**
 * Write a candidate to the database through the full self-validation pipeline:
 *
 *  1. Field validation & cleaning (Enhancement 5)
 *  2. Name normalization (Enhancement 1)
 *  3. URL domain-diversity check + reachability (Enhancement 4)
 *  4. URL exact dedup check (existing)
 *  5. Fuzzy name dedup with country filter at 0.5 threshold (Enhancement 2)
 *  6. Completeness scoring (Enhancement 3)
 *  7. Composite routing (Enhancement 6)
 *  8. Insert with completenessScore + reviewNotes
 */
export async function writeCandidate(
  candidate: CandidateDraft,
  adapterKey: string,
): Promise<{ inserted: boolean; updated: boolean; flagged: boolean }> {
  const name = String(candidate.projectName ?? "").trim();
  if (!name || name.length < 5) return { inserted: false, updated: false, flagged: false };
  // Minimum confidence gate — reject garbage before any DB I/O
  if (candidate.confidence < 0.60) return { inserted: false, updated: false, flagged: false };

  // ── Step 1: Field validation & cleaning ──────────────────────────────────
  const fieldResult = validateFields(candidate);
  if (!fieldResult.valid) {
    // Hard reject: unrecognizable country or non-energy sector
    return { inserted: false, updated: false, flagged: false };
  }
  let cleaned = fieldResult.cleaned;
  const fieldIssues = fieldResult.issues;

  // ── Step 2: Name normalization ────────────────────────────────────────────
  const normalizedName = normalizeProjectName(name);

  // ── Step 3: URL validation (domain diversity + reachability) ─────────────
  const urlResult = await validateUrls(cleaned.newsUrl, null);
  const urlIssues = urlResult.issues;

  // ── Step 4: URL exact dedup check ─────────────────────────────────────────
  if (cleaned.newsUrl) {
    const urlMatch = await db.execute(sql`
      SELECT id FROM energy_projects
      WHERE news_url = ${cleaned.newsUrl} OR news_url_2 = ${cleaned.newsUrl}
      LIMIT 1
    `);
    if (urlMatch.rows.length > 0) {
      const existingId = (urlMatch.rows[0] as any).id as number;
      await db.update(projectsTable).set({
        ...(cleaned.developer && { developer: cleaned.developer }),
        ...(cleaned.financiers && { financiers: cleaned.financiers }),
        ...(cleaned.dfiInvolvement && { dfiInvolvement: cleaned.dfiInvolvement }),
        ...(cleaned.dealSizeUsdMn !== null && { dealSizeUsdMn: cleaned.dealSizeUsdMn }),
        ...(cleaned.capacityMw !== null && { capacityMw: cleaned.capacityMw }),
        confidenceScore: cleaned.confidence,
        extractionSource: adapterKey,
      }).where(eq(projectsTable.id, existingId));
      return { inserted: false, updated: true, flagged: false };
    }
  }

  // ── Step 5: Fuzzy dedup with country filter at 0.5 threshold ─────────────
  let duplicateSimilarity: number | null = null;
  let possibleDuplicateId: number | null = null;
  let possibleDuplicateName: string | null = null;

  const fuzzyClient = await pool.connect();
  try {
    await fuzzyClient.query("SET search_path TO public");

    // With country filter first for accuracy; fall back to global if no country
    const countryFilter = cleaned.country ?? "";
    const fuzzyResult = await fuzzyClient.query(
      `SELECT id, project_name,
              similarity(COALESCE(normalized_name, lower(project_name)), $1) AS sim_score
       FROM energy_projects
       WHERE ($2 = '' OR country = $2)
         AND similarity(COALESCE(normalized_name, lower(project_name)), $1) > 0.5
       ORDER BY sim_score DESC
       LIMIT 5`,
      [normalizedName, countryFilter],
    );

    if (fuzzyResult.rows.length > 0) {
      const top = fuzzyResult.rows[0] as { id: number; project_name: string; sim_score: number };
      duplicateSimilarity = top.sim_score;
      possibleDuplicateId = top.id;
      possibleDuplicateName = top.project_name;

      if (top.sim_score > 0.8) {
        // Definite duplicate — selective gap-fill upsert, never overwrite non-null
        await db.update(projectsTable).set({
          ...(cleaned.developer && { developer: cleaned.developer }),
          ...(cleaned.financiers && { financiers: cleaned.financiers }),
          ...(cleaned.dfiInvolvement && { dfiInvolvement: cleaned.dfiInvolvement }),
          ...(cleaned.newsUrl && { newsUrl: cleaned.newsUrl }),
          ...(cleaned.dealSizeUsdMn !== null && { dealSizeUsdMn: cleaned.dealSizeUsdMn }),
          ...(cleaned.capacityMw !== null && { capacityMw: cleaned.capacityMw }),
          confidenceScore: cleaned.confidence,
          extractionSource: adapterKey,
        }).where(eq(projectsTable.id, top.id));
        return { inserted: false, updated: true, flagged: false };
      }
      // 0.5–0.8 → possibly same project; continue to routing (will be flagged as review)
    }
  } finally {
    fuzzyClient.release();
  }

  // ── Step 6: Completeness scoring ─────────────────────────────────────────
  const completeness = scoreCompleteness(cleaned);

  // ── Step 7: Composite routing ─────────────────────────────────────────────
  const routing = computeFinalScore({
    adapterConfidence: cleaned.confidence,
    completenessScore: completeness.score,
    duplicateSimilarity,
    urlIssues,
    fieldIssues,
  });

  if (routing.track === "reject") {
    return { inserted: false, updated: false, flagged: false };
  }

  // ── Step 8: Build review notes ────────────────────────────────────────────
  const reviewNotes: string[] = [...routing.reasons];

  // Add possible-duplicate note with specifics
  if (
    possibleDuplicateId !== null &&
    duplicateSimilarity !== null &&
    duplicateSimilarity >= 0.5 &&
    duplicateSimilarity <= 0.8
  ) {
    const pct = Math.round(duplicateSimilarity * 100);
    const note = `Possible duplicate of "${possibleDuplicateName}" (#${possibleDuplicateId}) — ${pct}% similar`;
    if (!reviewNotes.some(r => r.startsWith("Possible duplicate"))) {
      reviewNotes.unshift(note);
    }
  }

  // Add completeness details when low
  if (completeness.score < 60 && completeness.missing.length > 0) {
    const existingNote = reviewNotes.findIndex(r => r.startsWith("Low completeness"));
    const detail = `Low completeness (${completeness.score}%) — missing: ${completeness.missing.filter(f => f !== "newsUrl2").join(", ")}`;
    if (existingNote >= 0) {
      reviewNotes[existingNote] = detail;
    } else {
      reviewNotes.push(detail);
    }
  }

  // Require country and technology before inserting
  if (!cleaned.country || !cleaned.technology) {
    return { inserted: false, updated: false, flagged: false };
  }

  // ── Step 9: Insert ────────────────────────────────────────────────────────
  try {
    await db.insert(projectsTable).values({
      projectName: name,
      normalizedName,
      country: cleaned.country,
      region: inferRegionBasic(cleaned.country),
      technology: cleaned.technology,
      dealSizeUsdMn: cleaned.dealSizeUsdMn,
      investors: cleaned.financiers ?? null,
      status: cleaned.status ?? "announced",
      description: cleaned.description ?? null,
      capacityMw: cleaned.capacityMw,
      announcedYear: cleaned.announcedYear ?? new Date().getFullYear(),
      closedYear: null,
      latitude: null,
      longitude: null,
      sourceUrl: cleaned.sourceUrl,
      newsUrl: cleaned.newsUrl,
      isAutoDiscovered: true,
      reviewStatus: routing.track === "approve" ? "approved" : "pending",
      discoveredAt: new Date(),
      developer: cleaned.developer ?? null,
      financiers: cleaned.financiers ?? null,
      dfiInvolvement: cleaned.dfiInvolvement ?? null,
      offtaker: cleaned.offtaker ?? null,
      dealStage: cleaned.dealStage ?? null,
      financialCloseDate: cleaned.financialCloseDate ?? null,
      confidenceScore: cleaned.confidence,
      extractionSource: adapterKey,
      completenessScore: completeness.score,
      reviewNotes: reviewNotes.length > 0 ? reviewNotes : [],
    });
    return { inserted: true, updated: false, flagged: routing.track === "review" };
  } catch {
    return { inserted: false, updated: false, flagged: false };
  }
}
