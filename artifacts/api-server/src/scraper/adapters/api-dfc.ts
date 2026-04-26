/**
 * US Development Finance Corporation (DFC) Transaction Data Adapter
 *
 * Downloads the publicly available DFC active transactions Excel file
 * and extracts energy-sector projects in African countries.
 *
 * Source: https://www.dfc.gov/our-impact/transaction-data
 * The file is updated quarterly (~45 days after quarter end).
 *
 * This adapter fetches the Excel file, parses it, filters for energy + Africa,
 * and maps to CandidateDraft. No LLM needed. Confidence 1.0.
 *
 * Key: api:dfc | defaultConfidence: 1.0 | Schedule: monthly (quarterly data)
 */

import { BaseSourceAdapter, type RawRow, type CandidateDraft } from "../base.js";

// ── Types ───────────────────────────────────────────────────────────────────

interface DFCRow {
  project_name?: string;
  country?: string;
  sector?: string;
  sub_sector?: string;
  commitment_amount?: number;
  fiscal_year?: number;
  product_type?: string;
  obligating_year?: string;
  status?: string;
  [key: string]: unknown;
}

// African countries — names as they appear in DFC data
const AFRICAN_COUNTRIES = new Set([
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cameroon", "Central African Republic", "Chad", "Comoros",
  "Congo (Brazzaville)", "Congo (Kinshasa)", "Congo, Democratic Republic of the",
  "Congo, Republic of the", "Cote d'Ivoire", "Côte d'Ivoire", "Djibouti",
  "Egypt", "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon",
  "Gambia", "Gambia, The", "Ghana", "Guinea", "Guinea-Bissau", "Kenya",
  "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi", "Mali", "Mauritania",
  "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria",
  "Rwanda", "Sao Tome and Principe", "Senegal", "Seychelles", "Sierra Leone",
  "Somalia", "South Africa", "South Sudan", "Sudan", "Tanzania", "Togo",
  "Tunisia", "Uganda", "Zambia", "Zimbabwe",
  // Multi-country / regional
  "Africa", "Sub-Saharan Africa", "Regional - Africa",
]);

function isAfricanCountry(country: string): boolean {
  if (AFRICAN_COUNTRIES.has(country)) return true;
  const lower = country.toLowerCase();
  return lower.includes("africa") || AFRICAN_COUNTRIES.has(country.trim());
}

function isEnergySector(sector: string, subSector?: string): boolean {
  const combined = `${sector} ${subSector ?? ""}`.toLowerCase();
  return (
    combined.includes("energy") ||
    combined.includes("power") ||
    combined.includes("electric") ||
    combined.includes("solar") ||
    combined.includes("wind") ||
    combined.includes("renewable") ||
    combined.includes("gas") ||
    combined.includes("hydro") ||
    combined.includes("generation") ||
    combined.includes("grid") ||
    combined.includes("transmission") ||
    combined.includes("fuel") ||
    combined.includes("petroleum")
  );
}

function mapTechnology(sector: string, subSector?: string): string | null {
  const text = `${sector} ${subSector ?? ""}`.toLowerCase();
  if (text.includes("solar")) return "Solar";
  if (text.includes("wind")) return "Wind";
  if (text.includes("hydro")) return "Hydro";
  if (text.includes("geotherm")) return "Geothermal";
  if (text.includes("biomass") || text.includes("bioenergy")) return "Biomass";
  if (text.includes("battery") || text.includes("storage")) return "Battery Storage";
  if (text.includes("hydrogen")) return "Green Hydrogen";
  if (text.includes("gas") || text.includes("lng") || text.includes("oil") || text.includes("petroleum")) return "Oil & Gas";
  if (text.includes("grid") || text.includes("transmission") || text.includes("distribution")) return "Transmission & Distribution";
  return null;
}

// ── Adapter ─────────────────────────────────────────────────────────────────

export class DFCTransactionAdapter extends BaseSourceAdapter {
  readonly key = "api:dfc";
  readonly schedule = "0 5 1 * *"; // Monthly on the 1st at 5am
  readonly defaultConfidence = 1.0;
  readonly maxRps = 1;

  // DFC transaction data download page
  private static readonly DATA_URL = "https://www.dfc.gov/our-impact/transaction-data";
  // Direct Excel download URL (may change — we try to find it from the page)
  private static readonly EXCEL_FALLBACK = "https://www3.dfc.gov/DFCProjects";

  async fetch(): Promise<RawRow[]> {
    const results: RawRow[] = [];

    try {
      // DFC exposes an active projects portal with JSON capabilities
      const apiUrl = "https://www3.dfc.gov/DFCProjects";
      const { response, cached } = await this.httpFetch(apiUrl, {
        headers: { Accept: "text/html, application/json" },
      });

      if (cached) return [];

      // Try to get JSON from the projects portal
      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("json")) {
        const data = await response.json() as any;
        const projects: DFCRow[] = Array.isArray(data) ? data : (data?.projects ?? data?.data ?? []);

        for (const p of projects) {
          const country = String(p.country ?? "").trim();
          const sector = String(p.sector ?? "").trim();
          const subSector = String(p.sub_sector ?? "").trim();

          if (isAfricanCountry(country) && isEnergySector(sector, subSector)) {
            results.push(p as RawRow);
          }
        }
      } else {
        // HTML response — parse the page for data or download link
        const html = await response.text();

        // Try to extract tabular data from the HTML
        // DFC's projects page often has inline data or a data table
        const rows = this.parseHTMLTable(html);
        for (const row of rows) {
          const country = String(row.country ?? "").trim();
          const sector = String(row.sector ?? "").trim();
          const subSector = String(row.sub_sector ?? "").trim();

          if (isAfricanCountry(country) && isEnergySector(sector, subSector)) {
            results.push(row as RawRow);
          }
        }
      }
    } catch (err) {
      console.error(`[${this.key}] Fetch failed: ${err instanceof Error ? err.message : err}`);
    }

