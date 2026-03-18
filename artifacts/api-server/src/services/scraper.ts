import Parser from "rss-parser";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "AfriEnergy-Scraper/1.0 (+https://afrienergy.app)" },
});

// ─── SOURCE NETWORK ────────────────────────────────────────────────────────
// skipCountryFilter: true  → source is Africa-focused; only need energy keyword
// skipCountryFilter: false → global source; need Africa country mention + energy keyword

interface FeedConfig {
  name: string;
  url: string;
  category: string;
  skipCountryFilter?: boolean;
}

const RSS_FEEDS: FeedConfig[] = [
  // ── ENERGY-SPECIFIC PUBLICATIONS ────────────────────────────────────────
  { name: "ESI Africa", url: "https://www.esi-africa.com/feed/", category: "Energy Media", skipCountryFilter: true },
  { name: "PV Magazine Africa", url: "https://www.pv-magazine-africa.com/feed/", category: "Energy Media", skipCountryFilter: true },
  { name: "Recharge News", url: "https://www.rechargenews.com/feed/", category: "Energy Media" },
  { name: "Energy Monitor", url: "https://www.energymonitor.ai/feed/", category: "Energy Media" },
  { name: "Carbon Brief", url: "https://www.carbonbrief.org/feed/", category: "Energy Media" },
  { name: "Power for All", url: "https://www.powerforall.org/feed/", category: "Energy Media", skipCountryFilter: true },

  // ── INTERNATIONAL DEVELOPMENT BANKS & AGENCIES ──────────────────────────
  { name: "World Bank Energy Blog", url: "https://blogs.worldbank.org/energy/feed", category: "Development Banks" },
  { name: "World Bank Africa Blog", url: "https://blogs.worldbank.org/africacan/feed", category: "Development Banks", skipCountryFilter: true },
  { name: "AfDB News", url: "https://www.afdb.org/en/rss", category: "Development Banks", skipCountryFilter: true },
  { name: "IFC Press Room", url: "https://pressroom.ifc.org/all/rss.xml", category: "Development Banks" },
  { name: "MIGA News", url: "https://www.miga.org/rss.xml", category: "Development Banks", skipCountryFilter: true },
  { name: "EBRD Africa", url: "https://www.ebrd.com/news/news-rss.html", category: "Development Banks" },

  // ── INTERNATIONAL ENERGY AGENCIES ───────────────────────────────────────
  { name: "IEA News", url: "https://www.iea.org/rss/news.xml", category: "Energy Agencies" },
  { name: "IRENA News", url: "https://www.irena.org/rss", category: "Energy Agencies" },
  { name: "SE4All Insights", url: "https://www.seforall.org/rss.xml", category: "Energy Agencies", skipCountryFilter: true },
  { name: "Power Africa (USAID)", url: "https://www.usaid.gov/powerafrica/rss", category: "Energy Agencies", skipCountryFilter: true },
  { name: "Climate Investment Funds", url: "https://www.climateinvestmentfunds.org/news/rss.xml", category: "Energy Agencies" },

  // ── FINANCIAL INSTITUTIONS & FUNDS ──────────────────────────────────────
  { name: "Proparco News", url: "https://www.proparco.fr/en/rss.xml", category: "Financial Institutions" },
  { name: "DFC (US Dev Finance)", url: "https://www.dfc.gov/news/rss.xml", category: "Financial Institutions" },
  { name: "Green Climate Fund", url: "https://www.greenclimate.fund/rss.xml", category: "Financial Institutions" },
  { name: "BII (UK Investment)", url: "https://www.bii.co.uk/en/news/rss/", category: "Financial Institutions", skipCountryFilter: true },

  // ── PAN-AFRICAN BUSINESS & NEWS ─────────────────────────────────────────
  { name: "AllAfrica Energy", url: "https://allafrica.com/stories/rss2.html?pub=energy", category: "Pan-African News", skipCountryFilter: true },
  { name: "The Africa Report", url: "https://www.theafricareport.com/feed/", category: "Pan-African News", skipCountryFilter: true },
  { name: "African Business", url: "https://african.business/feed/", category: "Pan-African News", skipCountryFilter: true },
  { name: "The East African", url: "https://www.theeastafrican.co.ke/tea/rss.xml", category: "Pan-African News", skipCountryFilter: true },
  { name: "African Arguments", url: "https://africanarguments.org/feed/", category: "Pan-African News", skipCountryFilter: true },
  { name: "Reuters Business", url: "https://feeds.reuters.com/reuters/businessNews", category: "Pan-African News" },

  // ── NATIONAL DAILIES: NIGERIA ────────────────────────────────────────────
  { name: "BusinessDay Nigeria", url: "https://businessday.ng/feed/", category: "Nigeria", skipCountryFilter: true },
  { name: "Vanguard (Energy)", url: "https://www.vanguardngr.com/category/energy-power/feed/", category: "Nigeria", skipCountryFilter: true },
  { name: "The Punch Nigeria", url: "https://punchng.com/feed/", category: "Nigeria", skipCountryFilter: true },
  { name: "ThisDay Live", url: "https://www.thisdaylive.com/index.php/feed/", category: "Nigeria", skipCountryFilter: true },

  // ── NATIONAL DAILIES: KENYA ──────────────────────────────────────────────
  { name: "Business Daily Africa", url: "https://www.businessdailyafrica.com/rss/", category: "Kenya", skipCountryFilter: true },
  { name: "Daily Nation Kenya", url: "https://nation.africa/kenya/rss.xml", category: "Kenya", skipCountryFilter: true },
  { name: "The Standard Kenya", url: "https://www.standardmedia.co.ke/rss/all", category: "Kenya", skipCountryFilter: true },

  // ── NATIONAL DAILIES: SOUTH AFRICA ──────────────────────────────────────
  { name: "BusinessLive SA", url: "https://www.businesslive.co.za/rss/", category: "South Africa", skipCountryFilter: true },
  { name: "Daily Maverick", url: "https://www.dailymaverick.co.za/feed/", category: "South Africa", skipCountryFilter: true },
  { name: "Engineering News SA", url: "https://www.engineeringnews.co.za/rss", category: "South Africa", skipCountryFilter: true },
  { name: "Fin24 Economy", url: "https://www.news24.com/fin24/economy/rss", category: "South Africa", skipCountryFilter: true },

  // ── NATIONAL DAILIES: GHANA ──────────────────────────────────────────────
  { name: "Ghana Business News", url: "https://www.ghanabusinessnews.com/feed/", category: "Ghana", skipCountryFilter: true },
  { name: "Graphic Online Ghana", url: "https://www.graphic.com.gh/feed.rss", category: "Ghana", skipCountryFilter: true },

  // ── NATIONAL DAILIES: ETHIOPIA, TANZANIA, OTHER ─────────────────────────
  { name: "The Reporter Ethiopia", url: "https://www.thereporterethiopia.com/rss.xml", category: "Ethiopia", skipCountryFilter: true },
  { name: "The Citizen Tanzania", url: "https://www.thecitizen.co.tz/tanzania/rss.xml", category: "Tanzania", skipCountryFilter: true },
  { name: "Egypt Independent", url: "https://egyptindependent.com/feed/", category: "Egypt", skipCountryFilter: true },
  { name: "Morocco World News", url: "https://www.moroccoworldnews.com/feed/", category: "Morocco", skipCountryFilter: true },
  { name: "Eye of Ethiopia", url: "https://borkena.com/feed/", category: "Ethiopia", skipCountryFilter: true },
];

