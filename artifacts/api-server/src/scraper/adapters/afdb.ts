/**
 * African Development Bank — MapAfrica energy projects.
 *
 * Pulls the AfDB MapAfrica data portal (IATI-formatted) and filters to the
 * Energy sector code F (23xxx). Pagination via `page` query param, 100 per page.
 */

import { fetchWithRetry } from "../shared/http.js";
import { normalizeCountry, isRecognizedCountry } from "../shared/countries.js";
import { normalizeTechnology, estimateDealSize } from "../shared/technologies.js";
import type { CandidateDraft, AdapterResult, RegisteredAdapter } from "./types.js";

const API_BASE = "https://mapafrica.afdb.org/api/iati/activities";
const MAX_PAGES = 10;

interface IATIActivity {
  iati_identifier?: string;
  afdb_identifier_ref?: string;
  id?: string;
  title?: string;
  recipient_country?: string;
  country?: string;
  activity_status?: string;
  afdb_status?: string;
  activity_date_planned_start?: string;
  activity_date_actual_start?: string;
  sector_code?: string;
  description?: string;
  total_cost?: number;
  amount?: number;
}

function mapStatus(s: string | undefined): string {
  const x = (s ?? "").toLowerCase();
  if (x.includes("complet") || x.includes("closed") || x.includes("operational")) return "operational";
  if (x.includes("approv") || x.includes("implementation") || x.includes("ongoing") || x.includes("active")) return "construction";
  if (x.includes("cancel")) return "cancelled";
  return "announced";
}

function parseYear(date: string | undefined): number | null {
  if (!date) return null;
  const y = new Date(date).getFullYear();
  return y > 1990 && y < 2100 ? y : null;
}

async function run(): Promise<AdapterResult> {
  const candidates: CandidateDraft[] = [];
  const errors: string[] = [];
  let fetched = 0;
  let filtered = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const url = `${API_BASE}?sector=F&page=${page}`;
      const { body } = await fetchWithRetry(url, {
        maxRps: 1,
        headers: { Accept: "application/json" },
      });
      if (!body) break;

      const data = JSON.parse(body) as { data?: IATIActivity[]; activities?: IATIActivity[] } | IATIActivity[];
      const activities: IATIActivity[] = Array.isArray(data)
        ? data
        : (data.data ?? data.activities ?? []);

      if (activities.length === 0) break;
      fetched += activities.length;

      for (const a of activities) {
        const title = (a.title ?? "").trim();
        if (!title || title.length < 5) { filtered++; continue; }

        const country = normalizeCountry(a.recipient_country ?? a.country ?? "");
        if (!country || !isRecognizedCountry(country)) { filtered++; continue; }

        const technology = normalizeTechnology(`${title} ${a.description ?? ""}`);
        if (!technology) { filtered++; continue; }

        // total_cost is raw USD; convert to millions
        const rawAmount = a.total_cost ?? a.amount ?? null;
        let dealSize: number | null = null;
        if (typeof rawAmount === "number" && rawAmount > 0) {
          dealSize = rawAmount > 100_000 ? rawAmount / 1_000_000 : rawAmount;
        }

        const id = a.iati_identifier ?? a.afdb_identifier_ref ?? a.id ?? "";
        const sourceUrl = id ? `https://mapafrica.afdb.org/en/project/${id}` : null;
        const status = mapStatus(a.activity_status ?? a.afdb_status);

        candidates.push({
          projectName: title.slice(0, 300),
          country,
          technology,
          dealSizeUsdMn: dealSize !== null && dealSize > 0 && dealSize < 50_000
            ? dealSize
            : estimateDealSize(null, technology),
          capacityMw: null,
          developer: null,
          financiers: "African Development Bank (AfDB)",
          dfiInvolvement: "AfDB",
          dealStage: status,
          status,
          description: a.description?.slice(0, 500) ?? null,
          newsUrl: null,
          sourceUrl,
          latitude: null,
          longitude: null,
          announcedYear: parseYear(a.activity_date_actual_start ?? a.activity_date_planned_start),
          offtaker: null,
          financialCloseDate: a.activity_date_actual_start ?? null,
          confidence: 1.0,
        });
      }

      if (activities.length < 100) break;
    } catch (e) {
      errors.push(`page ${page}: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
  }

  return { candidates, errors, meta: { recordsFetched: fetched, filteredOut: filtered } };
}

export const afdbAdapter: RegisteredAdapter = {
  config: {
    key: "afdb",
    label: "African Development Bank",
    group: "multilateral",
    schedule: "weekly",
    defaultConfidence: 1.0,
  },
  run,
};
