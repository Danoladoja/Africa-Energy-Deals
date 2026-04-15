/**
 * Field Validator — validates and cleans all structured fields on a CandidateDraft
 * before it enters the dedup and routing pipeline.
 *
 * Returns:
 *  - valid: false  → hard reject (unrecognizable country, no energy signal)
 *  - valid: true, issues.length > 0 → soft issue (auto-corrected values, attach as review notes)
 *  - valid: true, issues.length === 0 → clean pass
 */

import type { CandidateDraft } from "../scraper/base.js";
import { ENERGY_SECTORS, isEnergySector, type EnergySector } from "@workspace/shared";

export interface FieldValidationResult {
  valid: boolean;
  issues: string[];
  cleaned: CandidateDraft;
}

// ── Sector normalization ──────────────────────────────────────────────────────

const SECTOR_ALIASES: Record<string, EnergySector> = {
  "solar pv": "Solar",
  "solar power": "Solar",
  "solor": "Solar",
  "wind power": "Wind",
  "wind energy": "Wind",
  "wind farm": "Wind",
  "offshore wind": "Wind",
  "onshore wind": "Wind",
  "hydroelectric": "Hydro",
  "hydropower": "Hydro",
  "hydro power": "Hydro",
  "hydroelectric power": "Hydro",
  "natural gas": "Oil & Gas",
  "oil and gas": "Oil & Gas",
  "oil & gas": "Oil & Gas",
  "petroleum": "Oil & Gas",
  "battery storage": "Battery Storage",
  "battery": "Battery Storage",
  "energy storage": "Battery Storage",
  "bess": "Battery Storage",
  "green hydrogen": "Green Hydrogen",
  "hydrogen": "Green Hydrogen",
  "clean hydrogen": "Green Hydrogen",
  "t&d": "Transmission & Distribution",
  "transmission": "Transmission & Distribution",
  "distribution network": "Transmission & Distribution",
  "power grid": "Transmission & Distribution",
  "grid": "Transmission & Distribution",
  "transmission line": "Transmission & Distribution",
  "nuclear power": "Nuclear",
  "geothermal power": "Geothermal",
  "biomass energy": "Biomass",
  "bioenergy": "Biomass",
  "biogas": "Biomass",
  "coal power": "Coal",
  "thermal coal": "Coal",
};

function normalizeSector(raw: string): { sector: EnergySector | null; corrected: boolean } {
  if (isEnergySector(raw)) return { sector: raw as EnergySector, corrected: false };
  const lower = raw.toLowerCase().trim();
  if (SECTOR_ALIASES[lower]) return { sector: SECTOR_ALIASES[lower], corrected: true };
  // Partial match — check if any alias is a substring
  for (const [alias, sector] of Object.entries(SECTOR_ALIASES)) {
    if (lower.includes(alias) || alias.includes(lower)) {
      return { sector, corrected: true };
    }
  }
  return { sector: null, corrected: false };
}

// ── Country normalization ─────────────────────────────────────────────────────

const AU_COUNTRIES = new Set([
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cameroon", "Central African Republic", "Chad", "Comoros",
  "Congo", "Democratic Republic of the Congo", "DRC", "Djibouti", "Egypt",
  "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon", "Gambia",
  "Ghana", "Guinea", "Guinea-Bissau", "Ivory Coast", "Côte d'Ivoire",
  "Cote d'Ivoire", "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar",
  "Malawi", "Mali", "Mauritania", "Mauritius", "Morocco", "Mozambique",
  "Namibia", "Niger", "Nigeria", "Rwanda", "São Tomé and Príncipe",
  "Senegal", "Seychelles", "Sierra Leone", "Somalia", "South Africa",
  "South Sudan", "Sudan", "Tanzania", "Togo", "Tunisia", "Uganda",
  "Zambia", "Zimbabwe", "Swaziland",
]);

