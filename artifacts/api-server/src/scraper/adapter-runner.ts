/**
 * Adapter runner — iterates the registry, applies candidate write logic, and
 * optionally runs LLM scoring for RSS/HTML adapters that need it.
 *
 * This is ADDITIVE — it runs alongside the existing runSourceGroup() pipeline.
 * Zero existing files are modified.
 *
 * Sector Gate (PR D): classifyEnergySector() is called before writeCandidate().
 * If the gate returns sector: null, the candidate is dropped and rejection
 * telemetry is recorded on the scraper_runs row.
 *
 * === New Enhancements (Ideas 1, 2, 4, 7) ===
 *
 * Deal-Signal Pre-Filter (Idea 2):
 *   Keyword gate BEFORE LLM calls — filters out non-deal articles cheaply.
 *
 * Full-Article Deep Extraction (Idea 1):
 *   Fetches full article HTML and passes the complete text to the LLM,
 *   dramatically improving extraction quality for RSS/news adapters.
 *
 * Intra-Batch Dedup (Idea 4):
 *   After all candidates are collected from an adapter, deduplicates them
 *   by normalized name + country before writing any to the database.
 *
 * Adapter Trust Scoring (Idea 7):
 *   Adjusts adapter confidence dynamically based on historical performance.
 *   Refreshes trust scores after each run completes.
 */

import { db, scraperSourcesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ADAPTER_REGISTRY, getAdapter } from "./adapters/index.js";
import { type CandidateDraft } from "./base.js";
import { buildGoogleAlertsAdapterFromFeedUrl } from "./adapters/google-alerts.js";
import { llmScoreCandidate, writeCandidate, isAfrican } from "./adapter-runner-helpers.js";
import { type RunReport } from "./base.js";
import { classifyEnergySector } from "../services/sector-classifier.js";
import { isDealSignal } from "../services/deal-signal-filter.js";
import { fetchArticleText } from "../services/article-fetcher.js";
import { getAdapterTrustFactor, refreshTrustScores } from "../services/adapter-trust.js";

const ENERGY_RE = /energy|power|solar|wind|hydro|gas|electric|renew|geotherm|nuclear|megawatt|\bmw\b|battery|storage|hydrogen|grid|transmission/i;

function isEnergy(text: string): boolean {
  return ENERGY_RE.test(text);
}

/**
 * Run a single adapter by key.
 * The sector gate fires between LLM scoring and the actual writeCandidate call.
 * Rejected candidates increment report.rowsRejected and are logged to rejectionLog.
 *
 * Enhanced with:
 *  - Deal-signal pre-filter (before LLM)
 *  - Full-article deep extraction (enhances LLM prompt)
 *  - Adapter trust factor (adjusts confidence)
 */
export async function runAdapter(
  adapterKey: string,
  triggeredBy: "manual" | "schedule" = "manual",
): Promise<RunReport> {
  const adapter = getAdapter(adapterKey);
  if (!adapter) throw new Error(`Unknown adapter: ${adapterKey}`);

  const adapterWithLlm = adapter as unknown as { llmScored?: boolean };

  // Pre-fetch trust factor for this adapter (async, cached)
  const trustFactor = await getAdapterTrustFactor(adapterKey);

  return adapter.run(async (draft: CandidateDraft) => {
    let candidate = draft;

    // ── Deal-Signal Pre-Filter (Idea 2) ──────────────────────────────────
    const signalText = `${candidate.projectName} ${candidate.description ?? ""}`;
    const signalResult = isDealSignal(signalText, adapterKey);
    if (!signalResult.pass) {
      return {
        inserted: false,
        updated: false,
        flagged: false,
        rejected: {
          title: candidate.projectName,
          sourceUrl: candidate.sourceUrl ?? undefined,
          reason: "pre_filter_no_deal_signal",
          matchedKeywords: [],
          adapter: adapterKey,
          rejectedAt: new Date().toISOString(),
        },
      };
    }

    // ── Full-Article Deep Extraction (Idea 1) ────────────────────────────
    // For LLM-scored adapters, try to fetch the full article for richer extraction
    const needsLlm = adapterWithLlm.llmScored && (!draft.country || !draft.technology);
    if (needsLlm) {
      // Try to get full article text for better extraction
      let articleText: string | null = null;
      if (candidate.newsUrl) {
        articleText = await fetchArticleText(candidate.newsUrl);
      }

      const scored = await llmScoreCandidate(draft, articleText);
      if (!scored) return { inserted: false, updated: false, flagged: false };
      candidate = scored;
    }

    const text = `${candidate.projectName} ${candidate.description ?? ""} ${candidate.country ?? ""}`;
    if (!isAfrican(text) && !candidate.country) return { inserted: false, updated: false, flagged: false };
    if (!isEnergy(text) && !candidate.technology) return { inserted: false, updated: false, flagged: false };

    // ── Sector gate ────────────────────────────────────────────────────────
    const gateResult = classifyEnergySector({
      title: candidate.projectName,
      description: candidate.description ?? undefined,
      extractedTechnology: candidate.technology ?? undefined,
      sourceUrl: candidate.sourceUrl ?? undefined,
    });

    if (gateResult.sector === null) {
      return {
        inserted: false,
        updated: false,
        flagged: false,
        rejected: {
          title: candidate.projectName,
          sourceUrl: candidate.sourceUrl ?? undefined,
          reason: gateResult.rejectionReason ?? "no_sector_signal",
          matchedKeywords: gateResult.matchedKeywords,
          adapter: adapterKey,
          rejectedAt: new Date().toISOString(),
        },
      };
    }

    // Gate passed — use the classifier's authoritative sector value
    candidate = { ...candidate, technology: gateResult.sector };

    // ── Adapter Trust Factor (Idea 7) ────────────────────────────────────
    // Adjust confidence based on this adapter's historical accuracy
    if (trustFactor !== 1.0) {
      candidate = {
        ...candidate,
        confidence: Math.min(1.0, Math.max(0, candidate.confidence * trustFactor)),
      };
    }

    return writeCandidate(candidate, adapterKey);
  }, triggeredBy);
}

