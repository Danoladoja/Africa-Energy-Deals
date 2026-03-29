import { Router, type IRouter, type Request, type Response } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, projectsTable, newslettersTable } from "@workspace/db";

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
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";

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
    // Query the database for relevant project data
    let projects: any[] = [];
    try {
      projects = await db.select().from(projectsTable).limit(500);
    } catch (dbErr) {
      console.error("[Chat] DB query error:", dbErr);
    }

    // Apply context filters if provided
    let filteredProjects = projects;
    if (context) {
      if (context.sector) {
        filteredProjects = filteredProjects.filter(p => p.technology === context.sector);
      }
      if (context.country) {
        filteredProjects = filteredProjects.filter(p => p.country === context.country);
      }
      if (context.region) {
        filteredProjects = filteredProjects.filter(p => p.region === context.region);
      }
    }

    // Build aggregate stats from actual data
    const totalInvestment = filteredProjects.reduce((sum, p) => sum + (p.dealSizeUsdMn || 0), 0);
    const countries = [...new Set(filteredProjects.map(p => p.country))];
    const sectors = [...new Set(filteredProjects.map(p => p.technology))];

    // Build the data context message
    const dataContext = `INTERNAL DATA PROVIDED (${filteredProjects.length} projects from AfriEnergy Tracker PostgreSQL database):

AGGREGATE SUMMARY:
- Total projects in dataset: ${filteredProjects.length}
- Total tracked investment: $${(totalInvestment / 1000).toFixed(1)}B (USD)
- Countries covered: ${countries.length} (${countries.slice(0, 10).join(", ")}${countries.length > 10 ? `, +${countries.length - 10} more` : ""})
- Sectors covered: ${sectors.join(", ")}

BY SECTOR:
${sectors.map(s => {
  const sectorProjects = filteredProjects.filter(p => p.technology === s);
  const sectorInvestment = sectorProjects.reduce((sum, p) => sum + (p.dealSizeUsdMn || 0), 0);
  return `- ${s}: ${sectorProjects.length} projects, $${(sectorInvestment / 1000).toFixed(1)}B total investment`;
}).join("\n")}

BY REGION:
${["West Africa", "East Africa", "North Africa", "Southern Africa", "Central Africa"].map(r => {
  const rp = filteredProjects.filter(p => p.region === r);
  const ri = rp.reduce((sum, p) => sum + (p.dealSizeUsdMn || 0), 0);
  return `- ${r}: ${rp.length} projects, $${(ri / 1000).toFixed(1)}B`;
}).join("\n")}

FULL PROJECT DATA (first 200 records for context):
${JSON.stringify(filteredProjects.slice(0, 200).map(p => ({
  id: p.id,
  projectName: p.projectName,
  country: p.country,
  region: p.region,
  technology: p.technology,
  dealSizeUsdMn: p.dealSizeUsdMn,
  status: p.status,
  dealStage: p.dealStage,
  investors: p.investors,
  developer: p.developer,
  financiers: p.financiers,
  dfiInvolvement: p.dfiInvolvement,
  offtaker: p.offtaker,
  announcedYear: p.announcedYear,
  closedYear: p.closedYear,
  capacityMw: p.capacityMw,
  financingType: p.financingType,
  debtEquitySplit: p.debtEquitySplit,
  concessionalTerms: p.concessionalTerms,
  description: p.description,
})), null, 0)}

IMPORTANT: You may ONLY reference projects and data points from the DATA PROVIDED above. Do NOT use your training data to supplement with projects, statistics, or deals not listed above.`;

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
      model: "claude-sonnet-4-20250514",
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
      projectsAnalyzed: filteredProjects.length,
      totalInvestment: `$${(totalInvestment / 1000).toFixed(1)}B`,
      countriesCovered: countries.length,
      sectorsCovered: sectors.length,
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