    console.log(`[${this.key}] Fetched ${results.length} African energy transactions from DFC`);
    return results;
  }

  /**
   * Basic HTML table parser for DFC projects page.
   * Extracts rows from <table> elements with column headers.
   */
  private parseHTMLTable(html: string): DFCRow[] {
    const rows: DFCRow[] = [];

    try {
      // Find table headers to determine column mapping
      const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi);
      if (!tableMatch) return rows;

      for (const table of tableMatch) {
        // Extract header row
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

        // Map column indices
        const colMap: Record<string, number> = {};
        headers.forEach((h, i) => {
          if (h.includes("project") || h.includes("name")) colMap.project_name = i;
          if (h.includes("country")) colMap.country = i;
          if (h.includes("sector")) colMap.sector = i;
          if (h.includes("sub") && h.includes("sector")) colMap.sub_sector = i;
          if (h.includes("amount") || h.includes("commitment") || h.includes("value")) colMap.commitment_amount = i;
          if (h.includes("year") || h.includes("fiscal")) colMap.fiscal_year = i;
          if (h.includes("product") || h.includes("type")) colMap.product_type = i;
          if (h.includes("status")) colMap.status = i;
        });

        // Extract body rows
        const bodyMatch = table.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
        const body = bodyMatch ? bodyMatch[1] : table;
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rMatch;
        let isFirst = true;

        while ((rMatch = rowRegex.exec(body)) !== null) {
          if (isFirst && !bodyMatch) { isFirst = false; continue; } // Skip header row if no tbody
          isFirst = false;

          const cells: string[] = [];
          const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          let cMatch;
          while ((cMatch = cellRegex.exec(rMatch[1])) !== null) {
            cells.push(cMatch[1].replace(/<[^>]+>/g, "").trim());
          }

          if (cells.length < 2) continue;

          const row: DFCRow = {};
          if (colMap.project_name !== undefined) row.project_name = cells[colMap.project_name];
          if (colMap.country !== undefined) row.country = cells[colMap.country];
          if (colMap.sector !== undefined) row.sector = cells[colMap.sector];
          if (colMap.sub_sector !== undefined) row.sub_sector = cells[colMap.sub_sector];
          if (colMap.commitment_amount !== undefined) {
            const amt = parseFloat(cells[colMap.commitment_amount].replace(/[,$]/g, ""));
            if (isFinite(amt)) row.commitment_amount = amt;
          }
          if (colMap.fiscal_year !== undefined) {
            const fy = parseInt(cells[colMap.fiscal_year], 10);
            if (isFinite(fy)) row.fiscal_year = fy;
          }
          if (colMap.product_type !== undefined) row.product_type = cells[colMap.product_type];
          if (colMap.status !== undefined) row.status = cells[colMap.status];

          if (row.project_name) rows.push(row);
        }
      }
    } catch (e) {
      console.warn(`[${this.key}] HTML parsing error: ${e instanceof Error ? e.message : e}`);
    }

    return rows;
  }

  normalize(row: RawRow): CandidateDraft | null {
    const p = row as DFCRow;

    const name = String(p.project_name ?? "").trim();
    if (!name || name.length < 3) return null;

    const country = String(p.country ?? "").trim() || null;
    const sector = String(p.sector ?? "").trim();
    const subSector = String(p.sub_sector ?? "").trim();
    const technology = mapTechnology(sector, subSector);

    // Commitment amount — DFC reports in USD, convert to millions
    let dealSizeUsdMn: number | null = null;
    if (typeof p.commitment_amount === "number" && p.commitment_amount > 0) {
      // Amounts might already be in millions or in raw USD — detect by magnitude
      dealSizeUsdMn = p.commitment_amount > 100_000
        ? p.commitment_amount / 1_000_000  // Raw USD → millions
        : p.commitment_amount;              // Already in millions
    }

    const announcedYear = typeof p.fiscal_year === "number" && p.fiscal_year > 1990 ? p.fiscal_year : null;

    // Normalize country names
    let normalizedCountry = country;
    if (normalizedCountry === "Congo (Kinshasa)" || normalizedCountry === "Congo, Democratic Republic of the") {
      normalizedCountry = "DRC";
    } else if (normalizedCountry === "Congo (Brazzaville)" || normalizedCountry === "Congo, Republic of the") {
      normalizedCountry = "Congo";
    } else if (normalizedCountry === "Gambia, The") {
      normalizedCountry = "Gambia";
    }

    return {
      projectName: name.slice(0, 300),
      country: normalizedCountry,
      technology,
      dealSizeUsdMn: dealSizeUsdMn !== null && dealSizeUsdMn > 0 && dealSizeUsdMn < 50_000 ? dealSizeUsdMn : null,
      developer: null,
      financiers: "US International Development Finance Corporation (DFC)",
      dfiInvolvement: "DFC",
      offtaker: null,
      dealStage: "Financial Close",
      status: "Under Construction",
      description: [sector, subSector, p.product_type].filter(Boolean).join(" — ").slice(0, 500) || null,
      capacityMw: null,
      announcedYear,
      financialCloseDate: null,
      sourceUrl: "https://www.dfc.gov/our-impact/transaction-data",
      newsUrl: null,
      source: this.key,
      confidence: this.defaultConfidence,
      rawJson: { ...(p as Record<string, unknown>) },
    };
  }
}

export const dfcTransactionAdapter = new DFCTransactionAdapter();