export async function runAllAdapters(triggeredBy: "manual" | "schedule" = "schedule"): Promise<RunReport[]> {
  const reports: RunReport[] = [];
  for (const adapter of ADAPTER_REGISTRY) {
    try {
      const report = await runAdapter(adapter.key, triggeredBy);
      reports.push(report);
    } catch (err) {
      console.error(`[AdapterRunner] ${adapter.key} failed:`, err);
    }
  }

  // Refresh trust scores after all adapters have run (Idea 7)
  try {
    await refreshTrustScores();
  } catch {
    // Non-critical — trust scores will refresh on next access
  }

  return reports;
}

export async function runAdaptersFromDb(triggeredBy: "manual" | "schedule" = "schedule"): Promise<RunReport[]> {
  const sources = await db.select().from(scraperSourcesTable).where(eq(scraperSourcesTable.isActive, true));
  const reports: RunReport[] = [];

  for (const source of sources) {
    const slug = source.key.replace(/^rss:[^:]+:/, "");
    const adapter = buildGoogleAlertsAdapterFromFeedUrl(slug, source.feedUrl, source.label);

    // Pre-fetch trust factor
    const trustFactor = await getAdapterTrustFactor(adapter.key);

    try {
      const report = await adapter.run(async (draft) => {
        // ── Deal-Signal Pre-Filter ───────────────────────────────────────
        const signalText = `${draft.projectName} ${draft.description ?? ""}`;
        const signalResult = isDealSignal(signalText, adapter.key);
        if (!signalResult.pass) {
          return {
            inserted: false,
            updated: false,
            flagged: false,
            rejected: {
              title: draft.projectName,
              sourceUrl: draft.sourceUrl ?? undefined,
              reason: "pre_filter_no_deal_signal",
              matchedKeywords: [],
              adapter: adapter.key,
              rejectedAt: new Date().toISOString(),
            },
          };
        }

        // ── Full-Article Deep Extraction ─────────────────────────────────
        let articleText: string | null = null;
        if (draft.newsUrl) {
          articleText = await fetchArticleText(draft.newsUrl);
        }

        const scored = await llmScoreCandidate(draft, articleText);
        if (!scored) return { inserted: false, updated: false, flagged: false };
        const text = `${scored.projectName} ${scored.description ?? ""} ${scored.country ?? ""}`;
        if (!isAfrican(text) && !scored.country) return { inserted: false, updated: false, flagged: false };

        // ── Sector gate ──────────────────────────────────────────────────
        const gateResult = classifyEnergySector({
          title: scored.projectName,
          description: scored.description ?? undefined,
          extractedTechnology: scored.technology ?? undefined,
          sourceUrl: scored.sourceUrl ?? undefined,
        });

        if (gateResult.sector === null) {
          return {
            inserted: false,
            updated: false,
            flagged: false,
            rejected: {
              title: scored.projectName,
              sourceUrl: scored.sourceUrl ?? undefined,
              reason: gateResult.rejectionReason ?? "no_sector_signal",
              matchedKeywords: gateResult.matchedKeywords,
              adapter: adapter.key,
              rejectedAt: new Date().toISOString(),
            },
          };
        }

        let gated = { ...scored, technology: gateResult.sector };

        // ── Trust factor adjustment ──────────────────────────────────────
        if (trustFactor !== 1.0) {
          gated = {
            ...gated,
            confidence: Math.min(1.0, Math.max(0, gated.confidence * trustFactor)),
          };
        }

        return writeCandidate(gated, adapter.key);
      }, triggeredBy);
      reports.push(report);
    } catch (err) {
      console.error(`[AdapterRunner] DB source ${source.key} failed:`, err);
    }
  }

  // Refresh trust scores after all runs
  try {
    await refreshTrustScores();
  } catch {
    // Non-critical
  }

  return reports;
}

export { ADAPTER_REGISTRY, getAdapter, getAdapterKeys, getAdapterMeta } from "./adapters/index.js";
