/**
 * Global Energy Monitor (GEM) — Africa power plants.
 *
 * Pulls 8 tracker CSVs (Solar, Wind, Coal, Gas, Hydro, Bioenergy, Nuclear,
 * Geothermal), filters to African countries, and emits one CandidateDraft
 * per plant. Sizes are benchmark estimates (flagged isEstimated) and
 * confidence is deliberately moderate (0.6) so new records go to human review.
 */

import { fetchWithRetry } from "../shared/http.js";
import { parseCSV } from "../shared/csv-parser.js";
import { normalizeCountry, isRecognizedCountry } from "../shared/countries.js";
import { estimateDealSize } from "../shared/technologies.js";
import type { CandidateDraft, AdapterResult, RegisteredAdapter } from "./types.js";

const TRACKERS = [
  { url: "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Solar-Power-Tracker.csv", tech: "Solar" },
  { url: "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Wind-Power-Tracker.csv", tech: "Wind" },
  { url: "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Coal-Plant-Tracker.csv", tech: "Coal" },
  { url: "https://globalenergymonitor.org/wp-content/uploads/2024/Africa-Gas-Tracker.csv", tech: "Oil & Gas" },
  { url: "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Hydropower-Tracker.csv", tech: "Hydro" },
  { url: "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Bioenergy-Power-Tracker.csv", tech: "Bioenergy" },
  { url: "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Nuclear-Power-Tracker.csv", tech: "Nuclear" },
  { url: "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Geothermal-Power-Tracker.csv", tech: "Geothermal" },
];

// Canonical stage values (see shared/deal-stages.ts)
const STATUS_MAP: Record<string, string> = {
  "operating": "Commissioned",
  "operational": "Commissioned",
  "construction": "Construction",
  "pre-construction": "Announced",
  "permitted": "Announced",
  "announced": "Announced",
  "proposed": "Announced",
  "retired": "Decommissioned",
  "mothballed": "Decommissioned",
  "cancelled": "Cancelled",
  "shelved": "Cancelled",
};

function parseNumber(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

async function run(): Promise<AdapterResult> {
  const candidates: CandidateDraft[] = [];
  const errors: string[] = [];
  let fetched = 0;
  let filtered = 0;

  for (const tracker of TRACKERS) {
    try {
      const { body, fromCache } = await fetchWithRetry(tracker.url, {
        maxRps: 1,
        headers: { Accept: "text/csv, application/octet-stream" },
      });
      if (fromCache || !body) continue;

      const rows = parseCSV(body);
      fetched += rows.length;

      for (const row of rows) {
        const rawCountry = row["country"] ?? row["country_name"] ?? "";
        const country = normalizeCountry(rawCountry);
        if (!country || !isRecognizedCountry(country)) { filtered++; continue; }

        const name = (row["project_name"] ?? row["plant_name"] ?? row["name"] ?? row["unit_name"] ?? "").trim();
        if (!name || name.length < 3) { filtered++; continue; }

        const capacityRaw = row["capacity_mw"] ?? row["capacity"] ?? row["capacity__mw_"];
        const capacityMw = parseNumber(capacityRaw);
        const validCapacity = capacityMw !== null && capacityMw > 0 && capacityMw < 100_000 ? capacityMw : null;

        const statusRaw = (row["status"] ?? "").toLowerCase();
        const status = STATUS_MAP[statusRaw] ?? "announced";

        // Cancelled / shelved / retired plants are infrastructure history, not
        // investment deals — do not ingest them.
        if (status === "Cancelled" || status === "Decommissioned") { filtered++; continue; }

        const lat = parseNumber(row["latitude"] ?? row["lat"]);
        const lng = parseNumber(row["longitude"] ?? row["lon"] ?? row["lng"]);
        const validLat = lat !== null && lat >= -90 && lat <= 90 ? lat : null;
        const validLng = lng !== null && lng >= -180 && lng <= 180 ? lng : null;

        const year = parseNumber(row["year"] ?? row["start_year"] ?? row["commissioning_year"]);
        const announcedYear = year !== null && year > 1990 && year < 2100 ? Math.trunc(year) : null;

        candidates.push({
          projectName: name.slice(0, 300),
          country,
          technology: tracker.tech,
          dealSizeUsdMn: estimateDealSize(validCapacity, tracker.tech),
          isEstimated: true, // GEM sizes are capacity-based benchmark estimates, never disclosed values
          capacityMw: validCapacity,
          developer: (row["owner"] ?? row["parent"] ?? row["operator"] ?? row["developer"] ?? "").slice(0, 200) || null,
          financiers: null,
          dfiInvolvement: null,
          dealStage: status,
          status,
          description: `${tracker.tech} power plant${validCapacity ? ` (${validCapacity} MW)` : ""}`,
          newsUrl: null,
          sourceUrl: row["wiki_url"] || row["url"] || tracker.url,
          latitude: validLat,
          longitude: validLng,
          announcedYear,
          offtaker: null,
          financialCloseDate: null,
          confidence: 0.6, // route new GEM records through human review, not auto-approve
        });
      }
    } catch (e) {
      errors.push(`${tracker.tech}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { candidates, errors, meta: { recordsFetched: fetched, filteredOut: filtered } };
}

export const gemAdapter: RegisteredAdapter = {
  config: {
    key: "gem",
    label: "Global Energy Monitor",
    group: "gem",
    schedule: "monthly",
    defaultConfidence: 0.6,
  },
  run,
};
