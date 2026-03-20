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
