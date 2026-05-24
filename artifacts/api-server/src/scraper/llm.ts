/**
 * LLM-based deal extraction from news articles.
 * Used by the news adapter to turn a headline + snippet into a CandidateDraft.
 */

import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { CandidateDraft } from "./adapters/types.js";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 512;

const EXTRACTION_PROMPT = `You are an Africa energy investment deal extraction AI.
Given this news article, extract the deal if it represents an energy investment project in Africa.

Return a JSON object with these fields:
{
  "projectName": string,
  "country": string,
  "technology": string,
  "dealSizeUsdMn": number | null,
  "capacityMw": number | null,
  "developer": string | null,
  "financiers": string | null,
  "dfiInvolvement": string | null,
  "dealStage": string | null,
  "announcedYear": number | null,
  "confidence": number
}

Technology MUST be one of: Solar, Wind, Hydro, Geothermal, Biomass, Nuclear,
Oil & Gas, Transmission & Distribution, Battery Storage, Green Hydrogen, Coal.

If NOT an Africa energy investment deal, return null.
Return ONLY valid JSON, no markdown.`;

interface RawExtract {
  projectName?: string;
  country?: string;
  technology?: string;
  dealSizeUsdMn?: number | null;
  capacityMw?: number | null;
  developer?: string | null;
  financiers?: string | null;
  dfiInvolvement?: string | null;
  dealStage?: string | null;
  announcedYear?: number | null;
  confidence?: number;
}

/**
 * Extract a deal from an article title + URL (and optional body). Returns null
 * if the article is not about an Africa energy deal, or if the LLM call fails.
 */
export async function extractDealFromArticle(
  title: string,
  articleText: string | null,
  newsUrl: string,
): Promise<CandidateDraft | null> {
  if (!title || !newsUrl) return null;

  const context = articleText
    ? `Title: ${title}\nURL: ${newsUrl}\n\nFull Article:\n${articleText}`
    : `Title: ${title}\nURL: ${newsUrl}`;

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: `${EXTRACTION_PROMPT}\n\n${context}` }],
    });

    const block = msg.content[0];
    const raw = block.type === "text" ? block.text.trim() : "null";
    const match = raw.match(/\{[\s\S]*\}|null/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as RawExtract | null;
    if (!parsed || !parsed.projectName || !parsed.country || !parsed.technology) return null;

    return {
      projectName: String(parsed.projectName).slice(0, 300),
      country: String(parsed.country),
      technology: String(parsed.technology),
      dealSizeUsdMn: typeof parsed.dealSizeUsdMn === "number" ? parsed.dealSizeUsdMn : null,
      capacityMw: typeof parsed.capacityMw === "number" ? parsed.capacityMw : null,
      developer: parsed.developer ? String(parsed.developer) : null,
      financiers: parsed.financiers ? String(parsed.financiers) : null,
      dfiInvolvement: parsed.dfiInvolvement ? String(parsed.dfiInvolvement) : null,
      dealStage: parsed.dealStage ? String(parsed.dealStage) : null,
      status: null,
      description: null,
      newsUrl,
      sourceUrl: newsUrl,
      latitude: null,
      longitude: null,
      announcedYear: typeof parsed.announcedYear === "number" ? parsed.announcedYear : null,
      offtaker: null,
      financialCloseDate: null,
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
    };
  } catch {
    return null;
  }
}

// ── Government / Regulatory extraction ──────────────────────────────────────

const GOVERNMENT_EXTRACTION_PROMPT = `You are an Africa energy investment deal extraction AI.
Given text from a government/regulatory website, extract any energy project or investment deal.

This is from a government source, so look for:
- Licensing/permitting of power plants
- Procurement announcements for energy projects
- Gazette notices for energy licenses
- Regulatory approvals for generation capacity
- Government-sponsored electrification programs

Return a JSON object with these fields:
{
  "projectName": string,
  "country": string,
  "technology": string,
  "dealSizeUsdMn": number | null,
  "capacityMw": number | null,
  "developer": string | null,
  "financiers": string | null,
  "dfiInvolvement": string | null,
  "dealStage": string | null,
  "announcedYear": number | null,
  "confidence": number
}

Technology MUST be one of: Solar, Wind, Hydro, Geothermal, Biomass, Nuclear,
Oil & Gas, Transmission & Distribution, Battery Storage, Green Hydrogen, Coal.

If NOT an Africa energy investment deal or project, return null.
Return ONLY valid JSON, no markdown.`;

/**
 * Extract a deal from government/regulatory website content.
 * If countryHint is provided, it biases the LLM toward that country.
 */
export async function extractDealFromGovernmentSource(
  sourceName: string,
  pageText: string,
  sourceUrl: string,
  countryHint?: string,
): Promise<CandidateDraft | null> {
  if (!pageText || pageText.length < 50) return null;

  const context = countryHint
    ? `Source: ${sourceName} (${countryHint})\nURL: ${sourceUrl}\n\nContent:\n${pageText}`
    : `Source: ${sourceName}\nURL: ${sourceUrl}\n\nContent:\n${pageText}`;

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: `${GOVERNMENT_EXTRACTION_PROMPT}\n\n${context}` }],
    });

    const block = msg.content[0];
    const raw = block.type === "text" ? block.text.trim() : "null";
    const match = raw.match(/\{[\s\S]*\}|null/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as RawExtract | null;
    if (!parsed || !parsed.projectName || !parsed.country || !parsed.technology) return null;

    return {
      projectName: String(parsed.projectName).slice(0, 300),
      country: countryHint || String(parsed.country),
      technology: String(parsed.technology),
      dealSizeUsdMn: typeof parsed.dealSizeUsdMn === "number" ? parsed.dealSizeUsdMn : null,
      capacityMw: typeof parsed.capacityMw === "number" ? parsed.capacityMw : null,
      developer: parsed.developer ? String(parsed.developer) : null,
      financiers: parsed.financiers ? String(parsed.financiers) : null,
      dfiInvolvement: parsed.dfiInvolvement ? String(parsed.dfiInvolvement) : null,
      dealStage: parsed.dealStage ? String(parsed.dealStage) : null,
      status: null,
      description: null,
      newsUrl: null,
      sourceUrl,
      latitude: null,
      longitude: null,
      announcedYear: typeof parsed.announcedYear === "number" ? parsed.announcedYear : null,
      offtaker: null,
      financialCloseDate: null,
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
    };
  } catch {
    return null;
  }
}
