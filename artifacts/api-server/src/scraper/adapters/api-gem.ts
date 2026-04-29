/**
 * Global Energy Monitor (GEM) â Africa Energy Tracker Adapter
 *
 * Downloads CSV/Excel datasets from GEM's open trackers:
 * - Global Solar Power Tracker
 * - Global Wind Power Tracker
 * - Global Coal Plant Tracker (Africa subset)
 * - Africa Gas Tracker
 * - Global Hydropower Tracker
 * - Global Bioenergy Power Tracker
 * - Global Nuclear Power Tracker
 * - Global Geothermal Power Tracker
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

// ââ Types âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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
  _trackerTechnology?: string; // Injected by fetch() based on tracker URL
  [key: string]: unknown;
}

// African countries â ISO names as used by GEM
const AFRICAN_COUNTRIES = new Set([
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cape Verde", "Cameroon", "Central African Republic", "Chad",
  "Comoros", "Congo", "Republic of the Congo", "CÃ´te d'Ivoire", "Cote d'Ivoire",
  "Democratic Republic of the Congo", "Djibouti", "Egypt",
  "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon",
  "Gambia", "The Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Kenya",
  "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi", "Mali", "Mauritania",
  "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria",
  "Rwanda", "SÃ£o TomÃ© and PrÃ­ncipe", "Sao Tome and Principe", "Senegal",
  "Seychelles", "Sierra Leone", "Somalia", "South Africa", "South Sudan",
  "Sudan", "Tanzania", "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe",
]);

function isAfricanCountry(country: string): boolean {
  if (!country) return false;
  if (AFRICAN_COUNTRIES.has(country)) return true;
  const trimmed = country.trim();
  if (AFRICAN_COUNTRIES.has(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  if (lower.includes("africa")) return true;
  // Fuzzy: check if any African country name is contained in the string
  for (const c of AFRICAN_COUNTRIES) {
    if (lower === c.toLowerCase()) return true;
  }
  return false;
}

function mapTechnology(plant: GEMPlant): string | null {
  const text = [
    plant.technology,
    plant.fuel,
    plant.type,
    plant.project_name ?? plant.plant_name ?? plant.name,
  ].filter(Boolean).join(" ").toLowerCase();

  // Solar
  if (text.includes("solar") || text.includes("photovoltaic") || text.includes("pv") || text.includes("csp") || text.includes("concentrated solar")) return "Solar";
  // Wind
  if (text.includes("wind") || text.includes("onshore") || text.includes("offshore")) return "Wind";
  // Hydro
  if (text.includes("hydro") || text.includes("dam") || text.includes("run-of-river") || text.includes("pumped storage")) return "Hydro";
  // Geothermal
  if (text.includes("geotherm")) return "Geothermal";
  // Biomass
  if (text.includes("biomass") || text.includes("bioenergy") || text.includes("biogas") || text.includes("waste-to-energy") || text.includes("bagasse") || text.includes("wood")) return "Biomass";
  // Battery Storage
  if (text.includes("battery") || text.includes("storage") || text.includes("bess")) return "Battery Storage";
  // Green Hydrogen
  if (text.includes("hydrogen") || text.includes("electroly")) return "Green Hydrogen";
  // Nuclear
  if (text.includes("nuclear") || text.includes("atomic") || text.includes("smr")) return "Nuclear";
  // Coal â check before gas since some plants mention both
  if (text.includes("coal") || text.includes("subcritical") || text.includes("supercritical") || text.includes("ultra-supercritical") || text.includes("lignite")) return "Coal";
  // Oil & Gas â expanded with common GEM terms
  if (text.includes("gas") || text.includes("lng") || text.includes("oil") || text.includes("diesel") ||
      text.includes("petroleum") || text.includes("ccgt") || text.includes("ocgt") ||
      text.includes("combined cycle") || text.includes("open cycle") || text.includes("turbine") ||
      text.includes("heavy fuel") || text.includes("hfo") || text.includes("naphtha") ||
      text.includes("kerosene") || text.includes("natural gas") || text.includes("lpg") ||
      text.includes("thermal") || text.includes("fired") || text.includes("cogeneration") ||
      text.includes("reciprocating")) return "Oil & Gas";
  // Transmission
  if (text.includes("transmission") || text.includes("grid") || text.includes("substation") || text.includes("interconnect")) return "Transmission & Distribution";

  // ââ Fallback: use tracker-injected technology ââââââââââââââââââââââââââ
  if (plant._trackerTechnology) return plant._trackerTechnology;

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

// ââ Cost estimation from capacity (USD millions per MW benchmarks) âââââââââ

const COST_PER_MW: Record<string, number> = {
  "Solar": 0.9,               // ~$900k/MW utility-scale solar in Africa
  "Wind": 1.4,                // ~$1.4M/MW onshore wind
  "Hydro": 2.0,               // ~$2M/MW (varies widely)
  "Geothermal": 3.5,          // ~$3.5M/MW geothermal
  "Biomass": 2.5,             // ~$2.5M/MW biomass
  "Battery Storage": 1.2,     // ~$1.2M/MW battery
  "Green Hydrogen": 3.0,      // ~$3M/MW electrolyzer
  "Nuclear": 6.0,             // ~$6M/MW nuclear
  "Coal": 1.5,                // ~$1.5M/MW coal
  "Oil & Gas": 0.8,           // ~$800k/MW gas turbine
  "Transmission & Distribution": 0.5,
};

function estimateDealSizeMn(technology: string | null, capacityMw: number | null): number | null {
  if (!technology || !capacityMw || capacityMw <= 0) return null;
  const perMw = COST_PER_MW[technology];
  if (!perMw) return null;
  const estimate = Math.round(capacityMw * perMw * 10) / 10; // round to 1 decimal
  return estimate > 0.1 ? estimate : null;
}

// ââ CSV Parser (lightweight, no external dependency) ââââââââââââââââââââââââ

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

// ââ Adapter âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export class GEMAdapter extends BaseSourceAdapter {
  readonly key = "api:gem";
  readonly schedule = "0 2 1 * *"; // Monthly on the 1st at 2am
  readonly defaultConfidence = 0.95;
  readonly maxRps = 1;

  // GEM tracker download URLs (CSV) with their known technology fallback
  private static readonly TRACKER_URLS: { url: string; technology: string }[] = [
    { url: "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Solar-Power-Tracker.csv", technology: "Solar" },
    { url: "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Wind-Power-Tracker.csv", technology: "Wind" },
    { url: "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Coal-Plant-Tracker.csv", technology: "Coal" },
    { url: "https://globalenergymonitor.org/wp-content/uploads/2024/Africa-Gas-Tracker.csv", technology: "Oil & Gas" },
    { url: "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Hydropower-Tracker.csv", technology: "Hydro" },
    { url: "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Bioenergy-Power-Tracker.csv", technology: "Biomass" },
    { url: "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Nuclear-Power-Tracker.csv", technology: "Nuclear" },
    { url: "https://globalenergymonitor.org/wp-content/uploads/2024/Global-Geothermal-Power-Tracker.csv", technology: "Geothermal" },
  ];

  // Fallback: main tracker page with download links
  private static readonly TRACKER_PAGE = "https://globalenergymonitor.org/projects/africa-energy-tracker/";

  async fetch(): Promise<RawRow[]> {
    const results: RawRow[] = [];

    // Try direct CSV downloads â each tracker URL carries its technology type
    for (const tracker of GEMAdapter.TRACKER_URLS) {
      try {
        const { response, cached } = await this.httpFetch(tracker.url, {
          headers: { Accept: "text/csv, application/octet-stream" },
        });

        if (cached) continue;

        const text = await response.text();
        if (!text || text.length < 100) continue;

        const rows = parseCSV(text);
        let trackerCount = 0;
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
              _trackerTechnology: tracker.technology, // Fallback technology from tracker source
            };
            results.push(plant as RawRow);
            trackerCount++;
          }
        }
        console.log(`[${this.key}] ${tracker.technology} tracker: ${trackerCount} African plants from ${rows.length} total`);
      } catch (err) {
        console.warn(`[${this.key}] CSV download failed for ${tracker.url}: ${err instanceof Error ? err.message : err}`);
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

        // Infer technology from URL for fallback pages too
        const inferTechFromUrl = (u: string): string => {
          const lower = u.toLowerCase();
          if (lower.includes("solar")) return "Solar";
          if (lower.includes("wind")) return "Wind";
          if (lower.includes("coal")) return "Coal";
          if (lower.includes("gas")) return "Oil & Gas";
          if (lower.includes("hydro")) return "Hydro";
          if (lower.includes("bio")) return "Biomass";
          if (lower.includes("nuclear")) return "Nuclear";
          if (lower.includes("geotherm")) return "Geothermal";
          return "Oil & Gas"; // default for unidentified
        };

        for (const link of downloadLinks.slice(0, 10)) {
          try {
            const { response: dlResponse } = await this.httpFetch(link, {});
            const text = await dlResponse.text();
            if (text.length > 100) {
              const rows = parseCSV(text);
              const fallbackTech = inferTechFromUrl(link);
              for (const row of rows) {
                const country = row.country ?? "";
                if (isAfricanCountry(country)) {
                  (row as any)._trackerTechnology = fallbackTech;
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

    // If we still can't determine technology, skip â but log it
    if (!technology) {
      console.warn(`[api:gem] Skipping "${name}" â could not determine technology from: ${JSON.stringify({ tech: p.technology, fuel: p.fuel, type: p.type, tracker: p._trackerTechnology })}`);
      return null;
    }

    // Capacity in MW
    const capacityMw = p.capacity_mw ?? p.capacity ?? p["capacity (mw)"] ?? null;
    const validCapacity = typeof capacityMw === "number" && capacityMw > 0 && capacityMw < 100_000 ? capacityMw : null;

    // Estimate deal size from capacity and technology
    const estimatedDealSize = estimateDealSizeMn(technology, validCapacity);

    // Status
    const status = p.status ? mapStatus(p.status) : "Announced";

    // Year
    const year = p.year ?? p.start_year ?? p.commissioning_year ?? null;
    const announcedYear = typeof year === "number" && year > 1990 && year < 2100 ? year : null;

    // Owner/developer
    const owner = p.owner ?? p.developer ?? p.parent ?? p.operator ?? null;

    // Coordinates â validate range
    const lat = typeof p.latitude === "number" && p.latitude >= -90 && p.latitude <= 90 ? p.latitude : null;
    const lng = typeof p.longitude === "number" && p.longitude >= -180 && p.longitude <= 180 ? p.longitude : null;

    return {
      projectName: name.slice(0, 300),
      country,
      technology,
      dealSizeUsdMn: estimatedDealSize,
      developer: owner ? String(owner).slice(0, 200) : null,
      financiers: null,
      dfiInvolvement: null,
      offtaker: null,
      dealStage: status,
      status,
      description: `${technology} power plant` + (validCapacity ? ` (${validCapacity} MW)` : ""),
      capacityMw: validCapacity,
      announcedYear,
      financialCloseDate: null,
      sourceUrl: p.wiki_url ?? p.url ?? "https://globalenergymonitor.org/projects/africa-energy-tracker/",
      newsUrl: null,
      source: this.key,
      confidence: this.defaultConfidence,
      latitude: lat,
      longitude: lng,
      rawJson: { ...(p as Record<string, unknown>) },
    };
  }
}

export const gemAdapter = new GEMAdapter();
