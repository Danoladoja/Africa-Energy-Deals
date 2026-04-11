/**
 * Sector Classification Gate
 *
 * Strict energy-sector match gate that runs BEFORE any candidate is inserted
 * into energy_projects. All rules are grounded in real titles observed in the
 * live Rejected/Needs Source buckets on 2026-04-11.
 *
 * Rules applied in order:
 *  1. Hard-reject on disqualifying patterns (fiscal instruments, social programs,
 *     e-mobility, climate finance without asset, minerals advocacy, MOU/policy/events)
 *  2. If extractedTechnology is already a canonical sector, accept.
 *  3. Keyword-score each sector against combined text. Accept the top sector
 *     if score >= 2 AND it is unambiguous (no tie above threshold).
 *  4. Otherwise reject with reason 'no_sector_signal' or 'ambiguous_sector'.
 */

import { ENERGY_SECTORS, isEnergySector, type EnergySector } from "@workspace/shared";

export interface SectorClassificationResult {
  sector: EnergySector | null;
  confidence: number;
  matchedKeywords: string[];
  rejectionReason?: string;
}

export interface ScrapedCandidate {
  title: string;
  description?: string;
  rawText?: string;
  sourceUrl?: string;
  extractedTechnology?: string;
}

// ── Asset escape — presence of an explicitly named energy asset overrides some disqualifiers ──

const ASSET_ESCAPE_RE =
  /\d+\s*(?:MW|GW|KW|megawatt|gigawatt)|power plant|power station|power project|captive power|energy project|solar (farm|park|plant)|wind farm|hydro(power|electric)|dam construction/i;

// ── Hard rejection patterns ────────────────────────────────────────────────────

interface DisqualifierGroup {
  reason: string;
  patterns: RegExp[];
  assetEscapeApplies: boolean;
}

const DISQUALIFIERS: DisqualifierGroup[] = [
  {
    reason: "dev_policy_financing",
    assetEscapeApplies: false,
    patterns: [
      /\bDPF\d?\b|\bDPL\d?\b/i,
      /development policy (financing|loan|operation)/i,
      /budget support|economic governance|fiscal consolidation/i,
      /private investment and productive jobs/i,
      /infrastructure modernization and job creation/i,
    ],
  },
  {
    reason: "social_programming",
    assetEscapeApplies: false,
    patterns: [
      /social protection|social inclusion|socio.economic inclusion/i,
      /skills for (employment|economic transformation)/i,
      /street.connected children|child welfare|adolescents/i,
      /resilience opportunities and welfare|GROWTH \d/i,
      /youth empowerment|just transition|livelihood|community development/i,
      /food (and|&) nutrition security/i,
      /landscape management|community action for landscape/i,
      /housing finance|lands and sustainable investments/i,
      /urban transformation|jobs program/i,
    ],
  },
  {
    reason: "climate_finance_no_asset",
    assetEscapeApplies: true,
    patterns: [
      /climate.{0,20}(risk )?finance (program|platform|facility|accelerator)/i,
      /blended finance platform|resilient infrastructure platform/i,
      /carbon credit|carbon market|carbon offset/i,
      /sustainability bond|green bond/i,
      /climate fund|climate finance accelerator/i,
    ],
  },
  {
    reason: "minerals_advocacy",
    assetEscapeApplies: true,
    patterns: [
      /transition minerals|critical minerals|transparency in.{0,20}minerals/i,
      /\bcobalt\b|\blithium\b|\brare earth\b/i,
    ],
  },
  {
    reason: "mou_no_deal",
    assetEscapeApplies: true,
    patterns: [
      /mou signed|memorandum of understanding/i,
    ],
  },
  {
    reason: "policy_only",
    assetEscapeApplies: true,
    patterns: [
      /\bwhite paper\b|\bfeasibility study\b/i,
    ],
  },
  {
    reason: "conference",
    assetEscapeApplies: false,
    patterns: [
      /\bconference\b|\bsummit\b|\bworkshop\b|\bpanel discussion\b|COP\d{2}/i,
    ],
  },
  {
    reason: "appointment_news",
    assetEscapeApplies: false,
    patterns: [
      /appointment|new (ceo|cfo|vice president)|resignation|board (change|reshuffle)/i,
    ],
  },
];

