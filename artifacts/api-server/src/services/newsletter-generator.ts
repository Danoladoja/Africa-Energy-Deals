import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, projectsTable, newslettersTable } from "@workspace/db";
import { desc, sql, eq } from "drizzle-orm";
import { gatherExternalIntelligence, type ScrapedItem } from "./web-intelligence.js";
import {
  generateSectorChart,
  generatePipelineChart,
  generateRegionalChart,
  generateCountryChart,
  generateSectorCountChart,
  generateTopDealsTable,
  chartImageHtml,
  type SectorStat,
  type StageStat,
  type RegionStat,
  type CountryStat,
} from "./chart-generator.js";

const SECTORS = ["Solar", "Wind", "Hydro", "Oil & Gas", "Grid Expansion", "Battery & Storage", "Hydrogen", "Bioenergy", "Geothermal", "Nuclear", "Clean Cooking", "Coal"];
const COUNTRIES = ["Nigeria", "South Africa", "Kenya", "Egypt", "Morocco", "Ethiopia", "Ghana", "Tanzania", "Mozambique", "Senegal"];
const REGIONS = ["West Africa", "East Africa", "North Africa", "Southern Africa", "Central Africa"];
const STAGES = ["Announced", "Financial Close", "Construction", "Commissioned"];

// ── Monthly Insights System Prompt (8 sections — Global Context removed) ─────

const NEWSLETTER_SYSTEM_PROMPT = `You are the AfriEnergy Intelligence Analyst producing the official **AfriEnergy Insights** newsletter — a monthly intelligence briefing for energy sector professionals, investors, policy advisors, and development finance practitioners operating in African markets.

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

EXTERNAL INTELLIGENCE INTEGRATION:
External intelligence items are provided in the data. Do NOT create a standalone section for them.
Instead, weave them into the relevant sections where they add context:
- A World Bank energy access report → cite in the Country in Focus section
- An IRENA renewables statistic → cite in Sector Spotlight or Market Overview
- A BloombergNEF funding trend → cite in Investment & Financing Trends
Always attribute: "According to [Source]..." or "Per [Source's] latest data..."
If no external intelligence is relevant to a section, do not force it in.

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
- Close with 1-2 sentences of forward-looking commentary ONLY IF supported by the data

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

## 7. RISK RADAR (~200 words)
Identify 3-4 concrete risk signals visible in the data.
- Concentrate on data-derived risks: geographic concentration, sector overexposure, pipeline execution gaps, undisclosed deal sizes, stalled projects
- For each risk, cite the specific data that supports it
- Do NOT fabricate geopolitical or macro risks not visible in the dataset

## 8. KEY TAKEAWAYS & OUTLOOK (~150 words)
Close with 4-5 crisp, specific, data-backed takeaways. Each takeaway should be one sentence beginning with an action verb or a data point. End with a brief forward look — only what the pipeline data reasonably supports.

---

FORMATTING RULES:
- Use ## for section headers (exactly as numbered above)
- Use **bold** for project names, key figures, and important terms
- Use markdown tables for sector and region comparisons — include at least 2 data tables across the newsletter
- Use > blockquotes for key statistics or pull-quotes worth highlighting — you MUST include a MINIMUM OF 4 blockquote highlight boxes (> text) spread across the newsletter; do not leave a section without at least one if the data supports it
- Write 2,500–3,500 words total. Every section is mandatory. Do not truncate.
- Monetary values: "$1.2B", "$450M", "$12M" — always include the dollar sign
- Capacity values: "200 MW", "1.2 GW"`;

// ── Africa Energy Brief System Prompt ─────────────────────────────────────────

