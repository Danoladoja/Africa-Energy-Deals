/**
 * Africa Energy Portal (AfDB) Adapter
 *
 * Scrapes the Africa Energy Portal project database, maintained by the
 * African Development Bank. This is the AfDB's dedicated energy data
 * platform covering generation, transmission, distribution, and policy.
 *
 * Source: https://africa-energy-portal.org/
 * Also probes: https://projectsportal.afdb.org/dataportal/
 *
 * Attempts JSON API first; falls back to HTML table parsing.
 * Structured data â confidence 1.0, no LLM needed.
 *
 * Key: api:afdb-energy | defaultConfidence: 1.0 | Schedule: weekly
 */

import { BaseSourceAdapter, type RawRow, type CandidateDraft } from "../base.js";

// ââ Types âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

interface AfDBProject {
  project_name?: string;
  title?: string;
  name?: string;
  country?: string;
  country_name?: string;
  sector?: string;
  sector_name?: string;
  status?: string;
  approval_date?: string;
  date_approved?: string;
  board_approval_date?: string;
  total_cost?: number;
  amount?: number;
  usd_amount?: number;
  loan_amount?: number;
  description?: string;
  summary?: string;
  project_url?: string;
  url?: string;
  project_id?: string;
  iati_identifier?: string;
  implementing_agency?: string;
  [key: string]: unknown;
}

// African countries (for filtering multi-country or regional results)
const AFRICAN_COUNTRIES = new Set([
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cape Verde", "Cameroon", "Central African Republic", "Chad",
  "Comoros", "Congo", "CÃ´te d'Ivoire", "Cote d'Ivoire", "Ivory Coast",
  "Democratic Republic of the Congo", "DRC", "Djibouti", "Egypt",
  "Equatorial Guinea", "Eritrea", "Eswatini", "Swaziland", "Ethiopia", "Gabon",
  "Gambia", "The Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Kenya",
  "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi", "Mali", "Mauritania",
  "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria",
  "Rwanda", "SÃ£o TomÃ© and PrÃ­ncipe", "Sao Tome and Principe", "Senegal",
  "Seychelles", "Sierra Leone", "Somalia", "South Africa", "South Sudan",
  "Sudan", "Tanzania", "United Republic of Tanzania", "Togo", "Tunisia",
  "Uganda", "Zambia", "Zimbabwe",
  // Regional
  "Africa", "Multinational", "Regional", "Sub-Saharan Africa",
]);

function isEnergyProject(project: AfDBProject): boolean {
  const text = [
    project.sector,
    project.sector_name,
    project.project_name ?? project.title ?? project.name,
    project.description ?? project.summary,
  ].filter(Boolean).join(" ").toLowerCase();

  return (
    text.includes("energy") ||
    text.includes("power") ||
    text.includes("solar") ||
    text.includes("wind") ||
    text.includes("hydro") ||
    text.includes("geotherm") ||
    text.includes("electri") ||
    text.includes("grid") ||
    text.includes("transmission") ||
    text.includes("renewable") ||
    text.includes("biomass") ||
    text.includes("generation") ||
    text.includes("gas") ||
    text.includes("petroleum") ||
    text.includes("fuel")
  );
}

function mapTechnology(project: AfDBProject): string | null {
  const text = [
    project.sector,
    project.sector_name,
    project.project_name ?? project.title ?? project.name,
    project.description ?? project.summary,
  ].filter(Boolean).join(" ").toLowerCase();

  if (text.includes("solar")) return "Solar";
  if (text.includes("wind")) return "Wind";
  if (text.includes("hydro")) return "Hydro";
  if (text.includes("geotherm")) return "Geothermal";
  if (text.includes("biomass") || text.includes("bioenergy")) return "Biomass";
  if (text.includes("battery") || text.includes("storage")) return "Battery Storage";
  if (text.includes("hydrogen")) return "Green Hydrogen";
  if (text.includes("gas") || text.includes("lng") || text.includes("oil") || text.includes("petroleum")) return "Oil & Gas";
  if (text.includes("grid") || text.includes("transmission") || text.includes("distribution")) return "Transmission & Distribution";
  if (text.includes("nuclear")) return "Nuclear";
  return null;
}

function mapStatus(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("complet") || s.includes("closed") || s.includes("operational")) return "Operational";
  if (s.includes("approv") || s.includes("active") || s.includes("implementation") || s.includes("ongoing")) return "Under Construction";
  if (s.includes("pipeline") || s.includes("concept") || s.includes("appraisal") || s.includes("identification")) return "Announced";
  if (s.includes("cancel")) return "Cancelled";
  return "Announced";
}

