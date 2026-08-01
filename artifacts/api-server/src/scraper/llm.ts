/**
 * LLM-based deal extraction from news articles and government sources.
 *
 * Includes a daily budget tracker that caps total LLM calls across all adapters
 * to prevent runaway spend. Budget resets at midnight UTC.
 */

import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { CandidateDraft } from "./adapters/types.js";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 512;

// ── Cost tracking ──────────────────────────────────────────────────────────

// Approximate cost per call (Sonnet input ~$3/MTok + output ~$15/MTok).
// A typical extraction uses ~800 input tokens + ~200 output tokens ≈ $0.0054/call.
const ESTIMATED_COST_PER_CALL_USD = 0.006;

// Default daily budget: ~$3/day ≈ 500 calls. Override with LLM_DAILY_BUDGET env var.
const DAILY_BUDGET_USD = parseFloat(process.env["LLM_DAILY_BUDGET"] ?? "3.0");
const MAX_DAILY_CALLS = Math.floor(DAILY_BUDGET_USD / ESTIMATED_COST_PER_CALL_USD);

interface DailyUsage {
  date: string;           // YYYY-MM-DD UTC
  calls: number;
  estimatedCostUsd: number;
  byAdapter: Record<string, number>;  // adapter key → call count
}

let _usage: DailyUsage = freshUsage();

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function freshUsage(): DailyUsage {
  return { date: todayUTC(), calls: 0, estimatedCostUsd: 0, byAdapter: {} };
}

function ensureCurrentDay(): void {
  const today = todayUTC();
  if (_usage.date !== today) {
    // Log previous day's totals before resetting
    if (_usage.calls > 0) {
      console.log(
        `[LLM Budget] Day ${_usage.date} final: ${_usage.calls} calls, ~$${_usage.estimatedCostUsd.toFixed(3)} ` +
        `(breakdown: ${Object.entries(_usage.byAdapter).map(([k, v]) => `${k}=${v}`).join(", ")})`
      );
    }
    _usage = freshUsage();
  }
}

function recordCall(adapterKey: string): void {
  ensureCurrentDay();
  _usage.calls++;
  _usage.estimatedCostUsd += ESTIMATED_COST_PER_CALL_USD;
  _usage.byAdapter[adapterKey] = (_usage.byAdapter[adapterKey] ?? 0) + 1;
}

/**
 * Check whether the daily budget allows another LLM call.
 * Returns true if under budget, false if at/over limit.
 */
export function hasBudget(): boolean {
  ensureCurrentDay();
  return _usage.calls < MAX_DAILY_CALLS;
}

/**
 * Get current daily usage stats (for admin dashboard / logging).
 */
export function getLLMUsage(): {
  date: string;
  calls: number;
  maxCalls: number;
  estimatedCostUsd: number;
  dailyBudgetUsd: number;
  remainingCalls: number;
  byAdapter: Record<string, number>;
} {
  ensureCurrentDay();
  return {
    date: _usage.date,
    calls: _usage.calls,
    maxCalls: MAX_DAILY_CALLS,
    estimatedCostUsd: _usage.estimatedCostUsd,
    dailyBudgetUsd: DAILY_BUDGET_USD,
    remainingCalls: Math.max(0, MAX_DAILY_CALLS - _usage.calls),
    byAdapter: { ..._usage.byAdapter },
  };
}

// ── Prompts ────────────────────────────────────────────────────────────────

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
  "financingType": string | null,
  "ppaTermYears": number | null,
  "ppaTariffUsdKwh": number | null,
  "grantComponentUsdMn": number | null,
  "confidence": number
}

Technology MUST be one of: Solar, Wind, Hydro, Geothermal, Bioenergy, Nuclear,
Oil & Gas, Grid Expansion, Battery & Storage, Hydrogen, Clean Cooking, Coal.

financingType, if stated or clearly implied, MUST be one of: Project Finance,
Blended Finance, Concessional Loan, Grant / Donor Funding, Corporate Finance,
Sovereign Lending, IPP / Concession, PPP / Public-Private, Green / Climate Bond,
Equity Investment, Export Credit, Bilateral Aid / ODA. Use null if unclear.
ppaTermYears / ppaTariffUsdKwh / grantComponentUsdMn: only if explicitly stated.

