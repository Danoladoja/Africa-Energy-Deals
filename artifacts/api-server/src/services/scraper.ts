import Parser from "rss-parser";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, projectsTable, scraperRunsTable } from "@workspace/db";
import { eq, desc, or, ilike, and } from "drizzle-orm";
import { SEED_PROJECTS } from "./seeds/seed-data.js";

// ── PROXY FALLBACK ───────────────────────────────────────────────────────────
const PROXY_URL = "https://api.allorigins.win/raw?url=";

async function fetchFeedWithFallback(feedUrl: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(feedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) return await res.text();
    if (res.status === 403 || res.status === 401) throw new Error("blocked:" + res.status);
    throw new Error("Status code " + res.status);
  } catch (err: any) {
    if (err.message?.startsWith("blocked:") || err.message?.includes("403")) {
      const proxyRes = await fetch(PROXY_URL + encodeURIComponent(feedUrl), {
        signal: AbortSignal.timeout(25000),
      });
      if (proxyRes.ok) return await proxyRes.text();
      throw new Error("Proxy also failed: " + proxyRes.status);
    }
    throw err;
  }
}

const parser = new Parser({
  timeout: 25000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
  },
});

// ── SOURCE GROUPS ────────────────────────────────────────────────────────────

interface FeedConfig {
  name: string;
  url: string;
  category: string;
  skipCountryFilter?: boolean;
}

interface SourceGroup {
  name: string;
  description: string;
  feeds: FeedConfig[];
}

