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
  "Biomass": {
    aliases: ["bioenergy", "biogas", "waste-to-energy", "bagasse", "wood pellet"],
    costPerMw: 2.5,
  },
  "Battery Storage": {
    aliases: ["bess", "battery", "energy storage"],
    costPerMw: 1.2,
  },
  "Green Hydrogen": {
    aliases: ["hydrogen", "electrolysis", "electrolyzer", "electrolyser"],
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
  "Transmission & Distribution": {
    aliases: ["t&d", "grid", "transmission", "substation", "interconnect", "interconnector", "distribution"],
    costPerMw: 0.5,
  },
} as const;

export type TechnologyName = keyof typeof TECHNOLOGIES;

const CANONICAL_NAMES = Object.keys(TECHNOLOGIES) as TechnologyName[];

/**
 * True if `tech` is one of the 11 canonical technology names.
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
  const ORDER: TechnologyName[] = [
    "Solar", "Wind", "Hydro", "Geothermal", "Biomass",
    "Battery Storage", "Green Hydrogen", "Nuclear",
    "Coal", "Oil & Gas", "Transmission & Distribution",
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
  const estimate = Math.round(capacityMw * perMw * 10) / 10;
  return estimate > 0.1 ? estimate : null;
}
