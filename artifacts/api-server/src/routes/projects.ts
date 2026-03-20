import { Router, type IRouter } from "express";
import { db, projectsTable, insertProjectSchema } from "@workspace/db";
import { ilike, and, gte, lte, eq, sql } from "drizzle-orm";

const router: IRouter = Router();

// GET all projects with optional filters
router.get("/projects", async (req, res) => {
  try {
    const { country, region, technology, status, minDealSize, maxDealSize, search, page = "1", limit = "50" } = req.query;
    const conditions = [];
    if (country) conditions.push(ilike(projectsTable.country, String(country)));
    if (region) conditions.push(ilike(projectsTable.region, String(region)));
    if (technology) conditions.push(ilike(projectsTable.technology, String(technology)));
    if (status) conditions.push(ilike(projectsTable.status, String(status)));
    if (minDealSize) conditions.push(gte(projectsTable.dealSizeUsdMn, Number(minDealSize)));
    if (maxDealSize) conditions.push(lte(projectsTable.dealSizeUsdMn, Number(maxDealSize)));
    if (search) conditions.push(ilike(projectsTable.projectName, `%${String(search)}%`));
    const offset = (Number(page) - 1) * Number(limit);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [projects, countResult] = await Promise.all([
      db.select().from(projectsTable).where(whereClause).limit(Number(limit)).offset(offset).orderBy(projectsTable.id),
      db.select({ count: sql`count(*)` }).from(projectsTable).where(whereClause),
    ]);
    const total = Number(countResult[0].count);
    res.json({ projects, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// GET single project by ID
router.get("/projects/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid project ID" });
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(project);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

// POST create a new project
router.post("/projects", async (req, res) => {
  try {
    const parsed = insertProjectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid project data", details: parsed.error.issues });
    const [project] = await db.insert(projectsTable).values(parsed.data).returning();
    res.status(201).json(project);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create project" });
  }
});

// DELETE a project by ID
router.delete("/projects/:id", async (req, res) => {
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

// PATCH (update) a project by ID
router.patch("/projects/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    const updates = req.body;
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No update fields provided" });
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