const BRIEF_SYSTEM_PROMPT = `You are the AfriEnergy Intelligence Analyst producing the **AfriEnergy Brief** — a biweekly quick-read update for energy professionals, investors, and policy advisors.

This is NOT the monthly deep-dive report. It's a fast intelligence flash — think "Bloomberg terminal alert" not "research paper."

⛔ ABSOLUTE DATA INTEGRITY RULES (same as the monthly newsletter):
1. NEVER invent project names, deal sizes, investor names, or statistics.
2. Every figure MUST come from the DATA PROVIDED.
3. NEVER extrapolate or fill gaps with assumptions.
4. ALWAYS attribute external intelligence: "According to [Source]..." or "Per [Source]..."
5. If a statistic is not in the data, write "not yet disclosed" — never invent it.

BRIEF FORMAT RULES:
- Maximum 600-900 words total
- Use bullet points freely — this must be scannable in 3 minutes
- Every bullet must contain a specific data point (project name, dollar amount, country)
- NO filler paragraphs — every sentence must carry information
- Do NOT create a standalone "Global Context" section — weave external intelligence into the relevant sections
- Include a data caveat at the bottom: "Based on [N] tracked projects as of [date]."

STRUCTURE — write exactly these 5 sections:

## 1. HEADLINE NUMBERS
2-3 lines only. Key stats: total portfolio size, total investment, any notable milestones since last brief.

## 2. DEALS TO WATCH
3-5 bullet points. Most significant recent or progressing deals — name, country, sector, deal size, what's notable.

## 3. SECTOR PULSE
3-4 bullet points. Quick sector-level movements: which sectors have the most projects, which reached financial close, any notable shifts.

## 4. POLICY & MARKET SIGNALS
2-3 bullet points. External developments affecting the investment landscape. Attribute each bullet to its source. This is where external intelligence is woven in — not dumped.

## 5. DATA SNAPSHOT
Reference the data summary provided. 2-3 sentences describing what the numbers show. End with: "Based on [N] tracked projects as of [date]."

FORMATTING:
- Use ## for section headers
- Use **bold** for project names and key figures
- Use bullet points (- ) for all lists
- Use > blockquotes for key stats worth highlighting — you MUST include a MINIMUM OF 3 blockquote quote boxes (> text) spread across the brief; at least one per major section
- Monetary values: "$450M", "$1.2B"
- Capacity: "200 MW"`;

// ── Helper functions ───────────────────────────────────────────────────────────

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

function fmt(mn: number | null): string {
  if (!mn) return "undisclosed";
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  return `$${Math.round(mn)}M`;
}

function computeBreakdowns(projects: any[]) {
  const bySector: SectorStat[] = SECTORS.map(s => {
    const sp = projects.filter(p => p.technology === s);
    const inv = sp.reduce((sum: number, p: any) => sum + (p.dealSizeUsdMn || 0), 0);
    const disclosed = sp.filter((p: any) => p.dealSizeUsdMn);
    return { sector: s, count: sp.length, investment: inv, disclosed: disclosed.length };
  }).filter(s => s.count > 0).sort((a, b) => b.count - a.count);

  const byRegion: RegionStat[] = REGIONS.map(r => {
    const rp = projects.filter((p: any) => p.region === r);
    const ri = rp.reduce((sum: number, p: any) => sum + (p.dealSizeUsdMn || 0), 0);
    return { region: r, count: rp.length, investment: ri };
  }).filter(r => r.count > 0).sort((a, b) => b.count - a.count);

  const byStage: StageStat[] = STAGES.map(stage => {
    const sp = projects.filter((p: any) => p.dealStage === stage);
    const inv = sp.reduce((sum: number, p: any) => sum + (p.dealSizeUsdMn || 0), 0);
    return { stage, count: sp.length, investment: inv };
  });

  const countryMap = new Map<string, { count: number; investment: number }>();
  for (const p of projects) {
    if (!p.country) continue;
    const entry = countryMap.get(p.country) ?? { count: 0, investment: 0 };
    entry.count += 1;
    entry.investment += p.dealSizeUsdMn || 0;
    countryMap.set(p.country, entry);
  }
  const byCountry: CountryStat[] = Array.from(countryMap.entries())
    .map(([country, { count, investment }]) => ({ country, count, investment }))
    .sort((a, b) => b.investment - a.investment);

  return { bySector, byRegion, byStage, byCountry };
}

// ── Simple markdown → HTML converter for stored content_html ─────────────────