const CITY_TO_COUNTRY: Record<string, string> = {
  "nairobi": "Kenya",
  "mombasa": "Kenya",
  "lagos": "Nigeria",
  "abuja": "Nigeria",
  "accra": "Ghana",
  "cairo": "Egypt",
  "johannesburg": "South Africa",
  "cape town": "South Africa",
  "durban": "South Africa",
  "pretoria": "South Africa",
  "addis ababa": "Ethiopia",
  "dar es salaam": "Tanzania",
  "kampala": "Uganda",
  "kigali": "Rwanda",
  "kinshasa": "Democratic Republic of the Congo",
  "lubumbashi": "Democratic Republic of the Congo",
  "dakar": "Senegal",
  "tunis": "Tunisia",
  "casablanca": "Morocco",
  "rabat": "Morocco",
  "tripoli": "Libya",
  "algiers": "Algeria",
  "khartoum": "Sudan",
  "lusaka": "Zambia",
  "harare": "Zimbabwe",
  "maputo": "Mozambique",
  "luanda": "Angola",
  "antananarivo": "Madagascar",
  "bamako": "Mali",
  "conakry": "Guinea",
  "abidjan": "Ivory Coast",
  "libreville": "Gabon",
  "brazzaville": "Congo",
  "freetown": "Sierra Leone",
  "banjul": "Gambia",
  "monrovia": "Liberia",
  "niamey": "Niger",
  "ouagadougou": "Burkina Faso",
  "lome": "Togo",
  "cotonou": "Benin",
  "windhoek": "Namibia",
  "gaborone": "Botswana",
  "maseru": "Lesotho",
  "mbabane": "Eswatini",
  "asmara": "Eritrea",
};

function normalizeCountry(raw: string): { country: string | null; corrected: boolean } {
  if (!raw) return { country: null, corrected: false };

  // Direct match (case-insensitive)
  for (const c of AU_COUNTRIES) {
    if (c.toLowerCase() === raw.toLowerCase()) return { country: c, corrected: false };
  }

  // City mapping
  const lower = raw.toLowerCase().trim();
  if (CITY_TO_COUNTRY[lower]) {
    return { country: CITY_TO_COUNTRY[lower], corrected: true };
  }

  // Partial match for common variants
  for (const c of AU_COUNTRIES) {
    if (raw.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(raw.toLowerCase())) {
      return { country: c, corrected: true };
    }
  }

  return { country: null, corrected: false };
}

// ── Capacity parsing ──────────────────────────────────────────────────────────

export function parseCapacityMw(raw: unknown): { value: number | null; issue: string | null } {
  if (typeof raw === "number") {
    if (raw <= 0) return { value: null, issue: `Capacity must be positive (got ${raw})` };
    if (raw > 50_000) return { value: raw, issue: `Capacity unusually large (${raw} MW) — may be a program` };
    return { value: raw, issue: null };
  }
  if (typeof raw === "string") {
    const gw = raw.match(/^([\d.]+)\s*GW$/i);
    if (gw) return parseCapacityMw(parseFloat(gw[1]) * 1000);
    const mw = raw.match(/^([\d.]+)\s*MW$/i);
    if (mw) return parseCapacityMw(parseFloat(mw[1]));
    const kw = raw.match(/^([\d.]+)\s*KW$/i);
    if (kw) return parseCapacityMw(parseFloat(kw[1]) / 1000);
    const plain = parseFloat(raw);
    if (!isNaN(plain)) return parseCapacityMw(plain);
  }
  return { value: null, issue: null };
}

// ── Deal size parsing ─────────────────────────────────────────────────────────

