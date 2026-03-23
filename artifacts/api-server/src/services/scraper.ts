import Parser from "rss-parser";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, projectsTable, scraperRunsTable } from "@workspace/db";
import { eq, desc, or, ilike, and } from "drizzle-orm";

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
  "solar", "wind", "hydro", "geothermal", "energy", "power", "electricity",
  "megawatt", " mw ", "renewable", "gas", "lng", "lpg", "investment", "financing",
  "ipp", "utility", "grid", "power plant", "project finance", "deal", "fund",
  "coal", "oil", "petroleum", "minigrids", "mini-grid", "off-grid",
  "battery", "storage", "transmission", "distribution", "electrification",
  "clean energy", "climate finance", "carbon", "emissions",
  "electric vehicle", "electric bus", "electric motorcycle", "e-mobility",
  "e-moto", "ev charging", "electric mobility", "emobility", "bev", "e-bus",
  "electric fleet", "ev infrastructure", "charging station", "battery swap",
];

const EXCLUDE_KEYWORDS = [
  "obituary", "sports", "fashion", "celebrity", "lifestyle", "entertainment",
  "recipe", "travel guide", "horoscope", "crossword",
];

function isRelevantArticle(item: Parser.Item, feed: FeedConfig): boolean {
  const text = `${item.title ?? ""} ${item.contentSnippet ?? ""}`.toLowerCase();
  if (EXCLUDE_KEYWORDS.some((k) => text.includes(k))) return false;
  const hasEnergy = ENERGY_KEYWORDS.some((k) => text.includes(k));
  if (!hasEnergy) return false;
  if (feed.skipCountryFilter) return true;
  return AFRICA_TERMS.some((t) => text.includes(t));
}

