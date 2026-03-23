import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, projectsTable } from "@workspace/db";
import { ilike, and, gte, lte } from "drizzle-orm";

const router: IRouter = Router();

// ── Simple sliding-window rate limiter ────────────────────────────────────────
const rateLimitMap = new Map<string, number[]>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const prev = (rateLimitMap.get(ip) ?? []).filter(t => now - t < 60_000);
  if (prev.length >= 10) return false;
  prev.push(now);
  rateLimitMap.set(ip, prev);
  return true;
}

// ── System prompt ─────────────────────────────────────────────────────────────
const FILTER_SYSTEM_PROMPT = `You are a filter-extractor for AfriEnergy Tracker — a database of African energy investment deals.

Extract structured search filters from the user's query. Return ONLY valid JSON (no markdown, no explanation) with these optional fields — use null for any not explicitly mentioned:

{
  "country": string | null,        // exact country name
  "region": string | null,         // one of the valid regions
  "technology": string | null,     // one of the valid technology types
  "status": string | null,         // one of the valid statuses
  "minDealSize": number | null,    // minimum deal size in USD millions
  "maxDealSize": number | null,    // maximum deal size in USD millions
  "yearMin": number | null,        // minimum announced year
  "yearMax": number | null,        // maximum announced year
  "search": string | null          // keyword for project name search
}

VALID FIELD VALUES:
- technology: "Solar" | "Wind" | "Hydro" | "Grid & Storage" | "Oil & Gas" | "Coal" | "Nuclear" | "Bioenergy"
- region: "West Africa" | "East Africa" | "North Africa" | "Southern Africa" | "Central Africa"
- country: "Rwanda" | "Nigeria" | "Kenya" | "Mozambique" | "Senegal" | "Mauritania" | "Morocco" | "Ethiopia" | "South Africa" | "Uganda" | "Zambia" | "Egypt" | "Cameroon" | "DRC" | "Côte d'Ivoire" | "Ghana" | "Tanzania" | "Madagascar" | "Cape Verde" | "Benin" | "Mali" | "Zimbabwe" | "Malawi"
- status: "Announced" | "Construction" | "Operational" | "Financed" | "Commissioned"

CONVERSION RULES:
- "$1B" or "1 billion" → 1000 (million)
- "$500M" or "500 million" → 500
- "above $Xm" → minDealSize = X
- "below $Xm" → maxDealSize = X  
- "over $X billion" → minDealSize = X * 1000
- "last N years" → yearMin = ${new Date().getFullYear() - 3}, yearMax = ${new Date().getFullYear()}
- "recent" or "last 2 years" → yearMin = ${new Date().getFullYear() - 2}
- "large deals" → minDealSize = 500
- If user mentions a region (e.g., "West Africa"), use region field — don't enumerate countries
- Only filter on what is explicitly mentioned; leave others null
- "renewable" or "clean energy" → do NOT set technology (multiple types apply)
- "fossil" or "oil" → technology = "Oil & Gas"
- "grid" or "storage" or "battery" → technology = "Grid & Storage"
- "hydro" or "dam" → technology = "Hydro"

Return ONLY the JSON object.`;

// ── POST /api/nlq ─────────────────────────────────────────────────────────────
router.post("/nlq", async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";

  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: "Rate limit exceeded. Please wait a minute and try again." });
    return;
  }

  const { query } = req.body ?? {};
  if (!query?.trim()) {
    res.status(400).json({ error: "Query is required" });
    return;
  }
  if (typeof query !== "string" || query.length > 500) {
    res.status(400).json({ error: "Query must be a string under 500 characters" });
    return;
  }

  try {
    // Step 1: Extract structured filters from natural language
    const filterMsg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system: FILTER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: query }],
    });

    let filters: Record<string, any> = {};
    try {
      const raw = filterMsg.content[0].type === "text" ? filterMsg.content[0].text.trim() : "{}";
      // Strip any accidental markdown fences
      const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
      filters = JSON.parse(cleaned);
    } catch {
      filters = {};
    }

    // Step 2: Query the database with extracted filters
    const conditions = [];
    if (filters.country)     conditions.push(ilike(projectsTable.country,    filters.country));
    if (filters.region)      conditions.push(ilike(projectsTable.region,     filters.region));
    if (filters.technology)  conditions.push(ilike(projectsTable.technology, filters.technology));
    if (filters.status)      conditions.push(ilike(projectsTable.status,     `%${filters.status}%`));
    if (filters.search)      conditions.push(ilike(projectsTable.projectName,`%${filters.search}%`));
    if (filters.minDealSize) conditions.push(gte(projectsTable.dealSizeUsdMn, Number(filters.minDealSize)));
    if (filters.maxDealSize) conditions.push(lte(projectsTable.dealSizeUsdMn, Number(filters.maxDealSize)));
    if (filters.yearMin)     conditions.push(gte(projectsTable.announcedYear, Number(filters.yearMin)));
    if (filters.yearMax)     conditions.push(lte(projectsTable.announcedYear, Number(filters.yearMax)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const projects = await db
      .select()
      .from(projectsTable)
      .where(whereClause)
      .limit(50)
      .orderBy(projectsTable.dealSizeUsdMn);

    // Step 3: Generate a natural language summary
    const totalInv = projects.reduce((s, p) => s + (p.dealSizeUsdMn ?? 0), 0);
    const countries = [...new Set(projects.map(p => p.country))].slice(0, 5);
    const techs     = [...new Set(projects.map(p => p.technology))];

    const summaryPrompt = projects.length === 0
      ? `The user searched for: "${query}". No projects were found matching these criteria. Write 1 sentence explaining what was searched and suggesting the user try broader terms.`
      : `The user searched for: "${query}". Found ${projects.length} projects totalling $${totalInv >= 1000 ? (totalInv / 1000).toFixed(1) + "B" : totalInv.toFixed(0) + "M"} USD across ${countries.join(", ")}. Technologies: ${techs.join(", ")}. Top deals: ${projects.slice(-3).reverse().map(p => `${p.projectName} (${p.country}, $${p.dealSizeUsdMn}M)`).join("; ")}. Write 1–2 sentences summarising the results factually and concisely.`;

    const summaryMsg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      messages: [{ role: "user", content: summaryPrompt }],
    });

    const summary = summaryMsg.content[0].type === "text" ? summaryMsg.content[0].text.trim() : "";

    res.json({
      projects,
      summary,
      filters,
      total: projects.length,
    });
  } catch (err: any) {
    console.error("[nlq] Error:", err?.message ?? err);
    res.status(500).json({ error: "Failed to process query. Please try again." });
  }
});

export default router;
