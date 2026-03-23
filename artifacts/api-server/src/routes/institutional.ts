/**
 * Institutional API endpoints — designed for programmatic access.
 * All return consistent { data: [...], meta: { total, page, limit } } structure.
 */
import { Router, type IRouter } from "express";
import { db, projectsTable } from "@workspace/db";
import { ilike, and, gte, lte, isNotNull, sql } from "drizzle-orm";

const router: IRouter = Router();

function paginate(pageStr: unknown, limitStr: unknown, maxLimit = 100) {
  const page  = Math.max(1, Number(pageStr) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(limitStr) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

// GET /api/deals — full-featured project listing (institutional naming convention)
router.get("/deals", async (req, res) => {
  try {
    const {
      country, region, technology, status, dealStage, developer,
      minDealSize, maxDealSize, search,
      page: pageQ, limit: limitQ,
    } = req.query;

    const { page, limit, offset } = paginate(pageQ, limitQ);
    const conditions = [];

    if (country)     conditions.push(ilike(projectsTable.country,     `%${country}%`));
    if (region)      conditions.push(ilike(projectsTable.region,      `%${region}%`));
    if (technology)  conditions.push(ilike(projectsTable.technology,  `%${technology}%`));
    if (status)      conditions.push(ilike(projectsTable.status,      `%${status}%`));
    if (dealStage)   conditions.push(ilike(projectsTable.dealStage!,  `%${dealStage}%`));
    if (developer)   conditions.push(ilike(projectsTable.developer!,  `%${developer}%`));
    if (minDealSize) conditions.push(gte(projectsTable.dealSizeUsdMn, Number(minDealSize)));
    if (maxDealSize) conditions.push(lte(projectsTable.dealSizeUsdMn, Number(maxDealSize)));
    if (search) {
      conditions.push(ilike(projectsTable.projectName, `%${search}%`));
    }

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ count }]] = await Promise.all([
      db.select().from(projectsTable).where(where).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(projectsTable).where(where),
    ]);

    res.json({
      data: rows,
      meta: { total: count, page, limit, pages: Math.ceil(count / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /api/countries — all countries with aggregated stats
router.get("/countries", async (_req, res) => {
  try {
    const rows = await db
      .select({
        country: projectsTable.country,
        region: projectsTable.region,
        totalInvestmentUsdMn: sql<number>`coalesce(sum(deal_size_usd_mn), 0)`,
        projectCount: sql<number>`count(*)::int`,
        avgDealSizeUsdMn: sql<number>`coalesce(avg(deal_size_usd_mn), 0)`,
        totalCapacityMw: sql<number>`coalesce(sum(capacity_mw), 0)`,
        technologies: sql<string>`string_agg(distinct technology, ', ' order by technology)`,
      })
      .from(projectsTable)
      .groupBy(projectsTable.country, projectsTable.region)
      .orderBy(sql`sum(deal_size_usd_mn) desc nulls last`);

    res.json({
      data: rows,
      meta: { total: rows.length },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /api/investors — developer/financier entities with portfolio stats
router.get("/investors", async (req, res) => {
  try {
    const { search, page: pageQ, limit: limitQ } = req.query;
    const { page, limit, offset } = paginate(pageQ, limitQ, 200);

    const rows = await db
      .select({
        developer: projectsTable.developer,
        projectCount: sql<number>`count(*)::int`,
        totalInvestmentUsdMn: sql<number>`coalesce(sum(deal_size_usd_mn), 0)`,
        avgDealSizeUsdMn: sql<number>`coalesce(avg(deal_size_usd_mn), 0)`,
        countries: sql<string>`string_agg(distinct country, ', ' order by country)`,
        technologies: sql<string>`string_agg(distinct technology, ', ' order by technology)`,
        latestDealYear: sql<number>`max(announced_year)`,
      })
      .from(projectsTable)
      .where(
        search
          ? and(isNotNull(projectsTable.developer), ilike(projectsTable.developer!, `%${search}%`))
          : isNotNull(projectsTable.developer)
      )
      .groupBy(projectsTable.developer)
      .orderBy(sql`count(*) desc`)
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(distinct developer)::int` })
      .from(projectsTable)
      .where(isNotNull(projectsTable.developer));

    res.json({
      data: rows,
      meta: { total: count, page, limit, pages: Math.ceil(count / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;
