/**
 * World Bank Projects API Adapter (Idea 6 — Structured API Adapters)
 *
 * Pulls energy projects from the World Bank Projects & Operations API.
 * This is a STRUCTURED data source — returns clean JSON with typed fields.
 * No LLM extraction needed. Confidence is always 1.0.
 *
 * API: https://search.worldbank.org/api/v2/projects
 *
 * Filters: sector = "Energy and Extractives" or "Energy", region = Africa
 * Fields mapped directly to CandidateDraft schema.
 *
 * Key: api:worldbank | defaultConfidence: 1.0 | Schedule: weekly
 */

import { BaseSourceAdapter, type RawRow, type CandidateDraft, parseAmountUsd } from "../base.js";

// World Bank API response types
interface WBProject {
  id?: string;
  project_name?: string;
  countryname?: string;
  countryshortname?: string;
  sector1?: { Name?: string };
  sector2?: { Name?: string };
  mjsector1?: { Name?: string };
  mjsector?: { Name?: string };
  theme1?: { Name?: string };
  status?: string;
  totalamt?: number;
  ibrdcommamt?: number;
  idacommamt?: number;
  grantamt?: number;
  boardapprovaldate?: string;
  closingdate?: string;
  project_abstract?: { cdata?: string };
  url?: string;
  pdo?: { cdata?: string };
  [key: string]: unknown;
}

interface WBApiResponse {
  projects?: Record<string, WBProject>;
  total?: number;
}

// African country codes for filtering
const AFRICA_COUNTRY_CODES = new Set([
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG",
  "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN",
  "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ",
  "NA", "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD",
  "TZ", "TG", "TN", "UG", "ZM", "ZW",
]);

// Map World Bank sector names to our technology enum
function mapSectorToTechnology(sector: string): string | null {
  const s = sector.toLowerCase();
  if (s.includes("solar")) return "Solar";
  if (s.includes("wind")) return "Wind";
  if (s.includes("hydro")) return "Hydro";
  if (s.includes("geotherm")) return "Geothermal";
  if (s.includes("biomass") || s.includes("bioenergy")) return "Biomass";
  if (s.includes("nuclear")) return "Nuclear";
  if (s.includes("oil") || s.includes("gas") || s.includes("petroleum")) return "Oil & Gas";
  if (s.includes("transmission") || s.includes("distribution") || s.includes("grid")) return "Transmission & Distribution";
  if (s.includes("battery") || s.includes("storage")) return "Battery Storage";
  if (s.includes("hydrogen")) return "Green Hydrogen";
  // Generic energy — leave technology null for the sector classifier to handle
  if (s.includes("energy") || s.includes("power") || s.includes("electric")) return null;
  return null;
}

// Map World Bank status to our status enum
function mapStatus(wbStatus: string): string {
  const s = wbStatus.toLowerCase();
  if (s.includes("active") || s.includes("implementation")) return "Under Construction";
  if (s.includes("pipeline") || s.includes("proposed")) return "Planned";
  if (s.includes("approved")) return "Financial Close";
  if (s.includes("closed") || s.includes("completed")) return "Operational";
  if (s.includes("dropped") || s.includes("cancelled")) return "Cancelled";
  return "Announced";
}

export class WorldBankApiAdapter extends BaseSourceAdapter {
  readonly key = "api:worldbank";
  readonly schedule = "0 3 * * 0"; // Weekly on Sunday at 3am
  readonly defaultConfidence = 1.0;
  readonly maxRps = 1;

  private static readonly API_BASE = "https://search.worldbank.org/api/v2/projects";

