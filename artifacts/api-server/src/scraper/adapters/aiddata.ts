/**
 * AidData — Chinese development finance to African energy projects.
 *
 * AidData's Global Chinese Development Finance Dataset (v3.0) is distributed
 * as a bulk CSV. We filter to African recipients and energy-sector flow_classes.
 */

import { fetchWithRetry } from "../shared/http.js";
import { parseCSV } from "../shared/csv-parser.js";
import { normalizeCountry, isRecognizedCountry } from "../shared/countries.js";
import { normalizeTechnology, estimateDealSize } from "../shared/technologies.js";
import type { CandidateDraft, AdapterResult, RegisteredAdapter } from "./types.js";

const AIDDATA_CSV = "https://docs.aiddata.org/ad4/datasets/AidDatas_Global_Chinese_Development_Finance_Dataset_Version_3_0.csv";

function parseAmountUsd(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[,$\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  // AidData amounts are in constant USD (already absolute USD)
  return n > 100_000 ? n / 1_000_000 : n;
}

async function run(): Promise<AdapterResult> {
  const candidates: CandidateDraft[] = [];
  const errors: string[] = [];

  let body = "";
  try {
    const r = await fetchWithRetry(AIDDATA_CSV, {
      maxRps: 1,
      timeoutMs: 60_000,
      headers: { Accept: "text/csv" },
    });
    body = r.body;
  } catch (e) {
    errors.push(`fetch: ${e instanceof Error ? e.message : String(e)}`);
    return { candidates, errors, meta: { recordsFetched: 0, filteredOut: 0 } };
  }
  if (!body) return { candidates, errors, meta: { recordsFetched: 0, filteredOut: 0 } };

  const rows = parseCSV(body);
  const fetched = rows.length;
  let filtered = 0;

  for (const row of rows) {
    const sector = (row["sector_name"] ?? row["sector"] ?? "").toLowerCase();
    if (!sector.includes("energy") && !sector.includes("power") && !sector.includes("electricity")) {
      filtered++;
      continue;
    }

    const country = normalizeCountry(row["recipient"] ?? row["country_name"] ?? "");
    if (!country || !isRecognizedCountry(country)) { filtered++; continue; }

    const name = (row["title"] ?? row["project_title"] ?? row["description"] ?? "").trim();
    if (!name || name.length < 5) { filtered++; continue; }

    const technology = normalizeTechnology(`${name} ${row["description"] ?? ""} ${sector}`);
    if (!technology) { filtered++; continue; }

    const dealSize = parseAmountUsd(
      row["amount_constant_usd_2021"] ?? row["amount_original_currency"] ?? row["amount"],
    );

    const commitmentYear = row["commitment_year"] ? parseInt(row["commitment_year"], 10) : null;
    const announcedYear = commitmentYear && commitmentYear > 1990 && commitmentYear < 2100
      ? commitmentYear
      : null;

    candidates.push({
      projectName: name.slice(0, 300),
      country,
      technology,
      dealSizeUsdMn: dealSize ?? estimateDealSize(null, technology),
      capacityMw: null,
      developer: (row["receiving_agencies"] ?? "").slice(0, 200) || null,
      financiers: row["funding_agencies"]?.slice(0, 200) ?? "China (AidData)",
      dfiInvolvement: row["funding_agencies"] ?? "China Development Bank / Exim",
      dealStage: row["status"]?.toLowerCase() ?? "announced",
      status: row["status"]?.toLowerCase() ?? "announced",
      description: row["description"]?.slice(0, 500) ?? null,
      newsUrl: null,
      sourceUrl: row["project_id"]
        ? `https://china.aiddata.org/projects/${row["project_id"]}`
        : "https://china.aiddata.org/",
      latitude: null,
      longitude: null,
      announcedYear,
      offtaker: null,
      financialCloseDate: row["completion_date"] ?? row["commitment_date"] ?? null,
      confidence: 0.90,
    });
  }

  return { candidates, errors, meta: { recordsFetched: fetched, filteredOut: filtered } };
}

export const aidDataAdapter: RegisteredAdapter = {
  config: {
    key: "aiddata",
    label: "AidData (Chinese Finance)",
    group: "multilateral",
    schedule: "monthly",
    defaultConfidence: 0.90,
  },
  run,
};
