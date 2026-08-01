/**
 * Green Climate Fund (GCF) — funded projects.
 *
 * GCF exposes its project portfolio via a JSON open data API. We filter to
 * African region and renewables/transmission/storage.
 */

import { fetchWithRetry } from "../shared/http.js";
import { normalizeCountry, isRecognizedCountry } from "../shared/countries.js";
import { normalizeTechnology, estimateDealSize } from "../shared/technologies.js";
import type { CandidateDraft, AdapterResult, RegisteredAdapter } from "./types.js";

const GCF_API = "https://api.gcfund.org/v1/projects?region=africa&page_size=200";

interface GCFProject {
  id?: string;
  title?: string;
  project_name?: string;
  countries?: string[];
  country?: string;
  region?: string;
  sector?: string;
  result_area?: string;
  description?: string;
  summary?: string;
  total_funding_usd?: number;
  gcf_funding_usd?: number;
  approval_date?: string;
  status?: string;
  url?: string;
  project_url?: string;
}

function mapStatus(s: string | undefined): string {
  const x = (s ?? "").toLowerCase();
  if (x.includes("complete") || x.includes("closed")) return "operational";
  if (x.includes("implementation") || x.includes("active") || x.includes("disburs")) return "construction";
  if (x.includes("approved") || x.includes("under preparation")) return "announced";
  return "announced";
}

async function run(): Promise<AdapterResult> {
  const candidates: CandidateDraft[] = [];
  const errors: string[] = [];
  let fetched = 0;
  let filtered = 0;

  let body = "";
  try {
    const r = await fetchWithRetry(GCF_API, { maxRps: 1, headers: { Accept: "application/json" } });
    body = r.body;
  } catch (e) {
    errors.push(`fetch: ${e instanceof Error ? e.message : String(e)}`);
    return { candidates, errors, meta: { recordsFetched: 0, filteredOut: 0 } };
  }
  if (!body) return { candidates, errors, meta: { recordsFetched: 0, filteredOut: 0 } };

  let projects: GCFProject[] = [];
  try {
    const data = JSON.parse(body) as { results?: GCFProject[]; data?: GCFProject[] } | GCFProject[];
    projects = Array.isArray(data) ? data : (data.results ?? data.data ?? []);
  } catch (e) {
    errors.push(`parse: ${e instanceof Error ? e.message : String(e)}`);
    return { candidates, errors, meta: { recordsFetched: 0, filteredOut: 0 } };
  }

  fetched = projects.length;

  for (const p of projects) {
    const name = (p.title ?? p.project_name ?? "").trim();
    if (!name || name.length < 5) { filtered++; continue; }

    // GCF projects often span multiple countries — emit one candidate per country
    const countryList = p.countries ?? (p.country ? [p.country] : []);
    const validCountries = countryList
      .map((c) => normalizeCountry(c))
      .filter((c): c is string => c !== null && isRecognizedCountry(c));
    if (validCountries.length === 0) { filtered++; continue; }

    const technology = normalizeTechnology(
      `${name} ${p.description ?? p.summary ?? ""} ${p.sector ?? ""} ${p.result_area ?? ""}`,
    );
    if (!technology) { filtered++; continue; }

    const dealSizeRaw = p.total_funding_usd ?? p.gcf_funding_usd ?? null;
    const dealSize = typeof dealSizeRaw === "number" && dealSizeRaw > 0
      ? (dealSizeRaw > 100_000 ? dealSizeRaw / 1_000_000 : dealSizeRaw)
      : estimateDealSize(null, technology);

    const status = mapStatus(p.status);
    const year = p.approval_date ? new Date(p.approval_date).getFullYear() : null;

    for (const country of validCountries) {
      candidates.push({
        projectName: name.slice(0, 300),
        country,
        technology,
        dealSizeUsdMn: dealSize,
        capacityMw: null,
        developer: null,
        financiers: "Green Climate Fund (GCF)",
        dfiInvolvement: "GCF",
        financingType: "Grant / Donor Funding",
        dealStage: status,
        status,
        description: (p.description ?? p.summary)?.slice(0, 500) ?? null,
        newsUrl: null,
        sourceUrl: p.url ?? p.project_url ?? (p.id ? `https://www.greenclimate.fund/project/${p.id}` : null),
        latitude: null,
        longitude: null,
        announcedYear: year && year > 1990 && year < 2100 ? year : null,
        offtaker: null,
        financialCloseDate: p.approval_date ?? null,
        confidence: 1.0,
      });
    }
  }

  return { candidates, errors, meta: { recordsFetched: fetched, filteredOut: filtered } };
}

export const gcfAdapter: RegisteredAdapter = {
  config: {
    key: "gcf",
    label: "Green Climate Fund",
    group: "multilateral",
    schedule: "weekly",
    defaultConfidence: 1.0,
  },
  run,
};
