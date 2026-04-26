/**
 * IFC (International Finance Corporation) Investment Projects Adapter
 *
 * Pulls IFC investment projects from the World Bank Group Data Catalog
 * and IFC Disclosure Portal. IFC is the largest DFI focused on
 * private-sector investment in developing countries.
 *
 * Sources:
 * - IFC Disclosure Portal: https://disclosures.ifc.org/
 * - WBG Data Catalog: https://datacatalog.worldbank.org/search/dataset/0037737
 * - WBG Finances One: https://financesone.worldbank.org/
 *
 * Structured JSON — confidence 1.0, no LLM needed.
 *
 * Key: api:ifc | defaultConfidence: 1.0 | Schedule: weekly
 */

import { BaseSourceAdapter, type RawRow, type CandidateDraft } from "../base.js";

// ── Types ───────────────────────────────────────────────────────────────────

interface IFCProject {
  project_name?: string;
  project_number?: string;
  project_id?: string;
  country?: string;
  country_name?: string;
  region?: string;
  sector?: string;
  industry?: string;
  department?: string;
  product_line?: string;
  status?: string;
  project_status?: string;
  approval_date?: string;
  board_approval_date?: string;
  disclosed_date?: string;
  total_ifc_investment?: number;
  ifc_investment?: number;
  total_project_cost?: number;
  company_name?: string;
  sponsor?: string;
  environmental_category?: string;
  project_url?: string;
  url?: string;
  description?: string;
  [key: string]: unknown;
}

// African countries
const AFRICAN_COUNTRIES = new Set([
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cape Verde", "Cameroon", "Central African Republic", "Chad",
  "Comoros", "Congo", "Congo, Dem. Rep.", "Congo, Rep.", "Côte d'Ivoire",
  "Cote d'Ivoire", "Democratic Republic of the Congo", "Djibouti", "Egypt",
  "Egypt, Arab Rep.", "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia",
  "Gabon", "Gambia", "Gambia, The", "Ghana", "Guinea", "Guinea-Bissau",
  "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi", "Mali",
  "Mauritania", "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger",
  "Nigeria", "Rwanda", "São Tomé and Príncipe", "Senegal", "Seychelles",
  "Sierra Leone", "Somalia", "South Africa", "South Sudan", "Sudan",
  "Tanzania", "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe",
  // Regional
  "Africa", "Sub-Saharan Africa", "Eastern and Southern Africa",
  "Western and Central Africa", "Middle East and North Africa",
]);

function isAfricanProject(p: IFCProject): boolean {
  const country = p.country ?? p.country_name ?? "";
  if (AFRICAN_COUNTRIES.has(country)) return true;
  const region = p.region ?? "";
  return region.toLowerCase().includes("africa");
}

function isEnergyProject(p: IFCProject): boolean {
  const text = [
    p.sector,
    p.industry,
    p.department,
    p.project_name,
    p.description,
  ].filter(Boolean).join(" ").toLowerCase();

  return (
    text.includes("energy") ||
    text.includes("power") ||
    text.includes("solar") ||
    text.includes("wind") ||
    text.includes("hydro") ||
    text.includes("electri") ||
    text.includes("grid") ||
    text.includes("transmission") ||
    text.includes("renewable") ||
    text.includes("gas") ||
    text.includes("generation") ||
    text.includes("geotherm") ||
    text.includes("biomass") ||
    text.includes("battery") ||
    text.includes("storage")
  );
}

function mapTechnology(p: IFCProject): string | null {
  const text = [
    p.sector,
    p.industry,
    p.project_name,
    p.description,
  ].filter(Boolean).join(" ").toLowerCase();

  if (text.includes("solar") || text.includes("photovoltaic")) return "Solar";
  if (text.includes("wind")) return "Wind";
  if (text.includes("hydro")) return "Hydro";
  if (text.includes("geotherm")) return "Geothermal";
  if (text.includes("biomass") || text.includes("bioenergy")) return "Biomass";
  if (text.includes("battery") || text.includes("storage")) return "Battery Storage";
  if (text.includes("hydrogen")) return "Green Hydrogen";
  if (text.includes("gas") || text.includes("lng") || text.includes("oil")) return "Oil & Gas";
  if (text.includes("grid") || text.includes("transmission") || text.includes("distribution")) return "Transmission & Distribution";
  return null;
}

function mapStatus(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("active") || s.includes("disbursing")) return "Under Construction";
  if (s.includes("complet") || s.includes("closed") || s.includes("mature")) return "Operational";
  if (s.includes("pipeline") || s.includes("pending") || s.includes("proposed")) return "Announced";
  if (s.includes("dropped") || s.includes("cancelled")) return "Cancelled";
  return "Announced";
}