// ─── RELEVANCE FILTERS ─────────────────────────────────────────────────────
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

// ─── OPENAI EXTRACTION ────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert analyst specialising in Africa energy investment and project finance.
Extract structured investment deal data from news article summaries.

Only extract articles that describe:
- Specific energy project announcements (solar farms, wind parks, hydro, gas plants, etc.)
- Investment / financing / lending deals (loans, equity, grants, PPAs)
- Government energy procurement or MDA award announcements
- Development bank / fund disbursements or approvals for African energy projects

Skip: opinion pieces, general policy commentary, energy price news, fuel subsidies unless linked to a specific project.

Return a JSON array where each object has:
- projectName: string — specific, unique project name (e.g. "Lake Turkana Wind Power Phase 2"); never generic
- country: string — African country name only
- region: string — one of: "East Africa", "West Africa", "North Africa", "Southern Africa", "Central Africa"
- technology: string — one of: "Solar PV", "Wind", "Hydro", "Geothermal", "Gas", "Oil & Gas", "Battery Storage", "Transmission", "Mini-Grid", "Other Renewables"
- dealSizeUsdMn: number | null — deal/investment value in USD millions; null if not stated
- investors: string | null — comma-separated lenders, equity investors, donors, or development banks
- status: string — one of: "announced", "under construction", "financing closed", "operational", "tender"
- description: string — 2–3 factual sentences covering what the project is, who is involved, and its significance
- capacityMw: number | null — generation or storage capacity in MW; null if not stated
- announcedYear: number | null — year of announcement or deal closure
- sourceUrl: string | null — full URL of the article
- newsUrl: string | null — same value as sourceUrl

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

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Extract Africa energy investment projects from these articles:\n\n${articlesSummary}` },
    ],
  });

  const rawContent = response.choices[0]?.message?.content ?? "[]";
  try {
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as Record<string, unknown>[];
  } catch {
    // ignore parse errors
  }
  return [];
}

// ─── STATE ─────────────────────────────────────────────────────────────────
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

// ─── MAIN RUNNER ───────────────────────────────────────────────────────────
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
            message: `✓ ${feed.name} [${feed.category}]: ${relevant.length} article${relevant.length !== 1 ? "s" : ""}`,
            feedsTotal: RSS_FEEDS.length,
            feedsDone,
          });
        }
      } catch (err) {
        result.feedsFailed++;
        feedsDone++;
        const msg = `✗ ${feed.name}: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`;
        result.errors.push(msg);
        onProgress?.({ stage: "fetching", message: msg, feedsTotal: RSS_FEEDS.length, feedsDone });
      }
    }

    result.processed = relevantArticles.length;

    if (relevantArticles.length === 0) {
      onProgress?.({ stage: "done", message: "Scan complete — no new relevant articles found.", discovered: 0 });
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
      message: `Analysing ${relevantArticles.length} articles across ${batches.length} batch${batches.length !== 1 ? "es" : ""} with AI...`,
    });

    const allProjects: Record<string, unknown>[] = [];
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
      message: `Scan complete — ${result.discovered} new deal${result.discovered !== 1 ? "s" : ""} discovered from ${result.processed} articles across ${result.feedsReached} source${result.feedsReached !== 1 ? "s" : ""}.`,
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
