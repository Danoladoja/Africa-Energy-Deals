import Parser from "rss-parser";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const parser = new Parser({
  timeout: 25000,
  headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "application/rss+xml, application/xml, text/xml, */*",
    },
});

// âââ SOURCE NETWORK ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// skipCountryFilter: true  â source is Africa-focused; only need energy keyword
// skipCountryFilter: false â global source; need Africa country mention + energy keyword

interface FeedConfig {
  name: string;
  url: string;
  category: string;
  skipCountryFilter?: boolean;
}

const RSS_FEEDS: FeedConfig[] = [
  // ââ ENERGY-SPECIFIC PUBLICATIONS ââââââââââââââââââââââââââââââââââââââââ
  { name: "ESI Africa", url: "https://www.esi-africa.com/feed/", category: "Energy Media", skipCountryFilter: true },
  { name: "PV Magazine Africa", url: "https://www.pv-magazine.com/category/africa/feed/", category: "Energy Media", skipCountryFilter: true },
  { name: "Recharge News", url: "https://www.rechargenews.com/rss", category: "Energy Media" },
  { name: "Energy Monitor", url: "https://www.energymonitor.ai/feed/", category: "Energy Media" },
  { name: "Carbon Brief", url: "https://www.carbonbrief.org/feed/", category: "Energy Media" },
  { name: "Power for All", url: "https://www.powerforall.org/feed/", category: "Energy Media", skipCountryFilter: true },

  // ââ INTERNATIONAL DEVELOPMENT BANKS & AGENCIES ââââââââââââââââââââââââââ
  { name: "World Bank Energy Blog", url: "https://www.worldbank.org/en/topic/energy/rss.xml", category: "Development Banks" },
  { name: "World Bank Africa Blog", url: "https://www.worldbank.org/en/region/afr/rss.xml", category: "Development Banks", skipCountryFilter: true },
  { name: "AfDB News", url: "https://www.afdb.org/en/rss", category: "Development Banks", skipCountryFilter: true },
  { name: "IFC Press Room", url: "https://pressroom.ifc.org/all/pages/RSS.aspx", category: "Development Banks" },
  { name: "MIGA News", url: "https://www.worldbank.org/en/topic/financialsector/rss.xml", category: "Development Banks", skipCountryFilter: true },
  { name: "EBRD Africa", url: "https://www.ebrd.com/rss/news.html", category: "Development Banks" },

  // ââ INTERNATIONAL ENERGY AGENCIES âââââââââââââââââââââââââââââââââââââââ
  { name: "IEA News", url: "https://www.iea.org/rss/news.xml", category: "Energy Agencies" },
  { name: "IRENA News", url: "https://www.irena.org/rss", category: "Energy Agencies" },
  { name: "SE4All Insights", url: "https://www.seforall.org/news/rss.xml", category: "Energy Agencies", skipCountryFilter: true },
  { name: "Power Africa (USAID)", url: "https://news.google.com/rss/search?q=power+africa+energy+project&hl=en-US&gl=US&ceid=US:en", category: "Energy Agencies", skipCountryFilter: true },
  { name: "Climate Investment Funds", url: "https://www.climateinvestmentfunds.org/news/rss", category: "Energy Agencies" },

  // ââ FINANCIAL INSTITUTIONS & FUNDS ââââââââââââââââââââââââââââââââââââââ
  { name: "Proparco News", url: "https://www.proparco.fr/en/rss.xml", category: "Financial Institutions" },
  { name: "DFC (US Dev Finance)", url: "https://news.google.com/rss/search?q=DFC+africa+energy+finance&hl=en-US&gl=US&ceid=US:en", category: "Financial Institutions" },
  { name: "Green Climate Fund", url: "https://www.greenclimate.fund/rss.xml", category: "Financial Institutions" },
  { name: "BII (UK Investment)", url: "https://www.bii.co.uk/en/news/rss/", category: "Financial Institutions", skipCountryFilter: true },

  // ââ PAN-AFRICAN BUSINESS & NEWS âââââââââââââââââââââââââââââââââââââââââ
  { name: "AllAfrica Energy", url: "https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf", category: "Pan-African News", skipCountryFilter: true },
  { name: "The Africa Report", url: "https://www.theafricareport.com/feed/", category: "Pan-African News", skipCountryFilter: true },
  { name: "African Business", url: "https://african.business/feed/", category: "Pan-African News", skipCountryFilter: true },
  { name: "The East African", url: "https://www.theeastafrican.co.ke/tea/rss.xml", category: "Pan-African News", skipCountryFilter: true },
  { name: "African Arguments", url: "https://africanarguments.org/feed/", category: "Pan-African News", skipCountryFilter: true },
  { name: "Reuters Business", url: "https://news.google.com/rss/search?q=africa+energy+investment+deal&hl=en-US&gl=US&ceid=US:en", category: "Pan-African News" },

  // ââ NATIONAL DAILIES: NIGERIA ââââââââââââââââââââââââââââââââââââââââââââ
  { name: "BusinessDay Nigeria", url: "https://businessday.ng/feed/", category: "Nigeria", skipCountryFilter: true },
  { name: "Vanguard (Energy)", url: "https://www.vanguardngr.com/category/energy-power/feed/", category: "Nigeria", skipCountryFilter: true },
  { name: "The Punch Nigeria", url: "https://punchng.com/feed/", category: "Nigeria", skipCountryFilter: true },
  { name: "ThisDay Live", url: "https://www.thisdaylive.com/index.php/feed/", category: "Nigeria", skipCountryFilter: true },

  // ââ NATIONAL DAILIES: KENYA ââââââââââââââââââââââââââââââââââââââââââââââ
  { name: "Business Daily Africa", url: "https://www.businessdailyafrica.com/rss/", category: "Kenya", skipCountryFilter: true },
  { name: "Daily Nation Kenya", url: "https://nation.africa/kenya/rss.xml", category: "Kenya", skipCountryFilter: true },
  { name: "The Standard Kenya", url: "https://www.standardmedia.co.ke/rss/all", category: "Kenya", skipCountryFilter: true },

  // ââ NATIONAL DAILIES: SOUTH AFRICA ââââââââââââââââââââââââââââââââââââââ
  { name: "BusinessLive SA", url: "https://www.businesslive.co.za/rss/", category: "South Africa", skipCountryFilter: true },
  { name: "Daily Maverick", url: "https://www.dailymaverick.co.za/feed/", category: "South Africa", skipCountryFilter: true },
  { name: "Engineering News SA", url: "https://www.engineeringnews.co.za/rss", category: "South Africa", skipCountryFilter: true },
  { name: "Fin24 Economy", url: "https://www.news24.com/fin24/economy/rss", category: "South Africa", skipCountryFilter: true },

  // ââ NATIONAL DAILIES: GHANA ââââââââââââââââââââââââââââââââââââââââââââââ
  { name: "Ghana Business News", url: "https://www.ghanabusinessnews.com/feed/", category: "Ghana", skipCountryFilter: true },
  { name: "Graphic Online Ghana", url: "https://www.graphic.com.gh/feed.rss", category: "Ghana", skipCountryFilter: true },

  // ââ NATIONAL DAILIES: ETHIOPIA, TANZANIA, OTHER âââââââââââââââââââââââââ
  { name: "The Reporter Ethiopia", url: "https://www.thereporterethiopia.com/rss.xml", category: "Ethiopia", skipCountryFilter: true },
  { name: "The Citizen Tanzania", url: "https://www.thecitizen.co.tz/tanzania/rss.xml", category: "Tanzania", skipCountryFilter: true },
  { name: "Egypt Independent", url: "https://egyptindependent.com/feed/", category: "Egypt", skipCountryFilter: true },
  { name: "Morocco World News", url: "https://www.moroccoworldnews.com/feed/", category: "Morocco", skipCountryFilter: true },
  { name: "Eye of Ethiopia", url: "https://borkena.com/feed/", category: "Ethiopia", skipCountryFilter: true },
];