// ── NORMALIZERS ──────────────────────────────────────────────────────────────
function normalizeSector(rawSector: string): string {
  const sectorMap: Record<string, string> = {
    "solar": "Solar", "photovoltaic": "Solar", "pv": "Solar", "concentrated solar": "Solar", "csp": "Solar",
    "wind": "Wind", "offshore wind": "Wind", "onshore wind": "Wind",
    "hydro": "Hydro", "hydroelectric": "Hydro", "hydropower": "Hydro", "dam": "Hydro", "tidal": "Hydro", "wave": "Hydro",
    "grid & storage": "Grid & Storage", "grid and storage": "Grid & Storage", "battery storage": "Grid & Storage",
    "battery": "Grid & Storage", "storage": "Grid & Storage", "green hydrogen": "Grid & Storage",
    "hydrogen": "Grid & Storage", "green h2": "Grid & Storage", "electrolyser": "Grid & Storage",
    "electrolysis": "Grid & Storage", "ammonia": "Grid & Storage", "mini-grid": "Grid & Storage",
    "mini grid": "Grid & Storage", "minigrid": "Grid & Storage", "transmission": "Grid & Storage",
    "grid": "Grid & Storage", "smart grid": "Grid & Storage", "ev": "Grid & Storage",
    "electric vehicle": "Grid & Storage", "e-mobility": "Grid & Storage",
    "oil & gas": "Oil & Gas", "oil and gas": "Oil & Gas", "natural gas": "Oil & Gas", "gas": "Oil & Gas",
    "lng": "Oil & Gas", "lpg": "Oil & Gas", "oil": "Oil & Gas", "petroleum": "Oil & Gas",
    "refinery": "Oil & Gas", "upstream": "Oil & Gas", "downstream": "Oil & Gas", "pipeline": "Oil & Gas", "biogas": "Oil & Gas",
    "coal": "Coal", "thermal power": "Coal",
    "nuclear": "Nuclear", "atomic": "Nuclear", "uranium": "Nuclear",
    "bioenergy": "Bioenergy", "biomass": "Bioenergy", "geothermal": "Bioenergy",
    "other renewables": "Bioenergy", "waste-to-energy": "Bioenergy", "waste to energy": "Bioenergy",
  };
  const normalized = sectorMap[rawSector.toLowerCase().trim()];
  if (normalized) return normalized;
  const lower = rawSector.toLowerCase();
  if (lower.includes("solar") || lower.includes("pv") || lower.includes("photovoltaic")) return "Solar";
  if (lower.includes("wind")) return "Wind";
  if (lower.includes("hydro") || lower.includes("dam")) return "Hydro";
  if (lower.includes("battery") || lower.includes("storage") || lower.includes("grid") || lower.includes("hydrogen") || lower.includes("mini-grid")) return "Grid & Storage";
  if (lower.includes("oil") || lower.includes("gas") || lower.includes("lng") || lower.includes("petro")) return "Oil & Gas";
  if (lower.includes("coal") || lower.includes("thermal")) return "Coal";
  if (lower.includes("nuclear") || lower.includes("uranium")) return "Nuclear";
  if (lower.includes("bio") || lower.includes("geotherm") || lower.includes("waste")) return "Bioenergy";
  return "Solar";
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
const SYSTEM_PROMPT = `You are an expert analyst specialising in Africa energy investment and project finance.
Extract structured investment deal data from news article summaries.

PRIORITY: Articles from 2023, 2024, 2025, and 2026 are especially valuable — extract all qualifying deals thoroughly.

Only extract articles that describe:
- Specific energy project announcements (solar farms, wind parks, hydro, gas plants, battery storage, mini-grids, etc.)
- Investment / financing / lending deals (loans, equity, grants, PPAs, bond issuances)
- Government energy procurement, tender awards, or regulatory approvals for African energy projects
- Development bank / fund disbursements or approvals for African energy projects (AfDB, IFC, World Bank, DFC, Proparco, BII, etc.)
- COP28/COP29 climate finance commitments linked to specific African energy projects
- Just Energy Transition Partnership (JET-P) funded projects in African countries

Skip: opinion pieces, general policy commentary, energy price news, fuel subsidies unless linked to a specific named project, duplicate projects already in the batch.

Return a JSON array where each object has:
- projectName: string — specific, unique project name (e.g. "Lake Turkana Wind Power Phase 2"); never generic
- country: string — African country name only
- region: string — one of: "East Africa", "West Africa", "North Africa", "Southern Africa", "Central Africa"
- technology: string — one of exactly these 8 canonical sectors: "Solar", "Wind", "Hydro", "Grid & Storage", "Oil & Gas", "Coal", "Nuclear", "Bioenergy". Use "Grid & Storage" for battery storage, transmission/grid projects, green hydrogen, EVs, and mini-grids. Use "Bioenergy" for biomass, geothermal, and waste-to-energy. Use "Oil & Gas" for all oil, gas, LNG, and petroleum projects.
- dealSizeUsdMn: number | null — deal/investment value in USD millions; null if not stated
- developer: string | null — project developer or sponsor
- financiers: string | null — comma-separated lenders, equity investors, donors, or development banks
- dfiInvolvement: string | null — specific DFI names if any (AfDB, IFC, World Bank, etc.)
- offtaker: string | null — electricity off-taker or buyer if mentioned
- dealStage: string | null — one of: "Announced", "Mandated", "Financial Close", "Construction", "Commissioned", "Suspended"
- status: string — one of: "announced", "under construction", "financing closed", "operational", "tender"
- description: string — 2–3 factual sentences covering what the project is, who is involved, and its significance
- capacityMw: number | null — generation or storage capacity in MW; null if not stated
- announcedYear: number | null — year of announcement or deal closure
- financialCloseDate: string | null — ISO date (YYYY-MM-DD) of financial close if mentioned
- sourceUrl: string | null — full URL of the article
- confidence: number — 0.0 to 1.0 confidence in the extraction quality (1.0 = all key fields clearly stated; 0.5 = several fields inferred; 0.3 = mostly uncertain)

Return ONLY a valid JSON array. No markdown fences, no explanation outside the array.`;

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
        const country = String(project.country ?? "").trim();
        if (!name || !country || name.length < 5) continue;

        const technology = normalizeSector(String(project.technology ?? "Solar"));
        const confidence = typeof project.confidence === "number" ? project.confidence : 0.7;
        const isLowConfidence = confidence < 0.7;
        const reviewStatus = isLowConfidence ? "pending" : "pending"; // all auto-discovered go to review

        // Check exact name match first
        if (existingNames.has(name.toLowerCase())) {
          // Update with new data if we have richer info
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
              ...(typeof project.dealSizeUsdMn === "number" && { dealSizeUsdMn: project.dealSizeUsdMn }),
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
          // Merge into existing
          try {
            await db.update(projectsTable).set({
              ...(project.developer && { developer: project.developer }),
              ...(project.financiers && { financiers: project.financiers }),
              ...(project.dfiInvolvement && { dfiInvolvement: project.dfiInvolvement }),
              ...(project.offtaker && { offtaker: project.offtaker }),
              ...(project.dealStage && { dealStage: project.dealStage }),
              ...(project.financialCloseDate && { financialCloseDate: project.financialCloseDate }),
              ...(project.sourceUrl && { newsUrl: project.sourceUrl }),
              ...(typeof project.dealSizeUsdMn === "number" && { dealSizeUsdMn: project.dealSizeUsdMn }),
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

        // New project — insert
        try {
          await db.insert(projectsTable).values({
            projectName: name,
            country,
            region: String(project.region ?? inferRegion(country)),
            technology,
            dealSizeUsdMn: typeof project.dealSizeUsdMn === "number" ? project.dealSizeUsdMn : null,
            investors: project.financiers ?? null,
            status: String(project.status ?? "announced"),
            description: typeof project.description === "string" ? project.description : null,
            capacityMw: typeof project.capacityMw === "number" ? project.capacityMw : null,
            announcedYear: typeof project.announcedYear === "number" ? project.announcedYear : new Date().getFullYear(),
            closedYear: null,
            latitude: null,
            longitude: null,
            sourceUrl: typeof project.sourceUrl === "string" ? project.sourceUrl : null,
            newsUrl: typeof project.sourceUrl === "string" ? project.sourceUrl : null,
            isAutoDiscovered: true,
            reviewStatus,
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
          if (isLowConfidence) result.flagged++;
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
