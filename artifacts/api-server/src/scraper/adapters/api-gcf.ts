/**
 * Green Climate Fund (GCF) API Adapter
 *
 * Pulls approved climate/energy projects from the GCF Open Data Library.
 * Structured JSON source — no LLM extraction needed. Confidence is always 1.0.
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

// ── GCF API response types ──────────────────────────────────────────────────

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
  "Comoros", "Congo", "Côte d'Ivoire", "Cote d'Ivoire", "Ivory Coast",
  "Democratic Republic of the Congo", "DRC", "Djibouti", "Egypt",
  "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon",
  "Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Kenya", "Lesotho",
  "Liberia", "Libya", "Madagascar", "Malawi", "Mali", "Mauritania",
  "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria",
  "Rwanda", "São Tomé and Príncipe", "Senegal", "Seychelles", "Sierra Leone",
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

// ── Adapter ─────────────────────────────────────────────────────────────────

export class GCFApiAdapter extends BaseSourceAdapter {
  readonly key = "api:gcf";
  readonly schedule = "0 4 * * 0"; // Weekly on Sunday at 4am
  readonly defaultConfidence = 1.0;
  readonly maxRps = 1;

  // GCF Open Data Library API endpoint
  private static readonly API_BASE = "https://data.greenclimate.fund/public/api/projects";

  async fetch(): Promise<RawRow[]> {
    const results: RawRow[] = [];

    try {
      // Try the primary API endpoint
      const { response, cached } = await this.httpFetch(GCFApiAdapter.API_BASE, {
        headers: { Accept: "application/json" },
      });

      if (cached) return [];

      const data = await response.json() as any;

      // The API may return { data: [...] } or a direct array
      const projects: GCFProject[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : [];

      for (const p of projects) {
        if (isAfricanProject(p) && isEnergyProject(p)) {
          results.push(p as RawRow);
        }
      }
    } catch (err) {
      console.warn(`[${this.key}] Primary API failed, trying approved projects page: ${err instanceof Error ? err.message : err}`);

      // Fallback: GCF approved projects JSON feed
      try {
        const fallbackUrl = "https://www.greenclimate.fund/api/projects/all";
        const { response: fbResponse, cached: fbCached } = await this.httpFetch(fallbackUrl, {
          headers: { Accept: "application/json" },
        });

        if (fbCached) return [];

        const fbData = await fbResponse.json() as any;
        const fbProjects: GCFProject[] = Array.isArray(fbData)
          ? fbData
          : Array.isArray(fbData?.data)
            ? fbData.data
            : [];

        for (const p of fbProjects) {
          if (isAfricanProject(p) && isEnergyProject(p)) {
            results.push(p as RawRow);
          }
        }
      } catch (fbErr) {
        console.error(`[${this.key}] Fallback also failed: ${fbErr instanceof Error ? fbErr.message : fbErr}`);
      }
    }

    console.log(`[${this.key}] Fetched ${results.length} African energy projects from GCF`);
    return results;
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
