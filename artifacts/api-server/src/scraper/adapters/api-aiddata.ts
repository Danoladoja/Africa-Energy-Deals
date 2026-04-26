/**
 * AidData — Global Chinese Development Finance Dataset Adapter
 *
 * Imports the AidData GCDF dataset (Version 3.0) which covers 20,000+
 * Chinese-financed development projects across 165 countries (2000–2021),
 * 9,405 with geocoded locations. Filters for energy sector + Africa.
 *
 * Source: https://www.aiddata.org/data/aiddatas-geospatial-global-chinese-development-finance-dataset-version-3-0
 * GitHub: https://github.com/aiddata/gcdf-geospatial-data
 *
 * Bulk CSV dataset — imported periodically on new releases.
 * Confidence: 0.90 (academic dataset, well-sourced but historical)
 *
 * Key: api:aiddata | defaultConfidence: 0.90 | Schedule: quarterly
 */

import { BaseSourceAdapter, type RawRow, type CandidateDraft } from "../base.js";

// ── Types ───────────────────────────────────────────────────────────────────

interface AidDataProject {
  project_title?: string;
  title?: string;
  project_id?: string;
  aiddata_id?: string;
  recipient?: string;
  recipient_country?: string;
  country?: string;
  sector?: string;
  sector_name?: string;
  crs_sector_name?: string;
  flow_class?: string;
  flow_type?: string;
  amount_usd?: number;
  amount_constant_usd_2021?: number;
  commitment_amount_usd?: number;
  year?: number;
  commitment_year?: number;
  implementation_start_year?: number;
  completion_year?: number;
  status?: string;
  funding_agency?: string;
  implementing_agency?: string;
  lender?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  geoname?: string;
  source_url?: string;
  source?: string;
  [key: string]: unknown;
}

// African countries — names as used in AidData
const AFRICAN_COUNTRIES = new Set([
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cape Verde", "Cameroon", "Central African Republic", "Chad",
  "Comoros", "Congo", "Republic of the Congo", "Republic of Congo",
  "Côte d'Ivoire", "Cote d'Ivoire", "Ivory Coast",
  "Democratic Republic of the Congo", "DRC", "DR Congo", "Djibouti", "Egypt",
  "Equatorial Guinea", "Eritrea", "Eswatini", "Swaziland", "Ethiopia", "Gabon",
  "Gambia", "The Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Kenya",
  "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi", "Mali", "Mauritania",
  "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria",
  "Rwanda", "São Tomé and Príncipe", "Sao Tome and Principe", "Senegal",
  "Seychelles", "Sierra Leone", "Somalia", "South Africa", "South Sudan",
  "Sudan", "Tanzania", "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe",
]);

function isAfricanCountry(country: string): boolean {
  if (AFRICAN_COUNTRIES.has(country)) return true;
  const lower = country.toLowerCase();
  return lower.includes("africa") || AFRICAN_COUNTRIES.has(country.trim());
}

function isEnergyProject(p: AidDataProject): boolean {
  const text = [
    p.sector,
    p.sector_name,
    p.crs_sector_name,
    p.project_title ?? p.title,
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
    text.includes("generation") ||
    text.includes("geotherm") ||
    text.includes("biomass") ||
    text.includes("gas") ||
    text.includes("nuclear") ||
    text.includes("coal") ||
    text.includes("dam") ||
    text.includes("turbine") ||
    text.includes("substation")
  );
}

function mapTechnology(p: AidDataProject): string | null {
  const text = [
    p.sector,
    p.sector_name,
    p.project_title ?? p.title,
    p.description,
  ].filter(Boolean).join(" ").toLowerCase();

  if (text.includes("solar") || text.includes("photovoltaic")) return "Solar";
  if (text.includes("wind")) return "Wind";
  if (text.includes("hydro") || text.includes("dam")) return "Hydro";
  if (text.includes("geotherm")) return "Geothermal";
  if (text.includes("biomass") || text.includes("bioenergy")) return "Biomass";
  if (text.includes("battery") || text.includes("storage")) return "Battery Storage";
  if (text.includes("hydrogen")) return "Green Hydrogen";
  if (text.includes("nuclear")) return "Nuclear";
  if (text.includes("coal")) return "Coal";
  if (text.includes("gas") || text.includes("lng") || text.includes("oil") || text.includes("petroleum")) return "Oil & Gas";
  if (text.includes("grid") || text.includes("transmission") || text.includes("substation") || text.includes("distribution")) return "Transmission & Distribution";
  return null;
}

function mapStatus(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("complet") || s.includes("operational")) return "Operational";
  if (s.includes("implementation") || s.includes("construction") || s.includes("active")) return "Under Construction";
  if (s.includes("pipeline") || s.includes("pledged") || s.includes("commitment")) return "Announced";
  if (s.includes("cancel") || s.includes("suspend")) return "Cancelled";
  return "Under Construction"; // Most AidData projects are historical commitments
}

// ── CSV Parser ──────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    if (values.length < 2) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (j < values.length) row[h] = values[j];
    });
    rows.push(row);
  }

  return rows;
}

// ── Adapter ─────────────────────────────────────────────────────────────────

export class AidDataAdapter extends BaseSourceAdapter {
  readonly key = "api:aiddata";
  readonly schedule = "0 6 1 1,4,7,10 *"; // Quarterly on the 1st
  readonly defaultConfidence = 0.90;
  readonly maxRps = 1;

