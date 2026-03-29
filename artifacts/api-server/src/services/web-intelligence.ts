import Parser from "rss-parser";
import { db, externalIntelligenceTable } from "@workspace/db";
import { gt } from "drizzle-orm";

const parser = new Parser({ timeout: 10_000 });

interface IntelligenceSource {
  name: string;
  url: string;
  category: "dfi" | "industry" | "news" | "thinktank";
}

const SOURCES: IntelligenceSource[] = [
  // DFI / Multilateral
  { name: "World Bank", url: "https://feeds.feedburner.com/worldbank/topic/energy", category: "dfi" },
  { name: "IFC", url: "https://www.ifc.org/rss/ifc_pressreleases.rss", category: "dfi" },
  { name: "AfDB", url: "https://www.afdb.org/en/rss/news-feed.xml", category: "dfi" },
  // Industry
  { name: "PV Magazine Africa", url: "https://www.pv-magazine-africa.com/feed/", category: "industry" },
  { name: "ESI Africa", url: "https://www.esi-africa.com/feed/", category: "industry" },
  { name: "Energy Capital Power", url: "https://energycapitalpower.com/feed/", category: "industry" },
  // News
  { name: "Reuters Energy", url: "https://feeds.reuters.com/reuters/environment", category: "news" },
  { name: "IRENA", url: "https://www.irena.org/rss/irena-news.xml", category: "thinktank" },
];

// Africa-relevant keywords for relevance scoring
const AFRICA_KEYWORDS = [
  "africa", "african", "nigeria", "kenya", "south africa", "ethiopia", "ghana",
  "tanzania", "egypt", "morocco", "mozambique", "senegal", "zimbabwe", "zambia",
  "rwanda", "uganda", "angola", "côte d'ivoire", "ivory coast", "cameroon", "mali",
  "solar", "wind", "hydro", "renewable", "energy", "power", "electricity", "grid",
  "investment", "finance", "deal", "project", "capacity", "mw", "generation",
  "dfi", "ifc", "afdb", "ebrd", "eib", "climate", "transition",
];

function scoreRelevance(title: string, summary: string): number {
  const text = `${title} ${summary}`.toLowerCase();
  const matches = AFRICA_KEYWORDS.filter(kw => text.includes(kw));
  return Math.min(matches.length / 8, 1.0);
}

function cleanSummary(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

export interface ScrapedItem {
  source: string;
  title: string;
  summary: string;
  url: string;
  publishDate: Date | null;
  category: string;
  relevanceScore: number;
}

async function scrapeSource(source: IntelligenceSource): Promise<ScrapedItem[]> {
  try {
    const feed = await parser.parseURL(source.url);
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days

    return feed.items
      .filter(item => {
        const pubDate = item.pubDate ? new Date(item.pubDate) : null;
        return !pubDate || pubDate >= cutoff;
      })
      .slice(0, 10)
      .map(item => {
        const title = item.title ?? "";
        const rawSummary = item.contentSnippet ?? item.summary ?? item.content ?? "";
        const summary = cleanSummary(rawSummary);
        return {
          source: source.name,
          title,
          summary,
          url: item.link ?? "",
          publishDate: item.pubDate ? new Date(item.pubDate) : null,
          category: source.category,
          relevanceScore: scoreRelevance(title, summary),
        };
      })
      .filter(item => item.relevanceScore >= 0.1);
  } catch (err) {
    console.warn(`[WebIntel] Failed to scrape ${source.name}:`, (err as Error).message);
    return [];
  }
}

export async function gatherExternalIntelligence(): Promise<ScrapedItem[]> {
  // Check cache first — return cached items if fresh (< 24 hours old)
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cached = await db
      .select()
      .from(externalIntelligenceTable)
      .where(gt(externalIntelligenceTable.scrapedAt!, cutoff))
      .limit(30);

    if (cached.length >= 5) {
      console.log(`[WebIntel] Using ${cached.length} cached items`);
      return cached.map(c => ({
        source: c.source,
        title: c.title,
        summary: c.summary ?? "",
        url: c.url ?? "",
        publishDate: c.publishDate,
        category: c.category ?? "news",
        relevanceScore: c.relevanceScore ?? 0.5,
      }));
    }
  } catch (err) {
    console.warn("[WebIntel] Cache check failed:", (err as Error).message);
  }

  // Scrape all sources in parallel
  console.log("[WebIntel] Scraping external intelligence sources...");
  const results = await Promise.allSettled(SOURCES.map(scrapeSource));
  const allItems = results.flatMap(r => r.status === "fulfilled" ? r.value : []);

  // Sort by relevance and take top 20
  const topItems = allItems
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 20);

  // Cache in database
  if (topItems.length > 0) {
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Clear old entries first
      await db.delete(externalIntelligenceTable);

      await db.insert(externalIntelligenceTable).values(
        topItems.map(item => ({
          source: item.source,
          title: item.title,
          summary: item.summary,
          url: item.url,
          publishDate: item.publishDate,
          category: item.category,
          relevanceScore: item.relevanceScore,
          expiresAt,
        }))
      );
      console.log(`[WebIntel] Cached ${topItems.length} intelligence items`);
    } catch (err) {
      console.warn("[WebIntel] Failed to cache items:", (err as Error).message);
    }
  }

  return topItems;
}
