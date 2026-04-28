/**
 * Green Climate Fund (GCF) API Adapter
 *
 * Pulls approved climate/energy projects from the GCF Open Data Library.
 * Structured JSON source â no LLM extraction needed. Confidence is always 1.0.
 *
 * API: https://data.greenclimate.fund  (Open Data Library)
 * Docs: https://developer.gcfund.org/
 *
 * Filters: result_area includes energy, region = Africa
 * Fields mapped directly to CandidateDraft schema.
 *
 * Key: api:gcf | defaultConfidence: 1.0 | Schedule: weekly
 */

import { BaseSourceAdapter, type RawRow, type CandidateDraft } from "../base.js";

// ââ GCF API response types ââââââââââââââââââââââââââââââââââââââââââââââââââ

interface GCFProject {
  ref?: string;
  project_name?: string;
  country?: string;
  countries?: string[];
  region?: string;
  theme?: string;
  result_areas?: string[];
  sector?: string;
  status?: string;
  approved_date?: string;
  funding_amount?: number;       // GCF funding in USD
  co_financing?: number;         // Co-financing in USD
  total_project_value?: number;  // Total value in USD
  disbursed_amount?: number;
  accredited_entity?: string;
  implementing_entity?: string;
  project_url?: string;
  description?: string;
  [key: string]: unknown;
}

// African countries for filtering multi-country projects
const AFRICAN_COUNTRIES = new Set([
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cape Verde", "Cameroon", "Central African Republic", "Chad",
  "Comoros", "Congo", "CÃ´te d'Ivoire", "Cote d'Ivoire", "Ivory Coast",
  "Democratic Republic of the Congo", "DRC", "Djibouti", "Egypt",
  "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon",
  "Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Kenya", "Lesotho",
  "Liberia", "Libya", "Madagascar", "Malawi", "Mali", "Mauritania",
  "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria",
  "Rwanda", "SÃ£o TomÃ© and PrÃ­ncipe", "Senegal", "Seychelles", "Sierra Leone",
  "Somalia", "South Africa", "South Sudan", "Sudan", "Tanzania",
  "United Republic of Tanzania", "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe",
]);

function isAfricanProject(p: GCFProject): boolean {
  // Check single country field
  if (p.country && AFRICAN_COUNTRIES.has(p.country)) return true;
  // Check region field
  if (p.region?.toLowerCase().includes("africa")) return true;
  // Check countries array
  if (p.countries?.some((c) => AFRICAN_COUNTRIES.has(c))) return true;
  return false;
}

function isEnergyProject(p: GCFProject): boolean {
  const text = [
    p.project_name,
    p.sector,
    p.theme,
    ...(p.result_areas ?? []),
    p.description,
  ].filter(Boolean).join(" ").toLowerCase();

  return (
    text.includes("energy") ||
    text.includes("power") ||
    text.includes("solar") ||
    text.includes("wind") ||
    text.includes("hydro") ||
    text.includes("geotherm") ||
    text.includes("biomass") ||
    text.includes("electri") ||
    text.includes("grid") ||
    text.includes("transmission") ||
    text.includes("renewable") ||
    text.includes("fossil") ||
    text.includes("hydrogen") ||
    text.includes("battery") ||
    text.includes("storage")
  );
}

function mapTechnology(p: GCFProject): string | null {
  const text = [
    p.project_name,
    p.sector,
    ...(p.result_areas ?? []),
    p.description,
  ].filter(Boolean).join(" ").toLowerCase();

  if (text.includes("solar")) return "Solar";
  if (text.includes("wind")) return "Wind";
  if (text.includes("hydro")) return "Hydro";
  if (text.includes("geotherm")) return "Geothermal";
  if (text.includes("biomass") || text.includes("bioenergy")) return "Biomass";
  if (text.includes("battery") || text.includes("storage")) return "Battery Storage";
  if (text.includes("hydrogen")) return "Green Hydrogen";
  if (text.includes("grid") || text.includes("transmission")) return "Transmission & Distribution";
  if (text.includes("gas") || text.includes("oil")) return "Oil & Gas";
  return null;
}

function mapStatus(gcfStatus: string): string {
  const s = gcfStatus.toLowerCase();
  if (s.includes("approved") || s.includes("active")) return "Under Construction";
  if (s.includes("completed") || s.includes("closed")) return "Operational";
  if (s.includes("concept") || s.includes("pipeline")) return "Announced";
  if (s.includes("cancelled") || s.includes("terminated")) return "Cancelled";
  return "Announced";
}