export function markdownToHtml(md: string): string {
  let html = md;

  // Tables — dark header, clean alternating rows
  html = html.replace(/(\|.+\|\n)(\|[-| :]+\|\n)((?:\|.+\|\n?)+)/g, (_match, header, _sep, body) => {
    const headerCells = header.trim().split("|").filter(Boolean).map((c: string) =>
      `<th style="background:#0f172a;color:#10b981;font-size:11px;font-weight:700;padding:11px 14px;text-align:left;text-transform:uppercase;letter-spacing:0.6px;white-space:nowrap;">${c.trim()}</th>`
    ).join("");
    const bodyRows = body.trim().split("\n").map((row: string, i: number) => {
      const cells = row.split("|").filter(Boolean).map((c: string) =>
        `<td style="padding:10px 14px;font-size:13px;color:#334155;border-bottom:1px solid #e2e8f0;background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"};">${c.trim()}</td>`
      ).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    return `<div style="border-radius:10px;overflow:hidden;margin:22px 0;border:1px solid #e2e8f0;box-shadow:0 1px 4px rgba(0,0,0,0.06);"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><thead><tr style="background:#0f172a;">${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
  });

  // Blockquotes → key insight callout
  html = html.replace(/^> (.+)$/gm,
    '<div style="border-left:4px solid #10b981;background:#f0fdf9;padding:14px 20px;margin:22px 0;border-radius:0 8px 8px 0;color:#065f46;font-size:14px;line-height:1.7;font-style:italic;font-family:\'Manrope\',\'Helvetica Neue\',Helvetica,Arial,sans-serif;">$1</div>'
  );

  // H2 → section header with green left accent bar
  html = html.replace(/^## (.+)$/gm,
    '<h2 style="color:#0f172a;font-size:22px;font-weight:800;margin:40px 0 14px;padding:2px 0 2px 16px;border-left:4px solid #10b981;font-family:\'Syne\',\'Helvetica Neue\',Helvetica,Arial,sans-serif;letter-spacing:-0.4px;line-height:1.25;">$1</h2>'
  );

  // H3
  html = html.replace(/^### (.+)$/gm,
    '<h3 style="color:#1e293b;font-size:17px;font-weight:700;margin:28px 0 10px;font-family:\'Syne\',\'Helvetica Neue\',Helvetica,Arial,sans-serif;letter-spacing:-0.2px;">$1</h3>'
  );

  // H4
  html = html.replace(/^#### (.+)$/gm,
    '<h4 style="color:#1e293b;font-size:14px;font-weight:700;margin:20px 0 8px;font-family:\'Syne\',\'Helvetica Neue\',Helvetica,Arial,sans-serif;letter-spacing:0;">$1</h4>'
  );

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#0f172a;font-weight:700;">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em style="color:#334155;">$1</em>');

  // Bullet lists
  html = html.replace(/^[-*] (.+)$/gm, '<li style="margin:6px 0;color:#374151;font-size:15px;line-height:1.7;padding-left:4px;">$1</li>');
  html = html.replace(/(<li[^>]*>[\s\S]*?<\/li>\s*)+/g,
    '<ul style="padding-left:24px;margin:14px 0;list-style-type:disc;">$&</ul>'
  );

  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin:6px 0;color:#374151;font-size:15px;line-height:1.7;padding-left:4px;">$1</li>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0;" />');

  // Paragraphs
  html = html.split("\n\n").map(block => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("<")) return trimmed;
    return `<p style="color:#374151;font-size:15px;line-height:1.8;margin:0 0 18px;">${trimmed.replace(/\n/g, " ")}</p>`;
  }).join("\n");

  return html;
}

/**
 * Inject chart images and the top deals table into the converted HTML body
 * by finding section headings and inserting visuals after each relevant section.
 */
function injectChartsIntoHtml(html: string, charts: {
  sectorChart: string | null;
  pipelineChart: string | null;
  regionalChart: string | null;
  countryChart: string | null;
  sectorCountChart: string | null;
  topDealsTable: string;
}): string {
  // Insert content before the next <h2 after the section containing `keyword`
  function insertAfterSection(src: string, keyword: string, content: string): string {
    const keyIdx = src.toLowerCase().indexOf(keyword.toLowerCase());
    if (keyIdx === -1) return src;
    // Find next <h2 after this section heading
    const nextH2 = src.indexOf("<h2", keyIdx + keyword.length);
    if (nextH2 === -1) {
      // Last section — append at end
      return src + content;
    }
    return src.slice(0, nextH2) + content + src.slice(nextH2);
  }

  let result = html;

  // 1. After Executive Summary: Top Deals Table
  if (charts.topDealsTable) {
    const tableBlock = `<div style="margin:20px 0;">
      <h3 style="color:#065f46;font-size:15px;font-weight:700;margin:16px 0 10px;font-family:'Syne','Helvetica Neue',Helvetica,Arial,sans-serif;">📊 Top Deals by Investment Size</h3>
      ${charts.topDealsTable}
    </div>`;
    result = insertAfterSection(result, "EXECUTIVE SUMMARY", tableBlock);
  }

  // 2. After Market Overview: Sector investment chart
  if (charts.sectorChart) {
    result = insertAfterSection(result, "MARKET OVERVIEW", chartImageHtml(charts.sectorChart, "Investment by Sector (USD $M) — AfriEnergy Tracker Data"));
  }

  // 3. After Sector Spotlight: Regional investment chart
  if (charts.regionalChart) {
    result = insertAfterSection(result, "SECTOR SPOTLIGHT", chartImageHtml(charts.regionalChart, "Investment by Region (USD $M) — AfriEnergy Tracker Data"));
  }

  // 4. After Country in Focus: Country investment chart
  if (charts.countryChart) {
    result = insertAfterSection(result, "COUNTRY IN FOCUS", chartImageHtml(charts.countryChart, "Top Countries by Total Investment (USD $M) — AfriEnergy Tracker Data"));
  }

  // 5. After Deal Pipeline Update: Pipeline funnel chart
  if (charts.pipelineChart) {
    result = insertAfterSection(result, "DEAL PIPELINE", chartImageHtml(charts.pipelineChart, "Deal Pipeline by Stage — Project Count — AfriEnergy Tracker Data"));
  }

  // 6. After Investment & Financing Trends: Sector project count chart
  if (charts.sectorCountChart) {
    result = insertAfterSection(result, "INVESTMENT", chartImageHtml(charts.sectorCountChart, "Active Projects by Sector — AfriEnergy Tracker Data"));
  }

  return result;
}

// ── Monthly Insights prompt builder ───────────────────────────────────────────

function buildNewsletterPrompt(params: {
  projects: any[];
  stats: { total: number; totalInvestment: number; countries: string[]; sectors: string[] };
  bySector: SectorStat[];
  byRegion: RegionStat[];
  byStage: StageStat[];
  externalIntel: ScrapedItem[];
  spotlightSector: string;
  spotlightCountry: string;
  editionNumber: number;
  editionDate: Date;
  periodDays: number;
}): string {
  const { projects, stats, bySector, byRegion, byStage, externalIntel, spotlightSector, spotlightCountry, editionNumber, editionDate, periodDays } = params;

  const cutoff = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
  const recentProjects = projects.filter((p: any) => p.createdAt && new Date(p.createdAt) >= cutoff);

  const top10Deals = projects
    .filter((p: any) => p.dealSizeUsdMn)
    .sort((a: any, b: any) => (b.dealSizeUsdMn || 0) - (a.dealSizeUsdMn || 0))
    .slice(0, 10);

  const undisclosedCount = projects.filter((p: any) => !p.dealSizeUsdMn).length;
  const dfiCount = projects.filter((p: any) => p.dfiInvolvement).length;
  const climateFinanceCount = projects.filter((p: any) => p.climateFinanceTag).length;

  const spotlightProjects = projects
    .filter((p: any) => p.technology === spotlightSector)
    .sort((a: any, b: any) => (b.dealSizeUsdMn || 0) - (a.dealSizeUsdMn || 0));
  const countryProjects = projects.filter((p: any) => p.country === spotlightCountry);

  const sectorTable = `| Sector | Projects | Total Investment | Disclosed |
|--------|----------|-----------------|-----------|
${bySector.slice(0, 12).map(s => `| ${s.sector} | ${s.count} | ${fmt(s.investment)} | ${s.disclosed}/${s.count} |`).join("\n")}`;

  const regionTable = `| Region | Projects | Total Investment |
|--------|----------|-----------------|
${byRegion.map(r => `| ${r.region} | ${r.count} | ${fmt(r.investment)} |`).join("\n")}`;

  const pipelineTable = `| Stage | Projects | Capital |
|-------|----------|---------|
${byStage.map(s => `| ${s.stage} | ${s.count} | ${fmt(s.investment)} |`).join("\n")}`;

  return `EDITION: AfriEnergy Insights #${editionNumber} — Monthly Report
DATE: ${editionDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
SECTOR SPOTLIGHT: ${spotlightSector}
COUNTRY IN FOCUS: ${spotlightCountry}
REPORTING PERIOD: Last ${periodDays} days (monthly)

═══════════════════════════════════════
INTERNAL DATA (${projects.length} projects — AfriEnergy Tracker PostgreSQL)
═══════════════════════════════════════

HEADLINE FIGURES:
- Total tracked projects: ${stats.total}
- Total tracked investment: $${(stats.totalInvestment / 1000).toFixed(1)}B (USD)
- Countries covered: ${stats.countries.length}
- Active sectors: ${bySector.length}
- Projects with undisclosed deal size: ${undisclosedCount} (${Math.round(undisclosedCount / projects.length * 100)}% — actual investment is higher than the tracked figure)
- Projects with DFI involvement documented: ${dfiCount}
- Projects with climate finance tag: ${climateFinanceCount}
- Recently added (last ${periodDays} days): ${recentProjects.length} projects

SECTOR BREAKDOWN (use this table in Sections 2 and 3):
${sectorTable}

REGIONAL BREAKDOWN (use this table in Section 2):
${regionTable}

DEAL PIPELINE BY STAGE (use this table in Section 5):
${pipelineTable}

TOP 10 LARGEST DEALS BY INVESTMENT (cite these in relevant sections):
${top10Deals.map((p: any, i: number) => `${i + 1}. **${p.projectName}** | ${p.country} | ${p.technology} | ${fmt(p.dealSizeUsdMn)} | Stage: ${p.dealStage ?? "not specified"} | Investors: ${p.investors ?? "not disclosed"} | Developer: ${p.developer ?? "not disclosed"}`).join("\n")}

SECTOR SPOTLIGHT DATA — ${spotlightSector} (${spotlightProjects.length} projects, sorted by deal size):
${JSON.stringify(spotlightProjects.slice(0, 40).map((p: any) => ({
    name: p.projectName, country: p.country, dealSize: p.dealSizeUsdMn ? fmt(p.dealSizeUsdMn) : "undisclosed",
    stage: p.dealStage, announcedYear: p.announcedYear, closedYear: p.closedYear,
    capacityMw: p.capacityMw, investors: p.investors, developer: p.developer,
    financiers: p.financiers, dfiInvolvement: p.dfiInvolvement, concessionalTerms: p.concessionalTerms,
    financingType: p.financingType,
  })), null, 1)}

COUNTRY IN FOCUS DATA — ${spotlightCountry} (${countryProjects.length} projects):
${JSON.stringify(countryProjects.map((p: any) => ({
    name: p.projectName, sector: p.technology, dealSize: p.dealSizeUsdMn ? fmt(p.dealSizeUsdMn) : "undisclosed",
    stage: p.dealStage, announcedYear: p.announcedYear, closedYear: p.closedYear,
    investors: p.investors, developer: p.developer, financiers: p.financiers,
    dfiInvolvement: p.dfiInvolvement, capacityMw: p.capacityMw, financingType: p.financingType,
    description: p.description,
  })), null, 1)}

EXTERNAL INTELLIGENCE (${externalIntel.length} items — weave into relevant sections, always attributed):
${externalIntel.length > 0
  ? externalIntel.map(i => `SOURCE: ${i.source} | CATEGORY: ${i.category}
TITLE: ${i.title}
SUMMARY: ${i.summary}
PUBLISHED: ${i.publishDate?.toDateString() ?? "Unknown"}`).join("\n\n---\n\n")
  : "No external intelligence items available for this edition."}

═══════════════════════════════════════
INSTRUCTIONS
═══════════════════════════════════════

Produce the complete 8-section AfriEnergy Insights monthly newsletter using ONLY the data above.
Write 2,500–3,500 words total. Every section is mandatory — do not skip or abbreviate.
Use the PRE-FORMATTED TABLES above directly in the relevant sections.
Name specific projects by name in Sections 3, 4, and 5.
Weave external intelligence into relevant sections (do NOT create a standalone section for it).

## 1. EXECUTIVE SUMMARY
## 2. MARKET OVERVIEW
## 3. SECTOR SPOTLIGHT: ${spotlightSector}
## 4. COUNTRY IN FOCUS: ${spotlightCountry}
## 5. DEAL PIPELINE UPDATE
## 6. INVESTMENT & FINANCING TRENDS
## 7. RISK RADAR
## 8. KEY TAKEAWAYS & OUTLOOK`;
}

// ── Africa Energy Brief prompt builder ────────────────────────────────────────

function buildBriefPrompt(params: {
  projects: any[];
  stats: { total: number; totalInvestment: number; countries: string[] };
  bySector: SectorStat[];
  byStage: StageStat[];
  externalIntel: ScrapedItem[];
  periodDays: number;
  editionDate: Date;
  editionNumber: number;
}): string {
  const { projects, stats, bySector, byStage, externalIntel, periodDays, editionDate, editionNumber } = params;

  const cutoff = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
  const recentProjects = projects.filter((p: any) => p.createdAt && new Date(p.createdAt) >= cutoff);

  // Top 5 recent deals by size
  const recentDeals = [...recentProjects]
    .filter((p: any) => p.dealSizeUsdMn)
    .sort((a: any, b: any) => (b.dealSizeUsdMn || 0) - (a.dealSizeUsdMn || 0))
    .slice(0, 5);

  // Top 5 all-time deals
  const topDeals = projects
    .filter((p: any) => p.dealSizeUsdMn)
    .sort((a: any, b: any) => (b.dealSizeUsdMn || 0) - (a.dealSizeUsdMn || 0))
    .slice(0, 5);

  const sectorSummary = bySector.slice(0, 6).map(s => `${s.sector}: ${s.count} projects, ${fmt(s.investment)}`).join(" | ");
  const stageSummary = byStage.filter(s => s.count > 0).map(s => `${s.stage}: ${s.count}`).join(" | ");

  return `AFRICA ENERGY BRIEF — Edition #${editionNumber}
DATE: ${editionDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
PERIOD: Last ${periodDays} days (biweekly)

PORTFOLIO SNAPSHOT:
- Total projects tracked: ${stats.total}
- Total investment: $${(stats.totalInvestment / 1000).toFixed(1)}B (USD)
- Countries: ${stats.countries.length}
- New projects added (last ${periodDays} days): ${recentProjects.length}

TOP SECTORS: ${sectorSummary}
PIPELINE STAGES: ${stageSummary}

RECENT DEALS (last ${periodDays} days, by size):
${recentDeals.length > 0 ? recentDeals.map((p: any) => `- ${p.projectName} | ${p.country} | ${p.technology} | ${fmt(p.dealSizeUsdMn)} | ${p.dealStage ?? "stage not specified"}`).join("\n") : "No deals with disclosed sizes added in this period."}

NOTABLE DEALS (top 5 overall for context):
${topDeals.map((p: any) => `- ${p.projectName} | ${p.country} | ${p.technology} | ${fmt(p.dealSizeUsdMn)} | ${p.dealStage ?? "stage not specified"}`).join("\n")}

EXTERNAL INTELLIGENCE (${externalIntel.length} items — weave attributed bullets into Section 4):
${externalIntel.length > 0
  ? externalIntel.slice(0, 5).map(i => `SOURCE: ${i.source}\nTITLE: ${i.title}\nSUMMARY: ${i.summary}`).join("\n---\n")
  : "No external intelligence available for this period."}

INSTRUCTIONS:
Write a concise 600-900 word briefing in exactly 5 sections as instructed.
Every bullet must cite a specific project name, dollar amount, or country.
End Section 5 with: "Based on ${stats.total} tracked projects as of ${editionDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}."`;
}

// ── Data types ────────────────────────────────────────────────────────────────

export interface GeneratedNewsletter {
  editionNumber: number;
  title: string;
  content: string;
  contentHtml: string;
  executiveSummary: string;
  spotlightSector: string;
  spotlightCountry: string;
  projectsAnalyzed: number;
  totalInvestmentCovered: string;
  externalSourcesUsed: number;
  type: "insights" | "brief";
}

// ── Monthly Insights generator ────────────────────────────────────────────────

export async function generateNewsletter(periodDays = 30): Promise<GeneratedNewsletter> {
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
    console.warn("[Newsletter] Could not load last edition:", (err as Error).message?.slice(0, 200));
  }

  const spotlightSector = getNextSector(lastSector);
  const spotlightCountry = getNextCountry(lastCountry);

  const [projects, externalIntel] = await Promise.all([
    db.select().from(projectsTable).where(eq(projectsTable.reviewStatus, "approved")).limit(500),
    gatherExternalIntelligence(),
  ]);

  const totalInvestment = projects.reduce((sum, p) => sum + (p.dealSizeUsdMn || 0), 0);
  const { bySector, byRegion, byStage, byCountry } = computeBreakdowns(projects);
  const stats = {
    total: projects.length,
    totalInvestment,
    countries: [...new Set(projects.map(p => p.country))].filter(Boolean) as string[],
    sectors: [...new Set(projects.map(p => p.technology))].filter(Boolean) as string[],
  };

  const editionDate = new Date();
  const prompt = buildNewsletterPrompt({
    projects, stats, bySector, byRegion, byStage,
    externalIntel, spotlightSector, spotlightCountry,
    editionNumber, editionDate, periodDays,
  });

  console.log(`[Newsletter] Generating monthly edition #${editionNumber}...`);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 12000,
    system: NEWSLETTER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content[0].type === "text" ? response.content[0].text : "";

  // Generate all 5 charts + top deals table in parallel (minimum 6 visuals per edition)
  const top10Deals = projects
    .filter(p => p.dealSizeUsdMn)
    .sort((a, b) => (b.dealSizeUsdMn || 0) - (a.dealSizeUsdMn || 0))
    .slice(0, 10);

  const [sectorChart, pipelineChart, regionalChart, countryChart, sectorCountChart] = await Promise.all([
    generateSectorChart(bySector),
    generatePipelineChart(byStage),
    generateRegionalChart(byRegion),
    generateCountryChart(byCountry),
    generateSectorCountChart(bySector),
  ]);
  const topDealsTable = generateTopDealsTable(top10Deals);

  // Convert markdown → HTML and inject all 6 visuals (1 table + 5 charts)
  const bodyHtml = markdownToHtml(content);
  const contentHtml = injectChartsIntoHtml(bodyHtml, {
    sectorChart,
    pipelineChart,
    regionalChart,
    countryChart,
    sectorCountChart,
    topDealsTable,
  });

  const execMatch = content.match(/## 1\. EXECUTIVE SUMMARY\s*([\s\S]*?)(?=## 2\.)/i);
  const executiveSummary = execMatch ? execMatch[1].trim().slice(0, 1000) : content.slice(0, 500);

  const monthYear = editionDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const title = `AfriEnergy Insights — Monthly Intelligence Report — ${monthYear}`;

  return {
    editionNumber,
    title,
    content,
    contentHtml,
    executiveSummary,
    spotlightSector,
    spotlightCountry,
    projectsAnalyzed: projects.length,
    totalInvestmentCovered: `$${(totalInvestment / 1000).toFixed(1)}B`,
    externalSourcesUsed: externalIntel.length,
    type: "insights",
  };
}

// ── Africa Energy Brief generator ─────────────────────────────────────────────

export async function generateBrief(periodDays = 14): Promise<GeneratedNewsletter> {
  let editionNumber = 1;
  try {
    const lastEdition = await db
      .select({ editionNumber: newslettersTable.editionNumber })
      .from(newslettersTable)
      .orderBy(desc(newslettersTable.editionNumber))
      .limit(1);
    editionNumber = (lastEdition[0]?.editionNumber ?? 0) + 1;
  } catch (err) {
    console.warn("[Brief] Could not load last edition:", (err as Error).message?.slice(0, 200));
  }

  const [projects, externalIntel] = await Promise.all([
    db.select().from(projectsTable).where(eq(projectsTable.reviewStatus, "approved")).limit(500),
    gatherExternalIntelligence(),
  ]);

  const totalInvestment = projects.reduce((sum, p) => sum + (p.dealSizeUsdMn || 0), 0);
  const { bySector, byRegion, byStage } = computeBreakdowns(projects);
  const stats = {
    total: projects.length,
    totalInvestment,
    countries: [...new Set(projects.map(p => p.country))].filter(Boolean) as string[],
  };

  const editionDate = new Date();
  const prompt = buildBriefPrompt({
    projects, stats, bySector, byStage,
    externalIntel, periodDays, editionDate, editionNumber,
  });

  console.log(`[Brief] Generating biweekly brief #${editionNumber}...`);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: BRIEF_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content[0].type === "text" ? response.content[0].text : "";

  // Generate 3 charts in parallel (minimum 3 per brief edition)
  const [sectorChart, pipelineChart, regionalChart] = await Promise.all([
    generateSectorChart(bySector),
    generatePipelineChart(byStage),
    generateRegionalChart(byRegion),
  ]);

  // Inject charts at specific sections in the brief
  function insertAfterBriefSection(src: string, keyword: string, content: string): string {
    const keyIdx = src.toLowerCase().indexOf(keyword.toLowerCase());
    if (keyIdx === -1) return src;
    const nextH2 = src.indexOf("<h2", keyIdx + keyword.length);
    if (nextH2 === -1) return src + content;
    return src.slice(0, nextH2) + content + src.slice(nextH2);
  }

  let bodyHtml = markdownToHtml(content);
  // 1. After Sector Pulse: sector investment chart
  if (sectorChart) {
    bodyHtml = insertAfterBriefSection(bodyHtml, "SECTOR PULSE", chartImageHtml(sectorChart, "Investment by Sector (USD $M) — AfriEnergy Tracker Data"));
  }
  // 2. After Deals to Watch: regional distribution chart
  if (regionalChart) {
    bodyHtml = insertAfterBriefSection(bodyHtml, "DEALS TO WATCH", chartImageHtml(regionalChart, "Investment by Region (USD $M) — AfriEnergy Tracker Data"));
  }
  // 3. After Data Snapshot (end): pipeline chart
  if (pipelineChart) {
    bodyHtml = bodyHtml + chartImageHtml(pipelineChart, "Deal Pipeline by Stage — AfriEnergy Tracker Data");
  }
  const contentHtml = bodyHtml;

  const execMatch = content.match(/## 1\. HEADLINE NUMBERS\s*([\s\S]*?)(?=## 2\.)/i);
  const executiveSummary = execMatch ? execMatch[1].trim().slice(0, 800) : content.slice(0, 400);

  const dateStr = editionDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const title = `AfriEnergy Brief — ${dateStr}`;

  return {
    editionNumber,
    title,
    content,
    contentHtml,
    executiveSummary,
    spotlightSector: "",
    spotlightCountry: "",
    projectsAnalyzed: projects.length,
    totalInvestmentCovered: `$${(totalInvestment / 1000).toFixed(1)}B`,
    externalSourcesUsed: externalIntel.length,
    type: "brief",
  };
}

// ── AI-powered editorial revision ─────────────────────────────────────────────

export async function reviseNewsletter(
  currentContent: string,
  instruction: string,
  sectionIndex?: number,
  type?: string
): Promise<string> {
  let contentToRevise = currentContent;
  let prefix = "";
  let suffix = "";

  if (sectionIndex !== undefined) {
    const sections = currentContent.split(/(?=^## \d+\.\s)/m);
    if (sectionIndex >= 0 && sectionIndex < sections.length) {
      prefix = sections.slice(0, sectionIndex).join("");
      contentToRevise = sections[sectionIndex];
      suffix = sections.slice(sectionIndex + 1).join("");
    }
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: `You are the editor of the AfriEnergy ${type === "brief" ? "Brief" : "Insights"} newsletter.
You will be given the current newsletter content (or a section of it) and an editorial instruction.
Revise the content according to the instruction.
IMPORTANT RULES:
- Preserve all factual data, numbers, project names, and dollar amounts exactly as they are
- Preserve the overall structure and section numbering
- Only change what the instruction asks for
- Return ONLY the revised content in the same markdown format — no commentary or explanation
- Do not add new data or statistics that weren't in the original
- Keep the same professional tone unless the instruction asks otherwise`,
    messages: [
      {
        role: "user",
        content: `## Current Content\n\n${contentToRevise}\n\n## Editorial Instruction\n\n${instruction}\n\nPlease return the revised content only.`,
      },
    ],
  });

  const revisedSection = response.content[0].type === "text" ? response.content[0].text : "";

  if (sectionIndex !== undefined) {
    return prefix + revisedSection + suffix;
  }
  return revisedSection;
}

// ── Save newsletter (works for both Insights and Brief) ───────────────────────

export async function saveNewsletter(newsletter: GeneratedNewsletter): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO newsletters
      (edition_number, title, content, executive_summary,
       spotlight_sector, spotlight_country,
       projects_analyzed, total_investment_covered, status, type)
    VALUES
      (${newsletter.editionNumber}, ${newsletter.title}, ${newsletter.content},
       ${newsletter.executiveSummary}, ${newsletter.spotlightSector ?? ""},
       ${newsletter.spotlightCountry ?? ""}, ${newsletter.projectsAnalyzed},
       ${newsletter.totalInvestmentCovered}, 'draft', ${newsletter.type})
    RETURNING id
  `);
  const rows = result.rows as Array<{ id: number }>;
  const id = rows[0].id;

  // Store the chart-injected HTML separately (best-effort — column may not exist on older DBs)
  if (newsletter.contentHtml) {
    try {
      await db.execute(sql`
        UPDATE newsletters SET content_html = ${newsletter.contentHtml} WHERE id = ${id}
      `);
    } catch {
      // Ignore if column doesn't exist yet on production DB
    }
  }

  return id;
}