// ── Adapter ─────────────────────────────────────────────────────────────────

export class IFCInvestmentAdapter extends BaseSourceAdapter {
  readonly key = "api:ifc";
  readonly schedule = "0 4 * * 1"; // Weekly on Monday at 4am
  readonly defaultConfidence = 1.0;
  readonly maxRps = 1;

  // IFC project disclosure endpoints
  private static readonly ENDPOINTS = [
    // IFC disclosure portal API
    "https://disclosures.ifc.org/enterprise-search-api/search?query=*&type=InvestmentProject",
    // WBG Finances One — IFC projects
    "https://financesone.worldbank.org/api/data/IFC?format=json",
    // IFC project list JSON
    "https://disclosures.ifc.org/api/projects",
  ];

  async fetch(): Promise<RawRow[]> {
    const results: RawRow[] = [];

    for (const endpoint of IFCInvestmentAdapter.ENDPOINTS) {
      try {
        const { response, cached } = await this.httpFetch(endpoint, {
          headers: { Accept: "application/json" },
        });

        if (cached) return [];

        const data = await response.json() as any;

        // Handle various response shapes
        const projects: IFCProject[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.response?.docs)
            ? data.response.docs
            : Array.isArray(data?.data)
              ? data.data
              : Array.isArray(data?.results)
                ? data.results
                : Array.isArray(data?.projects)
                  ? data.projects
                  : [];

        for (const p of projects) {
          if (isAfricanProject(p) && isEnergyProject(p)) {
            results.push(p as RawRow);
          }
        }

        if (results.length > 0) {
          console.log(`[${this.key}] Got ${results.length} African energy projects from ${endpoint}`);
          return results;
        }
      } catch (err) {
        console.warn(`[${this.key}] Endpoint ${endpoint} failed: ${err instanceof Error ? err.message : err}`);
        continue;
      }
    }

    console.log(`[${this.key}] Fetched ${results.length} African energy IFC projects`);
    return results;
  }

  normalize(row: RawRow): CandidateDraft | null {
    const p = row as IFCProject;

    const name = String(p.project_name ?? "").trim();
    if (!name || name.length < 5) return null;

    const country = String(p.country ?? p.country_name ?? "").trim() || null;
    const technology = mapTechnology(p);

    // Deal size — IFC reports total investment or total project cost
    const rawAmount = p.total_ifc_investment ?? p.ifc_investment ?? p.total_project_cost ?? null;
    let dealSizeUsdMn: number | null = null;
    if (typeof rawAmount === "number" && rawAmount > 0) {
      dealSizeUsdMn = rawAmount > 100_000
        ? rawAmount / 1_000_000
        : rawAmount;
    }

    // Announced year
    let announcedYear: number | null = null;
    const dateStr = p.approval_date ?? p.board_approval_date ?? p.disclosed_date ?? null;
    if (dateStr) {
      const y = new Date(String(dateStr)).getFullYear();
      if (y > 2000 && y < 2100) announcedYear = y;
    }

    const status = (p.status ?? p.project_status) ? mapStatus(String(p.status ?? p.project_status)) : "Announced";
    const description = p.description ? String(p.description).slice(0, 500) : null;
    const developer = p.company_name ?? p.sponsor ?? null;

    // Source URL
    let sourceUrl: string | null = null;
    if (p.project_url ?? p.url) {
      sourceUrl = String(p.project_url ?? p.url);
    } else if (p.project_number) {
      sourceUrl = `https://disclosures.ifc.org/project-detail/SII/${p.project_number}`;
    } else if (p.project_id) {
      sourceUrl = `https://disclosures.ifc.org/project-detail/SII/${p.project_id}`;
    } else {
      sourceUrl = "https://disclosures.ifc.org/";
    }

    // Normalize country names
    let normalizedCountry = country;
    if (normalizedCountry === "Congo, Dem. Rep.") normalizedCountry = "DRC";
    if (normalizedCountry === "Congo, Rep.") normalizedCountry = "Congo";
    if (normalizedCountry === "Egypt, Arab Rep.") normalizedCountry = "Egypt";
    if (normalizedCountry === "Gambia, The") normalizedCountry = "Gambia";

    return {
      projectName: name.slice(0, 300),
      country: normalizedCountry,
      technology,
      dealSizeUsdMn: dealSizeUsdMn !== null && dealSizeUsdMn > 0 && dealSizeUsdMn < 50_000 ? dealSizeUsdMn : null,
      developer: developer ? String(developer).slice(0, 200) : null,
      financiers: "International Finance Corporation (IFC)",
      dfiInvolvement: "IFC",
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

export const ifcInvestmentAdapter = new IFCInvestmentAdapter();
