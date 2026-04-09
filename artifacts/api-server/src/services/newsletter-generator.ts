import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, projectsTable, newslettersTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";
import { gatherExternalIntelligence, type ScrapedItem } from "./web-intelligence.js";

const SECTORS = ["Solar", "Wind", "Hydro", "Oil & Gas", "Grid Expansion", "Battery & Storage", "Hydrogen", "Bioenergy", "Geothermal", "Nuclear", "Clean Cooking", "Coal"];
const COUNTRIES = ["Nigeria", "South Africa", "Kenya", "Egypt", "Morocco", "Ethiopia", "Ghana", "Tanzania", "Mozambique", "Senegal"];

const NEWSLETTER_SYSTEM_PROMPT = `You are the AfriEnergy Intelligence Analyst producing the official **AfriEnergy Insights** newsletter — a weekly intelligence briefing for energy sector professionals, investors, policy advisors, and development finance practitioners operating in African markets.

You are the lead analyst at a Bloomberg/IJ Global-calibre intelligence service focused exclusively on Africa's energy transition and investment landscape. Your writing must be:
- Authoritative, specific, and richly data-cited — never vague or generic
- Professional but readable (not academic) — structured paragraphs, not bullet dumps
- Forward-looking where the data supports it, with clear reasoning
- Balanced — acknowledge data limitations rather than paper over them

---

⛔ ABSOLUTE DATA INTEGRITY RULES — THESE OVERRIDE EVERYTHING ELSE:
1. NEVER invent project names, deal sizes, investor names, or statistics. Every figure MUST come from the INTERNAL DATA or EXTERNAL INTELLIGENCE provided.
2. NEVER extrapolate beyond the data. If 69 solar projects exist, write "69" — not "roughly 70" or "nearly 100".
3. NEVER state trends unless the data contains concrete year-over-year numbers to support them.
4. NEVER fill gaps with assumptions. Write "not disclosed" or "data not available for [N] projects" when fields are null.
5. ALWAYS attribute external intelligence by source name: "According to [Source]..." Never present external claims as your own analysis.
6. NEVER use your training knowledge to supplement. Only the DATA PROVIDED and EXTERNAL INTELLIGENCE PROVIDED exist for you.
7. NEVER use certainty language beyond what data supports. Use "The data suggests…", "Based on N tracked projects…", "The tracker shows…".
8. If a section cannot be substantiated from real data, state that clearly — do NOT invent content.

---

📝 SECTION-BY-SECTION WRITING INSTRUCTIONS:

## 1. EXECUTIVE SUMMARY (~200 words)
Open with 2-3 crisp sentences summarising the headline numbers: total tracked portfolio (projects, total investment, countries covered). Then flag 2-3 of the most notable patterns or data points visible in this edition's dataset. Close with a one-sentence forward look. Cite exact numbers throughout.

## 2. MARKET OVERVIEW (~350 words)
Write a substantive market briefing. Cover:
- Total portfolio size (project count, investment, countries, sectors) with exact figures
- Sector distribution: identify the top 3 sectors by project count AND by capital value — note whether the rankings diverge and why that matters
- Regional distribution: which region leads by project count vs. capital concentration? Name the top 2 regions and cite their figures
- Deal stage pipeline: what share of projects are at Announced vs. Financial Close vs. Construction vs. Commissioned? What does the pipeline shape tell us about execution risk?
- At least one notable data quality observation (e.g., how many projects have undisclosed deal sizes and what this means for the total figures)
Use the pre-formatted SECTOR TABLE and REGION TABLE provided in the data.

## 3. SECTOR SPOTLIGHT: [SECTOR] (~400 words minimum)
This section must be at least 400 words. Write a deep, analyst-quality briefing on the spotlight sector.
- Open with the sector's total tracked footprint: project count, total investment, number of countries, share of overall portfolio
- Name and describe the TOP 5 LARGEST PROJECTS by deal size from the SECTOR SPOTLIGHT DATA — include project name, country, deal size, stage, and key investors/developers where available
- Analyse the geographic spread within the sector: which countries dominate and why?
- Analyse the deal stage distribution: is this sector heavy on announced deals (pipeline risk) or constructed/commissioned deals (proven delivery)?
- Discuss the typical financing structures visible in the data — DFI involvement, blended finance, grant components
- Close with 1-2 sentences of forward-looking commentary ONLY IF supported by the data (e.g., number of projects in construction suggests near-term commissioning)

## 4. COUNTRY IN FOCUS: [COUNTRY] (~400 words minimum)
This section must be at least 400 words. Write a deep country investment profile.
- Open with the country's total energy investment footprint from the data: number of projects, total investment, sectors represented
- Name and describe AT LEAST 5 SPECIFIC PROJECTS from the COUNTRY IN FOCUS DATA — include names, sectors, deal sizes, stages, investors/developers
- Analyse the sectoral composition: what does the mix tell us about the country's energy priorities?
- Examine the investor and developer landscape: which institutions are most active?
- Note the deal stage distribution: how much is pipeline vs. committed vs. operational?
- Discuss any DFI, climate finance, or concessional finance patterns visible in the data
- Close with an honest assessment of what the data suggests about this market's investment dynamics

## 5. DEAL PIPELINE UPDATE (~300 words)
Provide a structured analysis of the overall deal pipeline across all projects.
- Break down projects by deal stage (Announced / Financial Close / Construction / Commissioned) with exact counts and investment values for each stage
- Identify which stages represent the highest capital concentration
- Comment on pipeline conversion: are there many projects stuck at "Announced" stage? What does this suggest?
- Highlight 2-3 specific notable deals at critical stages (name the project, country, sector, size, stage)
- Note any patterns in deal timing (announced year distribution)

## 6. INVESTMENT & FINANCING TRENDS (~300 words)
Analyse the financing landscape visible in the data.
- DFI involvement: how many projects have documented DFI participation? Name the most active DFIs by count
- Financing structures: breakdown of project finance, corporate finance, grant-based approaches where data exists
- Blended finance and concessional terms: how prevalent are these structures? What does this tell us about commercial risk perception?
- Debt/equity characteristics: any patterns in the debtEquitySplit data?
- Climate finance tagging: how many projects carry climate finance designation?
- Capacity versus capital: is there a relationship between project size (MW) and deal size ($)?

## 7. GLOBAL CONTEXT & EXTERNAL INTELLIGENCE (~250 words)
This section MUST ONLY draw from the EXTERNAL INTELLIGENCE PROVIDED items. Do not use your training data.
- Summarise 3-5 of the most relevant external intelligence items, each attributed by source
- For each item, briefly explain its relevance to the patterns visible in the AfriEnergy Tracker data
- If no relevant external intelligence is available, state: "No external intelligence items were available for this edition."

## 8. RISK RADAR (~200 words)
Identify 3-4 concrete risk signals visible in the data.
- Concentrate on data-derived risks: geographic concentration, sector overexposure, pipeline execution gaps, undisclosed deal sizes, stalled projects
- For each risk, cite the specific data that supports it
- Do NOT fabricate geopolitical or macro risks not visible in the dataset

## 9. KEY TAKEAWAYS & OUTLOOK (~150 words)
Close with 4-5 crisp, specific, data-backed takeaways. Each takeaway should be one sentence beginning with an action verb or a data point. End with a brief forward look — only what the pipeline data reasonably supports.

---

FORMATTING RULES:
- Use ## for section headers (exactly as numbered above)
- Use **bold** for project names, key figures, and important terms
- Use markdown tables for sector and region comparisons
- Use > blockquotes for key statistics or pull-quotes worth highlighting
- Write 2,500–3,500 words total. Every section is mandatory. Do not truncate.
- Monetary values: "$1.2B", "$450M", "$12M" — always include the dollar sign
- Capacity values: "200 MW", "1.2 GW"`;



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