// ── E-mobility — has its own routing exception ─────────────────────────────────

const EMOBILITY_REJECT_RE =
  /electric vehicle|EV (manufactur|expansion|fleet)|e.mobility|electric bus|bus (deal|fleet)|motorcycle fleet|e.motorcycle/i;

const EMOBILITY_CHARGING_EXCEPTION_RE =
  /charging (station|infrastructure|hub)|grid.connected (EV|charging)/i;

// ── Mining / copper — has captive-power exception ─────────────────────────────

const MINING_REJECT_RE = /\bmining\b|\bcopper\b/i;

const CAPTIVE_EXCEPTION_RE = /captive (power|plant)|\d+\s*MW.{0,30}(mine|mining)/i;

// ── Broader minerals advocacy — no asset escape (applies even without "mining" in title) ──

const MINERALS_ADVOCACY_BROAD_RE =
  /transition minerals|critical minerals|transparency in.{0,20}minerals|\bcobalt\b|\blithium\b|\brare earth\b/i;

// ── Sector keyword scoring ──────────────────────────────────────────────────────

interface SectorKeywords {
  sector: EnergySector;
  keywords: string[];
  exclusive?: RegExp;
}

const SECTOR_KEYWORDS: SectorKeywords[] = [
  {
    sector: "Solar",
    keywords: [
      "solar", "pv", "photovoltaic", "concentrated solar", "csp", "solar farm",
      "solar plant", "solar park", "solar power", "REIPPPP",
    ],
  },
  {
    sector: "Wind",
    keywords: [
      "wind farm", "wind turbine", "wind power", "offshore wind", "onshore wind", "wind energy",
    ],
  },
  {
    sector: "Hydro",
    keywords: [
      "hydropower", "hydroelectric", "hydro power", " dam ", "run-of-river",
      "pumped storage", "hydrodam", "hydro project",
    ],
  },
  {
    sector: "Geothermal",
    // geothermal keyword is exclusive — if matched, Biomass score is set to zero
    exclusive: /geothermal|steam field|wellhead|olkaria|menengai/i,
    keywords: [
      "geothermal", "steam field", "wellhead", "olkaria", "menengai",
    ],
  },
  {
    sector: "Biomass",
    keywords: [
      "biomass", "biogas", "biofuel", "waste-to-energy", "bagasse",
      "waste to energy", "bio-energy",
    ],
  },
  {
    sector: "Nuclear",
    keywords: [
      "nuclear reactor", "nuclear power", "nuclear plant", "smr",
      "small modular reactor", "nuclear energy",
    ],
  },
  {
    sector: "Oil & Gas",
    keywords: [
      "lng", "gas field", "oil field", "upstream", "fpso", "refinery",
      "pipeline", "crude oil", "natural gas", "petroleum", "offshore oil",
      "oil block", "gas plant", "offshore gas", "deepwater", "subsea",
      "fid offshore", "oil and gas", "oil & gas",
    ],
  },
  {
    sector: "Transmission & Distribution",
    keywords: [
      "transmission line", "grid extension", "substation", "interconnector",
      "hvdc", "grid expansion", "power grid", "distribution network",
      "electricity grid", "grid infrastructure", "charging station",
      "charging infrastructure",
    ],
  },
  {
    sector: "Battery Storage",
    keywords: [
      "battery storage", "bess", "lithium-ion storage", "grid-scale battery",
      "energy storage", "battery system", "storage system",
    ],
  },
  {
    sector: "Green Hydrogen",
    keywords: [
      "green hydrogen", "electrolyzer", "electrolysis", "ammonia",
      "h2 project", "hydrogen plant", "hydrogen production",
    ],
  },
  {
    sector: "Coal",
    keywords: [
      "coal power", "coal plant", "coal mine power", "coal-fired",
      "thermal power station", "coal energy",
    ],
  },
];

// ── Classifier ────────────────────────────────────────────────────────────────

