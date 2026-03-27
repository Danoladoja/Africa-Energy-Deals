export const SECTOR_COLORS: Record<string, string> = {
  "Solar":            "#f59e0b",
  "Wind":             "#3b82f6",
  "Hydro":            "#06b6d4",
  "Geothermal":       "#ef4444",
  "Oil & Gas":        "#78350f",
  "Grid Expansion":   "#8b5cf6",
  "Battery & Storage":"#6366f1",
  "Hydrogen":         "#10b981",
  "Nuclear":          "#ec4899",
  "Bioenergy":        "#22c55e",
  "Clean Cooking":    "#f97316",
  "Coal":             "#64748b",
};

export const REGION_COLORS: Record<string, string> = {
  "North Africa":   "#3b82f6",
  "West Africa":    "#f59e0b",
  "East Africa":    "#10b981",
  "Central Africa": "#ef4444",
  "Southern Africa":"#8b5cf6",
};

export const FINANCING_COLORS: Record<string, string> = {
  "Project Finance": "#3b82f6",
  "Blended Finance": "#06b6d4",
  "Concessional":    "#f59e0b",
  "Grant":           "#10b981",
  "Corporate":       "#8b5cf6",
  "Sovereign":       "#ef4444",
  "IPP":             "#ec4899",
  "Green Bond":      "#22c55e",
};

export const STATUS_COLORS: Record<string, string> = {
  "Operational":        "#10b981",
  "Under Construction": "#3b82f6",
  "Development":        "#f59e0b",
  "Announced":          "#8b5cf6",
  "Cancelled":          "#ef4444",
};

export const FALLBACK_COLORS = [
  "#00e676","#00bcd4","#ff9800","#e91e63","#9c27b0",
  "#2196f3","#4caf50","#ff5722","#607d8b","#795548",
  "#ffc107","#03a9f4","#8bc34a","#ff4081","#7c4dff",
];

export function getColor(key: string, map: Record<string, string>, idx: number): string {
  return map[key] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

export function formatVal(value: number, isInvestment: boolean): string {
  if (!isInvestment) return value.toLocaleString();
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}B`;
  return `$${value.toFixed(0)}M`;
}
