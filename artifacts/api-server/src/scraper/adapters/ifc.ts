/**
 * International Finance Corporation (IFC) — investment projects.
 *
 * Pulls IFC's project disclosure CSV, filters to the Energy sector and
 * African region.
 */

import { fetchWithRetry } from "../shared/http.js";
import { parseCSV } from "../shared/csv-parser.js";
import { normalizeCountry, isRecognizedCountry } from "../shared/countries.js";
import { normalizeTechnology, estimateDealSize } from "../shared/technologies.js";
import type { CandidateDraft, AdapterResult, RegisteredAdapter } from "./types.js";

// IFC disclosure portal exposes project data as CSV. Endpoint historically changes;
// we try a small list and use whichever returns CSV.
const CANDIDATE_URLS = [
  "https://disclosures.ifc.org/api/projects.csv",
  "https://disclosures.ifc.org/api/projects/recent.csv",
];

function parseDealSizeUsd(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[,$\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 100_000 ? n / 1_000_000 : n;
}

async function run(): Promise<AdapterResult> {
  const candidates: CandidateDraft[] = [];
  const errors: string[] = [];
  let fetched = 0;
  let filtered = 0;

  let body = "";
  let sourceUrl = "";
  for (const url of CANDIDATE_URLS) {
    try {
      const r = await fetchWithRetry(url, { maxRps: 1, headers: { Accept: "text/csv" } });
      if (r.body && r.body.length > 100) {
        body = r.body;
        sourceUrl = url;
        break;
      }
    } catch (e) {
      errors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!body) {
    return { candidates: [], errors, meta: { recordsFetched: 0, filteredOut: 0 } };
  }

  const rows = parseCSV(body);
  fetched = rows.length;

  for (const row of rows) {
    const sector = (row["sector"] ?? row["primary_sector"] ?? "").toLowerCase();
    if (!sector.includes("energy") && !sector.includes("power") && !sector.includes("infrastructure")) {
      filtered++;
      continue;
    }

    const country = normalizeCountry(row["country"] ?? row["country_name"] ?? "");
    if (!country || !isRecognizedCountry(country)) { filtered++; continue; }

    const name = (row["project_name"] ?? row["title"] ?? "").trim();
    if (!name || name.length < 5) { filtered++; continue; }

    const technology = normalizeTechnology(`${name} ${row["description"] ?? ""} ${sector}`);
    if (!technology) { filtered++; continue; }

    const dealSize = parseDealSizeUsd(row["total_investment_usd"] ?? row["ifc_investment_usd"] ?? row["amount"]);

    candidates.push({
      projectName: name.slice(0, 300),
      country,
      technology,
      dealSizeUsdMn: dealSize ?? estimateDealSize(null, technology),
      capacityMw: null,
      developer: (row["sponsor"] ?? row["company"] ?? "").slice(0, 200) || null,
      financiers: "International Finance Corporation (IFC)",
      dfiInvolvement: "IFC",
      financingType: "Project Finance",
      dealStage: row["status"]?.toLowerCase() ?? "announced",
      status: row["status"]?.toLowerCase() ?? "announced",
      description: row["description"]?.slice(0, 500) ?? null,
      newsUrl: null,
      sourceUrl: row["project_url"] || sourceUrl,
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

export const ifcAdapter: RegisteredAdapter = {
  config: {
    key: "ifc",
    label: "International Finance Corporation",
    group: "multilateral",
    schedule: "weekly",
    defaultConfidence: 1.0,
  },
  run,
};