function fmt(mn: number): string {
  if (!mn) return "undisclosed";
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  return `$${Math.round(mn)}M`;
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

  // Sector breakdown sorted by project count
  const bySector = SECTORS.map(s => {
    const sp = projects.filter(p => p.technology === s);
    const inv = sp.reduce((sum, p) => sum + (p.dealSizeUsdMn || 0), 0);
    const disclosed = sp.filter(p => p.dealSizeUsdMn);
    return { sector: s, count: sp.length, investment: inv, disclosed: disclosed.length };
  }).filter(s => s.count > 0).sort((a, b) => b.count - a.count);

  // Region breakdown
  const REGIONS = ["West Africa", "East Africa", "North Africa", "Southern Africa", "Central Africa"];
  const byRegion = REGIONS.map(r => {
    const rp = projects.filter(p => p.region === r);
    const ri = rp.reduce((sum, p) => sum + (p.dealSizeUsdMn || 0), 0);
    return { region: r, count: rp.length, investment: ri };
  }).filter(r => r.count > 0).sort((a, b) => b.count - a.count);

  // Deal stage breakdown
  const STAGES = ["Announced", "Financial Close", "Construction", "Commissioned"];
  const byStage = STAGES.map(stage => {
    const sp = projects.filter(p => p.dealStage === stage);
    const inv = sp.reduce((sum, p) => sum + (p.dealSizeUsdMn || 0), 0);
    return { stage, count: sp.length, investment: inv };
  });

  // Top 10 largest deals by investment
  const top10Deals = projects
    .filter(p => p.dealSizeUsdMn)
    .sort((a, b) => (b.dealSizeUsdMn || 0) - (a.dealSizeUsdMn || 0))
    .slice(0, 10);

  // Data quality
  const undisclosedCount = projects.filter(p => !p.dealSizeUsdMn).length;
  const dfiCount = projects.filter(p => p.dfiInvolvement).length;
  const climateFinanceCount = projects.filter(p => p.climateFinanceTag).length;

  // Spotlight data
  const spotlightProjects = projects
    .filter(p => p.technology === spotlightSector)
    .sort((a, b) => (b.dealSizeUsdMn || 0) - (a.dealSizeUsdMn || 0));
  const countryProjects = projects.filter(p => p.country === spotlightCountry);

  // Pre-formatted sector table
  const sectorTable = `| Sector | Projects | Total Investment | Disclosed |
|--------|----------|-----------------|-----------|
${bySector.slice(0, 12).map(s => `| ${s.sector} | ${s.count} | ${fmt(s.investment)} | ${s.disclosed}/${s.count} |`).join("\n")}`;

  // Pre-formatted region table
  const regionTable = `| Region | Projects | Total Investment |
|--------|----------|-----------------|
${byRegion.map(r => `| ${r.region} | ${r.count} | ${fmt(r.investment)} |`).join("\n")}`;

  // Pre-formatted pipeline table
  const pipelineTable = `| Stage | Projects | Capital |
|-------|----------|---------|
${byStage.map(s => `| ${s.stage} | ${s.count} | ${fmt(s.investment)} |`).join("\n")}`;

  return `EDITION: AfriEnergy Insights #${editionNumber}
DATE: ${editionDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
SECTOR SPOTLIGHT: ${spotlightSector}
COUNTRY IN FOCUS: ${spotlightCountry}
REPORTING PERIOD: Last ${periodDays} days

═══════════════════════════════════════
INTERNAL DATA (${projects.length} projects — AfriEnergy Tracker PostgreSQL)
═══════════════════════════════════════

HEADLINE FIGURES:
- Total tracked projects: ${stats.total}
- Total tracked investment: $${(stats.totalInvestment / 1000).toFixed(1)}B (USD)
- Countries covered: ${stats.countries.length}
- Active sectors: ${bySector.length}
- Projects with undisclosed deal size: ${undisclosedCount} (${Math.round(undisclosedCount / projects.length * 100)}% of portfolio — note this means actual investment is higher than the tracked figure)
- Projects with DFI involvement documented: ${dfiCount}
- Projects with climate finance tag: ${climateFinanceCount}
- Recently added (last ${periodDays} days): ${recentProjects.length} projects

SECTOR BREAKDOWN (use this table directly in Section 2 and 3):
${sectorTable}

REGIONAL BREAKDOWN (use this table directly in Section 2):
${regionTable}

DEAL PIPELINE BY STAGE (use this table in Section 5):
${pipelineTable}

TOP 10 LARGEST DEALS BY INVESTMENT (cite these in relevant sections):
${top10Deals.map((p, i) => `${i + 1}. **${p.projectName}** | ${p.country} | ${p.technology} | ${fmt(p.dealSizeUsdMn)} | Stage: ${p.dealStage ?? "not specified"} | Investors: ${p.investors ?? "not disclosed"} | Developer: ${p.developer ?? "not disclosed"}`).join("\n")}

SECTOR SPOTLIGHT DATA — ${spotlightSector} (${spotlightProjects.length} projects, sorted by deal size):
${JSON.stringify(spotlightProjects.slice(0, 40).map(p => ({
    name: p.projectName, country: p.country, dealSize: p.dealSizeUsdMn ? fmt(p.dealSizeUsdMn) : "undisclosed",
    stage: p.dealStage, announcedYear: p.announcedYear, closedYear: p.closedYear,
    capacityMw: p.capacityMw, investors: p.investors, developer: p.developer,
    financiers: p.financiers, dfiInvolvement: p.dfiInvolvement, concessionalTerms: p.concessionalTerms,
    financingType: p.financingType,
  })), null, 1)}

COUNTRY IN FOCUS DATA — ${spotlightCountry} (${countryProjects.length} projects):
${JSON.stringify(countryProjects.map(p => ({
    name: p.projectName, sector: p.technology, dealSize: p.dealSizeUsdMn ? fmt(p.dealSizeUsdMn) : "undisclosed",
    stage: p.dealStage, announcedYear: p.announcedYear, closedYear: p.closedYear,
    investors: p.investors, developer: p.developer, financiers: p.financiers,
    dfiInvolvement: p.dfiInvolvement, capacityMw: p.capacityMw, financingType: p.financingType,
    description: p.description,
  })), null, 1)}

EXTERNAL INTELLIGENCE (${externalIntel.length} items — cite these in Section 7 ONLY):
${externalIntel.length > 0
  ? externalIntel.map(i => `SOURCE: ${i.source} | CATEGORY: ${i.category}
TITLE: ${i.title}
SUMMARY: ${i.summary}
PUBLISHED: ${i.publishDate?.toDateString() ?? "Unknown"}`).join("\n\n---\n\n")
  : "No external intelligence items available for this edition."}

═══════════════════════════════════════
INSTRUCTIONS
═══════════════════════════════════════

Produce the complete 9-section AfriEnergy Insights newsletter using ONLY the data above.
Write 2,500–3,500 words total. Every section is mandatory — do not skip or abbreviate.
Use the PRE-FORMATTED TABLES above directly in the relevant sections.
Name specific projects by name in Sections 3, 4, and 5.

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
    max_tokens: 12000,
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
