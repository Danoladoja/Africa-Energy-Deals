/**
 * Single canonical source of truth for African countries, region inference,
 * and project-name normalization. Used by pipeline AND every adapter.
 */

// Map from lowercase alias → canonical English name.
// Sentinel "__REGIONAL__" marks terms that ARE African but aren't a country
// (used by isAfrican; never written to the `country` column).
export const AFRICAN_COUNTRIES: Record<string, string> = {
  // Canonical names (lowercase form maps to itself with proper casing)
  "algeria": "Algeria",
  "angola": "Angola",
  "benin": "Benin",
  "botswana": "Botswana",
  "burkina faso": "Burkina Faso",
  "burundi": "Burundi",
  "cabo verde": "Cabo Verde",
  "cape verde": "Cabo Verde",
  "cameroon": "Cameroon",
  "central african republic": "Central African Republic",
  "car": "Central African Republic",
  "chad": "Chad",
  "comoros": "Comoros",
  "côte d'ivoire": "Côte d'Ivoire",
  "cote d'ivoire": "Côte d'Ivoire",
  "ivory coast": "Côte d'Ivoire",
  "democratic republic of the congo": "Democratic Republic of the Congo",
  "drc": "Democratic Republic of the Congo",
  "dr congo": "Democratic Republic of the Congo",
  "congo-kinshasa": "Democratic Republic of the Congo",
  "republic of the congo": "Republic of the Congo",
  "congo": "Republic of the Congo",
  "congo-brazzaville": "Republic of the Congo",
  "djibouti": "Djibouti",
  "egypt": "Egypt",
  "equatorial guinea": "Equatorial Guinea",
  "eritrea": "Eritrea",
  "eswatini": "Eswatini",
  "swaziland": "Eswatini",
  "ethiopia": "Ethiopia",
  "gabon": "Gabon",
  "gambia": "Gambia",
  "the gambia": "Gambia",
  "ghana": "Ghana",
  "guinea": "Guinea",
  "guinea-bissau": "Guinea-Bissau",
  "kenya": "Kenya",
  "lesotho": "Lesotho",
  "liberia": "Liberia",
  "libya": "Libya",
  "madagascar": "Madagascar",
  "malawi": "Malawi",
  "mali": "Mali",
  "mauritania": "Mauritania",
  "mauritius": "Mauritius",
  "morocco": "Morocco",
  "mozambique": "Mozambique",
  "namibia": "Namibia",
  "niger": "Niger",
  "nigeria": "Nigeria",
  "rwanda": "Rwanda",
  "são tomé and príncipe": "São Tomé and Príncipe",
  "sao tome and principe": "São Tomé and Príncipe",
  "senegal": "Senegal",
  "seychelles": "Seychelles",
  "sierra leone": "Sierra Leone",
  "somalia": "Somalia",
  "south africa": "South Africa",
  "south sudan": "South Sudan",
  "sudan": "Sudan",
  "tanzania": "Tanzania",
  "united republic of tanzania": "Tanzania",
  "togo": "Togo",
  "tunisia": "Tunisia",
  "uganda": "Uganda",
  "zambia": "Zambia",
  "zimbabwe": "Zimbabwe",

  // Regional sentinels — count as "African" for screening, never as a country
  "africa": "__REGIONAL__",
  "african": "__REGIONAL__",
  "sub-saharan africa": "__REGIONAL__",
  "sub-saharan": "__REGIONAL__",
  "east africa": "__REGIONAL__",
  "west africa": "__REGIONAL__",
  "north africa": "__REGIONAL__",
  "southern africa": "__REGIONAL__",
  "central africa": "__REGIONAL__",
  "multinational": "__REGIONAL__",
  "regional": "__REGIONAL__",
};

// Pre-compute a Set of canonical country names (excluding regional sentinels)
const CANONICAL_COUNTRY_NAMES = new Set(
  Object.values(AFRICAN_COUNTRIES).filter((v) => v !== "__REGIONAL__"),
);

