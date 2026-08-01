import { Router, type IRouter, type Request, type Response } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, projectsTable, newslettersTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// Per-IP rate limit: 20 chat requests per minute
const chatRateMap = new Map<string, number[]>();
function checkChatRateLimit(ip: string): boolean {
  const now = Date.now();
  const prev = (chatRateMap.get(ip) ?? []).filter(t => now - t < 60_000);
  if (prev.length >= 20) return false;
  prev.push(now);
  chatRateMap.set(ip, prev);
  return true;
}

const CHAT_SYSTEM_PROMPT = `You are the AfriEnergy AI — an expert AI assistant embedded in the Africa Energy Investment Tracker platform. You serve two roles:

ROLE 1 — DATA LOOKUP & SEARCH:
When users ask to find, list, filter, or look up specific deals, projects, investors, or countries, respond with structured results from the data. Format results clearly with project names, countries, sectors, and deal sizes. Use tables or bullet lists for multiple results.

ROLE 2 — INTELLIGENCE & ANALYSIS:
When users ask for analysis, trends, commentary, comparisons, risk assessments, or strategic insights, produce professional-grade intelligence briefings. Write like a Bloomberg or IJ Global market analyst. Structure analysis with clear sections and data citations.

HOW TO DECIDE WHICH ROLE:
- "Show me / Find / List / Which deals..." → ROLE 1 (data lookup)
- "What are the trends / Analyze / Compare / Why / What does the data tell us..." → ROLE 2 (analysis)
- "Tell me about [country/sector]" → Use BOTH: provide key data points AND analytical commentary
- When in doubt, provide BOTH a data summary and analytical commentary

⛔ ABSOLUTE DATA INTEGRITY RULES — THESE OVERRIDE ALL OTHER INSTRUCTIONS:
1. NEVER invent project names, deal sizes, investor names, country data, or any statistics. Every data point you cite MUST come from the DATA PROVIDED below.
2. NEVER extrapolate or project numbers beyond what the data shows. If 69 solar projects exist, say "69" — not "approximately 70" or "nearly 100."
3. NEVER state trends unless the data contains time-series evidence. Do NOT say "investment is increasing" unless you can cite specific year-over-year numbers from announcedYear/closedYear fields.
4. NEVER fill gaps with assumptions. If a field is null/empty, say "not disclosed" or "data not available."
5. ALWAYS prefix external intelligence with its source. Say "According to IRENA's 2025 report..." — NEVER present external claims as your own analysis.
6. ALWAYS disclose data limitations in every response. Include at least one caveat such as "Based on [N] tracked projects; actual market activity may be broader."
7. When asked about something NOT in the data, say so explicitly: "The tracker does not currently contain data on [topic]."
8. NEVER use certainty language beyond what data supports. Use "The data suggests..." / "Based on [N] projects tracked..." — NOT "This clearly shows..." / "Undoubtedly..."
9. If you are uncertain about a data point, say "I cannot confirm this from the available data" rather than guessing.
10. NEVER supplement with knowledge from your training data. Only use the DATA PROVIDED and any EXTERNAL INTELLIGENCE PROVIDED.

GUIDELINES FOR ALL RESPONSES:
- Always ground responses in the ACTUAL DATA provided — cite specific deal counts, dollar amounts, countries, and percentages
- Format monetary values consistently (e.g., "$1.2B", "$450M")
- Use proper financial terminology (financial close, commissioning, PPA, offtaker, etc.)
- When discussing deal stages, note the distinction between Announced, Financial Close, Construction, and Commissioned
- Keep responses conversational but professional
- For analysis responses: identify patterns, anomalies, concentrations, and gaps
- For analysis responses: provide forward-looking commentary ONLY where the data supports it with concrete numbers
- Flag data quality caveats when relevant (e.g., "based on 156 tracked projects; actual market activity may be broader")
- Highlight the role of DFIs, concessional finance, and blended finance where present
- Support follow-up questions — remember conversation context and build on previous responses
- If the user asks something the data cannot answer, say so clearly and suggest what you CAN analyze

DATA SCHEMA — Each project record contains:
- projectName, country, region, technology (sector)
- dealSizeUsdMn (investment value in USD millions)
- investors, developer, financiers, offtaker, guarantor
- status (Active/Completed), dealStage (Announced/Financial Close/Construction/Commissioned)
- capacityMw (generation capacity)
- announcedYear, closedYear, financialCloseDate, commissioningDate
- financingType, financingSubTypes, debtEquitySplit, grantComponent, concessionalTerms
- ppaTermYears, ppaTariffUsdKwh
- dfiInvolvement, climateFinanceTag
- confidenceScore, extractionSource
- description, latitude, longitude`;

