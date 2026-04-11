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
 */

import { db, scraperSourcesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ADAPTER_REGISTRY, getAdapter } from "./adapters/index.js";
import { type CandidateDraft } from "./base.js";
import { buildGoogleAlertsAdapterFromFeedUrl } from "./adapters/google-alerts.js";
import { llmScoreCandidate, writeCandidate, isAfrican } from "./adapter-runner-helpers.js";
import { type RunReport } from "./base.js";
import { classifyEnergySector } from "../services/sector-classifier.js";

const ENERGY_RE = /energy|power|solar|wind|hydro|gas|electric|renew|geotherm|nuclear|megawatt|\bmw\b|battery|storage|hydrogen|grid|transmission/i;

function isEnergy(text: string): boolean {
  return ENERGY_RE.test(text);
}

/**
 * Run a single adapter by key.
 * The sector gate fires between LLM scoring and the actual writeCandidate call.
 * Rejected candidates increment report.rowsRejected and are logged to rejectionLog.
 */
export async function runAdapter(
  adapterKey: string,
  triggeredBy: "manual" | "schedule" = "manual",
): Promise<RunReport> {
  const adapter = getAdapter(adapterKey);
  if (!adapter) throw new Error(`Unknown adapter: ${adapterKey}`);

  const adapterWithLlm = adapter as unknown as { llmScored?: boolean };

  return adapter.run(async (draft: CandidateDraft) => {
    let candidate = draft;

    const needsLlm = adapterWithLlm.llmScored && (!draft.country || !draft.technology);
    if (needsLlm) {
      const scored = await llmScoreCandidate(draft);
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
  return reports;
}

export async function runAdaptersFromDb(triggeredBy: "manual" | "schedule" = "schedule"): Promise<RunReport[]> {
  const sources = await db.select().from(scraperSourcesTable).where(eq(scraperSourcesTable.isActive, true));
  const reports: RunReport[] = [];

  for (const source of sources) {
    const slug = source.key.replace(/^rss:[^:]+:/, "");
    const adapter = buildGoogleAlertsAdapterFromFeedUrl(slug, source.feedUrl, source.label);
    try {
      const report = await adapter.run(async (draft) => {
        const scored = await llmScoreCandidate(draft);
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

        const gated = { ...scored, technology: gateResult.sector };
        return writeCandidate(gated, adapter.key);
      }, triggeredBy);
      reports.push(report);
    } catch (err) {
      console.error(`[AdapterRunner] DB source ${source.key} failed:`, err);
    }
  }

  return reports;
}

export { ADAPTER_REGISTRY, getAdapter, getAdapterKeys, getAdapterMeta } from "./adapters/index.js";