dealStage, if known, MUST be one of: Announced, Mandated, Financial Close,
Construction, Commissioned, Suspended, Cancelled.

If NOT an Africa energy investment deal, return null.
Return ONLY valid JSON, no markdown.`;

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
  "financingType": string | null,
  "ppaTermYears": number | null,
  "ppaTariffUsdKwh": number | null,
  "grantComponentUsdMn": number | null,
  "confidence": number
}

Technology MUST be one of: Solar, Wind, Hydro, Geothermal, Bioenergy, Nuclear,
Oil & Gas, Grid Expansion, Battery & Storage, Hydrogen, Clean Cooking, Coal.

financingType, if stated or clearly implied, MUST be one of: Project Finance,
Blended Finance, Concessional Loan, Grant / Donor Funding, Corporate Finance,
Sovereign Lending, IPP / Concession, PPP / Public-Private, Green / Climate Bond,
Equity Investment, Export Credit, Bilateral Aid / ODA. Use null if unclear.
ppaTermYears / ppaTariffUsdKwh / grantComponentUsdMn: only if explicitly stated.

dealStage, if known, MUST be one of: Announced, Mandated, Financial Close,
Construction, Commissioned, Suspended, Cancelled.

If NOT an Africa energy investment deal or project, return null.
Return ONLY valid JSON, no markdown.`;

// ── Shared extraction logic ────────────────────────────────────────────────

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
  financingType?: string | null;
  ppaTermYears?: number | null;
  ppaTariffUsdKwh?: number | null;
  grantComponentUsdMn?: number | null;
  confidence?: number;
}

function parseExtraction(raw: string): RawExtract | null {
  const match = raw.match(/\{[\s\S]*\}|null/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as RawExtract | null;
    if (!parsed || !parsed.projectName || !parsed.country || !parsed.technology) return null;
    return parsed;
  } catch {
    return null;
  }
}

function toCandidateDraft(
  parsed: RawExtract,
  opts: { newsUrl: string | null; sourceUrl: string | null; countryOverride?: string },
): CandidateDraft {
  return {
    projectName: String(parsed.projectName).slice(0, 300),
    country: opts.countryOverride || String(parsed.country),
    technology: String(parsed.technology),
    dealSizeUsdMn: typeof parsed.dealSizeUsdMn === "number" ? parsed.dealSizeUsdMn : null,
    capacityMw: typeof parsed.capacityMw === "number" ? parsed.capacityMw : null,
    developer: parsed.developer ? String(parsed.developer) : null,
    financiers: parsed.financiers ? String(parsed.financiers) : null,
    dfiInvolvement: parsed.dfiInvolvement ? String(parsed.dfiInvolvement) : null,
    dealStage: parsed.dealStage ? String(parsed.dealStage) : null,
    status: null,
    description: null,
    newsUrl: opts.newsUrl,
    sourceUrl: opts.sourceUrl ?? opts.newsUrl,
    latitude: null,
    longitude: null,
    announcedYear: typeof parsed.announcedYear === "number" ? parsed.announcedYear : null,
    offtaker: null,
    financialCloseDate: null,
    financingType: parsed.financingType ? String(parsed.financingType) : null,
    ppaTermYears: typeof parsed.ppaTermYears === "number" ? Math.round(parsed.ppaTermYears) : null,
    ppaTariffUsdKwh: typeof parsed.ppaTariffUsdKwh === "number" ? parsed.ppaTariffUsdKwh : null,
    grantComponent: typeof parsed.grantComponentUsdMn === "number" ? parsed.grantComponentUsdMn : null,
    confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
  };
}