// ââ Adapter âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export class GCFApiAdapter extends BaseSourceAdapter {
  readonly key = "api:gcf";
  readonly schedule = "0 4 * * 0"; // Weekly on Sunday at 4am
  readonly defaultConfidence = 1.0;
  readonly maxRps = 1;

  // GCF Open Data Library API endpoint
  private static readonly DATA_URL = "https://data.greenclimate.fund/public/data/projects";

  async fetch(): Promise<RawRow[]> {
    try {
      // GCF data page is a Next.js SSR page with project data embedded in __NEXT_DATA__
      const html = await this.httpFetch(GCFApiAdapter.DATA_URL, {
        headers: { "Accept": "text/html,application/xhtml+xml" },
        responseType: "text",
      }) as string;

      // Extract __NEXT_DATA__ JSON from the HTML
      const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (!nextDataMatch) {
        console.error("[api:gcf] Could not find __NEXT_DATA__ in HTML response");
        return [];
      }

      let nextData: any;
      try {
        nextData = JSON.parse(nextDataMatch[1]);
      } catch (e) {
        console.error("[api:gcf] Failed to parse __NEXT_DATA__ JSON");
        return [];
      }

      // Navigate to the projects array: props.pageProps.data.data
      const projects: any[] = nextData?.props?.pageProps?.data?.data ?? [];
      if (!projects.length) {
        console.warn("[api:gcf] No projects found in __NEXT_DATA__");
        return [];
      }

      // Map real GCF fields to our GCFProject interface
      const rows: RawRow[] = [];
      for (const p of projects) {
        const countries: string[] = (p.Countries || []).map((c: any) => c.CountryName || c.Name || "");
        const africanCountries = countries.filter((c: string) => isAfricanProject({ countries }));

        // Only include projects with at least one African country
        if (!africanCountries.length && !isAfricanProject({ country: countries.join(", ") })) continue;

        // Energy filter: check sector, theme, and project name
        const sector = p.Sector || "";
        const theme = p.Theme || "";
        const name = p.ProjectName || "";
        if (!isEnergyProject({ sector, theme, project_name: name })) continue;

        rows.push({
          ref: p.ApprovedRef || p.ProjectsID || "",
          project_name: name,
          country: africanCountries.join(", ") || countries.join(", "),
          countries: africanCountries.length ? africanCountries : countries,
          sector: sector,
          theme: theme,
          status: p.Type || "APPROVED",
          approved_date: p.BMDate || "",
          funding_amount: p.TotalGCFBudgetUSD || p.ProjectSize || 0,
          co_financing: p.TotalCoBudgetUSD || 0,
          total_project_value: p.TotalBudgetUSD || 0,
          accredited_entity: (p.EntityData || []).map((e: any) => e.Acronym || e.Name || "").join(", "),
          project_url: p.ApprovedRef ? `https://www.greenclimate.fund/project/${p.ApprovedRef}` : "",
          description: p.ProjectName || "",
        } as any);
      }

      console.log(`[api:gcf] Fetched ${rows.length} African energy projects from ${projects.length} total`);
      return rows;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[api:gcf] Fetch failed: ${msg}`);
      (this as any)._lastFetchError = msg;
      return [];
    }
  }

  normalize(row: RawRow): CandidateDraft | null {
    const p = row as GCFProject;

    const name = String(p.project_name ?? "").trim();
    if (!name || name.length < 5) return null;

    // Get primary country (first African country found)
    let country: string | null = null;
    if (p.country && AFRICAN_COUNTRIES.has(p.country)) {
      country = p.country;
    } else if (p.countries) {
      country = p.countries.find((c) => AFRICAN_COUNTRIES.has(c)) ?? null;
    }

    // Deal size: prefer total project value, fallback to GCF funding amount
    const totalUsd = p.total_project_value ?? p.funding_amount ?? null;
    const dealSizeUsdMn = totalUsd && totalUsd > 0 ? totalUsd / 1_000_000 : null;

    // Announced year from approval date
    let announcedYear: number | null = null;
    if (p.approved_date) {
      const y = new Date(String(p.approved_date)).getFullYear();
      if (y > 2010 && y < 2100) announcedYear = y;
    }

    const technology = mapTechnology(p);
    const status = p.status ? mapStatus(p.status) : "Announced";
    const description = p.description ? String(p.description).slice(0, 500) : null;

    // Build source URL
    const sourceUrl = p.project_url
      ?? (p.ref ? `https://www.greenclimate.fund/project/${p.ref}` : null);

    // DFI / financier info
    const accreditedEntity = p.accredited_entity ?? p.implementing_entity ?? null;

    return {
      projectName: name.slice(0, 300),
      country,
      technology,
      dealSizeUsdMn: dealSizeUsdMn !== null && dealSizeUsdMn > 0 && dealSizeUsdMn < 50_000 ? dealSizeUsdMn : null,
      developer: accreditedEntity,
      financiers: "Green Climate Fund" + (accreditedEntity ? ` / ${accreditedEntity}` : ""),
      dfiInvolvement: "Green Climate Fund",
      offtaker: null,
      dealStage: status,
      status,
      description,
      capacityMw: null,
      announcedYear,
      financialCloseDate: p.approved_date ?? null,
      sourceUrl,
      newsUrl: sourceUrl,
      source: this.key,
      confidence: this.defaultConfidence,
      rawJson: { ...(p as Record<string, unknown>) },
    };
  }
}

export const gcfApiAdapter = new GCFApiAdapter();
