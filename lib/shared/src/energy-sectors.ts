/**
 * Canonical list of energy sectors tracked by AfriEnergy Tracker.
 * THIS IS THE ONLY PLACE new sectors should be added.
 * Adding a sector requires a code change + PR, on purpose.
 *
 * Reconciliation against live DB (2026-04-11):
 *   DB value              → Canonical name
 *   'Battery & Storage'   → 'Battery Storage'   (backfill in migration script)
 *   'Bioenergy'           → 'Biomass'            (backfill in migration script)
 *   'Coal'                → 'Coal'               (legitimate African sector, added)
 *   'Grid Expansion'      → 'Transmission & Distribution' (backfill)
 *   'Hydrogen'            → 'Green Hydrogen'     (backfill)
 *   All others match as-is.
 */
export const ENERGY_SECTORS = [
  "Solar",
  "Wind",
  "Hydro",
  "Geothermal",
  "Biomass",
  "Nuclear",
  "Oil & Gas",
  "Transmission & Distribution",
  "Battery Storage",
  "Green Hydrogen",
  "Coal",
] as const;

export type EnergySector = (typeof ENERGY_SECTORS)[number];

export function isEnergySector(value: string): value is EnergySector {
  return (ENERGY_SECTORS as readonly string[]).includes(value);
}
