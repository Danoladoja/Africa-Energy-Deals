import { Router, type IRouter } from "express";
import { db, projectsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

const VALID_TECHNOLOGIES = ["Solar", "Wind", "Hydro", "Geothermal", "Oil", "Natural Gas", "EV"];

router.get("/stats/summary", async (_req, res) => {
  try {
    const [result] = await db
      .select({
        totalProjects: sql<number>`count(*)::int`,
        totalInvestmentUsdMn: sql<number>`coalesce(sum(deal_size_usd_mn), 0)`,
        totalCountries: sql<number>`count(distinct country)::int`,
        totalTechnologies: sql<number>`${VALID_TECHNOLOGIES.length}`,
        activeProjects: sql<number>`sum(case when lower(status) in ('active', 'under construction', 'financial close', 'development', 'operational') then 1 else 0 end)::int`,
        completedProjects: sql<number>`sum(case when lower(status) in ('completed', 'commissioned', 'operational') then 1 else 0 end)::int`,
      })
      .from(projectsTable);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/stats/by-country", async (_req, res) => {
  try {
    const results = await db
      .select({
        country: projectsTable.country,
        region: projectsTable.region,
        projectCount: sql<number>`count(*)::int`,
        totalInvestmentUsdMn: sql<number>`coalesce(sum(deal_size_usd_mn), 0)`,
        latitude: sql<number | null>`avg(latitude)`,
        longitude: sql<number | null>`avg(longitude)`,
      })
      .from(projectsTable)
      .groupBy(projectsTable.country, projectsTable.region)
      .orderBy(sql`sum(deal_size_usd_mn) desc nulls last`);

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/stats/by-technology", async (_req, res) => {
  try {
    const results = await db
      .select({
        technology: projectsTable.technology,
        projectCount: sql<number>`count(*)::int`,
        totalInvestmentUsdMn: sql<number>`coalesce(sum(deal_size_usd_mn), 0)`,
      })
      .from(projectsTable)
      .groupBy(projectsTable.technology)
      .orderBy(sql`sum(deal_size_usd_mn) desc nulls last`);

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/stats/by-region", async (_req, res) => {
  try {
    const results = await db
      .select({
        region: projectsTable.region,
        projectCount: sql<number>`count(*)::int`,
        totalInvestmentUsdMn: sql<number>`coalesce(sum(deal_size_usd_mn), 0)`,
        countries: sql<number>`count(distinct country)::int`,
      })
      .from(projectsTable)
      .groupBy(projectsTable.region)
      .orderBy(sql`sum(deal_size_usd_mn) desc nulls last`);

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/stats/by-year", async (_req, res) => {
  try {
    const results = await db
      .select({
        year: projectsTable.announcedYear,
        projectCount: sql<number>`count(*)::int`,
        totalInvestmentUsdMn: sql<number>`coalesce(sum(deal_size_usd_mn), 0)`,
      })
      .from(projectsTable)
      .groupBy(projectsTable.announcedYear)
      .orderBy(projectsTable.announcedYear);

    res.json(results.filter((r) => r.year !== null));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
