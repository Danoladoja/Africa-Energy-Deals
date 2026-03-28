export const TECHNOLOGY_SECTORS = [
  "Solar", "Wind", "Hydro", "Geothermal", "Oil & Gas",
  "Grid Expansion", "Battery & Storage", "Hydrogen",
  "Nuclear", "Bioenergy", "Clean Cooking", "Coal",
] as const;

export type TechnologySector = typeof TECHNOLOGY_SECTORS[number];

export const TECHNOLOGY_COLORS: Record<TechnologySector, string> = {
  "Solar":             "#F59E0B",
  "Wind":              "#10B981",
  "Hydro":             "#3B82F6",
  "Geothermal":        "#DC2626",
  "Oil & Gas":         "#6B7280",
  "Grid Expansion":    "#8B5CF6",
  "Battery & Storage": "#EC4899",
  "Hydrogen":          "#06B6D4",
  "Nuclear":           "#7C3AED",
  "Bioenergy":         "#84CC16",
  "Clean Cooking":     "#F97316",
  "Coal":              "#1F2937",
};

export const TECHNOLOGY_BG_CLASSES: Record<TechnologySector, string> = {
  "Solar":             "bg-amber-100 text-amber-800",
  "Wind":              "bg-emerald-100 text-emerald-800",
  "Hydro":             "bg-blue-100 text-blue-800",
  "Geothermal":        "bg-red-100 text-red-800",
  "Oil & Gas":         "bg-gray-100 text-gray-800",
  "Grid Expansion":    "bg-purple-100 text-purple-800",
  "Battery & Storage": "bg-pink-100 text-pink-800",
  "Hydrogen":          "bg-cyan-100 text-cyan-800",
  "Nuclear":           "bg-violet-100 text-violet-800",
  "Bioenergy":         "bg-lime-100 text-lime-800",
  "Clean Cooking":     "bg-orange-100 text-orange-800",
  "Coal":              "bg-gray-200 text-gray-900",
};

export const TECHNOLOGY_SHORT_LABELS: Record<TechnologySector, string> = {
  "Solar":             "Solar",
  "Wind":              "Wind",
  "Hydro":             "Hydro",
  "Geothermal":        "Geothermal",
  "Oil & Gas":         "Oil & Gas",
  "Grid Expansion":    "Grid",
  "Battery & Storage": "Storage",
  "Hydrogen":          "H₂",
  "Nuclear":           "Nuclear",
  "Bioenergy":         "Bio",
  "Clean Cooking":     "Cooking",
  "Coal":              "Coal",
};

export function getTechColor(tech: string): string {
  return TECHNOLOGY_COLORS[tech as TechnologySector] ?? "#9CA3AF";
}

export function getTechBadgeClass(tech: string): string {
  return TECHNOLOGY_BG_CLASSES[tech as TechnologySector] ?? "bg-gray-100 text-gray-800";
}