async function callLLM(prompt: string, context: string, adapterKey: string): Promise<string | null> {
  if (!hasBudget()) {
    console.warn(`[LLM Budget] Daily limit reached (${_usage.calls}/${MAX_DAILY_CALLS}). Skipping call for ${adapterKey}.`);
    return null;
  }

  recordCall(adapterKey);

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: `${prompt}\n\n${context}` }],
    });

    const block = msg.content[0];
    return block.type === "text" ? block.text.trim() : null;
  } catch (e) {
    console.error(`[LLM] Call failed for ${adapterKey}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

// ── Public extraction functions ────────────────────────────────────────────

/**
 * Extract a deal from an article title + URL (and optional body). Returns null
 * if the article is not about an Africa energy deal, the LLM call fails,
 * or the daily budget is exhausted.
 */
export async function extractDealFromArticle(
  title: string,
  articleText: string | null,
  newsUrl: string,
  adapterKey: string = "news",
): Promise<CandidateDraft | null> {
  if (!title || !newsUrl) return null;

  const context = articleText
    ? `Title: ${title}\nURL: ${newsUrl}\n\nFull Article:\n${articleText}`
    : `Title: ${title}\nURL: ${newsUrl}`;

  const raw = await callLLM(EXTRACTION_PROMPT, context, adapterKey);
  if (!raw) return null;

  const parsed = parseExtraction(raw);
  if (!parsed) return null;

  return toCandidateDraft(parsed, { newsUrl, sourceUrl: newsUrl });
}

/**
 * Extract a deal from government/regulatory website content.
 * If countryHint is provided, it biases the LLM toward that country.
 * Returns null if the daily budget is exhausted.
 */
export async function extractDealFromGovernmentSource(
  sourceName: string,
  pageText: string,
  sourceUrl: string,
  countryHint?: string,
  adapterKey: string = "gov",
): Promise<CandidateDraft | null> {
  if (!pageText || pageText.length < 50) return null;

  const context = countryHint
    ? `Source: ${sourceName} (${countryHint})\nURL: ${sourceUrl}\n\nContent:\n${pageText}`
    : `Source: ${sourceName}\nURL: ${sourceUrl}\n\nContent:\n${pageText}`;

  const raw = await callLLM(GOVERNMENT_EXTRACTION_PROMPT, context, adapterKey);
  if (!raw) return null;

  const parsed = parseExtraction(raw);
  if (!parsed) return null;

  return toCandidateDraft(parsed, { newsUrl: null, sourceUrl, countryOverride: countryHint });
}

// ── Financing enrichment ─────────────────────────────────────────────────────

const FINANCING_PROMPT = `You are an energy-finance analyst. Given text from an article
or project page about a SPECIFIC known energy deal, extract ONLY financing-structure
details that are explicitly stated. Never guess or infer numbers.

Return JSON:
{
  "financingType": string | null,   // one of: Project Finance, Blended Finance, Concessional Loan, Grant / Donor Funding, Corporate Finance, Sovereign Lending, IPP / Concession, PPP / Public-Private, Green / Climate Bond, Equity Investment, Export Credit, Bilateral Aid / ODA
  "ppaTermYears": number | null,    // power purchase agreement term, years
  "ppaTariffUsdKwh": number | null, // PPA tariff in USD per kWh (convert cents: 8.5 US cents = 0.085)
  "grantComponentUsdMn": number | null, // grant portion in USD millions
  "financiers": string | null,      // lenders / equity providers, semicolon-separated
  "dfiInvolvement": string | null   // development finance institutions involved
}

If the text does not clearly describe this deal's financing, return all nulls.
Return ONLY valid JSON, no markdown.`;

export interface FinancingExtract {
  financingType: string | null;
  ppaTermYears: number | null;
  ppaTariffUsdKwh: number | null;
  grantComponentUsdMn: number | null;
  financiers: string | null;
  dfiInvolvement: string | null;
}

/** Extract financing details for a known deal from source-page text. */
export async function extractFinancingFromText(
  projectName: string,
  country: string,
  pageText: string,
): Promise<FinancingExtract | null> {
  const context = `Deal: ${projectName} (${country})\n\nSource text:\n${pageText.slice(0, 6000)}`;
  const raw = await callLLM(FINANCING_PROMPT, context, "financing-enrichment");
  if (!raw) return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const p = JSON.parse(match[0]) as Partial<FinancingExtract>;
    return {
      financingType: p.financingType ? String(p.financingType) : null,
      ppaTermYears: typeof p.ppaTermYears === "number" ? Math.round(p.ppaTermYears) : null,
      ppaTariffUsdKwh: typeof p.ppaTariffUsdKwh === "number" ? p.ppaTariffUsdKwh : null,
      grantComponentUsdMn: typeof p.grantComponentUsdMn === "number" ? p.grantComponentUsdMn : null,
      financiers: p.financiers ? String(p.financiers) : null,
      dfiInvolvement: p.dfiInvolvement ? String(p.dfiInvolvement) : null,
    };
  } catch {
    return null;
  }
}
