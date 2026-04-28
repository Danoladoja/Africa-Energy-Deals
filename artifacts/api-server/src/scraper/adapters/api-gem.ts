/**
 * Global Energy Monitor (GEM) â Africa Energy Tracker Adapter
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
    try {
      // GEM Africa Energy Tracker map data is publicly hosted as GeoJSON on DigitalOcean Spaces
      // The config.js at github.io/maps/trackers/africa-energy/ points to the latest version
      // Current URL pattern: publicgemdata.nyc3.cdn.digitaloceanspaces.com/hydro/{YYYY-MM}/africa-energy_map_{date}.geojson
      
      // Step 1: Get the current GeoJSON URL from the tracker config
      let geojsonUrl = "";
      try {
        const configResp = await this.httpFetch(
          "https://globalenergymonitor.github.io/maps/trackers/africa-energy/config.js",
          { responseType: "text" }
        ) as string;
        
        // config.js sets window.config = { ... geojson: "url" ... }
        const urlMatch = configResp.match(/geojson[\s]*:[\s]*["']([^"']+)["']/);
        if (urlMatch) {
          geojsonUrl = urlMatch[1];
        }
      } catch (e) {
        console.warn(`[api:gem] Could not fetch config.js: ${e instanceof Error ? e.message : e}`);
      }
      
      // Fallback to known URL if config fetch failed
      if (!geojsonUrl) {
        geojsonUrl = "https://publicgemdata.nyc3.cdn.digitaloceanspaces.com/hydro/2026-03/africa-energy_map_2026-03-19.geojson";
      }
      
      // Step 2: Fetch the GeoJSON data
      const data = await this.httpFetch(geojsonUrl, {
        headers: { "Accept": "application/json" },
      }) as any;
      
      if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
        console.error("[api:gem] Response is not a valid GeoJSON FeatureCollection");
        (this as any)._lastFetchError = "Invalid GeoJSON response";
        return [];
      }
      
      // Step 3: Map GeoJSON features to RawRow format
      const rows: RawRow[] = [];
      for (const feature of data.features) {
        const p = feature.properties || {};
        const coords = feature.geometry?.coordinates || [0, 0];
        
        // The tracker-custom field identifies the source tracker (GSPT=Solar, GWPT=Wind, etc.)
        const trackerType = p["tracker-custom"] || "";
        const fuel = p.fuel || "";
        const status = p.status || "";
        const name = p.name || p["plant-name-in-local-language-/-script"] || "";
        const country = (p.areas || "").replace(/;\s*$/, "");
        
        rows.push({
          project_name: name,
          country: country,
          region: p.region || "Africa",
          subregion: p.subregion || "",
          fuel: fuel,
          tracker_type: trackerType,
          capacity_mw: p.capacity || p["scaling-capacity"] || null,
          status: status,
          start_year: p["start-year"] || "",
          retired_year: p["retired-year"] || "",
          owner: p.owner || "",
          operator: p["operator(s)"] || "",
          parent: p.parent || "",
          latitude: coords[1],
          longitude: coords[0],
          city: p.city || "",
          subnational: p.subnat || "",
          gem_id: p.id || p.pid || "",
          source_url: p.url || "",
        } as any);
      }
      
      console.log(`[api:gem] Fetched ${rows.length} energy projects from GEM Africa Energy Tracker GeoJSON (${data.features.length} total features)`);
      return rows;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[api:gem] Fetch failed: ${msg}`);
      (this as any)._lastFetchError = msg;
      return [];
    }
  }

            // We filter for African countries in normalize(), pass all through
            allRows.push({
              project_name: nameIdx >= 0 ? cols[nameIdx] : "",
              country: country,
              capacity_mw: capacityIdx >= 0 ? parseFloat(cols[capacityIdx]) || 0 : 0,
              status: statusIdx >= 0 ? cols[statusIdx] : "",
              tracker_type: tracker.name.replace("-alt", ""),
              raw_cols: cols,
              raw_headers: headers,
            } as any);
          }
          
          console.log(`[api:gem] Parsed ${lines.length - 1} rows from ${tracker.name} tracker`);
        } catch (e) {
          fetchErrors.push(`${tracker.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (allRows.length === 0 && fetchErrors.length > 0) {
        const msg = "GEM trackers require registration with CAPTCHA. " +
          "Manual download needed. Errors: " + fetchErrors.join("; ");
        console.error(`[api:gem] ${msg}`);
        (this as any)._lastFetchError = msg;
      } else {
        console.log(`[api:gem] Total rows fetched: ${allRows.length}`);
      }

      return allRows;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[api:gem] Fetch failed: ${msg}`);
      (this as any)._lastFetchError = msg;
      return [];
    }
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