// POST /api/chat — SSE streaming chat endpoint
router.post("/chat", async (req: Request, res: Response): Promise<void> => {
  const ip = req.ip ?? "unknown"; // trust proxy is set — req.ip is the real client

  if (!checkChatRateLimit(ip)) {
    res.status(429).json({ error: "Rate limit exceeded. Please wait a minute and try again." });
    return;
  }

  const { messages, context } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "Messages array is required" });
    return;
  }

  // Validate message format
  const validMessages = messages.filter(
    (m: any) => m && typeof m.role === "string" && typeof m.content === "string"
      && (m.role === "user" || m.role === "assistant")
  );
  if (validMessages.length === 0) {
    res.status(400).json({ error: "At least one valid message is required" });
    return;
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Build grounded context: full-dataset aggregates (disclosed-only, matching
    // the site's accounting rules) + the largest disclosed deals as compact rows.
    // This replaces the old approach (500 arbitrary rows, estimate-inflated sums,
    // 200 full JSON records) with representative, honest, token-efficient context.
    const NOT_CANCELLED_SQL = `(deal_stage IS NULL OR lower(deal_stage) NOT IN ('cancelled','decommissioned')) AND lower(status) NOT IN ('cancelled','decommissioned')`;
    const ctxFilters: string[] = [];
    const ctxVals: unknown[] = [];
    if (context?.sector) { ctxVals.push(context.sector); ctxFilters.push(`technology = $${ctxVals.length}`); }
    if (context?.country) { ctxVals.push(context.country); ctxFilters.push(`country = $${ctxVals.length}`); }
    if (context?.region) { ctxVals.push(context.region); ctxFilters.push(`region = $${ctxVals.length}`); }
    const ctxWhere = ctxFilters.length ? ` AND ${ctxFilters.join(" AND ")}` : "";
    const baseWhere = `review_status = 'approved' AND region <> 'Other' AND ${NOT_CANCELLED_SQL}${ctxWhere}`;

    let dataContext = "INTERNAL DATA PROVIDED: (database unavailable)";
    let ctxSummary = { projects: 0, countries: 0, disclosedBn: "0.0", sectors: 0 };
    try {
      const [agg, bySector, byRegion, byCountry, topDeals] = await Promise.all([
        pool.query(`SELECT count(*)::int AS projects, count(distinct country)::int AS countries,
                           coalesce(sum(deal_size_usd_mn) filter (where is_estimated = false), 0) AS disclosed_mn,
                           count(*) filter (where is_estimated = false AND deal_size_usd_mn IS NOT NULL)::int AS disclosed_deals
                    FROM energy_projects WHERE ${baseWhere}`, ctxVals),
        pool.query(`SELECT technology, count(*)::int AS n,
                           coalesce(sum(deal_size_usd_mn) filter (where is_estimated = false), 0) AS mn
                    FROM energy_projects WHERE ${baseWhere} GROUP BY technology ORDER BY mn DESC`, ctxVals),
        pool.query(`SELECT region, count(*)::int AS n,
                           coalesce(sum(deal_size_usd_mn) filter (where is_estimated = false), 0) AS mn
                    FROM energy_projects WHERE ${baseWhere} GROUP BY region ORDER BY mn DESC`, ctxVals),
        pool.query(`SELECT country, count(*)::int AS n,
                           coalesce(sum(deal_size_usd_mn) filter (where is_estimated = false), 0) AS mn
                    FROM energy_projects WHERE ${baseWhere} GROUP BY country ORDER BY mn DESC LIMIT 20`, ctxVals),
        pool.query(`SELECT id, project_name, country, region, technology, deal_size_usd_mn, is_estimated,
                           deal_stage, status, announced_year, capacity_mw, developer, financiers,
                           dfi_involvement, financing_type, extraction_source
                    FROM energy_projects
                    WHERE ${baseWhere} AND deal_size_usd_mn IS NOT NULL AND is_estimated = false
                    ORDER BY deal_size_usd_mn DESC LIMIT 250`, ctxVals),
      ]);

      const a = agg.rows[0] as { projects: number; countries: number; disclosed_mn: string | number; disclosed_deals: number };
      ctxSummary = { projects: a.projects, countries: a.countries, disclosedBn: (Number(a.disclosed_mn) / 1000).toFixed(1), sectors: bySector.rows.length };
      const fmtB = (mn: number) => `$${(Number(mn) / 1000).toFixed(1)}B`;
      const dealLine = (p: Record<string, unknown>) =>
        `#${p.id}|${p.project_name}|${p.country}|${p.technology}|$${Math.round(Number(p.deal_size_usd_mn))}M|${p.deal_stage ?? p.status ?? "?"}|${p.announced_year ?? "?"}|` +
        `${p.capacity_mw ? Math.round(Number(p.capacity_mw)) + "MW" : "-"}|dev:${(p.developer as string | null)?.slice(0, 60) ?? "-"}|fin:${(p.financiers as string | null)?.slice(0, 60) ?? "-"}|` +
        `dfi:${(p.dfi_involvement as string | null)?.slice(0, 40) ?? "-"}|type:${p.financing_type ?? "-"}`;

      dataContext = `INTERNAL DATA PROVIDED (live AfriEnergy Tracker database${ctxFilters.length ? ", filtered to the user's current view" : ""}):

ACCOUNTING RULES (identical to the public site — always follow them):
- Dollar totals count DISCLOSED transaction values only. Capacity-based estimates are flagged and EXCLUDED from totals; individual estimated figures must always be described as estimates.
- Cancelled and decommissioned projects are excluded from all statistics.

AGGREGATES (cover ALL ${a.projects} tracked projects in scope — not a sample):
- Tracked projects: ${a.projects} across ${a.countries} countries
- Disclosed investment: ${fmtB(Number(a.disclosed_mn))} across ${a.disclosed_deals} deals with disclosed values

BY SECTOR (projects, disclosed investment):
${bySector.rows.map((r: any) => `- ${r.technology}: ${r.n} projects, ${fmtB(Number(r.mn))}`).join("\n")}

BY REGION:
${byRegion.rows.map((r: any) => `- ${r.region}: ${r.n} projects, ${fmtB(Number(r.mn))}`).join("\n")}

TOP COUNTRIES (by disclosed investment):
${byCountry.rows.map((r: any) => `- ${r.country}: ${r.n} projects, ${fmtB(Number(r.mn))}`).join("\n")}

LARGEST DISCLOSED DEALS (top ${topDeals.rows.length}; fields: id|name|country|sector|size|stage|year|capacity|developer|financiers|dfi|financingType):
${topDeals.rows.map((r: any) => dealLine(r)).join("\n")}

IMPORTANT: You may ONLY reference projects and data points from the DATA PROVIDED above. Do NOT use your training data to supplement with projects, statistics, or deals not listed above. The deal list contains only the largest disclosed-value deals — when asked about totals or counts, use the AGGREGATES section, which covers the full dataset. If a specific project is not in the deal list, say the tracker may hold it but it is outside this conversation's context window.`;
    } catch (dbErr) {
      console.error("[Chat] DB context error:", dbErr);
    }

    // Construct the messages array for Claude
    const claudeMessages: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: dataContext },
      { role: "assistant", content: "I have received and reviewed the AfriEnergy project dataset. I will only reference data from this dataset in my responses, never supplementing with external knowledge or training data. I'm ready to assist." },
      ...validMessages.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content as string,
      })),
    ];

    // Stream the Claude response
    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: CHAT_SYSTEM_PROMPT,
      messages: claudeMessages,
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        sendEvent({ type: "text", content: chunk.delta.text });
      }
    }

    // Compute and send the data summary from actual query results (NOT from Claude's text)
    const dataSummary = {
      projectsAnalyzed: ctxSummary.projects,
      totalInvestment: `$${ctxSummary.disclosedBn}B`,
      countriesCovered: ctxSummary.countries,
      sectorsCovered: ctxSummary.sectors,
      queryTimestamp: new Date().toISOString(),
      dataSource: "afrienergytracker_postgresql",
    };

    sendEvent({ type: "done", dataSummary });
    res.end();
  } catch (err: any) {
    console.error("[Chat] Error:", err);
    const msg = err?.status === 401
      ? "AI Insights requires configuration. Please contact the administrator."
      : "An error occurred while generating the response. Please try again.";
    sendEvent({ type: "error", message: msg });
    res.end();
  }
});

export default router;
