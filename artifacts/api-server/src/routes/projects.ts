import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, projectsTable, insertProjectSchema } from "@workspace/db";
import { ilike, and, gte, lte, eq, sql, desc, isNotNull, or } from "drizzle-orm";

const router: IRouter = Router();

// Valid technology categories (canonical sectors)
const VALID_TECHNOLOGIES = [
  "Solar", "Wind", "Hydro", "Geothermal", "Oil & Gas",
  "Grid Expansion", "Battery & Storage", "Hydrogen",
  "Nuclear", "Bioenergy", "Clean Cooking", "Coal",
];

// Valid deal stages
const VALID_DEAL_STAGES = ["Announced", "Mandated", "Financial Close", "Construction", "Commissioned", "Suspended"];

// Allowed fields for PATCH updates (whitelist to prevent overwriting id, etc.)
// Use camelCase JS property names that match projectsTable column definitions exactly.
const ALLOWED_UPDATE_FIELDS = [
  "projectName", "country", "region", "technology", "status",
  "dealSizeUsdMn", "capacityMw", "yearAnnounced", "latitude", "longitude",
  "description", "newsUrl", "newsUrl2", "sourceUrl",
  // Deal lifecycle & enriched fields
  "dealStage", "developer", "financiers", "dfiInvolvement", "offtaker",
  "financialCloseDate", "commissioningDate", "announcementDate",
  "debtEquitySplit", "grantComponent",
  // Financing structure fields
  "financingType", "financingSubTypes", "concessionalTerms",
  "ppaTermYears", "ppaTariffUsdKwh", "guarantor", "climateFinanceTag",
];

// Map incoming field aliases to the exact Drizzle column property names on projectsTable.
// Keys: accepted request field names. Values: projectsTable JS property names.
const FIELD_NAME_MAP: Record<string, string> = {
  yearAnnounced: "announcedYear", // schema: announcedYear: integer("announced_year")
};

// API Key authentication middleware for write operations
const requireApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers["x-api-key"];
  const expectedKey = process.env.API_KEY;

  if (!expectedKey) {
    res.status(503).json({ error: "Write operations are not configured. Set API_KEY environment variable." });
    return;
  }

  if (!apiKey || apiKey !== expectedKey) {
    res.status(401).json({ error: "Unauthorized. Valid API key required." });
    return;
  }

  next();
};

// GET all projects with optional filters
router.get("/projects", async (req, res) => {
  try {
    const {
      country, region, technology, status,
      minDealSize, maxDealSize, search,
      developer, dealStage, dfiInvolvement,
      financingType, climateFinanceTag, hasPPA, hasGrant,
      page = "1", limit = "50",
    } = req.query;

    const conditions = [eq(projectsTable.reviewStatus, "approved")];
    if (country) conditions.push(ilike(projectsTable.country, String(country)));
    if (region) conditions.push(ilike(projectsTable.region, String(region)));
    if (technology) conditions.push(ilike(projectsTable.technology, String(technology)));
    if (status) conditions.push(ilike(projectsTable.status, String(status)));
    if (minDealSize) conditions.push(gte(projectsTable.dealSizeUsdMn, Number(minDealSize)));
    if (maxDealSize) conditions.push(lte(projectsTable.dealSizeUsdMn, Number(maxDealSize)));
    if (search) conditions.push(ilike(projectsTable.projectName, `%${String(search)}%`));
    if (developer) conditions.push(ilike(projectsTable.developer, `%${String(developer)}%`));
    if (dealStage) conditions.push(ilike(projectsTable.dealStage, String(dealStage)));
    if (dfiInvolvement) conditions.push(ilike(projectsTable.dfiInvolvement, `%${String(dfiInvolvement)}%`));
    if (financingType) conditions.push(ilike(projectsTable.financingType, String(financingType)));
    if (climateFinanceTag) conditions.push(ilike(projectsTable.climateFinanceTag, String(climateFinanceTag)));
    if (hasPPA === "true") conditions.push(isNotNull(projectsTable.ppaTermYears));
    if (hasGrant === "true") conditions.push(isNotNull(projectsTable.grantComponent));

    const offset = (Number(page) - 1) * Number(limit);
    const whereClause = and(...conditions);

    const [projects, countResult] = await Promise.all([
      db.select().from(projectsTable).where(whereClause).limit(Number(limit)).offset(Math.max(0, Number(offset) || 0)).orderBy(projectsTable.id),
      db.select({ count: sql`count(*)` }).from(projectsTable).where(whereClause),
    ]);

    const total = Number(countResult[0].count);
    res.json({ projects, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// GET latest projects (ordered by createdAt desc, then announcedYear desc)
router.get("/projects/latest", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 5), 20);
    const projects = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.reviewStatus, "approved"))
      .orderBy(desc(projectsTable.createdAt), desc(projectsTable.announcedYear))
      .limit(limit);
    res.json({ projects });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch latest projects" });
  }
});