export function classifyEnergySector(
  candidate: ScrapedCandidate,
): SectorClassificationResult {
  const combined = [
    candidate.title,
    candidate.description ?? "",
    candidate.rawText ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const hasAsset = ASSET_ESCAPE_RE.test(combined);

  // ── 1. E-mobility check (with charging exception) ─────────────────────────
  if (EMOBILITY_REJECT_RE.test(combined)) {
    if (EMOBILITY_CHARGING_EXCEPTION_RE.test(combined)) {
      // Route to T&D — fall through to keyword scoring below
    } else {
      return { sector: null, confidence: 0, matchedKeywords: [], rejectionReason: "e_mobility_not_generation" };
    }
  }

  // ── 2a. Broad minerals advocacy (no asset escape) ──────────────────────────
  if (MINERALS_ADVOCACY_BROAD_RE.test(combined) && !hasAsset) {
    return { sector: null, confidence: 0, matchedKeywords: [], rejectionReason: "minerals_advocacy" };
  }

  // ── 2b. Mining / copper check (with captive power exception) ───────────────
  if (MINING_REJECT_RE.test(combined)) {
    if (CAPTIVE_EXCEPTION_RE.test(combined) || hasAsset) {
      // Fall through — has a real energy asset
    } else {
      return { sector: null, confidence: 0, matchedKeywords: [], rejectionReason: "minerals_advocacy" };
    }
  }

  // ── 3. Other hard disqualifiers ────────────────────────────────────────────
  for (const group of DISQUALIFIERS) {
    if (group.reason === "minerals_advocacy") continue; // handled above in steps 2a/2b

    for (const pattern of group.patterns) {
      if (pattern.test(combined)) {
        if (group.assetEscapeApplies && hasAsset) {
          // Asset escape: proceed to keyword scoring
          break;
        }
        return {
          sector: null,
          confidence: 0,
          matchedKeywords: [],
          rejectionReason: group.reason,
        };
      }
    }
  }

  // ── 4. Fast-accept: extractedTechnology is already canonical ─────────────
  if (candidate.extractedTechnology && isEnergySector(candidate.extractedTechnology)) {
    return {
      sector: candidate.extractedTechnology,
      confidence: 1,
      matchedKeywords: [candidate.extractedTechnology],
    };
  }

  // ── 5. Geothermal exclusivity — if geothermal keyword is present, zero out Biomass ──
  const hasGeothermal = /geothermal|olkaria|menengai|steam field|wellhead/i.test(combined);

  // ── 6. Keyword scoring ────────────────────────────────────────────────────
  const scores: { sector: EnergySector; score: number; keywords: string[] }[] = [];

  for (const { sector, keywords, exclusive } of SECTOR_KEYWORDS) {
    // Geothermal exclusive override: if geothermal is present, skip Biomass scoring
    if (sector === "Biomass" && hasGeothermal) {
      scores.push({ sector, score: 0, keywords: [] });
      continue;
    }

    // If this sector has an exclusive regexp and it matches, score as exclusive match
    if (exclusive && exclusive.test(combined)) {
      scores.push({ sector, score: 10, keywords: [sector.toLowerCase()] });
      continue;
    }

    const matched: string[] = [];
    for (const kw of keywords) {
      if (combined.includes(kw.toLowerCase())) {
        matched.push(kw);
      }
    }

    scores.push({ sector, score: matched.length, keywords: matched });
  }

  // Sort descending by score
  scores.sort((a, b) => b.score - a.score);

  const top = scores[0];
  const second = scores[1];

  if (top.score < 1) {
    return { sector: null, confidence: 0, matchedKeywords: top.keywords, rejectionReason: "no_sector_signal" };
  }

  if (second.score >= 1 && top.score === second.score) {
    // Tie — try to break with extractedTechnology
    const extracted = candidate.extractedTechnology;
    const tiedSectors = scores.filter((s) => s.score === top.score);
    if (extracted) {
      const match = tiedSectors.find((s) => s.sector === extracted || s.sector.toLowerCase() === extracted.toLowerCase());
      if (match) {
        return {
          sector: match.sector,
          confidence: Math.min(1, match.score / 4),
          matchedKeywords: match.keywords,
        };
      }
    }
    return {
      sector: null,
      confidence: 0,
      matchedKeywords: top.keywords,
      rejectionReason: "ambiguous_sector",
    };
  }

  return {
    sector: top.sector,
    confidence: Math.min(1, top.score / 4),
    matchedKeywords: top.keywords,
  };
}
