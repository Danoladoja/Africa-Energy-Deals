/**
 * Financing enrichment sweep.
 *
 * Revisits the source pages of the largest DISCLOSED deals that have no
 * financing-structure data yet, and extracts financing type, PPA terms,
 * grant components, and financiers with a focused LLM prompt. Only ever
 * fills NULL fields — never overwrites existing data — and appends a
 * provenance note to the record's review notes.
 *
 * Cost control: every LLM call goes through the shared daily budget cap
 * (DAILY_BUDGET_USD). Scheduled monthly with a per-run limit; also
 * triggerable from the admin API.
 */

import { pool } from "@workspace/db";
import { fetchWithRetry } from "./shared/http.js";
import { extractFinancingFromText, hasBudget } from "./llm.js";

export interface EnrichmentSummary {
  scanned: number;
  fetched: number;
  enriched: number;
  fieldsWritten: number;
  skippedNoBudget: number;
  errors: string[];
}

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const { body, status } = await fetchWithRetry(url, { timeoutMs: 15_000 });
    if (status >= 400 || !body) return null;
    return body
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
  } catch {
    return null;
  }
}

export async function runFinancingEnrichment(options?: { limit?: number }): Promise<EnrichmentSummary> {
  const limit = Math.min(Math.max(options?.limit ?? 60, 1), 150);
  const summary: EnrichmentSummary = { scanned: 0, fetched: 0, enriched: 0, fieldsWritten: 0, skippedNoBudget: 0, errors: [] };

  // Largest disclosed deals first — that's where financing data has the most value.
  const { rows } = await pool.query(
    `SELECT id, project_name, country, news_url, source_url
     FROM energy_projects
     WHERE review_status = 'approved'
       AND is_estimated = FALSE
       AND deal_size_usd_mn IS NOT NULL
       AND financing_type IS NULL
       AND (deal_stage IS NULL OR lower(deal_stage) NOT IN ('cancelled', 'decommissioned'))
       AND lower(status) NOT IN ('cancelled', 'decommissioned')
       AND (news_url IS NOT NULL OR source_url IS NOT NULL)
     ORDER BY deal_size_usd_mn DESC
     LIMIT $1`,
    [limit],
  );

  console.log(`[Enrichment] ${rows.length} deals queued for financing enrichment`);

  for (const row of rows as Array<{ id: number; project_name: string; country: string; news_url: string | null; source_url: string | null }>) {
    summary.scanned++;

    if (!hasBudget()) {
      summary.skippedNoBudget = rows.length - summary.scanned + 1;
      console.warn("[Enrichment] Daily LLM budget reached — stopping sweep early.");
      break;
    }

    const url = row.news_url || row.source_url;
    if (!url) continue;

    const text = await fetchPageText(url);
    if (!text || text.length < 200) continue;
    summary.fetched++;

    try {
      const fin = await extractFinancingFromText(row.project_name, row.country, text);
      if (!fin) continue;

      // Only fill NULL columns — never overwrite.
      const sets: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      const push = (col: string, val: unknown) => {
        sets.push(`${col} = COALESCE(${col}, $${i})`);
        vals.push(val);
        i++;
      };
      if (fin.financingType) push("financing_type", fin.financingType);
      if (fin.ppaTermYears != null) push("ppa_term_years", fin.ppaTermYears);
      if (fin.ppaTariffUsdKwh != null) push("ppa_tariff_usd_kwh", fin.ppaTariffUsdKwh);
      if (fin.grantComponentUsdMn != null) push("grant_component", fin.grantComponentUsdMn);
      if (fin.financiers) push("financiers", fin.financiers);
      if (fin.dfiInvolvement) push("dfi_involvement", fin.dfiInvolvement);

      if (sets.length === 0) continue;

      vals.push(row.id);
      await pool.query(
        `UPDATE energy_projects
         SET ${sets.join(", ")},
             review_notes = COALESCE(review_notes, '[]'::jsonb) || '["Financing details auto-extracted from source article"]'::jsonb
         WHERE id = $${i}`,
        vals,
      );
      summary.enriched++;
      summary.fieldsWritten += sets.length;
    } catch (err) {
      summary.errors.push(`#${row.id} ${row.project_name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`[Enrichment] Done — scanned:${summary.scanned} fetched:${summary.fetched} enriched:${summary.enriched} fields:${summary.fieldsWritten}`);
  return summary;
}
