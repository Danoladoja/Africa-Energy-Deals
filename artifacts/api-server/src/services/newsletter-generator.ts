import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, projectsTable, newslettersTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";
import { gatherExternalIntelligence, type ScrapedItem } from "./web-intelligence.js";

const SECTORS = ["Solar", "Wind", "Hydro", "Oil & Gas", "Grid Expansion", "Battery & Storage", "Hydrogen", "Bioenergy", "Geothermal", "Nuclear", "Clean Cooking", "Coal"];
const COUNTRIES = ["Nigeria", "South Africa", "Kenya", "Egypt", "Morocco", "Ethiopia", "Ghana", "Tanzania", "Mozambique", "Senegal"];

const NEWSLETTER_SYSTEM_PROMPT = `You are the AfriEnergy Intelligence Analyst producing the official AfriEnergy Insights newsletter — a periodic intelligence briefing for energy sector professionals, investors, policy advisors, and development finance practitioners working in African markets.

NEWSLETTER FORMAT:
You are producing a COMPLETE newsletter edition. Write as if you are the lead analyst at a Bloomberg-style intelligence service focused exclusively on African energy. The tone should be:
- Authoritative and data-driven
- Professional but readable (not academic)
- Forward-looking with actionable implications
- Balanced — acknowledge uncertainties and data limitations

⛔ ABSOLUTE DATA INTEGRITY RULES — THESE OVERRIDE ALL OTHER INSTRUCTIONS:
1. NEVER invent project names, deal sizes, investor names, country data, or any statistics. Every data point MUST come from the INTERNAL DATA PROVIDED or the EXTERNAL INTELLIGENCE PROVIDED below.
2. NEVER extrapolate or project numbers beyond what the data shows. Use exact figures from the data.
3. NEVER state trends unless the data contains time-series evidence with specific year-over-year numbers.
4. NEVER fill gaps with assumptions. If data is missing, say "not disclosed" or "data not available for [N] projects."
5. ALWAYS prefix external intelligence with its source name. Say "According to IRENA's 2025 report..." — NEVER present external claims without attribution.
6. ALWAYS disclose data limitations. Every section must acknowledge the scope of the underlying data.
7. NEVER supplement with knowledge from your training data. Only use the data provided in this prompt.
8. NEVER use certainty language beyond what data supports. Use "The data suggests..." — NOT "This clearly shows..."
9. If you cannot substantiate a claim from the provided data, do NOT include it.
10. The "Global Context" section may ONLY reference items from the EXTERNAL INTELLIGENCE PROVIDED section — never fabricate external sources, report titles, or statistics.

ADDITIONAL RULES:
1. Every claim MUST be grounded in the actual data provided. Cite specific numbers.
2. The Sector Spotlight and Country in Focus should be DEEP — at least 300 words each with specific deal examples.
3. Format all monetary values consistently: "$1.2B", "$450M".
4. Use the full 9-section structure. Do not skip sections.
5. Write 2,500-3,500 words total.
6. If a section cannot be populated with real data, state this explicitly rather than fabricating content.
7. Use markdown formatting: ## for section headers, **bold** for key terms, tables where appropriate.`;

function getNextSector(lastSector: string | null): string {
  if (!lastSector) return SECTORS[0];
  const idx = SECTORS.indexOf(lastSector);
  return SECTORS[(idx + 1) % SECTORS.length];
}

function getNextCountry(lastCountry: string | null): string {
  if (!lastCountry) return COUNTRIES[0];
  const idx = COUNTRIES.indexOf(lastCountry);
  return COUNTRIES[(idx + 1) % COUNTRIES.length];
}

