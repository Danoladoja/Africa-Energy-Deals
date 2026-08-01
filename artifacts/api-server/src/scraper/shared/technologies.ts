/**
 * Technology enum + aliases + cost-per-MW benchmarks.
 * Single source of truth used by pipeline AND adapters.
 */

export const TECHNOLOGIES = {
  "Solar": {
    aliases: ["solar pv", "photovoltaic", "pv", "csp", "concentrated solar", "solar power", "solar park"],
    costPerMw: 0.9,
  },
  "Wind": {
    aliases: ["onshore wind", "offshore wind", "wind farm", "wind power"],
    costPerMw: 1.4,
  },
  "Hydro": {
    aliases: ["hydroelectric", "hydropower", "small hydro", "mini hydro", "run-of-river", "pumped storage", "dam"],
    costPerMw: 2.0,
  },
  "Geothermal": {
    aliases: ["geotherm"],
    costPerMw: 3.5,
  },
  "Bioenergy": {
    aliases: ["biomass", "biogas", "waste-to-energy", "bagasse", "wood pellet", "bioenergy"],
    costPerMw: 2.5,
  },
  "Battery & Storage": {
    aliases: ["battery storage", "bess", "battery", "energy storage"],
    costPerMw: 1.2,
  },
  "Hydrogen": {
    aliases: ["green hydrogen", "hydrogen", "electrolysis", "electrolyzer", "electrolyser", "ammonia"],
    costPerMw: 3.0,
  },
  "Nuclear": {
    aliases: ["atomic", "smr"],
    costPerMw: 6.0,
  },
  "Coal": {
    aliases: ["coal-fired", "lignite", "subcritical", "supercritical", "ultra-supercritical"],
    costPerMw: 1.5,
  },
  "Oil & Gas": {
    aliases: [
      "gas", "lng", "natural gas", "petroleum", "oil", "diesel", "lpg",
      "ccgt", "ocgt", "combined cycle", "open cycle", "heavy fuel", "hfo",
      "naphtha", "kerosene", "thermal", "fired", "cogeneration", "reciprocating",
    ],
    costPerMw: 0.8,
  },
  "Grid Expansion": {
    aliases: [
      "transmission & distribution", "t&d", "grid", "transmission", "substation",
      "interconnect", "interconnector", "distribution", "rural electrification",
    ],
    costPerMw: 0.5,
  },
  "Clean Cooking": {
    aliases: ["cookstove", "cook stove", "clean cooking", "improved cooking"],
    costPerMw: 0, // no MW benchmark — never estimate deal sizes for this sector
  },
} as const;

export type TechnologyName = keyof typeof TECHNOLOGIES;

const CANONICAL_NAMES = Object.keys(TECHNOLOGIES) as TechnologyName[];

/**
 * True if `tech` is one of the canonical sector names (single source of truth\n * for the whole app — scraper, API validation, and frontend filters).
 */
export function isRecognizedTechnology(tech: string): boolean {
  return (CANONICAL_NAMES as string[]).includes(tech);
}

/**
 * Map free text → canonical technology name, or null.
 * Tries exact match first, then aliases, then word-contains.
 * IMPORTANT: checks more specific tags before more generic ones
 * (e.g. "Coal" before "Oil & Gas" since "supercritical" appears in both contexts).
 */
export function normalizeTechnology(text: string): TechnologyName | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Canonical exact match
  if (isRecognizedTechnology(trimmed)) return trimmed as TechnologyName;

  const lower = trimmed.toLowerCase();

  // Check in order: specific renewables first, then storage/hydrogen, then nuclear,
  // then coal (before oil & gas), then T&D last.
  // Hydrogen before Hydro (the word "hydrogen" contains "hydro"); Geothermal
  // before Oil & Gas ("geothermal" contains the alias "thermal"); Grid last.
  const ORDER: TechnologyName[] = [
    "Solar", "Wind", "Geothermal", "Hydrogen", "Hydro", "Bioenergy",
    "Battery & Storage", "Clean Cooking", "Nuclear",
    "Coal", "Oil & Gas", "Grid Expansion",
  ];

  for (const name of ORDER) {
    if (lower.includes(name.toLowerCase())) return name;
    for (const alias of TECHNOLOGIES[name].aliases) {
      if (lower.includes(alias)) return name;
    }
  }

  return null;
}

/**
 * Estimate USD-millions deal size from MW capacity using benchmark cost/MW.
 * Returns null if either input is missing or the technology has no benchmark.
 */
export function estimateDealSize(
  capacityMw: number | null,
  technology: string,
): number | null {
  if (!capacityMw || capacityMw <= 0) return null;
  if (!isRecognizedTechnology(technology)) return null;
  const perMw = TECHNOLOGIES[technology as TechnologyName].costPerMw;
  if (!perMw) return null; // sectors with no MW benchmark (e.g. Clean Cooking)
  const estimate = Math.round(capacityMw * perMw * 10) / 10;
  return estimate > 0.1 ? estimate : null;
}

/**
 * Rule-based climate finance classification by sector (IPCC convention:
 * low-carbon generation = Mitigation; enabling infrastructure = Cross-Cutting).
 */
export function climateTagForTechnology(tech: string): "Mitigation" | "Cross-Cutting" | "Non-Climate" | null {
  const t = normalizeTechnology(tech);
  if (!t) return null;
  if (t === "Coal" || t === "Oil & Gas") return "Non-Climate";
  if (t === "Grid Expansion") return "Cross-Cutting";
  return "Mitigation";
}
