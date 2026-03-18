import Parser from "rss-parser";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, projectsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const parser = new Parser({ timeout: 10000 });

const RSS_FEEDS = [
  { name: "ESI Africa", url: "https://www.esi-africa.com/feed/" },
  { name: "PV Magazine Africa", url: "https://www.pv-magazine-africa.com/feed/" },
  { name: "Recharge News", url: "https://www.rechargenews.com/feed/" },
  { name: "The Africa Report", url: "https://www.theafricareport.com/feed/" },
  { name: "African Business", url: "https://african.business/feed/" },
  { name: "Reuters Business", url: "https://feeds.reuters.com/reuters/businessNews" },
];

const AFRICA_COUNTRIES = [
  "nigeria", "kenya", "south africa", "ethiopia", "ghana", "tanzania", "egypt",
  "morocco", "mozambique", "senegal", "zambia", "uganda", "rwanda", "cameroon",
  "angola", "namibia", "botswana", "zimbabwe", "malawi", "burkina faso",
  "ivory coast", "sudan", "tunisia", "algeria", "libya", "drc", "congo",
  "sierra leone", "gambia", "mauritania", "niger", "chad", "somalia",
  "madagascar", "benin", "togo", "mali", "guinea", "african",
];

const ENERGY_KEYWORDS = [
  "solar", "wind", "hydro", "geothermal", "energy", "power", "electricity",
  "megawatt", "mw", "renewable", "gas", "lng", "investment", "financing",
  "ipp", "utility", "grid", "plant", "project", "deal", "fund",
];

function isRelevantArticle(item: Parser.Item): boolean {
  const text = `${item.title ?? ""} ${item.contentSnippet ?? ""}`.toLowerCase();
  const hasCountry = AFRICA_COUNTRIES.some((c) => text.includes(c));
  const hasKeyword = ENERGY_KEYWORDS.some((k) => text.includes(k));
  return hasCountry && hasKeyword;
}

function inferRegion(country: string): string {
  const regions: Record<string, string[]> = {
    "East Africa": ["kenya", "tanzania", "uganda", "rwanda", "ethiopia", "somalia", "mozambique", "madagascar", "malawi", "zambia", "zimbabwe"],
    "West Africa": ["nigeria", "ghana", "senegal", "ivory coast", "cameroon", "sierra leone", "gambia", "mauritania", "niger", "mali", "burkina faso", "benin", "togo", "guinea"],
    "North Africa": ["egypt", "morocco", "tunisia", "algeria", "libya", "sudan"],
    "Southern Africa": ["south africa", "botswana", "namibia", "angola"],
    "Central Africa": ["drc", "congo", "chad"],
  };
  const lower = country.toLowerCase();
  for (const [region, countries] of Object.entries(regions)) {
    if (countries.some((c) => lower.includes(c))) return region;
  }
  return "Africa";
}

export interface ScraperProgress {
  stage: "fetching" | "analyzing" | "saving" | "done" | "error";
  message: string;
  processed?: number;
  discovered?: number;
}

export interface ScraperResult {
  processed: number;
  discovered: number;
  errors: string[];
  runAt: Date;
}

let lastRunAt: Date | null = null;
let lastResult: ScraperResult | null = null;
let isRunning = false;

export function getScraperStatus() {
  return { lastRunAt, isRunning, lastResult };
}

export async function runScraper(
  onProgress?: (p: ScraperProgress) => void,
): Promise<ScraperResult> {
  if (isRunning) throw new Error("Scraper is already running");
  isRunning = true;

  const result: ScraperResult = {
    processed: 0,
    discovered: 0,
    errors: [],
    runAt: new Date(),
  };

  try {
    onProgress?.({ stage: "fetching", message: "Fetching RSS feeds from energy news sources..." });

    const existing = await db
      .select({ projectName: projectsTable.projectName })
      .from(projectsTable);
    const existingNames = new Set(existing.map((p) => p.projectName.toLowerCase()));

    const relevantArticles: Array<Parser.Item & { feedName: string }> = [];

    for (const feed of RSS_FEEDS) {
      try {
        const parsed = await parser.parseURL(feed.url);
        const relevant = parsed.items
          .filter(isRelevantArticle)
          .slice(0, 4);
        relevantArticles.push(...relevant.map((item) => ({ ...item, feedName: feed.name })));
        onProgress?.({
          stage: "fetching",
          message: `Fetched ${feed.name}: ${relevant.length} relevant articles`,
        });
      } catch (err) {
        const msg = `Skipped ${feed.name}: ${err instanceof Error ? err.message : String(err)}`;
        result.errors.push(msg);
        onProgress?.({ stage: "fetching", message: msg });
      }
    }

    result.processed = relevantArticles.length;

    if (relevantArticles.length === 0) {
      onProgress?.({ stage: "done", message: "No relevant articles found this run.", discovered: 0 });
      lastRunAt = new Date();
      lastResult = result;
      return result;
    }

    onProgress?.({
      stage: "analyzing",
      message: `Analyzing ${relevantArticles.length} articles with AI...`,
    });

    const articlesSummary = relevantArticles
      .map(
        (item, i) =>
          `[${i + 1}] Title: ${item.title ?? "Untitled"}\nSource: ${item.feedName}\nURL: ${item.link ?? ""}\nSummary: ${(item.contentSnippet ?? "").slice(0, 400)}\nDate: ${item.pubDate ?? "Unknown"}`,
      )
      .join("\n\n---\n\n");

    const systemPrompt = `You are an expert analyst specializing in Africa energy investment deals.
Extract structured investment project data from news article summaries.
Only extract projects representing real energy investments, financing deals, or major project announcements.
Skip opinion pieces, general market commentary, or articles without a specific project.

Return a JSON array. Each object must have:
- projectName: string (specific project name, not generic like "solar project")
- country: string (African country name only)
- region: string (one of: "East Africa", "West Africa", "North Africa", "Southern Africa", "Central Africa")
- technology: string (one of: "Solar PV", "Wind", "Hydro", "Geothermal", "Gas", "Oil & Gas", "Battery Storage", "Transmission", "Other Renewables")
- dealSizeUsdMn: number | null (deal value in USD millions; null if not stated)
- investors: string | null (comma-separated investor/lender names)
- status: string (one of: "announced", "under construction", "financing closed", "operational")
- description: string (2-3 sentence factual summary)
- capacityMw: number | null (capacity in MW; null if not stated)
- announcedYear: number | null
- sourceUrl: string | null (article URL)
- newsUrl: string | null (same as sourceUrl)

Return ONLY a valid JSON array. No markdown, no explanation outside the array.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Extract energy investment projects from these articles:\n\n${articlesSummary}`,
        },
      ],
    });

    const rawContent = response.choices[0]?.message?.content ?? "[]";
    let projects: Record<string, unknown>[] = [];

    try {
      const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        projects = JSON.parse(jsonMatch[0]) as Record<string, unknown>[];
      }
    } catch {
      result.errors.push("Failed to parse AI response as JSON");
    }

    onProgress?.({
      stage: "saving",
      message: `AI identified ${projects.length} potential projects. Saving new ones...`,
    });

    for (const project of projects) {
      const name = String(project.projectName ?? "").trim();
      const country = String(project.country ?? "").trim();
      if (!name || !country) continue;
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
        result.errors.push(`Insert failed for "${name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    onProgress?.({
      stage: "done",
      message: `Done! Discovered ${result.discovered} new project(s) from ${result.processed} articles.`,
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