function buildNewsletterPrompt(params: {
  projects: any[];
  stats: { total: number; totalInvestment: number; countries: string[]; sectors: string[] };
  externalIntel: ScrapedItem[];
  spotlightSector: string;
  spotlightCountry: string;
  editionNumber: number;
  editionDate: Date;
  periodDays: number;
}): string {
  const { projects, stats, externalIntel, spotlightSector, spotlightCountry, editionNumber, editionDate, periodDays } = params;

  const cutoff = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
  const recentProjects = projects.filter(p => p.createdAt && new Date(p.createdAt) >= cutoff);

  const bySector = SECTORS.map(s => {
    const sp = projects.filter(p => p.technology === s);
    const inv = sp.reduce((sum, p) => sum + (p.dealSizeUsdMn || 0), 0);
    return { sector: s, count: sp.length, investment: inv };
  });

  const byRegion = ["West Africa", "East Africa", "North Africa", "Southern Africa", "Central Africa"].map(r => {
    const rp = projects.filter(p => p.region === r);
    const ri = rp.reduce((sum, p) => sum + (p.dealSizeUsdMn || 0), 0);
    return { region: r, count: rp.length, investment: ri };
  });

  const spotlightProjects = projects.filter(p => p.technology === spotlightSector);
  const countryProjects = projects.filter(p => p.country === spotlightCountry);

  return `EDITION DETAILS:
- Edition Number: ${editionNumber}
- Date: ${editionDate.toDateString()}
- Sector Spotlight: ${spotlightSector}
- Country in Focus: ${spotlightCountry}
- Reporting Period: Last ${periodDays} days

INTERNAL DATA PROVIDED (${projects.length} projects from AfriEnergy Tracker):

AGGREGATE STATS:
- Total projects: ${stats.total}
- Total tracked investment: $${(stats.totalInvestment / 1000).toFixed(1)}B
- Countries: ${stats.countries.length}
- Sectors: ${stats.sectors.length}

RECENTLY ADDED (last ${periodDays} days): ${recentProjects.length} projects

BY SECTOR:
${bySector.map(s => `- ${s.sector}: ${s.count} projects, $${(s.investment / 1000).toFixed(1)}B`).join("\n")}

BY REGION:
${byRegion.map(r => `- ${r.region}: ${r.count} projects, $${(r.investment / 1000).toFixed(1)}B`).join("\n")}

SECTOR SPOTLIGHT DATA (${spotlightSector}, ${spotlightProjects.length} projects):
${JSON.stringify(spotlightProjects.slice(0, 30).map(p => ({
    name: p.projectName, country: p.country, size: p.dealSizeUsdMn, stage: p.dealStage,
    year: p.announcedYear, investors: p.investors, capacity: p.capacityMw,
  })))}

COUNTRY IN FOCUS DATA (${spotlightCountry}, ${countryProjects.length} projects):
${JSON.stringify(countryProjects.map(p => ({
    name: p.projectName, sector: p.technology, size: p.dealSizeUsdMn, stage: p.dealStage,
    year: p.announcedYear, investors: p.investors, developer: p.developer,
  })))}

EXTERNAL INTELLIGENCE PROVIDED (${externalIntel.length} items from RSS feeds):
${externalIntel.map(i => `[${i.source}] ${i.title}
Summary: ${i.summary}
Published: ${i.publishDate?.toDateString() ?? "Unknown"}
URL: ${i.url}`).join("\n\n")}

---

Please produce the complete 9-section AfriEnergy Insights newsletter using ONLY the data provided above. Follow this structure exactly:

## 1. EXECUTIVE SUMMARY
## 2. MARKET OVERVIEW
## 3. SECTOR SPOTLIGHT: ${spotlightSector}
## 4. COUNTRY IN FOCUS: ${spotlightCountry}
## 5. DEAL PIPELINE UPDATE
## 6. INVESTMENT & FINANCING TRENDS
## 7. GLOBAL CONTEXT & EXTERNAL INTELLIGENCE
## 8. RISK RADAR
## 9. KEY TAKEAWAYS & OUTLOOK`;
}