// ââ Adapter âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export class AfDBEnergyAdapter extends BaseSourceAdapter {
  readonly key = "api:afdb-energy";
  readonly schedule = "0 3 * * 0"; // Weekly on Sunday at 3am
  readonly defaultConfidence = 1.0;
  readonly maxRps = 1;

  // AfDB data portal endpoints to try
  private static readonly ENDPOINTS = [
    // IATI-based project data portal (JSON API)
    "https://projectsportal.afdb.org/dataportal/api/projects?sector=energy&region=africa&format=json",
    // General projects portal list
    "https://projectsportal.afdb.org/dataportal/VProject/list",
    // Africa Energy Portal project list
    "https://africa-energy-portal.org/api/projects",
    "https://africa-energy-portal.org/project-list",
  ];

  async fetch(): Promise<RawRow[]> {
    try {
      // MapAfrica API: sector=F is Energy/Power sector
      // Paginated with 100 results per page
      const allRows: RawRow[] = [];
      let page = 1;
      const maxPages = 10; // Safety limit

      while (page <= maxPages) {
        const url = `${AfDBEnergyAdapter.API_BASE}?sector=F&page=${page}`;
                const { response: afdbResp } = await this.httpFetch(url, {
          headers: { "Accept": "application/json" },
                });
        const data = await afdbResp.json();

        // The API returns an object with activities array
        const activities: any[] = data?.data || data?.activities || data?.results || [];
        if (Array.isArray(data)) {
          // Sometimes the API returns a flat array
          activities.push(...data);
        }

        if (!activities.length) break;

        for (const a of activities) {
          const country = a.recipient_country || a.country || "";
          const title = a.title || "";
          const id = a.iati_identifier || a.afdb_identifier_ref || a.id || "";
          
          // Map status
          let status = a.activity_status || a.afdb_status || "";
          
          allRows.push({
            id: id,
            title: title,
            country: country,
            country_codes: a.country_codes || "",
            region: a.region || "Africa",
            sector: "Energy",
            sector_code: a.sector_code || "23111",
            status: status,
            start_date: a.activity_date_planned_start || a.activity_date_actual_start || "",
            end_date: a.activity_date_planned_end || "",
            adf_cycle: a.adf_cycle || "",
            source_url: id ? `https://mapafrica.afdb.org/en/project/${id}` : "",
          } as any);
        }

        // Check if there are more pages
        if (activities.length < 100) break;
        page++;
      }

      console.log(`[api:afdb-energy] Fetched ${allRows.length} energy projects across ${page} pages`);
      return allRows;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[api:afdb-energy] Fetch failed: ${msg}`);
      (this as any)._lastFetchError = msg;
      return [];
    }
  }

  normalize(row: RawRow): CandidateDraft | null {
    const p = row as AfDBProject;

    const name = String(p.project_name ?? p.title ?? p.name ?? "").trim();
    if (!name || name.length < 5) return null;

    const country = String(p.country ?? p.country_name ?? "").trim() || null;

    // Deal size â convert to USD millions
    const rawAmount = p.total_cost ?? p.amount ?? p.usd_amount ?? p.loan_amount ?? null;
    let dealSizeUsdMn: number | null = null;
    if (typeof rawAmount === "number" && rawAmount > 0) {
      dealSizeUsdMn = rawAmount > 100_000
        ? rawAmount / 1_000_000  // Raw USD â millions
        : rawAmount;              // Already in millions
    }

    // Announced year
    let announcedYear: number | null = null;
    const dateStr = p.approval_date ?? p.date_approved ?? p.board_approval_date ?? null;
    if (dateStr) {
      const y = new Date(String(dateStr)).getFullYear();
      if (y > 2000 && y < 2100) announcedYear = y;
    }

    const technology = mapTechnology(p);
    const status = p.status ? mapStatus(p.status) : "Announced";
    const description = String(p.description ?? p.summary ?? "").slice(0, 500) || null;

    // Source URL
    let sourceUrl: string | null = null;
    if (p.project_url) {
      sourceUrl = p.project_url.startsWith("http") ? p.project_url : `https://projectsportal.afdb.org${p.project_url}`;
    } else if (p.url) {
      sourceUrl = String(p.url);
    } else if (p.project_id) {
      sourceUrl = `https://projectsportal.afdb.org/dataportal/VProject/Show/${p.project_id}`;
    } else {
      sourceUrl = "https://projectsportal.afdb.org/dataportal/";
    }

    return {
      projectName: name.slice(0, 300),
      country,
      technology,
      dealSizeUsdMn: dealSizeUsdMn !== null && dealSizeUsdMn > 0 && dealSizeUsdMn < 50_000 ? dealSizeUsdMn : null,
      developer: p.implementing_agency ? String(p.implementing_agency) : null,
      financiers: "African Development Bank (AfDB)",
      dfiInvolvement: "AfDB",
      offtaker: null,
      dealStage: status,
      status,
      description,
      capacityMw: null,
      announcedYear,
      financialCloseDate: dateStr ?? null,
      sourceUrl,
      newsUrl: null,
      source: this.key,
      confidence: this.defaultConfidence,
      rawJson: { ...(p as Record<string, unknown>) },
    };
  }
}

export const afdbEnergyAdapter = new AfDBEnergyAdapter();