  // AidData dataset download URLs
  private static readonly DATA_URLS = [
    // GitHub raw CSV (GCDF 3.0)
    "https://raw.githubusercontent.com/aiddata/gcdf-geospatial-data/main/data/gcdf_3.0.csv",
    // Alternative GitHub location
    "https://raw.githubusercontent.com/aiddata/gcdf-geospatial-data/master/data/gcdf_3.0.csv",
    // AidData direct download
    "https://www.aiddata.org/datasets/gcdf-3-0/download",
  ];

  async fetch(): Promise<RawRow[]> {
    const results: RawRow[] = [];

    for (const url of AidDataAdapter.DATA_URLS) {
      try {
        const { response, cached } = await this.httpFetch(url, {
          headers: { Accept: "text/csv, application/octet-stream, */*" },
        });

        if (cached) return [];

        const text = await response.text();
        if (!text || text.length < 200) continue;

        const rows = parseCSV(text);

        for (const row of rows) {
          const country = row.recipient ?? row.recipient_country ?? row.country ?? "";
          if (!isAfricanCountry(country)) continue;

          const project: AidDataProject = {
            project_title: row.project_title ?? row.title,
            project_id: row.project_id ?? row.aiddata_id ?? row.id,
            recipient: country,
            sector: row.sector ?? row.sector_name,
            crs_sector_name: row.crs_sector_name,
            flow_class: row.flow_class,
            flow_type: row.flow_type,
            amount_usd: parseFloat(row.amount_usd ?? row.amount_constant_usd_2021 ?? row.commitment_amount_usd ?? "0") || undefined,
            year: parseInt(row.year ?? row.commitment_year ?? "", 10) || undefined,
            status: row.status,
            funding_agency: row.funding_agency ?? row.lender,
            implementing_agency: row.implementing_agency,
            description: row.description,
            latitude: parseFloat(row.latitude ?? "") || undefined,
            longitude: parseFloat(row.longitude ?? "") || undefined,
            source_url: row.source_url ?? row.source,
          };

          if (isEnergyProject(project)) {
            results.push(project as RawRow);
          }
        }

        if (results.length > 0) {
          console.log(`[${this.key}] Parsed ${results.length} African energy projects from AidData`);
          return results;
        }
      } catch (err) {
        console.warn(`[${this.key}] Download failed for ${url}: ${err instanceof Error ? err.message : err}`);
        continue;
      }
    }

    console.log(`[${this.key}] Fetched ${results.length} African energy projects from AidData`);
    return results;
  }

  normalize(row: RawRow): CandidateDraft | null {
    const p = row as AidDataProject;

    const name = String(p.project_title ?? p.title ?? "").trim();
    if (!name || name.length < 5) return null;

    const country = String(p.recipient ?? p.recipient_country ?? p.country ?? "").trim() || null;
    const technology = mapTechnology(p);

    // Deal size — AidData reports in raw USD
    let dealSizeUsdMn: number | null = null;
    const rawAmount = p.amount_usd ?? p.amount_constant_usd_2021 ?? p.commitment_amount_usd ?? null;
    if (typeof rawAmount === "number" && rawAmount > 0) {
      dealSizeUsdMn = rawAmount > 100_000
        ? rawAmount / 1_000_000
        : rawAmount;
    }

    const announcedYear = typeof p.year === "number" && p.year > 1990 && p.year < 2100
      ? p.year
      : typeof p.commitment_year === "number" && p.commitment_year > 1990
        ? p.commitment_year
        : null;

    const status = p.status ? mapStatus(p.status) : "Under Construction";
    const description = p.description ? String(p.description).slice(0, 500) : null;

    // Financier info
    const funder = p.funding_agency ?? p.lender ?? null;
    const financiers = funder
      ? `${funder} (Chinese Development Finance)`
      : "Chinese Development Finance";

    // Normalize country
    let normalizedCountry = country;
    if (normalizedCountry === "Democratic Republic of the Congo" || normalizedCountry === "DR Congo") {
      normalizedCountry = "DRC";
    } else if (normalizedCountry === "Republic of the Congo" || normalizedCountry === "Republic of Congo") {
      normalizedCountry = "Congo";
    } else if (normalizedCountry === "The Gambia") {
      normalizedCountry = "Gambia";
    } else if (normalizedCountry === "Swaziland") {
      normalizedCountry = "Eswatini";
    }

    return {
      projectName: name.slice(0, 300),
      country: normalizedCountry,
      technology,
      dealSizeUsdMn: dealSizeUsdMn !== null && dealSizeUsdMn > 0 && dealSizeUsdMn < 50_000 ? dealSizeUsdMn : null,
      developer: p.implementing_agency ? String(p.implementing_agency).slice(0, 200) : null,
      financiers,
      dfiInvolvement: "Chinese Development Finance",
      offtaker: null,
      dealStage: status,
      status,
      description,
      capacityMw: null,
      announcedYear,
      financialCloseDate: null,
      sourceUrl: p.source_url ?? "https://www.aiddata.org/data/aiddatas-geospatial-global-chinese-development-finance-dataset-version-3-0",
      newsUrl: null,
      source: this.key,
      confidence: this.defaultConfidence,
      rawJson: { ...(p as Record<string, unknown>) },
    };
  }
}

export const aidDataAdapter = new AidDataAdapter();
