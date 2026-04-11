/**
 * Shared helper functions extracted for use by both adapter-runner.ts
 * and the per-source-feed route in adapters.ts.
 */

import { db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { type CandidateDraft } from "./base.js";

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

export async function writeCandidate(
  candidate: CandidateDraft,
  adapterKey: string,
): Promise<{ inserted: boolean; updated: boolean; flagged: boolean }> {
  const name = String(candidate.projectName ?? "").trim();
  if (!name || name.length < 5) return { inserted: false, updated: false, flagged: false };
  if (candidate.confidence < 0.65) return { inserted: false, updated: false, flagged: false };

  const existing = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(eq(projectsTable.projectName, name))
    .limit(1);

  if (existing.length > 0) {
    await db.update(projectsTable).set({
      ...(candidate.developer && { developer: candidate.developer }),
      ...(candidate.financiers && { financiers: candidate.financiers }),
      ...(candidate.dfiInvolvement && { dfiInvolvement: candidate.dfiInvolvement }),
      ...(candidate.newsUrl && { newsUrl: candidate.newsUrl }),
      ...(candidate.dealSizeUsdMn !== null && { dealSizeUsdMn: candidate.dealSizeUsdMn }),
      ...(candidate.capacityMw !== null && { capacityMw: candidate.capacityMw }),
      confidenceScore: candidate.confidence,
      extractionSource: adapterKey,
    }).where(eq(projectsTable.id, existing[0].id));
    return { inserted: false, updated: true, flagged: false };
  }

  if (!candidate.country || !candidate.technology) {
    return { inserted: false, updated: false, flagged: false };
  }

  const isHighConfidence = candidate.confidence >= 0.85;

  try {
    await db.insert(projectsTable).values({
      projectName: name,
      country: candidate.country,
      region: inferRegionBasic(candidate.country),
      technology: candidate.technology,
      dealSizeUsdMn: candidate.dealSizeUsdMn,
      investors: candidate.financiers ?? null,
      status: candidate.status ?? "announced",
      description: candidate.description ?? null,
      capacityMw: candidate.capacityMw,
      announcedYear: candidate.announcedYear ?? new Date().getFullYear(),
      closedYear: null,
      latitude: null,
      longitude: null,
      sourceUrl: candidate.sourceUrl,
      newsUrl: candidate.newsUrl,
      isAutoDiscovered: true,
      reviewStatus: isHighConfidence ? "approved" : "pending",
      discoveredAt: new Date(),
      developer: candidate.developer ?? null,
      financiers: candidate.financiers ?? null,
      dfiInvolvement: candidate.dfiInvolvement ?? null,
      offtaker: candidate.offtaker ?? null,
      dealStage: candidate.dealStage ?? null,
      financialCloseDate: candidate.financialCloseDate ?? null,
      confidenceScore: candidate.confidence,
      extractionSource: adapterKey,
    });
    return { inserted: true, updated: false, flagged: !isHighConfidence };
  } catch {
    return { inserted: false, updated: false, flagged: false };
  }
}
