/**
 * Global Energy Monitor (GEM) — Africa Energy Tracker Adapter
 *
 * Fetches the publicly-hosted GeoJSON dataset from GEM's Africa Energy Tracker,
 * which covers solar, wind, hydro, geothermal, coal, oil/gas, bioenergy, and
 * nuclear power plants across all African countries.
 *
 * Source: https://globalenergymonitor.org/projects/africa-energy-tracker/
 * Data: GeoJSON on DigitalOcean Spaces CDN (5,500+ features)
 *
 * Confidence: 0.95 (highly curated open data, may need name-matching)
 * Key: api:gem | Schedule: monthly
 */

import { BaseSourceAdapter, type RawRow, type CandidateDraft } from "../base.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GEMPlant {
  project_name?: string;
  plant_name?: string;
  name?: string;
  unit_name?: string;
  country?: string;
  subnational?: string;
  capacity_mw?: number | string;
  capacity?: number | string;
  "capacity (mw)"?: number | string;
  status?: string;
  technology?: string;
  fuel?: string;
  type?: string;
  tracker_type?: string;
  owner?: string;
  developer?: string;
  parent?: string;
  operator?: string;
  year?: number | string;
  start_year?: number | string;
  commissioning_year?: number | string;
  retired_year?: number | string;
  latitude?: number;
  longitude?: number;
  wiki_url?: string;
  url?: string;
  source_url?: string;
  source?: string;
  gem_id?: string;
  region?: string;
  [key: string]: unknown;
}

// Map GEM tracker-custom codes to technology names
const TRACKER_TYPE_MAP: Record<string, string> = {
  GSPT: "Solar",
  GWPT: "Wind",
  GHPT: "Hydro",
  GGPT: "Geothermal",
  GBPT: "Biomass",
  GNPT: "Nuclear",
  GCPT: "Coal",
  GOGPT: "Oil & Gas",
  "GOGET-oil": "Oil & Gas",
  GGIT: "Oil & Gas",
  GOIT: "Oil & Gas",
  GCMT: "Coal",
  GCTT: "Coal",
};

function mapTechnology(plant: GEMPlant): string | null {
  // First try the tracker_type code — this is always set in the GeoJSON
  if (plant.tracker_type) {
    const mapped = TRACKER_TYPE_MAP[plant.tracker_type];
    if (mapped) return mapped;
  }

  // Then try fuel/technology/type text matching
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

/** Parse a value that may be a number or numeric string, return number or null */
function toNumber(val: unknown): number | null {
  if (typeof val === "number" && isFinite(val)) return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    if (isFinite(n)) return n;
  }
  return null;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class GEMAdapter extends BaseSourceAdapter {
  readonly key = "api:gem";
  readonly schedule = "0 2 1 * *"; // Monthly on the 1st at 2am
  readonly defaultConfidence = 0.95;
  readonly maxRps = 1;

  async fetch(): Promise<RawRow[]> {
    try {
      // GEM Africa Energy Tracker map data is publicly hosted as GeoJSON on DigitalOcean Spaces
      // The config.js at github.io/maps/trackers/africa-energy/ points to the latest version

      // Step 1: Get the current GeoJSON URL from the tracker config
      let geojsonUrl = "";
      try {
        const { response: configResp } = await this.httpFetch(
          "https://globalenergymonitor.github.io/maps/trackers/africa-energy/config.js",
          { headers: { Accept: "text/javascript" } }
        );

        const configText = await configResp.text();
        // config.js sets window.config = { ... geojson: "url" ... }
        const urlMatch = configText.match(/geojson[\s]*:[\s]*["']([^"']+)["']/);
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
      const { response } = await this.httpFetch(geojsonUrl, {
        headers: { Accept: "application/json" },
      });

      const data = await response.json();

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
        // Country field has trailing semicolons in the GeoJSON (e.g. "Nigeria;")
        const country = (p.areas || "").replace(/;\s*$/, "").trim();

        if (!name || !country) continue;

        rows.push({
          project_name: name,
          country: country,
          region: p.region || "Africa",
          subregion: p.subregion || "",
          fuel: fuel,
          tracker_type: trackerType,
          capacity_mw: toNumber(p.capacity) ?? toNumber(p["scaling-capacity"]),
          status: status,
          start_year: toNumber(p["start-year"]),
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

  normalize(row: RawRow): CandidateDraft | null {
    const p = row as GEMPlant;

    const name = String(p.project_name ?? p.plant_name ?? p.name ?? p.unit_name ?? "").trim();
    if (!name || name.length < 3) return null;

    // Country — already cleaned in fetch() but double-check
    const rawCountry = String(p.country ?? "").replace(/;\s*$/, "").trim();
    const country = rawCountry || null;

    // Technology — use tracker_type first (always set in GeoJSON), then fuel text
    const technology = mapTechnology(p);
    if (!technology) return null; // Skip if we can't determine technology

    // Capacity in MW — handle both number and string values
    const capacityMw = toNumber(p.capacity_mw) ?? toNumber(p.capacity) ?? toNumber(p["capacity (mw)"]);
    const validCapacity = capacityMw !== null && capacityMw > 0 && capacityMw < 100_000 ? capacityMw : null;

    // Status
    const status = p.status ? mapStatus(p.status) : "Announced";

    // Year — handle string values from GeoJSON (e.g. "2023")
    const year = toNumber(p.year) ?? toNumber(p.start_year) ?? toNumber(p.commissioning_year);
    const announcedYear = year !== null && year > 1990 && year < 2100 ? year : null;

    // Owner/developer
    const owner = p.owner ?? p.developer ?? p.parent ?? p.operator ?? null;

    return {
      projectName: name.slice(0, 300),
      country,
      technology,
      dealSizeUsdMn: null,
      developer: owner ? String(owner).slice(0, 200) : null,
      financiers: null,
      dfiInvolvement: null,
      offtaker: null,
      dealStage: status,
      status,
      description: `${technology} power plant — GEM ${p.tracker_type || ""}`.trim(),
      capacityMw: validCapacity,
      announcedYear,
      financialCloseDate: null,
      sourceUrl: p.source_url || p.wiki_url || p.url || "https://globalenergymonitor.org/projects/africa-energy-tracker/",
      newsUrl: null,
      source: this.key,
      confidence: this.defaultConfidence,
      rawJson: { ...(p as Record<string, unknown>) },
    };
  }
}

export const gemAdapter = new GEMAdapter();