const SOURCE_GROUPS: SourceGroup[] = [
  {
    name: "Energy Media",
    description: "Specialist energy publications: ESI Africa, PV Magazine, Recharge News, EMBER",
    feeds: [
      { name: "ESI Africa", url: "https://www.esi-africa.com/feed/", category: "Energy Media", skipCountryFilter: true },
      { name: "PV Magazine Africa", url: "https://www.pv-magazine.com/category/africa/feed/", category: "Energy Media", skipCountryFilter: true },
      { name: "Recharge News", url: "https://www.rechargenews.com/rss", category: "Energy Media" },
      { name: "Energy Monitor", url: "https://www.energymonitor.ai/feed/", category: "Energy Media" },
      { name: "Carbon Brief", url: "https://www.carbonbrief.org/feed/", category: "Energy Media" },
      { name: "Power for All", url: "https://www.powerforall.org/feed/", category: "Energy Media", skipCountryFilter: true },
      { name: "PV Tech", url: "https://www.pv-tech.org/feed/", category: "Energy Media" },
    ],
  },
  {
    name: "Development Banks",
    description: "AfDB, IFC, World Bank, EBRD, MIGA — project disclosures and press releases",
    feeds: [
      { name: "World Bank Energy Blog", url: "https://www.worldbank.org/en/topic/energy/rss.xml", category: "Development Banks" },
      { name: "World Bank Africa Blog", url: "https://www.worldbank.org/en/region/afr/rss.xml", category: "Development Banks", skipCountryFilter: true },
      { name: "AfDB News", url: "https://www.afdb.org/en/rss", category: "Development Banks", skipCountryFilter: true },
      { name: "IFC Press Room", url: "https://pressroom.ifc.org/all/pages/RSS.aspx", category: "Development Banks" },
      { name: "MIGA News", url: "https://www.worldbank.org/en/topic/financialsector/rss.xml", category: "Development Banks", skipCountryFilter: true },
      { name: "EBRD Africa", url: "https://www.ebrd.com/rss/news.html", category: "Development Banks" },
    ],
  },
  {
    name: "Energy Agencies",
    description: "IEA, IRENA, SE4All, Power Africa, Climate Investment Funds",
    feeds: [
      { name: "IEA News", url: "https://www.iea.org/rss/news.xml", category: "Energy Agencies" },
      { name: "IRENA News", url: "https://www.irena.org/rss", category: "Energy Agencies" },
      { name: "SE4All Insights", url: "https://www.seforall.org/news/rss.xml", category: "Energy Agencies", skipCountryFilter: true },
      { name: "Power Africa (USAID)", url: "https://news.google.com/rss/search?q=power+africa+energy+project&hl=en-US&gl=US&ceid=US:en", category: "Energy Agencies", skipCountryFilter: true },
      { name: "Climate Investment Funds", url: "https://www.climateinvestmentfunds.org/news/rss", category: "Energy Agencies" },
    ],
  },
  {
    name: "Financial Institutions",
    description: "Proparco, DFC, Green Climate Fund, BII — climate finance and DFI deal news",
    feeds: [
      { name: "Proparco News", url: "https://www.proparco.fr/en/rss.xml", category: "Financial Institutions" },
      { name: "DFC (US Dev Finance)", url: "https://news.google.com/rss/search?q=DFC+africa+energy+finance&hl=en-US&gl=US&ceid=US:en", category: "Financial Institutions" },
      { name: "Green Climate Fund", url: "https://www.greenclimate.fund/rss.xml", category: "Financial Institutions" },
      { name: "BII (UK Investment)", url: "https://www.bii.co.uk/en/news/rss/", category: "Financial Institutions", skipCountryFilter: true },
    ],
  },
  {
    name: "Pan-African News",
    description: "AllAfrica, The Africa Report, African Business, Reuters Africa energy deals",
    feeds: [
      { name: "AllAfrica Energy", url: "https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf", category: "Pan-African News", skipCountryFilter: true },
      { name: "The Africa Report", url: "https://www.theafricareport.com/feed/", category: "Pan-African News", skipCountryFilter: true },
      { name: "African Business", url: "https://african.business/feed/", category: "Pan-African News", skipCountryFilter: true },
      { name: "The East African", url: "https://www.theeastafrican.co.ke/tea/rss.xml", category: "Pan-African News", skipCountryFilter: true },
      { name: "African Arguments", url: "https://africanarguments.org/feed/", category: "Pan-African News", skipCountryFilter: true },
      { name: "Reuters Business", url: "https://news.google.com/rss/search?q=africa+energy+investment+deal&hl=en-US&gl=US&ceid=US:en", category: "Pan-African News" },
    ],
  },
  {
    name: "Government & Regulators",
    description: "NERSA (SA), NERC (Nigeria), EPRA (Kenya), national energy ministry announcements",
    feeds: [
      { name: "Africa Energy Ministry Announcements", url: "https://news.google.com/rss/search?q=africa+energy+ministry+announcement+project&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
      { name: "REIPPPP South Africa", url: "https://news.google.com/rss/search?q=REIPPPP+south+africa+renewable+energy+bid+award&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
      { name: "Nigeria NERC Energy", url: "https://news.google.com/rss/search?q=NERC+nigeria+electricity+license+project+approval&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
      { name: "Kenya EPRA / REREC", url: "https://news.google.com/rss/search?q=REREC+OR+KETRACO+OR+EPRA+kenya+energy+project+2024&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
      { name: "Ghana Energy Commission", url: "https://news.google.com/rss/search?q=ghana+energy+commission+renewable+project+license&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
      { name: "Rwanda REG Energy", url: "https://news.google.com/rss/search?q=rwanda+energy+group+REG+solar+project+investment&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
      { name: "Ethiopia EEP Power", url: "https://news.google.com/rss/search?q=ethiopia+electric+power+hydropower+solar+project&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
      { name: "Egypt NREA Renewable", url: "https://news.google.com/rss/search?q=NREA+egypt+renewable+energy+project+tender+2024&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
      { name: "Morocco MASEN Projects", url: "https://news.google.com/rss/search?q=MASEN+morocco+solar+wind+energy+project&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
      { name: "Tanzania TANESCO REA", url: "https://news.google.com/rss/search?q=TANESCO+OR+REA+tanzania+energy+project+solar&hl=en-US&gl=US&ceid=US:en", category: "Government", skipCountryFilter: true },
    ],
  },
  {
    name: "Nigeria",
    description: "BusinessDay, Vanguard Energy, Premium Times, Guardian Nigeria",
    feeds: [
      { name: "BusinessDay Nigeria", url: "https://businessday.ng/feed/", category: "Nigeria", skipCountryFilter: true },
      { name: "Vanguard (Energy)", url: "https://www.vanguardngr.com/category/energy-power/feed/", category: "Nigeria", skipCountryFilter: true },
      { name: "Premium Times Nigeria", url: "https://www.premiumtimesng.com/feed/", category: "Nigeria", skipCountryFilter: true },
      { name: "The Guardian Nigeria", url: "https://guardian.ng/feed/", category: "Nigeria", skipCountryFilter: true },
      { name: "Nairametrics Energy", url: "https://nairametrics.com/feed/", category: "Nigeria", skipCountryFilter: true },
      { name: "ThisDay Live", url: "https://www.thisdaylive.com/index.php/feed/", category: "Nigeria", skipCountryFilter: true },
    ],
  },
  {
    name: "East Africa",
    description: "Business Daily Africa, Daily Nation, The Standard (Kenya), Tanzania, Ethiopia, Uganda, Rwanda",
    feeds: [
      { name: "Business Daily Africa", url: "https://www.businessdailyafrica.com/rss/", category: "Kenya", skipCountryFilter: true },
      { name: "Daily Nation Kenya", url: "https://nation.africa/kenya/rss.xml", category: "Kenya", skipCountryFilter: true },
      { name: "The Standard Kenya", url: "https://www.standardmedia.co.ke/rss/all", category: "Kenya", skipCountryFilter: true },
      { name: "The Reporter Ethiopia", url: "https://www.thereporterethiopia.com/rss.xml", category: "Ethiopia", skipCountryFilter: true },
      { name: "Addis Fortune Ethiopia", url: "https://addisfortune.net/feed/", category: "Ethiopia", skipCountryFilter: true },
      { name: "The Citizen Tanzania", url: "https://www.thecitizen.co.tz/tanzania/rss.xml", category: "Tanzania", skipCountryFilter: true },
      { name: "The Independent Uganda", url: "https://www.independent.co.ug/feed/", category: "Uganda", skipCountryFilter: true },
      { name: "Rwanda New Times", url: "https://www.newtimes.co.rw/feed/", category: "Rwanda", skipCountryFilter: true },
    ],
  },
  {
    name: "Southern & North Africa",
    description: "BusinessLive SA, Daily Maverick, Engineering News SA, Morocco, Egypt, Ghana",
    feeds: [
      { name: "BusinessLive SA", url: "https://www.businesslive.co.za/rss/", category: "South Africa", skipCountryFilter: true },
      { name: "Daily Maverick", url: "https://www.dailymaverick.co.za/feed/", category: "South Africa", skipCountryFilter: true },
      { name: "Engineering News SA", url: "https://www.engineeringnews.co.za/rss", category: "South Africa", skipCountryFilter: true },
      { name: "Fin24 Economy", url: "https://www.news24.com/fin24/economy/rss", category: "South Africa", skipCountryFilter: true },
      { name: "The Herald Zimbabwe", url: "https://www.herald.co.zw/feed/", category: "Zimbabwe", skipCountryFilter: true },
      { name: "New Era Namibia", url: "https://neweralive.na/feed/", category: "Namibia", skipCountryFilter: true },
      { name: "Egypt Independent", url: "https://egyptindependent.com/feed/", category: "Egypt", skipCountryFilter: true },
      { name: "Morocco World News", url: "https://www.moroccoworldnews.com/feed/", category: "Morocco", skipCountryFilter: true },
      { name: "Ghana Business News", url: "https://www.ghanabusinessnews.com/feed/", category: "Ghana", skipCountryFilter: true },
      { name: "Jeune Afrique Energie", url: "https://www.jeuneafrique.com/feed/", category: "Francophone Africa", skipCountryFilter: true },
    ],
  },
  {
    name: "EV & Clean Mobility",
    description: "Electric vehicle, e-mobility, and clean transport deals in Africa",
    feeds: [
      { name: "EV Africa (Google News)", url: "https://news.google.com/rss/search?q=electric+vehicle+africa+investment&hl=en-US&gl=US&ceid=US:en", category: "EV & Mobility" },
      { name: "E-Mobility Africa News", url: "https://news.google.com/rss/search?q=electric+mobility+africa+funding&hl=en-US&gl=US&ceid=US:en", category: "EV & Mobility" },
      { name: "Electric Bus Africa", url: "https://news.google.com/rss/search?q=electric+bus+africa+deal&hl=en-US&gl=US&ceid=US:en", category: "EV & Mobility" },
      { name: "TechCabal", url: "https://techcabal.com/feed/", category: "EV & Mobility", skipCountryFilter: true },
      { name: "Disrupt Africa", url: "https://disrupt-africa.com/feed/", category: "EV & Mobility", skipCountryFilter: true },
    ],
  },
  {
    name: "Recent Deals",
    description: "Targeted searches for 2024–2026 deals by technology: solar, wind, hydro, hydrogen, storage, nuclear, coal",
    feeds: [
      { name: "Africa Nuclear Energy", url: "https://news.google.com/rss/search?q=africa+nuclear+energy+power+plant+investment+2024+2025+2026&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
      { name: "Africa Battery Storage", url: "https://news.google.com/rss/search?q=africa+battery+storage+BESS+energy+storage+investment+2024+2025+2026&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
      { name: "Africa Green Hydrogen", url: "https://news.google.com/rss/search?q=africa+green+hydrogen+electrolysis+investment+project+2024+2025+2026&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
      { name: "Africa Grid Transmission", url: "https://news.google.com/rss/search?q=africa+electricity+grid+transmission+interconnection+investment+2024+2025&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
      { name: "Africa Solar Deals 2024-26", url: "https://news.google.com/rss/search?q=africa+solar+energy+deal+investment+2024+2025+2026&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
      { name: "Africa Wind Energy", url: "https://news.google.com/rss/search?q=africa+wind+farm+energy+project+financing+2024+2025&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
      { name: "Africa Hydro Projects", url: "https://news.google.com/rss/search?q=africa+hydropower+dam+project+financing+2024+2025&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
      { name: "Africa Gas LNG", url: "https://news.google.com/rss/search?q=africa+gas+LNG+energy+project+investment+2024+2025&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
      { name: "Africa Energy Finance", url: "https://news.google.com/rss/search?q=africa+energy+project+finance+loan+IFC+AfDB+2024+2025&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
      { name: "Africa Renewable IPP", url: "https://news.google.com/rss/search?q=africa+independent+power+producer+IPP+2024+megawatt&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
      { name: "Just Energy Transition", url: "https://news.google.com/rss/search?q=just+energy+transition+africa+JET-P+2024+2025&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
      { name: "COP28 COP29 Africa Energy", url: "https://news.google.com/rss/search?q=COP28+COP29+africa+energy+climate+fund+project&hl=en-US&gl=US&ceid=US:en", category: "Recent Deals", skipCountryFilter: true },
    ],
  },
  {
    name: "West & Central Africa",
    description: "Ghana, Cameroon, francophone Africa — BusinessNews Ghana, Graphic Online, Cameroon Tribune, Jeune Afrique, Confidentiel Afrique",
    feeds: [
      { name: "Ghana Business News", url: "https://www.ghanabusinessnews.com/feed/", category: "Ghana", skipCountryFilter: true },
      { name: "Graphic Online Ghana", url: "https://www.graphic.com.gh/feed/", category: "Ghana", skipCountryFilter: true },
      { name: "Cameroon Tribune", url: "https://www.cameroon-tribune.cm/rss.xml", category: "Cameroon", skipCountryFilter: true },
      { name: "Jeune Afrique", url: "https://www.jeuneafrique.com/feed/", category: "Francophone Africa", skipCountryFilter: true },
      { name: "Confidentiel Afrique", url: "https://www.confidentielafrique.com/feed/", category: "West Africa", skipCountryFilter: true },
    ],
  },
  {
    name: "Hydrogen & New Tech",
    description: "Green hydrogen, electrolysers, ammonia, and emerging clean tech projects in Africa",
    feeds: [
      { name: "Africa Green Hydrogen Projects", url: "https://news.google.com/rss/search?q=africa+green+hydrogen+project+investment&hl=en-US&gl=US&ceid=US:en", category: "Hydrogen", skipCountryFilter: true },
      { name: "Africa Hydrogen Ammonia", url: "https://news.google.com/rss/search?q=africa+hydrogen+ammonia+plant+investment+2024+2025&hl=en-US&gl=US&ceid=US:en", category: "Hydrogen", skipCountryFilter: true },
      { name: "Africa Electrolyzer", url: "https://news.google.com/rss/search?q=africa+electrolyzer+electrolyser+hydrogen+project&hl=en-US&gl=US&ceid=US:en", category: "Hydrogen", skipCountryFilter: true },
      { name: "H2 View Africa", url: "https://www.h2-view.com/feed/", category: "Hydrogen" },
      { name: "Hydrogen Insight", url: "https://www.hydrogeninsight.com/feed/", category: "Hydrogen" },
    ],
  },
];

// All feeds flat list for backward compat
const ALL_FEEDS: FeedConfig[] = SOURCE_GROUPS.flatMap((g) => g.feeds);

// ── RELEVANCE FILTERS ────────────────────────────────────────────────────────
const AFRICA_TERMS = [
  "nigeria", "kenya", "south africa", "ethiopia", "ghana", "tanzania", "egypt",
  "morocco", "mozambique", "senegal", "zambia", "uganda", "rwanda", "cameroon",
  "angola", "namibia", "botswana", "zimbabwe", "malawi", "burkina faso",
  "côte d'ivoire", "ivory coast", "cote d'ivoire", "sudan", "tunisia", "algeria",
  "libya", "drc", "congo", "sierra leone", "gambia", "mauritania", "niger", "chad",
  "somalia", "madagascar", "benin", "togo", "mali", "guinea", "african",
  "sub-saharan", "east africa", "west africa", "north africa", "southern africa",
];

const ENERGY_KEYWORDS = [
  "solar", "wind", "hydro", "hydropower", "geothermal", "power plant",
  "power station", "electricity", "megawatt", " mw ", "renewable energy",
  "gas plant", "gas turbine", "lng terminal", "lng plant", "lpg",
  "ipp", "independent power", "utility scale", "grid connection",
  "power purchase", "ppa", "coal plant", "oil refinery", "petroleum",
  "minigrids", "mini-grid", "off-grid", "battery storage", "energy storage",
  "transmission line", "distribution network", "electrification",
  "clean energy", "photovoltaic", "wind farm", "solar farm", "solar park",
  "wind park", "nuclear power", "biomass", "biogas", "tidal energy",
  "wave energy", "hydrogen plant", "green hydrogen", "ev charging",
  "electric vehicle charging",
];

const EXCLUDE_KEYWORDS = [
  "obituary", "sports", "fashion", "celebrity", "lifestyle", "entertainment",
  "recipe", "travel guide", "horoscope", "crossword", "opinion:", "editorial:",
  "book review", "movie review", "music review", "podcast", "tv show",
  "wedding", "divorce", "scandal", "arrest", "murder", "robbery",
  "football", "soccer", "cricket", "rugby", "tennis", "basketball",
  "stock price", "share price", "market close", "trading update",
];

// ── AFRICAN COUNTRY WHITELIST ─────────────────────────────────────────────────
const VALID_AFRICAN_COUNTRIES = new Set([
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
  "Cameroon", "Cape Verde", "Central African Republic", "Chad", "Comoros",
  "Congo", "Côte d'Ivoire", "Democratic Republic of the Congo",
  "Djibouti", "Egypt", "Equatorial Guinea", "Eritrea", "Eswatini",
  "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea", "Guinea-Bissau",
  "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi",
  "Mali", "Mauritania", "Mauritius", "Morocco", "Mozambique", "Namibia",
  "Niger", "Nigeria", "Rwanda", "São Tomé and Príncipe", "Senegal",
  "Seychelles", "Sierra Leone", "Somalia", "South Africa", "South Sudan",
  "Sudan", "Tanzania", "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe",
]);

const COUNTRY_ALIASES: Record<string, string> = {
  "drc": "Democratic Republic of the Congo",
  "dr congo": "Democratic Republic of the Congo",
  "dem. rep. congo": "Democratic Republic of the Congo",
  "congo-kinshasa": "Democratic Republic of the Congo",
  "ivory coast": "Côte d'Ivoire",
  "cote d'ivoire": "Côte d'Ivoire",
  "republic of congo": "Congo",
  "congo-brazzaville": "Congo",
  "swaziland": "Eswatini",
  "cabo verde": "Cape Verde",
  "the gambia": "Gambia",
};

function normalizeCountry(raw: string): string | null {
  const trimmed = raw.trim();
  if (VALID_AFRICAN_COUNTRIES.has(trimmed)) return trimmed;
  const alias = COUNTRY_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  return null;
}

// ── DEAL SIZE SANITY ──────────────────────────────────────────────────────────
const MAX_DEAL_SIZE_USD_MN = 5000;
const MIN_DEAL_SIZE_USD_MN = 0.1;

function sanitizeDealSize(value: unknown): number | null {
  if (typeof value !== "number" || isNaN(value)) return null;
  if (value <= 0) return null;
  if (value < MIN_DEAL_SIZE_USD_MN) return null;
  if (value > MAX_DEAL_SIZE_USD_MN) {
    console.warn(`[SCRAPER] Deal size $${value}M exceeds $5B cap — setting to null for manual review`);
    return null;
  }
  return Math.round(value * 100) / 100;
}

// ── NON-ENERGY EXCLUSION ──────────────────────────────────────────────────────
const NON_ENERGY_KEYWORDS = [
  // Generic development / social programs
  "social protection", "social safety net", "cash transfer",
  "skills training", "skills for", "education program", "school building", "university program",
  "health program", "health system", "covid-19", "covid response",
  "vaccination", "immunization", "nutrition", "food security",
  "water supply", "sanitation", "wash program",
  "governance", "judicial", "public sector reform", "public financial management",
  "digital identity", "digital transformation", "financial inclusion", "microfinance",
  "urban transformation", "housing program",
  "road construction", "highway", "bridge construction",
  "agriculture program", "agribusiness", "livestock", "poultry",
  "aquaculture", "fisheries management",
  "textile", "garment", "tourism development",
  "ida credit", "ida grant",
  // EV / transport companies (not energy infrastructure)
  "electric motorcycle", "e-motorcycle", "electric motorbike", "e-moto",
  "electric bus company", "e-bus company",
  "ride-hailing", "ride hailing",
  "ev startup", "ev company", "electric vehicle company",
  "electric vehicle financing", "e-mobility startup",
];

function isLikelyNonEnergy(projectName: string, description: string): boolean {
  const text = `${projectName} ${description}`.toLowerCase();
  return NON_ENERGY_KEYWORDS.some((kw) => text.includes(kw));
}

// ── TECHNOLOGY VALIDATION ─────────────────────────────────────────────────────
const VALID_TECHNOLOGIES = new Set([
  "Solar", "Wind", "Hydro", "Geothermal", "Oil & Gas",
  "Grid Expansion", "Battery & Storage", "Hydrogen", "Nuclear",
  "Bioenergy", "Clean Cooking", "Coal",
]);

// ── URL VALIDATION ────────────────────────────────────────────────────────────
function isHomepageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, "");
    return !path || path === "";
  } catch {
    return true; // Unparseable URL treated as invalid
  }
}

async function isUrlReachable(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    if (isHomepageUrl(url)) return false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "AfricaEnergyTracker/1.0 (link-checker)" },
    });
    clearTimeout(timeout);
    return res.ok || res.status === 301 || res.status === 302;
  } catch {
    return false;
  }
}

async function validateSourceUrl(rawUrl: string | null | undefined): Promise<string | null> {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  // Reject homepage-only URLs immediately — no HTTP request needed
  if (isHomepageUrl(trimmed)) {
    console.log(`[SCRAPER] URL rejected (homepage-only): ${trimmed}`);
    return null;
  }
  // Reachability check
  const reachable = await isUrlReachable(trimmed);
  if (!reachable) {
    console.log(`[SCRAPER] URL rejected (unreachable): ${trimmed}`);
    return null;
  }
  return trimmed;
}

function isRelevantArticle(item: Parser.Item, feed: FeedConfig): boolean {
  const text = `${item.title ?? ""} ${item.contentSnippet ?? ""}`.toLowerCase();
  if (EXCLUDE_KEYWORDS.some((k) => text.includes(k))) return false;
  const hasEnergy = ENERGY_KEYWORDS.some((k) => text.includes(k));
  if (!hasEnergy) return false;
  if (feed.skipCountryFilter) return true;
  return AFRICA_TERMS.some((t) => text.includes(t));
}

// ── NORMALIZERS ──────────────────────────────────────────────────────────────
// Returns null when the sector cannot be determined — NEVER defaults to Solar.
// Null causes the project to be flagged for human review instead of force-classified.
function normalizeSector(rawSector: string): string | null {
  const s = rawSector.trim().toLowerCase();

  const sectorMap: Record<string, string> = {
    // Solar
    "solar": "Solar", "solar pv": "Solar", "photovoltaic": "Solar", "pv": "Solar",
    "csp": "Solar", "concentrated solar": "Solar", "solar thermal": "Solar",
    "solar home": "Solar", "solar home system": "Solar",
    "mini-grid": "Solar", "mini grid": "Solar", "minigrid": "Solar",
    "solar mini-grid": "Solar", "off-grid solar": "Solar", "off grid solar": "Solar",
    "floating solar": "Solar", "agri-pv": "Solar",
    // Wind
    "wind": "Wind", "onshore wind": "Wind", "offshore wind": "Wind",
    "wind farm": "Wind", "wind power": "Wind", "wind park": "Wind",
    // Hydro — NOTE: pumped storage is Hydro, not Battery & Storage
    "hydro": "Hydro", "hydropower": "Hydro", "hydroelectric": "Hydro",
    "dam": "Hydro", "pumped storage": "Hydro", "pumped hydro": "Hydro",
    "pumped storage hydro": "Hydro", "pumped hydro storage": "Hydro",
    "phs": "Hydro", "run-of-river": "Hydro", "tidal": "Hydro",
    "wave energy": "Hydro", "small hydro": "Hydro",
    // Geothermal
    "geothermal": "Geothermal", "geothermal power": "Geothermal",
    "steam field": "Geothermal",
    // Oil & Gas (upstream, midstream, downstream, refining, LNG, LPG)
    "oil": "Oil & Gas", "oil & gas": "Oil & Gas", "oil and gas": "Oil & Gas",
    "petroleum": "Oil & Gas", "natural gas": "Oil & Gas", "gas": "Oil & Gas",
    "lng": "Oil & Gas", "flng": "Oil & Gas", "floating lng": "Oil & Gas",
    "refinery": "Oil & Gas", "gas-to-power": "Oil & Gas", "gas to power": "Oil & Gas",
    "ccgt": "Oil & Gas", "combined cycle": "Oil & Gas", "gas turbine": "Oil & Gas",
    "upstream": "Oil & Gas", "downstream": "Oil & Gas", "midstream": "Oil & Gas",
    "crude": "Oil & Gas", "lpg": "Oil & Gas", "pipeline": "Oil & Gas",
    "gas pipeline": "Oil & Gas", "gas plant": "Oil & Gas", "gas terminal": "Oil & Gas",
    "fpso": "Oil & Gas", "gas processing": "Oil & Gas",
    // Grid Expansion (transmission, distribution, interconnection)
    "grid expansion": "Grid Expansion", "grid": "Grid Expansion",
    "transmission": "Grid Expansion", "transmission line": "Grid Expansion",
    "interconnector": "Grid Expansion", "substation": "Grid Expansion",
    "distribution": "Grid Expansion", "power line": "Grid Expansion",
    "hvdc": "Grid Expansion", "grid extension": "Grid Expansion",
    "electrification": "Grid Expansion", "power pool": "Grid Expansion",
    "smart grid": "Grid Expansion", "electricity grid": "Grid Expansion",
    // Battery & Storage (BESS only — NOT pumped hydro)
    "battery & storage": "Battery & Storage", "battery storage": "Battery & Storage",
    "battery": "Battery & Storage", "bess": "Battery & Storage",
    "energy storage": "Battery & Storage", "storage": "Battery & Storage",
    "flywheel": "Battery & Storage",
    // Hydrogen
    "hydrogen": "Hydrogen", "green hydrogen": "Hydrogen", "green h2": "Hydrogen",
    "electrolyzer": "Hydrogen", "electrolyser": "Hydrogen", "electrolysis": "Hydrogen",
    "power-to-x": "Hydrogen", "green ammonia": "Hydrogen", "ammonia": "Hydrogen",
    "hydrogen plant": "Hydrogen", "hydrogen hub": "Hydrogen", "h2": "Hydrogen",
    // Nuclear
    "nuclear": "Nuclear", "nuclear power": "Nuclear",
    "smr": "Nuclear", "small modular reactor": "Nuclear",
    // Bioenergy (biomass, biogas, waste-to-energy, bagasse, cogeneration)
    "bioenergy": "Bioenergy", "biomass": "Bioenergy", "biogas": "Bioenergy",
    "waste-to-energy": "Bioenergy", "waste to energy": "Bioenergy",
    "biofuel": "Bioenergy", "bagasse": "Bioenergy", "cogeneration": "Bioenergy",
    "other renewables": "Bioenergy",
    // Clean Cooking (cookstoves and electric cooking ONLY — LPG distribution goes to Oil & Gas)
    "clean cooking": "Clean Cooking", "cookstove": "Clean Cooking",
    "improved stove": "Clean Cooking", "e-cooking": "Clean Cooking",
    "electric cooking": "Clean Cooking", "bioethanol": "Clean Cooking",
    "ethanol cooking": "Clean Cooking",
    // Coal
    "coal": "Coal", "coal-fired": "Coal", "coal plant": "Coal",
    "coal gasification": "Coal", "coal mine": "Coal",
    // Old taxonomy — remap to nearest canonical sector
    "grid & storage": "Grid Expansion",
    "grid and storage": "Grid Expansion",
    "thermal power": "Coal",
  };

  // Exact key match
  if (sectorMap[s]) return sectorMap[s];

  // Partial containment match (ordered most-specific to least)
  if (s.includes("pumped hydro") || s.includes("pumped storage")) return "Hydro";
  if (s.includes("solar") || s.includes("photovoltaic") || s.includes("mini-grid") || s.includes("minigrid")) return "Solar";
  if (s.includes("wind")) return "Wind";
  if (s.includes("geotherm")) return "Geothermal";
  if (s.includes("hydrogen") || s.includes("electroly") || s.includes("green ammonia")) return "Hydrogen";
  if (s.includes("bess") || s.includes("battery storage")) return "Battery & Storage";
  if (s.includes("hydro") || s.includes("dam") || s.includes("run-of-river")) return "Hydro";
  if (s.includes("transmission") || s.includes("substation") || s.includes("interconnect") || s.includes("grid expansion")) return "Grid Expansion";
  if (s.includes("lng") || s.includes("lpg") || s.includes("refin") || s.includes("petro") || s.includes("crude") || s.includes("fpso") || s.includes("gas turbine")) return "Oil & Gas";
  if (s.includes("coal")) return "Coal";
  if (s.includes("nuclear") || s.includes("smr")) return "Nuclear";
  if (s.includes("biomass") || s.includes("biogas") || s.includes("waste-to-energy") || s.includes("bioenergy") || s.includes("bagasse")) return "Bioenergy";
  if (s.includes("cookstove") || s.includes("clean cooking")) return "Clean Cooking";

  // CRITICAL: Do NOT default to Solar. Return null and flag for human review.
  return null;
}

function inferRegion(country: string): string {
  const regions: Record<string, string[]> = {
    "East Africa": ["kenya", "tanzania", "uganda", "rwanda", "ethiopia", "somalia", "mozambique", "madagascar", "malawi", "zambia", "zimbabwe", "burundi", "djibouti", "eritrea"],
    "West Africa": ["nigeria", "ghana", "senegal", "ivory coast", "côte d'ivoire", "cameroon", "sierra leone", "gambia", "mauritania", "niger", "mali", "burkina faso", "benin", "togo", "guinea", "liberia"],
    "North Africa": ["egypt", "morocco", "tunisia", "algeria", "libya", "sudan"],
    "Southern Africa": ["south africa", "botswana", "namibia", "angola", "lesotho", "swaziland", "eswatini"],
    "Central Africa": ["drc", "congo", "chad", "central african"],
  };
  const lower = country.toLowerCase();
  for (const [region, countries] of Object.entries(regions)) {
    if (countries.some((c) => lower.includes(c))) return region;
  }
  return "Africa";
}

// ── FUZZY DEDUPLICATION ──────────────────────────────────────────────────────
function tokenize(str: string): Set<string> {
  return new Set(
    str.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !["the", "and", "for", "project", "energy", "power", "phase"].includes(w))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

interface ExistingProject {
  id: number;
  projectName: string;
  country: string;
  technology: string;
}

function findFuzzyMatch(
  name: string,
  country: string,
  technology: string,
  existing: ExistingProject[],
): ExistingProject | null {
  const nameTokens = tokenize(name);
  const countryLower = country.toLowerCase();
  const techLower = technology.toLowerCase();

  for (const p of existing) {
    const pTokens = tokenize(p.projectName);
    const nameSim = jaccardSimilarity(nameTokens, pTokens);
    const sameCountry = p.country.toLowerCase().includes(countryLower) || countryLower.includes(p.country.toLowerCase());
    const sameTech = p.technology.toLowerCase() === techLower;

    // Strong name match + same country, OR very strong name match alone
    if ((nameSim >= 0.65 && sameCountry) || (nameSim >= 0.85 && sameTech)) {
      return p;
    }
  }
  return null;
}

// ── CLAUDE EXTRACTION ────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert analyst specialising in African energy infrastructure investment and project finance. Your job is to extract ONLY genuine energy/power infrastructure projects from news articles.

WHAT TO EXTRACT:
- Physical energy infrastructure: power plants, solar farms, wind parks, hydro dams, geothermal wells, gas pipelines, LNG terminals, refineries, battery storage facilities, transmission lines, hydrogen plants, clean cooking facilities, nuclear plants, substations, interconnectors
- Investment/financing deals for the above (loans, equity, grants, PPAs, concessions) — but ONLY when a specific physical project is named
- Government procurement tenders for specific energy capacity
- DFI project approvals specifically for energy infrastructure

WHAT TO REJECT (return empty array or skip the item):
- General development programs (World Bank/IDA social programs, health, education, agriculture, water/sanitation, governance, financial sector reform, IDA credits for non-energy purposes)
- EV companies, electric motorcycle startups, ride-hailing platforms — these are transport companies, NOT energy infrastructure
- Corporate fundraising announcements (Series A/B/C) that don't name a specific physical project being built
- Policy announcements without a named, physical project
- Climate finance pledges without a specific project
- Energy price news, fuel subsidy changes, tariff adjustments
- Opinion pieces, market commentary, conference announcements, awards, rankings
- Agriculture, fisheries, livestock, textiles, tourism, housing programs
- Digital transformation, skills training, education programs
- "Africa needs $100B in energy" style commentary — NOT a project

SECTOR CLASSIFICATION — use exactly one of these 12 values:
"Solar" | "Wind" | "Hydro" | "Geothermal" | "Oil & Gas" | "Grid Expansion" | "Battery & Storage" | "Hydrogen" | "Nuclear" | "Bioenergy" | "Clean Cooking" | "Coal"

Sector rules (read carefully — these distinctions matter):
- Solar: solar PV farms, CSP, solar home systems, mini-grids where solar is the primary source, floating solar, agri-PV
- Wind: onshore and offshore wind farms only
- Hydro: dams, run-of-river, pumped-storage hydropower (PHS), small hydro, tidal, wave energy
- Geothermal: geothermal wells, steam fields, geothermal plants
- Oil & Gas: upstream exploration, LNG, FLNG, refineries, gas-to-power plants, CCGT, pipelines, LPG distribution
- Grid Expansion: transmission lines, interconnectors between countries, substations, distribution upgrades, rural electrification (grid extension), HVDC, power pools
- Battery & Storage: standalone BESS, battery procurement programs, flywheel storage. NOT pumped-storage hydro (that is Hydro).
- Hydrogen: green/blue hydrogen plants, electrolyzers, ammonia-from-hydrogen, power-to-X
- Nuclear: nuclear power plants, SMRs
- Bioenergy: biomass power, biogas digesters, waste-to-energy, bagasse cogeneration
- Clean Cooking: improved cookstove programs, electric cooking programs, bioethanol for cooking. LPG distribution goes to Oil & Gas.
- Coal: coal-fired power plants only

CRITICAL DISTINCTIONS:
- "100 MW Solar + 50 MWh Battery hybrid" → Solar (battery is ancillary)
- "250 MWh BESS co-located with solar" → Battery & Storage (storage is the primary asset)
- "Grid-connected solar farm" → Solar (the generation asset)
- "Transmission line to connect solar farm" → Grid Expansion (the transmission asset)
- "Pumped-storage hydropower plant" → Hydro (NOT Battery & Storage)
- "Electric motorcycle company raises $10M" → REJECT (transport company, not energy)
- "EV bus fleet financing" → REJECT (transport, not energy infrastructure)

COUNTRY RULE: Must be a single African country name. NEVER a region. If multi-country, use primary host country.

DEAL SIZE RULE (dealSizeUsdMn in USD millions):
- "$1.2 billion" → 1200; "$500M" → 500; "$50,000" → 0.05
- NEVER above 5000. Multi-country program budgets → null.

CONFIDENCE (0.0 to 1.0):
- Score below 0.5 if: the project might be non-African, it's actually a corporate event or policy announcement, you're unsure about the technology, or the article is vague about what's actually being built.
- NEVER default a vague article to Solar. If you can't classify it, score it below 0.5.

Return a JSON array. If nothing qualifies, return []. ONLY valid JSON, no markdown.

Each object:
{
  "projectName": string,        // Specific, unique name. NEVER generic. If no named project, return [].
  "country": string,            // Single African country
  "region": string,             // "East Africa" | "West Africa" | "North Africa" | "Southern Africa" | "Central Africa"
  "technology": string,         // One of the 12 sectors above
  "dealSizeUsdMn": number|null,
  "developer": string|null,
  "financiers": string|null,    // Comma-separated
  "dfiInvolvement": string|null,
  "offtaker": string|null,
  "dealStage": string|null,     // "Announced"|"Mandated"|"Financial Close"|"Construction"|"Commissioned"|"Suspended"
  "status": string,             // "announced"|"under construction"|"financing closed"|"operational"|"tender"
  "description": string,        // 2-3 factual sentences about the physical energy project
  "capacityMw": number|null,    // MW (power capacity, not MWh)
  "announcedYear": number|null,
  "financialCloseDate": string|null,  // YYYY-MM-DD
  "sourceUrl": string|null,     // EXACT article URL. Never fabricated. Never a homepage.
  "newsUrl": string|null,       // Same as sourceUrl
  "confidence": number          // 0.0-1.0
}`;

interface ExtractedProject {
  projectName: string;
  country: string;
  region?: string;
  technology: string;
  dealSizeUsdMn?: number | null;
  developer?: string | null;
  financiers?: string | null;
  dfiInvolvement?: string | null;
  offtaker?: string | null;
  dealStage?: string | null;
  status?: string;
  description?: string | null;
  capacityMw?: number | null;
  announcedYear?: number | null;
  financialCloseDate?: string | null;
  sourceUrl?: string | null;
  newsUrl?: string | null;
  confidence?: number;
}

async function extractProjectsFromBatch(
  articles: Array<Parser.Item & { feedName: string }>,
): Promise<ExtractedProject[]> {
  if (articles.length === 0) return [];

  const articlesSummary = articles
    .map(
      (item, i) =>
        `[${i + 1}] Title: ${item.title ?? "Untitled"}\nSource: ${item.feedName}\nURL: ${item.link ?? ""}\nDate: ${item.pubDate ?? "Unknown"}\nSummary: ${(item.contentSnippet ?? "").slice(0, 500)}`,
    )
    .join("\n\n---\n\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Extract Africa energy investment projects from these articles:\n\n${articlesSummary}`,
      },
    ],
  });

  const block = message.content[0];
  const rawContent = block.type === "text" ? block.text : "[]";

  try {
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as ExtractedProject[];
  } catch {
    // ignore parse errors
  }
  return [];
}

// ── STATE ────────────────────────────────────────────────────────────────────
export interface ScraperProgress {
  stage: "fetching" | "analyzing" | "saving" | "done" | "error";
  message: string;
  processed?: number;
  discovered?: number;
  updated?: number;
  flagged?: number;
  feedsTotal?: number;
  feedsDone?: number;
}

export interface ScraperResult {
  processed: number;
  discovered: number;
  updated: number;
  flagged: number;
  feedsReached: number;
  feedsFailed: number;
  errors: string[];
  runAt: Date;
}

let lastRunAt: Date | null = null;
let lastResult: ScraperResult | null = null;
let isRunning = false;
const sourceRunning = new Set<string>();

export function getScraperStatus() {
  return { lastRunAt, isRunning, lastResult };
}

export function getFeedList() {
  return ALL_FEEDS.map((f) => ({ name: f.name, category: f.category }));
}

export function getSourceGroups() {
  return SOURCE_GROUPS.map((g) => ({
    name: g.name,
    description: g.description,
    feedCount: g.feeds.length,
    isRunning: sourceRunning.has(g.name),
  }));
}

export function getRawSourceGroups() {
  return SOURCE_GROUPS;
}

// ── CORE RUNNER FOR A SOURCE GROUP ───────────────────────────────────────────
export async function runSourceGroup(
  groupName: string,
  triggeredBy: "manual" | "schedule" = "manual",
  onProgress?: (p: ScraperProgress) => void,
): Promise<ScraperResult> {
  const group = SOURCE_GROUPS.find((g) => g.name === groupName);
  if (!group) throw new Error(`Unknown source group: ${groupName}`);
  if (sourceRunning.has(groupName)) throw new Error(`Source group "${groupName}" is already running`);

  sourceRunning.add(groupName);

  const [runRow] = await db.insert(scraperRunsTable).values({
    sourceName: groupName,
    startedAt: new Date(),
    triggeredBy,
  }).returning();

  const result: ScraperResult = {
    processed: 0, discovered: 0, updated: 0, flagged: 0,
    feedsReached: 0, feedsFailed: 0, errors: [], runAt: new Date(),
  };

  try {
    onProgress?.({
      stage: "fetching",
      message: `Scanning ${group.feeds.length} feeds in "${groupName}"...`,
      feedsTotal: group.feeds.length, feedsDone: 0,
    });

    // Load existing projects for deduplication
    const existing = await db
      .select({ id: projectsTable.id, projectName: projectsTable.projectName, country: projectsTable.country, technology: projectsTable.technology })
      .from(projectsTable);

    const existingNames = new Map(existing.map((p) => [p.projectName.toLowerCase(), p.id]));

    const relevantArticles: Array<Parser.Item & { feedName: string }> = [];
    let feedsDone = 0;

    for (const feed of group.feeds) {
      try {
        let parsed;
        try {
          parsed = await parser.parseURL(feed.url);
        } catch (directErr: any) {
          if (directErr.message?.includes("403") || directErr.message?.includes("401")) {
            const xmlText = await fetchFeedWithFallback(feed.url);
            parsed = await parser.parseString(xmlText);
          } else {
            throw directErr;
          }
        }
        const relevant = parsed.items.filter((item) => isRelevantArticle(item, feed)).slice(0, 3);
        relevantArticles.push(...relevant.map((item) => ({ ...item, feedName: feed.name })));
        result.feedsReached++;
        feedsDone++;
        if (relevant.length > 0) {
          onProgress?.({
            stage: "fetching",
            message: `✓ ${feed.name}: ${relevant.length} article${relevant.length !== 1 ? "s" : ""}`,
            feedsTotal: group.feeds.length, feedsDone,
          });
        }
      } catch (err) {
        result.feedsFailed++;
        feedsDone++;
        const msg = `✗ ${feed.name}: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`;
        result.errors.push(msg);
        onProgress?.({ stage: "fetching", message: msg, feedsTotal: group.feeds.length, feedsDone });
      }
    }

    result.processed = relevantArticles.length;

    if (relevantArticles.length === 0) {
      onProgress?.({ stage: "done", message: "No new relevant articles found.", discovered: 0 });
    } else {
      const BATCH_SIZE = 15;
      const batches: Array<typeof relevantArticles> = [];
      for (let i = 0; i < relevantArticles.length; i += BATCH_SIZE) {
        batches.push(relevantArticles.slice(i, i + BATCH_SIZE));
      }

      onProgress?.({
        stage: "analyzing",
        message: `Analysing ${relevantArticles.length} articles across ${batches.length} batch${batches.length !== 1 ? "es" : ""} with Claude...`,
      });

      const allProjects: ExtractedProject[] = [];
      for (let b = 0; b < batches.length; b++) {
        onProgress?.({
          stage: "analyzing",
          message: `AI batch ${b + 1}/${batches.length}: processing ${batches[b].length} articles...`,
        });
        try {
          const extracted = await extractProjectsFromBatch(batches[b]);
          allProjects.push(...extracted);
        } catch (err) {
          result.errors.push(`AI batch ${b + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      onProgress?.({
        stage: "saving",
        message: `AI identified ${allProjects.length} candidate project${allProjects.length !== 1 ? "s" : ""}. Deduplicating and saving...`,
      });

      for (const project of allProjects) {
        const name = String(project.projectName ?? "").trim();
        const rawCountry = String(project.country ?? "").trim();
        const description = String(project.description ?? "");

        // Basic field validation
        if (!name || name.length < 5) {
          console.log(`[SCRAPER] Rejected: Name too short — "${name}"`);
          continue;
        }

        const confidence = typeof project.confidence === "number" ? project.confidence : 0.7;
        if (confidence < 0.65) {
          console.log(`[SCRAPER] Rejected low-confidence (${confidence.toFixed(2)}): "${name}"`);
          continue;
        }
        const isHighConfidence = confidence >= 0.85;

        // Country validation (all paths)
        const country = normalizeCountry(rawCountry);
        if (!country) {
          console.log(`[SCRAPER] Rejected: Non-African country "${rawCountry}" for project "${name}"`);
          continue;
        }

        // Non-energy exclusion
        if (isLikelyNonEnergy(name, description)) {
          console.log(`[SCRAPER] Rejected: Non-energy project "${name}"`);
          continue;
        }

        // Technology: normalize to canonical sector — null means unclassifiable, reject
        const rawTech = String(project.technology ?? "").trim();
        const technology = normalizeSector(rawTech);
        if (!technology) {
          console.log(`[SCRAPER] Rejected: Unclassifiable technology "${rawTech}" for "${name}" — add to normalizeSector map or review manually`);
          continue;
        }

        // Sanitized deal size
        const cleanDealSize = sanitizeDealSize(project.dealSizeUsdMn);

        // Check exact name match first
        if (existingNames.has(name.toLowerCase())) {
          const existingId = existingNames.get(name.toLowerCase())!;
          try {
            await db.update(projectsTable).set({
              ...(project.developer && { developer: project.developer }),
              ...(project.financiers && { financiers: project.financiers }),
              ...(project.dfiInvolvement && { dfiInvolvement: project.dfiInvolvement }),
              ...(project.offtaker && { offtaker: project.offtaker }),
              ...(project.dealStage && { dealStage: project.dealStage }),
              ...(project.financialCloseDate && { financialCloseDate: project.financialCloseDate }),
              ...(project.sourceUrl && { newsUrl: project.sourceUrl }),
              ...(cleanDealSize !== null && { dealSizeUsdMn: cleanDealSize }),
              ...(typeof project.capacityMw === "number" && { capacityMw: project.capacityMw }),
              confidenceScore: confidence,
              extractionSource: groupName,
            }).where(eq(projectsTable.id, existingId));
            result.updated++;
          } catch {
            // ignore update errors
          }
          continue;
        }

        // Fuzzy match check
        const fuzzyMatch = findFuzzyMatch(name, country, technology, existing);
        if (fuzzyMatch) {
          try {
            await db.update(projectsTable).set({
              ...(project.developer && { developer: project.developer }),
              ...(project.financiers && { financiers: project.financiers }),
              ...(project.dfiInvolvement && { dfiInvolvement: project.dfiInvolvement }),
              ...(project.offtaker && { offtaker: project.offtaker }),
              ...(project.dealStage && { dealStage: project.dealStage }),
              ...(project.financialCloseDate && { financialCloseDate: project.financialCloseDate }),
              ...(project.sourceUrl && { newsUrl: project.sourceUrl }),
              ...(cleanDealSize !== null && { dealSizeUsdMn: cleanDealSize }),
              ...(typeof project.capacityMw === "number" && { capacityMw: project.capacityMw }),
              confidenceScore: confidence,
              extractionSource: groupName,
            }).where(eq(projectsTable.id, fuzzyMatch.id));
            result.updated++;
          } catch {
            // ignore
          }
          continue;
        }

        // New project — insert with all validations passed
        try {
          // Validate source URL before inserting
          const rawSourceUrl = typeof project.sourceUrl === "string" ? project.sourceUrl : null;
          const validatedUrl = await validateSourceUrl(rawSourceUrl);
          const baseStatus = isHighConfidence ? "approved" : "pending";
          const insertReviewStatus = validatedUrl ? baseStatus : "needs_source";

          await db.insert(projectsTable).values({
            projectName: name,
            country,
            region: String(project.region ?? inferRegion(country)),
            technology,
            dealSizeUsdMn: cleanDealSize,
            investors: project.financiers ?? null,
            status: String(project.status ?? "announced"),
            description: description || null,
            capacityMw: typeof project.capacityMw === "number" ? project.capacityMw : null,
            announcedYear: typeof project.announcedYear === "number" ? project.announcedYear : new Date().getFullYear(),
            closedYear: null,
            latitude: null,
            longitude: null,
            sourceUrl: validatedUrl,
            newsUrl: validatedUrl,
            isAutoDiscovered: true,
            reviewStatus: insertReviewStatus,
            discoveredAt: new Date(),
            developer: project.developer ?? null,
            financiers: project.financiers ?? null,
            dfiInvolvement: project.dfiInvolvement ?? null,
            offtaker: project.offtaker ?? null,
            dealStage: project.dealStage ?? null,
            financialCloseDate: project.financialCloseDate ?? null,
            confidenceScore: confidence,
            extractionSource: groupName,
          });
          existingNames.set(name.toLowerCase(), -1);
          existing.push({ id: -1, projectName: name, country, technology });
          result.discovered++;
          if (!isHighConfidence) result.flagged++;
        } catch (err) {
          result.errors.push(`Insert failed for "${name}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      onProgress?.({
        stage: "done",
        message: `Complete — ${result.discovered} new, ${result.updated} updated, ${result.flagged} flagged for review.`,
        processed: result.processed,
        discovered: result.discovered,
        updated: result.updated,
        flagged: result.flagged,
      });
    }

    // Update scraper_runs record
    await db.update(scraperRunsTable).set({
      completedAt: new Date(),
      recordsFound: result.processed,
      recordsInserted: result.discovered,
      recordsUpdated: result.updated,
      flaggedForReview: result.flagged,
      errors: result.errors.length > 0 ? JSON.stringify(result.errors.slice(0, 10)) : null,
    }).where(eq(scraperRunsTable.id, runRow.id));

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    onProgress?.({ stage: "error", message: `Scraper error: ${msg}` });
    await db.update(scraperRunsTable).set({
      completedAt: new Date(),
      errors: JSON.stringify([msg]),
    }).where(eq(scraperRunsTable.id, runRow.id)).catch(() => {});
  } finally {
    sourceRunning.delete(groupName);
  }

  return result;
}

// ── MAIN RUNNER (all sources) ────────────────────────────────────────────────
export async function runScraper(
  onProgress?: (p: ScraperProgress) => void,
): Promise<ScraperResult> {
  if (isRunning) throw new Error("Scraper is already running");
  isRunning = true;

  const combined: ScraperResult = {
    processed: 0, discovered: 0, updated: 0, flagged: 0,
    feedsReached: 0, feedsFailed: 0, errors: [], runAt: new Date(),
  };

  try {
    for (const group of SOURCE_GROUPS) {
      if (sourceRunning.has(group.name)) continue;
      try {
        const groupResult = await runSourceGroup(group.name, "schedule", onProgress);
        combined.processed += groupResult.processed;
        combined.discovered += groupResult.discovered;
        combined.updated += groupResult.updated;
        combined.flagged += groupResult.flagged;
        combined.feedsReached += groupResult.feedsReached;
        combined.feedsFailed += groupResult.feedsFailed;
        combined.errors.push(...groupResult.errors);
      } catch (err) {
        combined.errors.push(`Group "${group.name}" failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    lastRunAt = new Date();
    lastResult = combined;
  } finally {
    isRunning = false;
  }

  return combined;
}

// ── SEED DATA IMPORT ─────────────────────────────────────────────────────────
export interface SeedImportResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  log: string[];
}

export async function runSeedImport(
  onProgress?: (msg: string) => void,
): Promise<SeedImportResult> {
  const result: SeedImportResult = {
    total: SEED_PROJECTS.length,
    inserted: 0, updated: 0, skipped: 0,
    errors: [], log: [],
  };

  const [runRow] = await db.insert(scraperRunsTable).values({
    sourceName: "Seed Data Import",
    startedAt: new Date(),
    triggeredBy: "manual",
  }).returning();

  const existing = await db
    .select({ id: projectsTable.id, projectName: projectsTable.projectName, country: projectsTable.country, technology: projectsTable.technology })
    .from(projectsTable);

  const existingNames = new Map(existing.map((p) => [p.projectName.toLowerCase(), p.id]));

  for (const seed of SEED_PROJECTS) {
    const name = seed.projectName.trim();
    const country = seed.country.trim();
    const technology = normalizeSector(seed.technology) ?? seed.technology; // Seed data is curated

    try {
      // 1) Exact name match → UPDATE with non-null seed fields
      if (existingNames.has(name.toLowerCase())) {
        const existingId = existingNames.get(name.toLowerCase())!;
        await db.update(projectsTable).set({
          ...(seed.dealSizeUsdMn != null && { dealSizeUsdMn: seed.dealSizeUsdMn }),
          ...(seed.capacityMw != null && { capacityMw: seed.capacityMw }),
          ...(seed.developer && { developer: seed.developer }),
          ...(seed.investors && { investors: seed.investors, financiers: seed.investors }),
          ...(seed.description && { description: seed.description }),
          ...(seed.latitude != null && { latitude: seed.latitude }),
          ...(seed.longitude != null && { longitude: seed.longitude }),
          ...(seed.sourceUrl && { sourceUrl: seed.sourceUrl }),
          ...(seed.announcedYear != null && { announcedYear: seed.announcedYear }),
          confidenceScore: 0.95,
          extractionSource: "seed",
        }).where(eq(projectsTable.id, existingId));
        const msg = `UPDATED: ${name} (matched existing ID ${existingId})`;
        result.log.push(msg); result.updated++;
        onProgress?.(msg);
        continue;
      }

      // 2) Fuzzy match → UPDATE existing
      const fuzzy = findFuzzyMatch(name, country, technology, existing);
      if (fuzzy) {
        await db.update(projectsTable).set({
          ...(seed.dealSizeUsdMn != null && { dealSizeUsdMn: seed.dealSizeUsdMn }),
          ...(seed.capacityMw != null && { capacityMw: seed.capacityMw }),
          ...(seed.developer && { developer: seed.developer }),
          ...(seed.investors && { investors: seed.investors, financiers: seed.investors }),
          ...(seed.description && { description: seed.description }),
          ...(seed.latitude != null && { latitude: seed.latitude }),
          ...(seed.longitude != null && { longitude: seed.longitude }),
          ...(seed.sourceUrl && { sourceUrl: seed.sourceUrl }),
          ...(seed.announcedYear != null && { announcedYear: seed.announcedYear }),
          confidenceScore: 0.95,
          extractionSource: "seed",
        }).where(eq(projectsTable.id, fuzzy.id));
        const msg = `UPDATED: ${name} (fuzzy match → ID ${fuzzy.id} "${fuzzy.projectName}")`;
        result.log.push(msg); result.updated++;
        onProgress?.(msg);
        continue;
      }

      // 3) New project → INSERT
      await db.insert(projectsTable).values({
        projectName: name,
        country,
        region: seed.region ?? inferRegion(country),
        technology,
        status: seed.status ?? "Development",
        dealSizeUsdMn: seed.dealSizeUsdMn ?? null,
        capacityMw: seed.capacityMw ?? null,
        announcedYear: seed.announcedYear ?? null,
        description: seed.description ?? null,
        latitude: seed.latitude ?? null,
        longitude: seed.longitude ?? null,
        developer: seed.developer ?? null,
        investors: seed.investors ?? null,
        financiers: seed.investors ?? null,
        sourceUrl: seed.sourceUrl ?? null,
        newsUrl: seed.sourceUrl ?? null,
        isAutoDiscovered: false,
        reviewStatus: "approved",
        discoveredAt: new Date(),
        confidenceScore: 0.95,
        extractionSource: "seed",
      });
      existingNames.set(name.toLowerCase(), -1);
      existing.push({ id: -1, projectName: name, country, technology });
      const msg = `INSERTED: ${name} (${country})`;
      result.log.push(msg); result.inserted++;
      onProgress?.(msg);
    } catch (err) {
      const msg = `ERROR: ${name} — ${err instanceof Error ? err.message : String(err)}`;
      result.log.push(msg); result.errors.push(msg);
      onProgress?.(msg);
    }
  }

  await db.update(scraperRunsTable).set({
    completedAt: new Date(),
    recordsFound: result.total,
    recordsInserted: result.inserted,
    recordsUpdated: result.updated,
    flaggedForReview: 0,
    errors: result.errors.length > 0 ? JSON.stringify(result.errors.slice(0, 10)) : null,
  }).where(eq(scraperRunsTable.id, runRow.id));

  return result;
}

// ── WORLD BANK API ADAPTER ───────────────────────────────────────────────────
const WB_AFRICA_COUNTRY_CODES = [
  "DZ","AO","BJ","BW","BF","BI","CM","CV","CF","TD","KM","CD","CG","CI","DJ",
  "EG","GQ","ER","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY","MG","MW",
  "ML","MR","MU","MA","MZ","NA","NE","NG","RW","ST","SN","SL","SO","ZA","SS",
  "SD","SZ","TZ","TG","TN","UG","ZM","ZW",
];

const WB_ENERGY_SECTOR_CODES = [
  "EX", // Energy and Extractives
  "EG", // Other Energy and Extractives  
  "EP", // Energy (general)
];

interface WBProject {
  id: string;
  project_name: string;
  countryname: string;
  country_code: string;
  totalamt: number;
  boardapprovaldate: string;
  status: string;
  sector1?: { Name: string };
  sector_exact?: string[];
  objective?: string;
}

export async function runWorldBankAdapter(
  onProgress?: (msg: string) => void,
): Promise<SeedImportResult> {
  const result: SeedImportResult = {
    total: 0, inserted: 0, updated: 0, skipped: 0, errors: [], log: [],
  };

  const [runRow] = await db.insert(scraperRunsTable).values({
    sourceName: "World Bank API",
    startedAt: new Date(),
    triggeredBy: "manual",
  }).returning();

  try {
    onProgress?.("Fetching World Bank Africa energy projects...");

    const WB_API = "https://search.worldbank.org/api/v3/projects";
    const params = new URLSearchParams({
      format: "json",
      fl: "id,project_name,countryname,country_code,totalamt,boardapprovaldate,status,sector1,objective",
      regionname: "Africa",
      sectorname: "Energy",
      rows: "250",
      os: "0",
    });

    let projects: WBProject[] = [];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${WB_API}?${params}`, {
        headers: { "Accept": "application/json", "User-Agent": "AfriEnergyTracker/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json() as { projects?: { [key: string]: WBProject } };
        if (data.projects) {
          projects = Object.values(data.projects).filter(
            (p) => p && p.project_name && p.countryname
          );
        }
      } else {
        throw new Error(`World Bank API returned ${res.status}`);
      }
    } catch (fetchErr) {
      const msg = `World Bank API fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`;
      result.errors.push(msg);
      onProgress?.(msg);
    }

    result.total = projects.length;
    onProgress?.(`Found ${projects.length} World Bank energy projects in Africa`);

    if (projects.length === 0) {
      await db.update(scraperRunsTable).set({
        completedAt: new Date(),
        recordsFound: 0, recordsInserted: 0, recordsUpdated: 0, flaggedForReview: 0,
        errors: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
      }).where(eq(scraperRunsTable.id, runRow.id));
      return result;
    }

    const existing = await db
      .select({ id: projectsTable.id, projectName: projectsTable.projectName, country: projectsTable.country, technology: projectsTable.technology })
      .from(projectsTable);
    const existingNames = new Map(existing.map((p) => [p.projectName.toLowerCase(), p.id]));

    for (const p of projects) {
      const name = (p.project_name ?? "").trim();
      const country = (p.countryname ?? "").replace(/\s*\([^)]*\)/g, "").trim();
      if (!name || !country || name.length < 5) continue;

      // Derive technology from sector name — skip if unclassifiable (non-energy World Bank project)
      const sectorRaw = p.sector1?.Name ?? p.sector_exact?.[0] ?? "";
      const technology = normalizeSector(sectorRaw);
      if (!technology) {
        console.log(`[SCRAPER] World Bank project skipped: non-energy sector "${sectorRaw}" for "${name}"`);
        continue;
      }

      // Deal size: World Bank amounts are in USD thousands → convert to millions
      const dealSizeUsdMn = p.totalamt && p.totalamt > 0 ? Math.round(p.totalamt / 1000) : null;

      // Status mapping
      const statusMap: Record<string, string> = {
        "Active": "Under Construction",
        "Closed": "Operational",
        "Pipeline": "Announced",
        "Dropped": "Suspended",
      };
      const status = statusMap[p.status ?? ""] ?? "Development";

      const announcedYear = p.boardapprovaldate
        ? parseInt(p.boardapprovaldate.slice(0, 4), 10)
        : null;

      const description = p.objective
        ? p.objective.slice(0, 300)
        : `World Bank ${status.toLowerCase()} energy project in ${country}.`;

      try {
        if (existingNames.has(name.toLowerCase())) {
          const eid = existingNames.get(name.toLowerCase())!;
          await db.update(projectsTable).set({
            ...(dealSizeUsdMn != null && { dealSizeUsdMn }),
            investors: "World Bank",
            dfiInvolvement: "World Bank",
            confidenceScore: 0.80,
            extractionSource: "world-bank-api",
          }).where(eq(projectsTable.id, eid));
          result.log.push(`UPDATED: ${name} (WB ID ${p.id})`);
          result.updated++;
          onProgress?.(`UPDATED: ${name}`);
          continue;
        }

        const fuzzy = findFuzzyMatch(name, country, technology, existing);
        if (fuzzy) {
          await db.update(projectsTable).set({
            ...(dealSizeUsdMn != null && { dealSizeUsdMn }),
            investors: "World Bank",
            dfiInvolvement: "World Bank",
            confidenceScore: 0.80,
            extractionSource: "world-bank-api",
          }).where(eq(projectsTable.id, fuzzy.id));
          result.log.push(`UPDATED: ${name} (fuzzy → ID ${fuzzy.id})`);
          result.updated++;
          onProgress?.(`UPDATED (fuzzy): ${name}`);
          continue;
        }

        await db.insert(projectsTable).values({
          projectName: name,
          country,
          region: inferRegion(country),
          technology,
          status,
          dealSizeUsdMn,
          announcedYear: Number.isNaN(announcedYear ?? NaN) ? null : announcedYear,
          description,
          investors: "World Bank",
          financiers: "World Bank",
          dfiInvolvement: "World Bank",
          isAutoDiscovered: true,
          reviewStatus: "pending",
          discoveredAt: new Date(),
          confidenceScore: 0.80,
          extractionSource: "world-bank-api",
          sourceUrl: `https://projects.worldbank.org/en/projects-operations/project-detail/${p.id}`,
          newsUrl: `https://projects.worldbank.org/en/projects-operations/project-detail/${p.id}`,
        });
        existingNames.set(name.toLowerCase(), -1);
        existing.push({ id: -1, projectName: name, country, technology });
        result.log.push(`INSERTED: ${name} (${country})`);
        result.inserted++;
        onProgress?.(`INSERTED: ${name} (${country})`);
      } catch (err) {
        const msg = `ERROR: ${name} — ${err instanceof Error ? err.message : String(err)}`;
        result.errors.push(msg);
        result.skipped++;
        onProgress?.(msg);
      }
    }
  } catch (outerErr) {
    const msg = `World Bank adapter error: ${outerErr instanceof Error ? outerErr.message : String(outerErr)}`;
    result.errors.push(msg);
    onProgress?.(msg);
  }

  await db.update(scraperRunsTable).set({
    completedAt: new Date(),
    recordsFound: result.total,
    recordsInserted: result.inserted,
    recordsUpdated: result.updated,
    flaggedForReview: result.inserted, // WB inserts go to review
    errors: result.errors.length > 0 ? JSON.stringify(result.errors.slice(0, 10)) : null,
  }).where(eq(scraperRunsTable.id, runRow.id));

  return result;
}