export function parseDealSizeUsdMn(raw: unknown): { value: number | null; issue: string | null } {
  if (typeof raw === "number") {
    if (raw <= 0) return { value: null, issue: null };
    if (raw > 5000) return { value: raw, issue: `Deal size unusually large ($${raw}M) — may be a multi-project program` };
    if (raw < 0.05) return { value: null, issue: null };
    return { value: raw, issue: null };
  }
  if (typeof raw === "string") {
    const s = raw.replace(/[,$\s]/g, "").toLowerCase();
    const billion = s.match(/^([\d.]+)\s*b(?:illion)?$/i);
    if (billion) return parseDealSizeUsdMn(parseFloat(billion[1]) * 1000);
    const million = s.match(/^([\d.]+)\s*(?:m(?:illion)?|mn|mm)?$/i);
    if (million) return parseDealSizeUsdMn(parseFloat(million[1]));
  }
  return { value: null, issue: null };
}

// ── Status normalization ──────────────────────────────────────────────────────

const VALID_STATUSES = new Set([
  "Announced", "Planned", "Under Development", "Construction",
  "Commissioned", "Operational", "Suspended", "Cancelled",
  "announced", "planned",
]);

const STATUS_ALIASES: Record<string, string> = {
  "under construction": "Construction",
  "in construction": "Construction",
  "construction phase": "Construction",
  "planned": "Planned",
  "announced": "Announced",
  "commissioned": "Commissioned",
  "in operation": "Operational",
  "operational": "Operational",
  "online": "Operational",
  "suspended": "Suspended",
  "on hold": "Suspended",
  "cancelled": "Cancelled",
  "canceled": "Cancelled",
  "under development": "Under Development",
  "in development": "Under Development",
  "development stage": "Under Development",
  "pre-construction": "Under Development",
  "financial close": "Under Development",
};

// ── Main export ───────────────────────────────────────────────────────────────

export function validateFields(candidate: CandidateDraft): FieldValidationResult {
  const issues: string[] = [];
  let cleaned = { ...candidate };

  // Sector
  if (candidate.technology) {
    const { sector, corrected } = normalizeSector(candidate.technology);
    if (!sector) {
      // Hard reject only if no energy signal at all
      return {
        valid: false,
        issues: [`Unrecognized sector: "${candidate.technology}"`],
        cleaned,
      };
    }
    if (corrected) {
      issues.push(`Sector auto-corrected: "${candidate.technology}" → "${sector}"`);
      cleaned = { ...cleaned, technology: sector };
    }
  }

  // Country
  if (candidate.country) {
    const { country, corrected } = normalizeCountry(candidate.country);
    if (!country) {
      return {
        valid: false,
        issues: [`Unrecognized country: "${candidate.country}"`],
        cleaned,
      };
    }
    if (corrected) {
      issues.push(`Country auto-corrected: "${candidate.country}" → "${country}"`);
      cleaned = { ...cleaned, country };
    }
  }

  // Capacity
  if (candidate.capacityMw !== null && candidate.capacityMw !== undefined) {
    const { value, issue } = parseCapacityMw(candidate.capacityMw);
    if (issue) issues.push(issue);
    cleaned = { ...cleaned, capacityMw: value };
  }

  // Deal size
  if (candidate.dealSizeUsdMn !== null && candidate.dealSizeUsdMn !== undefined) {
    const { value, issue } = parseDealSizeUsdMn(candidate.dealSizeUsdMn);
    if (issue) issues.push(issue);
    cleaned = { ...cleaned, dealSizeUsdMn: value };
  }

  // Developer — strip legal suffixes for display (but keep original stored value)
  if (candidate.developer) {
    cleaned = { ...cleaned, developer: candidate.developer.trim() };
    if (!cleaned.developer) issues.push("Developer name is empty after trimming");
  }

  // Status normalization
  if (candidate.status) {
    const lower = candidate.status.toLowerCase().trim();
    if (STATUS_ALIASES[lower]) {
      const normalized = STATUS_ALIASES[lower];
      if (normalized !== candidate.status) {
        issues.push(`Status normalized: "${candidate.status}" → "${normalized}"`);
        cleaned = { ...cleaned, status: normalized };
      }
    }
  }

  return { valid: true, issues, cleaned };
}