export interface GeneratedNewsletter {
  editionNumber: number;
  title: string;
  content: string;
  executiveSummary: string;
  spotlightSector: string;
  spotlightCountry: string;
  projectsAnalyzed: number;
  totalInvestmentCovered: string;
  externalSourcesUsed: number;
}

export async function generateNewsletter(periodDays = 7): Promise<GeneratedNewsletter> {
  // Get the last edition to determine rotation — wrapped in try/catch in case
  // the newsletters table is missing on a fresh production DB (schema not yet migrated)
  let lastSector: string | null = null;
  let lastCountry: string | null = null;
  let editionNumber = 1;
  try {
    const lastEdition = await db
      .select({
        editionNumber: newslettersTable.editionNumber,
        spotlightSector: newslettersTable.spotlightSector,
        spotlightCountry: newslettersTable.spotlightCountry,
      })
      .from(newslettersTable)
      .orderBy(desc(newslettersTable.editionNumber))
      .limit(1);
    lastSector = lastEdition[0]?.spotlightSector ?? null;
    lastCountry = lastEdition[0]?.spotlightCountry ?? null;
    editionNumber = (lastEdition[0]?.editionNumber ?? 0) + 1;
  } catch (err) {
    console.warn("[Newsletter] Could not load last edition (using defaults — run db push to migrate):", (err as Error).message?.slice(0, 200));
  }

  const spotlightSector = getNextSector(lastSector);
  const spotlightCountry = getNextCountry(lastCountry);

  // Gather all data
  const [projects, externalIntel] = await Promise.all([
    db.select().from(projectsTable).limit(500),
    gatherExternalIntelligence(),
  ]);

  const totalInvestment = projects.reduce((sum, p) => sum + (p.dealSizeUsdMn || 0), 0);
  const stats = {
    total: projects.length,
    totalInvestment,
    countries: [...new Set(projects.map(p => p.country))],
    sectors: [...new Set(projects.map(p => p.technology))],
  };

  const prompt = buildNewsletterPrompt({
    projects,
    stats,
    externalIntel,
    spotlightSector,
    spotlightCountry,
    editionNumber,
    editionDate: new Date(),
    periodDays,
  });

  console.log(`[Newsletter] Generating edition #${editionNumber}...`);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: NEWSLETTER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content[0].type === "text" ? response.content[0].text : "";

  // Extract executive summary (first section)
  const execMatch = content.match(/## 1\. EXECUTIVE SUMMARY\s*([\s\S]*?)(?=## 2\.)/i);
  const executiveSummary = execMatch ? execMatch[1].trim().slice(0, 1000) : content.slice(0, 500);

  const title = `AfriEnergy Insights — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

  return {
    editionNumber,
    title,
    content,
    executiveSummary,
    spotlightSector,
    spotlightCountry,
    projectsAnalyzed: projects.length,
    totalInvestmentCovered: `$${(totalInvestment / 1000).toFixed(1)}B`,
    externalSourcesUsed: externalIntel.length,
  };
}

export async function saveNewsletter(newsletter: GeneratedNewsletter): Promise<number> {
  // Use raw SQL to insert ONLY the columns that exist in all DB versions.
  // Drizzle ORM's insert() always emits every column defined in the schema
  // (with DEFAULT for unset ones) — which breaks on production DBs that are
  // missing optional columns added later (content_html, external_sources_used, pdf_url).
  const result = await db.execute(sql`
    INSERT INTO newsletters
      (edition_number, title, content, executive_summary,
       spotlight_sector, spotlight_country,
       projects_analyzed, total_investment_covered, status)
    VALUES
      (${newsletter.editionNumber}, ${newsletter.title}, ${newsletter.content},
       ${newsletter.executiveSummary}, ${newsletter.spotlightSector},
       ${newsletter.spotlightCountry}, ${newsletter.projectsAnalyzed},
       ${newsletter.totalInvestmentCovered}, 'draft')
    RETURNING id
  `);
  const rows = result.rows as Array<{ id: number }>;
  return rows[0].id;
}
