/**
 * Canonical deal-stage taxonomy — single source of truth.
 *
 * Stages: Announced → Mandated → Financial Close → Construction → Commissioned,
 * plus the terminal/off-track states Suspended, Cancelled, Decommissioned.
 * "Operational" and "Under Construction" are legacy variants folded into
 * Commissioned and Construction respectively.
 */

export const CANONICAL_STAGES = [
  "Announced", "Mandated", "Financial Close", "Construction", "Commissioned",
  "Suspended", "Cancelled", "Decommissioned",
] as const;

export type CanonicalStage = (typeof CANONICAL_STAGES)[number];

export function normalizeDealStage(stage: string | null | undefined): CanonicalStage | null {
  if (!stage) return null;
  const s = stage.toLowerCase().trim();
  if (s.includes("decommission") || s.includes("retired") || s.includes("mothball")) return "Decommissioned";
  if (s.includes("cancel") || s.includes("shelved")) return "Cancelled";
  if (s.includes("suspend")) return "Suspended";
  if (s.includes("commission") || s.includes("operational") || s.includes("operating") || s === "active" || s.includes("completed")) return "Commissioned";
  if (s.includes("construct")) return "Construction";
  if (s.includes("financial close") || s.includes("financing closed") || s.includes("financial_close")) return "Financial Close";
  if (s.includes("mandate")) return "Mandated";
  if (s.includes("announce") || s.includes("proposed") || s.includes("permitted") || s.includes("pre-construction") || s.includes("planned")) return "Announced";
  return "Announced";
}
