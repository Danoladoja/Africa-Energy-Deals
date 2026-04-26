/**
 * Global Energy Monitor (GEM) — Africa Energy Tracker Adapter
 *
 * Downloads CSV/Excel datasets from GEM's open trackers:
 * - Global Solar Power Tracker
 * - Global Wind Power Tracker
 * - Global Coal Plant Tracker (Africa subset)
 * - Africa Gas Tracker
 *
 * GEM tracks individual power plants with name, capacity, status, country,
 * coordinates, ownership, fuel type, and commissioning year.
 *
 * Source: https://globalenergymonitor.org/projects/africa-energy-tracker/
 * Download: CSV files from individual global trackers
 *
 * Confidence: 0.95 (highly curated open data, may need name-matching)
 * Key: api:gem | Schedule: monthly
 */

import { BaseSourceAdapter, type RawRow, type CandidateDraft } from "../base.js";

// ── Types ───────────────────────────────────────────────────────────────────

interface GEMPlant {
  project_name?: string;
  plant_name?: string;
  name?: string;
  unit_name?: string;
  country?: string;
  subnational?: string;
  capacity_mw?: number;
  capacity?: number;
  "capacity (mw)"?: number;
  status?: string;
  technology?: string;
  fuel?: string;
  type?: string;
  owner?: string;
  developer?: string;
  parent?: string;
  operator?: string;
  year?: number;
  start_year?: number;
  commissioning_year?: number;
  retired_year?: number;
  latitude?: number;
  longitude?: number;
  wiki_url?: string;
  url?: string;
  source?: string;
  [key: string]: unknown;
}

