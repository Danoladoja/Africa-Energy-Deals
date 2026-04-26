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
 * Structured data — confidence 1.0, no LLM needed.
 *
 * Key: api:afdb-energy | defaultConfidence: 1.0 | Schedule: weekly
 */

import { BaseSourceAdapter, type RawRow, type CandidateDraft } from "../base.js";

// ── Types ───────────────────────────────────────────────────────────────────

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
  "Comoros", "Congo", "Côte d'Ivoire", "Cote d'Ivoire", "Ivory Coast",
  "Democratic Republic of the Congo", "DRC", "Djibouti", "Egypt",
  "Equatorial Guinea", "Eritrea", "Eswatini", "Swaziland", "Ethiopia", "Gabon",
  "Gambia", "The Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Kenya",
  "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi", "Mali", "Mauritania",
  "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria",
  "Rwanda", "São Tomé and Príncipe", "Sao Tome and Principe", "Senegal",
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

// ── Adapter ─────────────────────────────────────────────────────────────────

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
    const results: RawRow[] = [];

    for (const endpoint of AfDBEnergyAdapter.ENDPOINTS) {
      try {
        const { response, cached } = await this.httpFetch(endpoint, {
          headers: { Accept: "application/json, text/html" },
        });

        if (cached) return [];

        const contentType = response.headers.get("content-type") ?? "";

        if (contentType.includes("json")) {
          const data = await response.json() as any;
          const projects: AfDBProject[] = Array.isArray(data)
            ? data
            : Array.isArray(data?.data)
              ? data.data
              : Array.isArray(data?.projects)
                ? data.projects
                : Array.isArray(data?.results)
                  ? data.results
                  : [];

          for (const p of projects) {
            if (isEnergyProject(p)) {
              results.push(p as RawRow);
            }
          }

          if (results.length > 0) {
            console.log(`[${this.key}] Got ${results.length} energy projects from ${endpoint}`);
            return results;
          }
        } else {
          // HTML response — try to parse project table
          const html = await response.text();
          const rows = this.parseHTMLProjects(html);
          for (const row of rows) {
            if (isEnergyProject(row)) {
              results.push(row as RawRow);
            }
          }

          if (results.length > 0) {
            console.log(`[${this.key}] Parsed ${results.length} energy projects from HTML at ${endpoint}`);
            return results;
          }
        }
      } catch (err) {
        console.warn(`[${this.key}] Endpoint ${endpoint} failed: ${err instanceof Error ? err.message : err}`);
        continue;
      }
    }

    console.log(`[${this.key}] Fetched ${results.length} African energy projects from AfDB portals`);
    return results;
  }

  /**
   * Parse HTML project listings from AfDB portals.
   */
  private parseHTMLProjects(html: string): AfDBProject[] {
    const rows: AfDBProject[] = [];

    try {
      const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi);
      if (!tableMatch) return rows;

      for (const table of tableMatch) {
        const headerMatch = table.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i) ??
          table.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
        if (!headerMatch) continue;

        const headers: string[] = [];
        const thRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
        let hMatch;
        while ((hMatch = thRegex.exec(headerMatch[1])) !== null) {
          headers.push(hMatch[1].replace(/<[^>]+>/g, "").trim().toLowerCase());
        }

        if (headers.length < 2) continue;

        const colMap: Record<string, number> = {};
        headers.forEach((h, i) => {
          if (h.includes("project") || h.includes("title") || h.includes("name")) colMap.project_name = i;
          if (h.includes("country")) colMap.country = i;
          if (h.includes("sector")) colMap.sector = i;
          if (h.includes("amount") || h.includes("cost") || h.includes("value")) colMap.total_cost = i;
          if (h.includes("date") || h.includes("approval") || h.includes("year")) colMap.approval_date = i;
          if (h.includes("status")) colMap.status = i;
        });

        const bodyMatch = table.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
        const body = bodyMatch ? bodyMatch[1] : table;
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rMatch;
        let isFirst = true;

        while ((rMatch = rowRegex.exec(body)) !== null) {
          if (isFirst && !bodyMatch) { isFirst = false; continue; }
          isFirst = false;

          const cells: string[] = [];
          const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          let cMatch;
          while ((cMatch = cellRegex.exec(rMatch[1])) !== null) {
            cells.push(cMatch[1].replace(/<[^>]+>/g, "").trim());
          }

          if (cells.length < 2) continue;

          const row: AfDBProject = {};
          if (colMap.project_name !== undefined) row.project_name = cells[colMap.project_name];
          if (colMap.country !== undefined) row.country = cells[colMap.country];
          if (colMap.sector !== undefined) row.sector = cells[colMap.sector];
          if (colMap.total_cost !== undefined) {
            const amt = parseFloat(cells[colMap.total_cost].replace(/[,$]/g, ""));
            if (isFinite(amt)) row.total_cost = amt;
          }
          if (colMap.approval_date !== undefined) row.approval_date = cells[colMap.approval_date];
          if (colMap.status !== undefined) row.status = cells[colMap.status];

          // Extract project URL from any link in the row
          const linkMatch = rMatch[1].match(/href="([^"]*project[^"]*)"/i);
          if (linkMatch) row.project_url = linkMatch[1];

          if (row.project_name) rows.push(row);
        }
      }
    } catch (e) {
      console.warn(`[${this.key}] HTML parsing error: ${e instanceof Error ? e.message : e}`);
    }

    return rows;
  }

  normalize(row: RawRow): CandidateDraft | null {
    const p = row as AfDBProject;

    const name = String(p.project_name ?? p.title ?? p.name ?? "").trim();
    if (!name || name.length < 5) return null;

    const country = String(p.country ?? p.country_name ?? "").trim() || null;

    // Deal size — convert to USD millions
    const rawAmount = p.total_cost ?? p.amount ?? p.usd_amount ?? p.loan_amount ?? null;
    let dealSizeUsdMn: number | null = null;
    if (typeof rawAmount === "number" && rawAmount > 0) {
      dealSizeUsdMn = rawAmount > 100_000
        ? rawAmount / 1_000_000  // Raw USD → millions
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
