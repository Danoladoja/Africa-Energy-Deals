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

// ââ Types âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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

// African countries â names as they appear in DFC data
const AFRICAN_COUNTRIES = new Set([
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cameroon", "Central African Republic", "Chad", "Comoros",
  "Congo (Brazzaville)", "Congo (Kinshasa)", "Congo, Democratic Republic of the",
  "Congo, Republic of the", "Cote d'Ivoire", "CÃ´te d'Ivoire", "Djibouti",
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

// ââ Adapter âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export class DFCTransactionAdapter extends BaseSourceAdapter {
  readonly key = "api:dfc";
  readonly schedule = "0 5 1 * *"; // Monthly on the 1st at 5am
  readonly defaultConfidence = 1.0;
  readonly maxRps = 1;

  // DFC transaction data download page
  private static readonly DATA_URL = "https://www3.dfc.gov/OPICProjects";
  // Direct Excel download URL (may change â we try to find it from the page)
  private static readonly EXCEL_FALLBACK = "https://www3.dfc.gov/DFCProjects";

  async fetch(): Promise<RawRow[]> {
    try {
      // DFC embeds project data as inline JavaScript for Infragistics igGrid
      // at www3.dfc.gov/OPICProjects — it's NOT a JSON API
      const { response: dfcResp } = await this.httpFetch(DFCApiAdapter.DATA_URL, {
        headers: { "Accept": "text/html,application/xhtml+xml" },
      });
      const html = await dfcResp.text();

      // The page embeds data in a JavaScript variable for the igGrid widget
      // Look for patterns like: var datasource = [...] or .igGrid({ dataSource: [...]
      let records: any[] = [];

      // Try to find JSON array in script tags
      // Pattern 1: var ds = [{...}, {...}]
      const varMatch = html.match(/var\s+\w+\s*=\s*(\[\s*\{[\s\S]*?\}\s*\]);/);
      if (varMatch) {
        try {
          records = JSON.parse(varMatch[1]);
        } catch (e) {
          // Try eval-style parsing for non-strict JSON
          console.warn("[api:dfc] Could not parse as strict JSON, trying alternative extraction");
        }
      }

      // Pattern 2: dataSource: [{...}]
      if (!records.length) {
        const dsMatch = html.match(/dataSource\s*:\s*(\[\s*\{[\s\S]*?\}\s*\])\s*[,}]/);
        if (dsMatch) {
          try {
            records = JSON.parse(dsMatch[1]);
          } catch (e) {
            console.warn("[api:dfc] Could not parse dataSource JSON");
          }
        }
      }

      // Pattern 3: look for a large JSON array anywhere
      if (!records.length) {
        const bigArrayMatch = html.match(/(\[\s*\{"Year"[\s\S]*?\}\s*\])/);
        if (bigArrayMatch) {
          try {
            records = JSON.parse(bigArrayMatch[1]);
          } catch (e) {
            console.warn("[api:dfc] Could not parse Year-keyed JSON array");
          }
        }
      }

      if (!records.length) {
        console.error("[api:dfc] Could not extract project data from HTML page");
        (this as any)._lastFetchError = "Could not extract igGrid data from HTML";
        return [];
      }

      // Filter for African region projects
      const rows: RawRow[] = [];
      for (const r of records) {
        const region = r.Region || "";
        if (!region.toLowerCase().includes("africa")) continue;

        rows.push({
          year: r.Year || "",
          region: region,
          country: r.Country || "",
          project_type: r.ProjectType || "",
          project_name: r.Project_Name || r.ProjectName || "",
          description: r.Project_Description || r.ProjectDescription || "",
          commitment: r.OPICCommitment || r.Commitment || 0,
          project_url: r.Project_Profile_URL || "",
          is_framework: r.IsFramework || false,
        } as any);
      }

      console.log(`[api:dfc] Fetched ${rows.length} African projects from ${records.length} total DFC records`);
      return rows;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[api:dfc] Fetch failed: ${msg}`);
      (this as any)._lastFetchError = msg;
      return [];
    }
  }

  normalize(row: RawRow): CandidateDraft | null {
    const p = row as DFCRow;

    const name = String(p.project_name ?? "").trim();
    if (!name || name.length < 3) return null;

    const country = String(p.country ?? "").trim() || null;
    const sector = String(p.sector ?? "").trim();
    const subSector = String(p.sub_sector ?? "").trim();
    const technology = mapTechnology(sector, subSector);

    // Commitment amount â DFC reports in USD, convert to millions
    let dealSizeUsdMn: number | null = null;
    if (typeof p.commitment_amount === "number" && p.commitment_amount > 0) {
      // Amounts might already be in millions or in raw USD â detect by magnitude
      dealSizeUsdMn = p.commitment_amount > 100_000
        ? p.commitment_amount / 1_000_000  // Raw USD â millions
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
      description: [sector, subSector, p.product_type].filter(Boolean).join(" â ").slice(0, 500) || null,
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
