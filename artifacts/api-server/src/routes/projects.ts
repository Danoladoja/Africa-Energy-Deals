import { Router, type IRouter } from "express";
import { db, projectsTable, insertProjectSchema } from "@workspace/db";
import { ilike, and, gte, lte, eq, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/projects", async (req, res) => {
  try {
    const {
      search,
      country,
      technology,
      status,
      region,
      minDealSize,
      maxDealSize,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    if (search) conditions.push(ilike(projectsTable.projectName, `%${search}%`));
    if (country) conditions.push(eq(projectsTable.country, country));
    if (technology) conditions.push(eq(projectsTable.technology, technology));
    if (status) conditions.push(eq(projectsTable.status, status));
    if (region) conditions.push(eq(projectsTable.region, region));
    if (minDealSize) conditions.push(gte(projectsTable.dealSizeUsdMn, parseFloat(minDealSize)));
    if (maxDealSize) conditions.push(lte(projectsTable.dealSizeUsdMn, parseFloat(maxDealSize)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [projects, countResult] = await Promise.all([
      db.select().from(projectsTable).where(where).limit(limitNum).offset(offset).orderBy(projectsTable.id),
      db.select({ count: sql<number>`count(*)::int` }).from(projectsTable).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;

    res.json({
      projects,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/projects/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
    if (!project) return res.status(404).json({ error: "Project not found" });

    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/projects", async (req, res) => {
  try {
    const parsed = insertProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    const [project] = await db.insert(projectsTable).values(parsed.data).returning();
    res.status(201).json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