// GET single project by ID (approved only for public access)
router.get("/projects/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid project ID" });
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.reviewStatus, "approved")));
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(project);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

// ── Rate limiter for /projects/similar (10 req/min per IP) ───────────────────
const similarRateLimiter = new Map<string, number[]>();
function allowSimilarRequest(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const prev = (similarRateLimiter.get(ip) ?? []).filter(t => now - t < windowMs);
  if (prev.length >= 10) return false;
  similarRateLimiter.set(ip, [...prev, now]);
  return true;
}

// GET /api/projects/similar?name=X&country=Y — public fuzzy name search (10/min per IP)
router.get("/projects/similar", async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] as string ?? req.socket.remoteAddress ?? "unknown").split(",")[0].trim();
  if (!allowSimilarRequest(ip)) {
    return res.status(429).json({ error: "Too many requests. Please wait a moment." });
  }

  const name = String(req.query.name ?? "").trim();
  const country = String(req.query.country ?? "").trim();
  if (name.length < 3) {
    return res.json({ similar: [] });
  }

  try {
    const results = await db.execute(
      country
        ? sql`
          SELECT id, project_name, country, technology, deal_size_usd_mn, review_status,
                 ROUND((public.similarity(project_name, ${name}) * 100)::numeric, 0) AS score
          FROM energy_projects
          WHERE country ILIKE ${country}
            AND public.similarity(project_name, ${name}) > 0.3
          ORDER BY public.similarity(project_name, ${name}) DESC
          LIMIT 3
        `
        : sql`
          SELECT id, project_name, country, technology, deal_size_usd_mn, review_status,
                 ROUND((public.similarity(project_name, ${name}) * 100)::numeric, 0) AS score
          FROM energy_projects
          WHERE public.similarity(project_name, ${name}) > 0.4
          ORDER BY public.similarity(project_name, ${name}) DESC
          LIMIT 3
        `
    );
    res.json({ similar: results.rows });
  } catch (err) {
    console.error("[/projects/similar]", err);
    res.status(500).json({ error: "Search failed" });
  }
});

// GET valid technology categories
router.get("/technologies", (_req, res) => {
  res.json({ technologies: VALID_TECHNOLOGIES });
});

// GET valid deal stages
router.get("/deal-stages", (_req, res) => {
  res.json({ dealStages: VALID_DEAL_STAGES });
});

// Health check
router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// POST create a new project (requires API key)
router.post("/projects", requireApiKey, async (req, res) => {
  try {
    const parsed = insertProjectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid project data", details: parsed.error.issues });

    // Deduplication: reject if a project with the same name + country already exists (case-insensitive)
    const incomingName = parsed.data.projectName;
    const incomingCountry = (parsed.data as any).country;
    if (incomingName && incomingCountry) {
      const [clash] = await db
        .select({ id: projectsTable.id, projectName: projectsTable.projectName })
        .from(projectsTable)
        .where(and(ilike(projectsTable.projectName, incomingName), ilike(projectsTable.country, incomingCountry)))
        .limit(1);
      if (clash) {
        return res.status(409).json({
          error: "Duplicate project",
          message: `A project named "${clash.projectName}" in ${incomingCountry} already exists.`,
          existingId: clash.id,
        });
      }
    }

    const [project] = await db.insert(projectsTable).values(parsed.data).returning();
    res.status(201).json(project);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create project" });
  }
});

// DELETE a project by ID (requires API key)
router.delete("/projects/:id", requireApiKey, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    const [deleted] = await db.delete(projectsTable).where(eq(projectsTable.id, id)).returning();
    if (!deleted) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.json({ message: "Project deleted successfully", project: deleted });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

// PATCH (update) a project by ID (requires API key)
router.patch("/projects/:id", requireApiKey, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    const rawUpdates = req.body;
    if (!rawUpdates || Object.keys(rawUpdates).length === 0) {
      return res.status(400).json({ error: "No update fields provided" });
    }
    // Validate technology if being updated
    if (rawUpdates.technology !== undefined && !VALID_TECHNOLOGIES.includes(rawUpdates.technology)) {
      return res.status(400).json({
        error: `Invalid technology value: "${rawUpdates.technology}". Must be one of: ${VALID_TECHNOLOGIES.join(", ")}`,
        validTechnologies: VALID_TECHNOLOGIES,
      });
    }
    // Whitelist fields and remap legacy names to Drizzle property names
    const updates: Record<string, unknown> = {};
    for (const key of Object.keys(rawUpdates)) {
      if (ALLOWED_UPDATE_FIELDS.includes(key)) {
        const mappedKey = FIELD_NAME_MAP[key] ?? key;
        updates[mappedKey] = rawUpdates[key];
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid update fields provided", allowedFields: ALLOWED_UPDATE_FIELDS });
    }
    const [updated] = await db.update(projectsTable).set(updates).where(eq(projectsTable.id, id)).returning();
    if (!updated) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update project" });
  }
});

export default router;