// African countries — ISO names as used by GEM
const AFRICAN_COUNTRIES = new Set([
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cape Verde", "Cameroon", "Central African Republic", "Chad",
  "Comoros", "Congo", "Republic of the Congo", "Côte d'Ivoire", "Cote d'Ivoire",
  "Democratic Republic of the Congo", "Djibouti", "Egypt",
  "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon",
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

function mapTechnology(plant: GEMPlant): string | null {
  const text = [
    plant.technology,
    plant.fuel,
    plant.type,
    plant.project_name ?? plant.plant_name ?? plant.name,
  ].filter(Boolean).join(" ").toLowerCase();

  if (text.includes("solar") || text.includes("photovoltaic") || text.includes("pv")) return "Solar";
  if (text.includes("wind")) return "Wind";
  if (text.includes("hydro")) return "Hydro";
  if (text.includes("geotherm")) return "Geothermal";
  if (text.includes("biomass") || text.includes("bioenergy") || text.includes("biogas")) return "Biomass";
  if (text.includes("battery") || text.includes("storage")) return "Battery Storage";
  if (text.includes("hydrogen")) return "Green Hydrogen";
  if (text.includes("nuclear")) return "Nuclear";
  if (text.includes("coal")) return "Coal";
  if (text.includes("gas") || text.includes("lng") || text.includes("oil") || text.includes("diesel") || text.includes("petroleum")) return "Oil & Gas";
  return null;
}

function mapStatus(gemStatus: string): string {
  const s = gemStatus.toLowerCase();
  if (s.includes("operating") || s.includes("operational") || s.includes("commissioned")) return "Operational";
  if (s.includes("construction")) return "Under Construction";
  if (s.includes("permitted") || s.includes("approved")) return "Permitted";
  if (s.includes("announced") || s.includes("proposed") || s.includes("pre-permit") || s.includes("discovery")) return "Announced";
  if (s.includes("shelved") || s.includes("mothballed") || s.includes("cancelled") || s.includes("retired")) return "Cancelled";
  return "Announced";
}

// ── CSV Parser (lightweight, no external dependency) ────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header row (handle quoted fields)
  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
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

export class GEMAdapter extends BaseSourceAdapter {
  readonly key = "api:gem";
  readonly schedule = "0 2 1 * *"; // Monthly on the 1st at 2am
  readonly defaultConfidence = 0.95;
  readonly maxRps = 1;

  // GEM tracker download URLs (CSV)
  private static readonly TRACKER_URLS = [
    "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Solar-Power-Tracker.csv",
    "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Wind-Power-Tracker.csv",
    "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Coal-Plant-Tracker.csv",
    "https://globalenergymonitor.org/wp-content/uploads/2024/Africa-Gas-Tracker.csv",
  ];

  // Fallback: main tracker page with download links
  private static readonly TRACKER_PAGE = "https://globalenergymonitor.org/projects/africa-energy-tracker/";

  async fetch(): Promise<RawRow[]> {
    const results: RawRow[] = [];

    // Try direct CSV downloads
    for (const url of GEMAdapter.TRACKER_URLS) {
      try {
        const { response, cached } = await this.httpFetch(url, {
          headers: { Accept: "text/csv, application/octet-stream" },
        });

        if (cached) continue;

        const text = await response.text();
        if (!text || text.length < 100) continue;

        const rows = parseCSV(text);
        for (const row of rows) {
          const country = row.country ?? row.country_name ?? "";
          if (isAfricanCountry(country)) {
            // Normalize CSV columns to GEMPlant shape
            const plant: GEMPlant = {
              project_name: row.project_name ?? row.plant_name ?? row.name ?? row.unit_name,
              country: country,
              subnational: row.subnational ?? row.state ?? row.region,
              capacity_mw: parseFloat(row.capacity_mw ?? row.capacity ?? row["capacity__mw_"] ?? "0") || undefined,
              status: row.status,
              technology: row.technology ?? row.fuel ?? row.type,
              owner: row.owner ?? row.parent ?? row.operator,
              developer: row.developer,
              year: parseInt(row.year ?? row.start_year ?? row.commissioning_year ?? "", 10) || undefined,
              latitude: parseFloat(row.latitude ?? row.lat ?? "") || undefined,
              longitude: parseFloat(row.longitude ?? row.lon ?? row.lng ?? "") || undefined,
              wiki_url: row.wiki_url ?? row.url ?? row.wiki,
            };
            results.push(plant as RawRow);
          }
        }
      } catch (err) {
        console.warn(`[${this.key}] CSV download failed for ${url}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // If no CSV downloads worked, try the tracker page for links
    if (results.length === 0) {
      try {
        const { response } = await this.httpFetch(GEMAdapter.TRACKER_PAGE, {
          headers: { Accept: "text/html" },
        });

        const html = await response.text();
        // Extract CSV/XLSX download links
        const linkRegex = /href="([^"]*(?:\.csv|\.xlsx?|download)[^"]*)"/gi;
        let linkMatch;
        const downloadLinks: string[] = [];

        while ((linkMatch = linkRegex.exec(html)) !== null) {
          const href = linkMatch[1];
          if (href.includes("tracker") || href.includes("energy") || href.includes("power")) {
            downloadLinks.push(href.startsWith("http") ? href : `https://globalenergymonitor.org${href}`);
          }
        }

        for (const link of downloadLinks.slice(0, 5)) {
          try {
            const { response: dlResponse } = await this.httpFetch(link, {});
            const text = await dlResponse.text();
            if (text.length > 100) {
              const rows = parseCSV(text);
              for (const row of rows) {
                const country = row.country ?? "";
                if (isAfricanCountry(country)) {
                  results.push(row as RawRow);
                }
              }
            }
          } catch {
            continue;
          }
        }
      } catch (err) {
        console.error(`[${this.key}] Tracker page fetch failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    console.log(`[${this.key}] Fetched ${results.length} African power plants from GEM`);
    return results;
  }

  normalize(row: RawRow): CandidateDraft | null {
    const p = row as GEMPlant;

    const name = String(p.project_name ?? p.plant_name ?? p.name ?? p.unit_name ?? "").trim();
    if (!name || name.length < 3) return null;

    const country = String(p.country ?? "").trim() || null;
    const technology = mapTechnology(p);

    // Capacity in MW
    const capacityMw = p.capacity_mw ?? p.capacity ?? p["capacity (mw)"] ?? null;
    const validCapacity = typeof capacityMw === "number" && capacityMw > 0 && capacityMw < 100_000 ? capacityMw : null;

    // Status
    const status = p.status ? mapStatus(p.status) : "Announced";

    // Year
    const year = p.year ?? p.start_year ?? p.commissioning_year ?? null;
    const announcedYear = typeof year === "number" && year > 1990 && year < 2100 ? year : null;

    // Owner/developer
    const owner = p.owner ?? p.developer ?? p.parent ?? p.operator ?? null;

    return {
      projectName: name.slice(0, 300),
      country,
      technology,
      dealSizeUsdMn: null, // GEM doesn't track deal sizes
      developer: owner ? String(owner).slice(0, 200) : null,
      financiers: null,
      dfiInvolvement: null,
      offtaker: null,
      dealStage: status,
      status,
      description: technology ? `${technology} power plant` : null,
      capacityMw: validCapacity,
      announcedYear,
      financialCloseDate: null,
      sourceUrl: p.wiki_url ?? p.url ?? "https://globalenergymonitor.org/projects/africa-energy-tracker/",
      newsUrl: null,
      source: this.key,
      confidence: this.defaultConfidence,
      rawJson: { ...(p as Record<string, unknown>) },
    };
  }
}

export const gemAdapter = new GEMAdapter();
