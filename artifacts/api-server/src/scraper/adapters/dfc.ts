/**
 * US Development Finance Corporation (DFC) — active transactions.
 *
 * DFC publishes its active project portfolio as a CSV download. We filter
 * to African countries and energy-sector projects.
 */

import { fetchWithRetry } from "../shared/http.js";
import { parseCSV } from "../shared/csv-parser.js";
import { normalizeCountry, isRecognizedCountry } from "../shared/countries.js";
import { normalizeTechnology, estimateDealSize } from "../shared/technologies.js";
import type { CandidateDraft, AdapterResult, RegisteredAdapter } from "./types.js";

const DFC_CSV = "https://www.dfc.gov/sites/default/files/media/documents/DFC_Active_Transactions.csv";

function parseDealSizeUsd(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[,$\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 100_000 ? n / 1_000_000 : n;
}

async function run(): Promise<AdapterResult> {
  const candidates: CandidateDraft[] = [];
  const errors: string[] = [];

  let body = "";
  try {
    const r = await fetchWithRetry(DFC_CSV, { maxRps: 1, headers: { Accept: "text/csv" } });
    body = r.body;
  } catch (e) {
    errors.push(`fetch: ${e instanceof Error ? e.message : String(e)}`);
    return { candidates: [], errors, meta: { recordsFetched: 0, filteredOut: 0 } };
  }

  if (!body) return { candidates: [], errors, meta: { recordsFetched: 0, filteredOut: 0 } };

  const rows = parseCSV(body);
  const fetched = rows.length;
  let filtered = 0;

  for (const row of rows) {
    const country = normalizeCountry(row["country"] ?? row["country_region"] ?? "");
    if (!country || !isRecognizedCountry(country)) { filtered++; continue; }

    const sector = (row["sector"] ?? row["sector_industry"] ?? "").toLowerCase();
    if (!sector.includes("energy") && !sector.includes("power") && !sector.includes("infrastructure")) {
      filtered++;
      continue;
    }

    const name = (row["project_name"] ?? row["client"] ?? row["transaction_name"] ?? "").trim();
    if (!name || name.length < 5) { filtered++; continue; }

    const technology = normalizeTechnology(`${name} ${row["description"] ?? ""} ${sector}`);
    if (!technology) { filtered++; continue; }

    const dealSize = parseDealSizeUsd(row["dfc_commitment"] ?? row["amount"] ?? row["total_project_cost"]);

    candidates.push({
      projectName: name.slice(0, 300),
      country,
      technology,
      dealSizeUsdMn: dealSize ?? estimateDealSize(null, technology),
      capacityMw: null,
      developer: (row["client"] ?? "").slice(0, 200) || null,
      financiers: "US Development Finance Corporation (DFC)",
      dfiInvolvement: "DFC",
      dealStage: "construction",
      status: "construction",
      description: row["description"]?.slice(0, 500) ?? null,
      newsUrl: null,
      sourceUrl: "https://www.dfc.gov/our-work/active-projects",
      latitude: null,
      longitude: null,
      announcedYear: row["board_date"] ? new Date(row["board_date"]).getFullYear() : null,
      offtaker: null,
      financialCloseDate: row["board_date"] || null,
      confidence: 1.0,
    });
  }

  return { candidates, errors, meta: { recordsFetched: fetched, filteredOut: filtered } };
}

export const dfcAdapter: RegisteredAdapter = {
  config: {
    key: "dfc",
    label: "US Development Finance Corporation",
    group: "multilateral",
    schedule: "weekly",
    defaultConfidence: 1.0,
  },
  run,
};
