/**
 * Deal-Signal Pre-Filter (Idea 2)
 *
 * Keyword gate that runs BEFORE expensive LLM calls.
 * Checks whether article text contains signals indicating an actual energy
 * deal/project rather than general news, opinion, or policy commentary.
 *
 * Two tiers:
 *  - Strong signals: terms that almost always indicate a deal (MW, PPA, etc.)
 *  - Weak signals: generic energy terms that need multiple matches to qualify
 *
 * A candidate passes if it has ≥1 strong signal OR ≥2 weak signals.
 */

export interface DealSignalResult {
  pass: boolean;
  strongMatches: string[];
  weakMatches: string[];
  reason?: string;
}

// ── Signal dictionaries ──────────────────────────────────────────────────────

const STRONG_SIGNALS: RegExp[] = [
  /\b\d+\s*MW\b/i,
  /\b\d+\s*GW\b/i,
  /\bmegawatt/i,
  /\bgigawatt/i,
  /\bfinancial\s+close/i,
  /\bPPA\b/,
  /\bpower\s+purchase\s+agreement/i,
  /\bEPC\s+(contract|contractor)/i,
  /\bcommission(ed|ing)\b/i,
  /\bunder\s+construction/i,
  /\bconstruction\s+start/i,
  /\bground\s*break/i,
  /\bproject\s+finance/i,
  /\bIPP\b/,
  /\bindependent\s+power\s+producer/i,
  /\b(USD|US\$|\$)\s*\d+\s*(m|mn|million|billion|bn)\b/i,
  /\bconcession(al)?\s+(loan|agreement)/i,
  /\b(BOT|BOO|BOOT)\b/,
  /\bfeed[\s-]*in[\s-]*tariff/i,
  /\bcapacity\s+\d+/i,
  /\boff[\s-]*?taker/i,
  /\btariff\s+award/i,
  /\bgreen\s+bond/i,
  /\bDFI\b/i,
  /\bdevelopment\s+finance/i,
];

const WEAK_SIGNALS: RegExp[] = [
  /\bsolar\b/i,
  /\bwind\s*(farm|power|energy|turbine)?\b/i,
  /\bhydro(power|electric)?\b/i,
  /\bgeotherm(al)?\b/i,
  /\bbiomass\b/i,
  /\bbattery\s+storage\b/i,
  /\bgreen\s+hydrogen\b/i,
  /\benergy\b/i,
  /\bpower\s+(plant|station|project)\b/i,
  /\binvestment\b/i,
  /\binfrastructure\b/i,
  /\bgrid\b/i,
  /\btransmission\b/i,
  /\brenewable/i,
  /\belectrif(y|ication)/i,
  /\bdeveloper\b/i,
  /\bfunding\b/i,
  /\bloan\b/i,
  /\bgrant\b/i,
];

// ── Adapters that should bypass the filter ───────────────────────────────────
// DFI project portals always contain deals — no need to filter
const BYPASS_ADAPTERS = new Set([
  "dfi:afdb",
  "dfi:ifc",
  "dfi:dfc",
  "dfi:proparco",
  "dfi:fmo",
  "dfi:bii",
  "api:worldbank",
  "api:gem",
]);

/**
 * Check if text contains deal signals.
 *
 * @param text     Combined title + description + snippet
 * @param adapter  Adapter key — some adapters bypass the filter
 */
export function isDealSignal(text: string, adapter?: string): DealSignalResult {
  // DFI and structured-API adapters always pass
  if (adapter && BYPASS_ADAPTERS.has(adapter)) {
    return { pass: true, strongMatches: ["bypass:" + adapter], weakMatches: [] };
  }

  if (!text || text.trim().length < 10) {
    return { pass: false, strongMatches: [], weakMatches: [], reason: "Text too short for signal detection" };
  }

  const strongMatches: string[] = [];
  const weakMatches: string[] = [];

  for (const re of STRONG_SIGNALS) {
    const match = text.match(re);
    if (match) strongMatches.push(match[0]);
  }

  for (const re of WEAK_SIGNALS) {
    const match = text.match(re);
    if (match) weakMatches.push(match[0]);
  }

  // Pass if ≥1 strong signal OR ≥2 weak signals
  const pass = strongMatches.length >= 1 || weakMatches.length >= 2;

  return {
    pass,
    strongMatches,
    weakMatches,
    reason: pass
      ? undefined
      : `No deal signals found (${strongMatches.length} strong, ${weakMatches.length} weak)`,
  };
}