/**
 * Returns true if `text` resolves to a real African country (not just a region).
 * Use this to gate inserts — only candidates with a real country are accepted.
 */
export function isRecognizedCountry(text: string): boolean {
  const c = normalizeCountry(text);
  return c !== null && c !== "__REGIONAL__";
}

/**
 * Resolve free-text into a canonical country name, or return null.
 * Returns the sentinel "__REGIONAL__" for region-only matches so callers
 * can distinguish "country unknown but in Africa" from "not African at all".
 */
export function normalizeCountry(text: string): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Direct lookup
  const lower = trimmed.toLowerCase();
  if (AFRICAN_COUNTRIES[lower]) return AFRICAN_COUNTRIES[lower];

  // Already a canonical name?
  if (CANONICAL_COUNTRY_NAMES.has(trimmed)) return trimmed;

  // Fuzzy contains — e.g. "Energy project in Kenya, East Africa"
  for (const [alias, canonical] of Object.entries(AFRICAN_COUNTRIES)) {
    if (canonical === "__REGIONAL__") continue;
    // Word-boundary check to avoid "mali" matching "somalia"
    const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lower)) return canonical;
  }

  // Regional fallback (so isAfrican still returns true)
  for (const alias of Object.keys(AFRICAN_COUNTRIES)) {
    if (AFRICAN_COUNTRIES[alias] !== "__REGIONAL__") continue;
    if (lower.includes(alias)) return "__REGIONAL__";
  }

  return null;
}

/**
 * Broader "is this about Africa at all?" check.
 * True for any country match OR any regional term match.
 */
export function isAfrican(text: string): boolean {
  return normalizeCountry(text) !== null;
}

/**
 * Map a canonical country name to its UN sub-region.
 * Returns "Africa" as the default for regional/unknown.
 */
export function inferRegion(country: string): string {
  const c = country.toLowerCase();
  if (/nigeria|ghana|senegal|mali|côte|cote|ivory|cameroon|guinea|liberia|togo|benin|burkina|niger|gambia|sierra|mauritania|cabo verde/.test(c)) return "West Africa";
  if (/kenya|ethiopia|tanzania|uganda|rwanda|burundi|somalia|djibouti|eritrea|south sudan|seychelles|comoros|mauritius|madagascar/.test(c)) return "East Africa";
  if (/south africa|zimbabwe|zambia|mozambique|namibia|botswana|malawi|angola|lesotho|eswatini|swaziland/.test(c)) return "Southern Africa";
  if (/egypt|morocco|tunisia|algeria|libya|sudan/.test(c)) return "North Africa";
  if (/drc|democratic republic of the congo|republic of the congo|gabon|equatorial guinea|chad|central african|são tomé|sao tome/.test(c)) return "Central Africa";
  return "Africa";
}

// ── Project-name normalization for fuzzy dedup ──────────────────────────────

const STRIP_WORDS = [
  // Phase markers
  "phase 1", "phase 2", "phase 3", "phase 4", "phase 5",
  "phase i", "phase ii", "phase iii", "phase iv", "phase v",
  // Filler project words
  "project", "development", "initiative", "programme", "program",
  "scheme", "facility",
  // Legal suffixes
  "limited", "ltd", "pty", "inc", "plc", "sarl", "sa", "bv",
  "gmbh", "llc", "llp", "corp", "corporation",
];

const STRIP_PATTERN = new RegExp(
  "\\b(" +
    STRIP_WORDS
      .slice()
      .sort((a, b) => b.length - a.length)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|") +
    ")\\b",
  "gi",
);

/**
 * Lowercase, strip filler/legal words, keep only [a-z0-9- ], collapse whitespace.
 * Used by fuzzy dedup so "Noor Ouarzazate Phase II Project Ltd" and
 * "noor ouarzazate phase 2" hash to the same key.
 */
export function normalizeProjectName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(STRIP_PATTERN, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