  async fetch(): Promise<RawRow[]> {
    const results: RawRow[] = [];
    let offset = 0;
    const pageSize = 50;
    const maxPages = 10; // Safety limit — 500 projects max

    for (let page = 0; page < maxPages; page++) {
      try {
        const params = new URLSearchParams({
          format: "json",
          mjsectorcode: "BX",  // Energy and Extractives major sector
          regionname: "Africa",
          rows: String(pageSize),
          os: String(offset),
          fl: "id,project_name,countryname,countryshortname,sector1,sector2,mjsector1,status,totalamt,ibrdcommamt,idacommamt,grantamt,boardapprovaldate,closingdate,project_abstract,url,pdo",
        });

        const { response, cached } = await this.httpFetch(`${WorldBankApiAdapter.API_BASE}?${params}`);
        if (cached) break;

        const data = await response.json() as WBApiResponse;
        const projects = data.projects ?? {};
        const entries = Object.values(projects);

        if (entries.length === 0) break;

        for (const p of entries) {
          results.push(p as RawRow);
        }

        // Check if we've fetched all
        if (entries.length < pageSize || (data.total && offset + pageSize >= data.total)) break;
        offset += pageSize;
      } catch (err) {
        console.warn(`[${this.key}] Page ${page} failed: ${err instanceof Error ? err.message : err}`);
        break;
      }
    }

    console.log(`[${this.key}] Fetched ${results.length} projects from World Bank API`);
    return results;
  }

  normalize(row: RawRow): CandidateDraft | null {
    const p = row as WBProject;

    const name = String(p.project_name ?? "").trim();
    if (!name || name.length < 5) return null;

    const country = String(p.countryshortname ?? p.countryname ?? "").trim() || null;

    // Determine sector/technology from available sector fields
    const sectorFields = [
      p.sector1?.Name,
      p.sector2?.Name,
      p.mjsector1?.Name,
      typeof p.mjsector === "object" && p.mjsector !== null ? (p.mjsector as any)?.Name : undefined,
    ].filter(Boolean) as string[];

    let technology: string | null = null;
    for (const sf of sectorFields) {
      technology = mapSectorToTechnology(sf);
      if (technology) break;
    }

    // Compute deal size from available amount fields
    const totalAmt = typeof p.totalamt === "number" ? p.totalamt : 0;
    const ibrd = typeof p.ibrdcommamt === "number" ? p.ibrdcommamt : 0;
    const ida = typeof p.idacommamt === "number" ? p.idacommamt : 0;
    const grant = typeof p.grantamt === "number" ? p.grantamt : 0;
    const rawAmount = totalAmt || (ibrd + ida + grant);
    // World Bank amounts are in USD, convert to millions
    const dealSizeUsdMn = rawAmount > 0 ? rawAmount / 1_000_000 : null;

    // Announced year from approval date
    let announcedYear: number | null = null;
    if (p.boardapprovaldate) {
      const y = new Date(String(p.boardapprovaldate)).getFullYear();
      if (y > 1990 && y < 2100) announcedYear = y;
    }

    // Description from project abstract or PDO
    const description = p.project_abstract?.cdata
      ?? p.pdo?.cdata
      ?? null;

    // Project URL
    const url = p.url
      ?? (p.id ? `https://projects.worldbank.org/en/projects-operations/project-detail/${p.id}` : null);

    const status = p.status ? mapStatus(p.status) : null;

    return {
      projectName: name.slice(0, 300),
      country,
      technology,
      dealSizeUsdMn: dealSizeUsdMn !== null && dealSizeUsdMn > 0 && dealSizeUsdMn < 50_000 ? dealSizeUsdMn : null,
      developer: null,
      financiers: "World Bank (IBRD/IDA)",
      dfiInvolvement: "World Bank",
      offtaker: null,
      dealStage: status,
      status,
      description: description ? String(description).slice(0, 500) : null,
      capacityMw: null, // World Bank API doesn't typically include capacity
      announcedYear,
      financialCloseDate: null,
      sourceUrl: url,
      newsUrl: url,
      source: this.key,
      confidence: this.defaultConfidence,
      rawJson: { ...(p as Record<string, unknown>) },
    };
  }
}

export const worldBankApiAdapter = new WorldBankApiAdapter();