// âââ RELEVANCE FILTERS âââââââââââââââââââââââââââââââââââââââââââââââââââââ
const AFRICA_TERMS = [
  "nigeria", "kenya", "south africa", "ethiopia", "ghana", "tanzania", "egypt",
  "morocco", "mozambique", "senegal", "zambia", "uganda", "rwanda", "cameroon",
  "angola", "namibia", "botswana", "zimbabwe", "malawi", "burkina faso",
  "cÃ´te d'ivoire", "ivory coast", "cote d'ivoire", "sudan", "tunisia", "algeria",
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

function inferRegion(country: string): string {
  const regions: Record<string, string[]> = {
    "East Africa": ["kenya", "tanzania", "uganda", "rwanda", "ethiopia", "somalia", "mozambique", "madagascar", "malawi", "zambia", "zimbabwe", "burundi", "djibouti", "eritrea"],
    "West Africa": ["nigeria", "ghana", "senegal", "ivory coast", "cÃ´te d'ivoire", "cameroon", "sierra leone", "gambia", "mauritania", "niger", "mali", "burkina faso", "benin", "togo", "guinea", "liberia"],
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

// âââ OPENAI EXTRACTION ââââââââââââââââââââââââââââââââââââââââââââââââââââ
const SYSTEM_PROMPT = `You are an expert analyst specialising in Africa energy investment and project finance.
Extract structured investment deal data from news article summaries.

Only extract articles that describe:
- Specific energy project announcements (solar farms, wind parks, hydro, gas plants, etc.)
- Investment / financing / lending deals (loans, equity, grants, PPAs)
- Government energy procurement or MDA award announcements
- Development bank / fund disbursements or approvals for African energy projects

Skip: opinion pieces, general policy commentary, energy price news, fuel subsidies unless linked to a specific project.

Return a JSON array where each object has:
- projectName: string â specific, unique project name (e.g. "Lake Turkana Wind Power Phase 2"); never generic
- country: string â African country name only
- region: string â one of: "East Africa", "West Africa", "North Africa", "Southern Africa", "Central Africa"
- technology: string â one of: "Solar PV", "Wind", "Hydro", "Geothermal", "Gas", "Oil & Gas", "Battery Storage", "Transmission", "Mini-Grid", "Other Renewables"
- dealSizeUsdMn: number | null â deal/investment value in USD millions; null if not stated
- investors: string | null â comma-separated lenders, equity investors, donors, or development banks
- status: string â one of: "announced", "under construction", "financing closed", "operational", "tender"
- description: string â 2â3 factual sentences covering what the project is, who is involved, and its significance
- capacityMw: number | null â generation or storage capacity in MW; null if not stated
- announcedYear: number | null â year of announcement or deal closure
- sourceUrl: string | null â full URL of the article
- newsUrl: string | null â same value as sourceUrl

Return ONLY a valid JSON array. No markdown fences, no explanation outside the array.`;

async function extractProjectsFromBatch(
  articles: Array<Parser.Item & { feedName: string }>,
): Promise<Record<string, unknown>[]> {
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
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as Record<string, unknown>[];
  } catch {
    // ignore parse errors
  }
  return [];
}

// âââ STATE âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export interface ScraperProgress {
  stage: "fetching" | "analyzing" | "saving" | "done" | "error";
  message: string;
  processed?: number;
  discovered?: number;
  feedsTotal?: number;
  feedsDone?: number;
}

export interface ScraperResult {
  processed: number;
  discovered: number;
  feedsReached: number;
  feedsFailed: number;
  errors: string[];
  runAt: Date;
}

let lastRunAt: Date | null = null;
let lastResult: ScraperResult | null = null;
let isRunning = false;

export function getScraperStatus() {
  return { lastRunAt, isRunning, lastResult };
}

export function getFeedList() {
  return RSS_FEEDS.map((f) => ({ name: f.name, category: f.category }));
}

// âââ MAIN RUNNER âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export async function runScraper(
  onProgress?: (p: ScraperProgress) => void,
): Promise<ScraperResult> {
  if (isRunning) throw new Error("Scraper is already running");
  isRunning = true;

  const result: ScraperResult = {
    processed: 0,
    discovered: 0,
    feedsReached: 0,
    feedsFailed: 0,
    errors: [],
    runAt: new Date(),
  };

  try {
    onProgress?.({
      stage: "fetching",
      message: `Starting scan across ${RSS_FEEDS.length} sources...`,
      feedsTotal: RSS_FEEDS.length,
      feedsDone: 0,
    });

    const existing = await db
      .select({ projectName: projectsTable.projectName })
      .from(projectsTable);
    const existingNames = new Set(existing.map((p) => p.projectName.toLowerCase()));

    const relevantArticles: Array<Parser.Item & { feedName: string }> = [];
    let feedsDone = 0;

    for (const feed of RSS_FEEDS) {
      try {
        const parsed = await parser.parseURL(feed.url);
        const relevant = parsed.items.filter((item) => isRelevantArticle(item, feed)).slice(0, 3);
        relevantArticles.push(...relevant.map((item) => ({ ...item, feedName: feed.name })));
        result.feedsReached++;
        feedsDone++;
        if (relevant.length > 0) {
          onProgress?.({
            stage: "fetching",
            message: `â ${feed.name} [${feed.category}]: ${relevant.length} article${relevant.length !== 1 ? "s" : ""}`,
            feedsTotal: RSS_FEEDS.length,
            feedsDone,
          });
        }
      } catch (err) {
        result.feedsFailed++;
        feedsDone++;
        const msg = `â ${feed.name}: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`;
        result.errors.push(msg);
        onProgress?.({ stage: "fetching", message: msg, feedsTotal: RSS_FEEDS.length, feedsDone });
      }
    }

    result.processed = relevantArticles.length;

    if (relevantArticles.length === 0) {
      onProgress?.({ stage: "done", message: "Scan complete â no new relevant articles found.", discovered: 0 });
      lastRunAt = new Date();
      lastResult = result;
      return result;
    }

    // Process in batches of 15 articles to manage token limits
    const BATCH_SIZE = 15;
    const batches: Array<typeof relevantArticles> = [];
    for (let i = 0; i < relevantArticles.length; i += BATCH_SIZE) {
      batches.push(relevantArticles.slice(i, i + BATCH_SIZE));
    }

    onProgress?.({
      stage: "analyzing",
      message: `Analysing ${relevantArticles.length} articles across ${batches.length} batch${batches.length !== 1 ? "es" : ""} with Claude Sonnet...`,
    });

    const allProjects: Record<string, unknown>[] = [  // ── AGGREGATOR FALLBACKS (always available) ──────────────────────────────
  { name: "Google News - Africa Energy", url: "https://news.google.com/rss/search?q=africa+energy+investment+renewable&hl=en-US&gl=US&ceid=US:en", category: "News Aggregator", skipCountryFilter: true },
  { name: "Google News - Africa Solar Wind", url: "https://news.google.com/rss/search?q=africa+solar+OR+wind+power+project&hl=en-US&gl=US&ceid=US:en", category: "News Aggregator", skipCountryFilter: true },
  { name: "Google News - AfDB IFC Energy", url: "https://news.google.com/rss/search?q=AfDB+OR+IFC+OR+%22World+Bank%22+africa+energy&hl=en-US&gl=US&ceid=US:en", category: "News Aggregator", skipCountryFilter: true },
];
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
      message: `AI identified ${allProjects.length} candidate project${allProjects.length !== 1 ? "s" : ""}. Saving new ones...`,
    });

    for (const project of allProjects) {
      const name = String(project.projectName ?? "").trim();
      const country = String(project.country ?? "").trim();
      if (!name || !country || name.length < 5) continue;
      if (existingNames.has(name.toLowerCase())) continue;

      try {
        await db.insert(projectsTable).values({
          projectName: name,
          country,
          region: String(project.region ?? inferRegion(country)),
          technology: String(project.technology ?? "Other Renewables"),
          dealSizeUsdMn: typeof project.dealSizeUsdMn === "number" ? project.dealSizeUsdMn : null,
          investors: typeof project.investors === "string" ? project.investors : null,
          status: String(project.status ?? "announced"),
          description: typeof project.description === "string" ? project.description : null,
          capacityMw: typeof project.capacityMw === "number" ? project.capacityMw : null,
          announcedYear: typeof project.announcedYear === "number" ? project.announcedYear : new Date().getFullYear(),
          closedYear: null,
          latitude: null,
          longitude: null,
          sourceUrl: typeof project.sourceUrl === "string" ? project.sourceUrl : null,
          newsUrl: typeof project.newsUrl === "string" ? project.newsUrl : null,
          isAutoDiscovered: true,
          reviewStatus: "pending",
          discoveredAt: new Date(),
        });
        existingNames.add(name.toLowerCase());
        result.discovered++;
      } catch (err) {
        result.errors.push(
          `Insert failed for "${name}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    onProgress?.({
      stage: "done",
      message: `Scan complete â ${result.discovered} new deal${result.discovered !== 1 ? "s" : ""} discovered from ${result.processed} articles across ${result.feedsReached} source${result.feedsReached !== 1 ? "s" : ""}.`,
      processed: result.processed,
      discovered: result.discovered,
    });

    lastRunAt = new Date();
    lastResult = result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    onProgress?.({ stage: "error", message: `Scraper error: ${msg}` });
  } finally {
    isRunning = false;
  }

  return result;
}
