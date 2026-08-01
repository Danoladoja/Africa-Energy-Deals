import { Router, type IRouter } from "express";
import { db, projectsTable } from "@workspace/db";
import { sql, inArray, isNotNull, eq, and, ne, isNull } from "drizzle-orm";

const CANONICAL_REGIONS = [
  "East Africa", "West Africa", "North Africa", "Southern Africa", "Central Africa",
];

const APPROVED = eq(projectsTable.reviewStatus, "approved");
const AFRICAN = ne(projectsTable.region, "Other");

// Cancelled / decommissioned projects are not investment activity — exclude them
// from every stat. (They remain in the database and the Deal Tracker for reference.)
const NOT_CANCELLED = sql`(
  (deal_stage IS NULL OR lower(deal_stage) NOT IN ('cancelled', 'decommissioned'))
  AND lower(status) NOT IN ('cancelled', 'decommissioned')
)`;

// Headline dollar totals count only DISCLOSED deal values. Capacity-based
// benchmark estimates (is_estimated = true) are excluded so the totals reflect
// real, reported transaction sizes.
const DISCLOSED_SUM = sql`coalesce(sum(deal_size_usd_mn) filter (where is_estimated = false), 0)`;
const DISCLOSED_SUM_DESC = sql`sum(deal_size_usd_mn) filter (where is_estimated = false) desc nulls last`;

const router: IRouter = Router();

router.get("/stats/summary", async (_req, res) => {
  try {
    const [[result], techResult, stageResult, devResult] = await Promise.all([
      db
        .select({
          totalProjects: sql<number>`count(*)::int`,
          totalInvestmentUsdMn: sql<number>`${DISCLOSED_SUM}`,
          totalCountries: sql<number>`count(distinct country)::int`,
          activeProjects: sql<number>`coalesce(sum(case when lower(status) in ('active', 'under construction', 'development') then 1 else 0 end), 0)::int`,
          completedProjects: sql<number>`coalesce(sum(case when lower(status) in ('operational', 'completed', 'commissioned') then 1 else 0 end), 0)::int`,
        })
        .from(projectsTable)
        .where(and(APPROVED, AFRICAN, NOT_CANCELLED)),
      db.selectDistinct({ technology: projectsTable.technology })
        .from(projectsTable)
        .where(and(APPROVED, AFRICAN, NOT_CANCELLED)),
      db
        .select({
          stage: projectsTable.dealStage,
          count: sql<number>`count(*)::int`,
        })
        .from(projectsTable)
        .where(and(APPROVED, AFRICAN, NOT_CANCELLED, isNotNull(projectsTable.dealStage)))
        .groupBy(projectsTable.dealStage),
      db
        .selectDistinct({ developer: projectsTable.developer })
        .from(projectsTable)
        .where(and(APPROVED, AFRICAN, NOT_CANCELLED, isNotNull(projectsTable.developer))),
    ]);

    const totalSectors = techResult.length;

    const dealsByStage: Record<string, number> = {};
    for (const row of stageResult) {
      if (row.stage) dealsByStage[row.stage] = row.count;
    }

    const totalDevelopers = devResult.length;

    res.json({ ...result, totalSectors, totalTechnologies: totalSectors, totalDevelopers, dealsByStage });
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
        totalInvestmentUsdMn: sql<number>`${DISCLOSED_SUM}`,
        latitude: sql<number | null>`avg(latitude)`,
        longitude: sql<number | null>`avg(longitude)`,
      })
      .from(projectsTable)
      .where(and(APPROVED, AFRICAN, NOT_CANCELLED))
      .groupBy(projectsTable.country, projectsTable.region)
      .orderBy(sql`${DISCLOSED_SUM_DESC}`);

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
        totalInvestmentUsdMn: sql<number>`${DISCLOSED_SUM}`,
      })
      .from(projectsTable)
      .where(and(APPROVED, AFRICAN, NOT_CANCELLED))
      .groupBy(projectsTable.technology)
      .orderBy(sql`${DISCLOSED_SUM_DESC}`);

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
        totalInvestmentUsdMn: sql<number>`${DISCLOSED_SUM}`,
        countries: sql<number>`count(distinct country)::int`,
      })
      .from(projectsTable)
      .where(and(APPROVED, NOT_CANCELLED, inArray(projectsTable.region, CANONICAL_REGIONS)))
      .groupBy(projectsTable.region)
      .orderBy(sql`${DISCLOSED_SUM_DESC}`);

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
        totalInvestmentUsdMn: sql<number>`${DISCLOSED_SUM}`,
      })
      .from(projectsTable)
      .where(and(APPROVED, AFRICAN, NOT_CANCELLED))
      .groupBy(projectsTable.announcedYear)
      .orderBy(projectsTable.announcedYear);

    res.json(results.filter((r) => r.year !== null));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/stats/financing", async (_req, res) => {
  try {
    const [byType, byClimate, ppaStats, blendedStats, dfiStats, topOfftakers] = await Promise.all([
      db
        .select({
          financingType: projectsTable.financingType,
          count: sql<number>`count(*)::int`,
          totalInvestmentUsdMn: sql<number>`${DISCLOSED_SUM}`,
        })
        .from(projectsTable)
        .where(and(APPROVED, AFRICAN, NOT_CANCELLED, isNotNull(projectsTable.financingType)))
        .groupBy(projectsTable.financingType)
        .orderBy(sql`${DISCLOSED_SUM_DESC}`),

      db
        .select({
          tag: projectsTable.climateFinanceTag,
          count: sql<number>`count(*)::int`,
          totalInvestmentUsdMn: sql<number>`${DISCLOSED_SUM}`,
        })
        .from(projectsTable)
        .where(and(APPROVED, AFRICAN, NOT_CANCELLED, isNotNull(projectsTable.climateFinanceTag)))
        .groupBy(projectsTable.climateFinanceTag)
        .orderBy(sql`count(*) desc`),

      db
        .select({
          count: sql<number>`count(*)::int`,
          avgTermYears: sql<number>`avg(ppa_term_years)`,
          avgTariffUsdKwh: sql<number>`avg(ppa_tariff_usd_kwh)`,
          totalCapacityMw: sql<number>`coalesce(sum(capacity_mw), 0)`,
        })
        .from(projectsTable)
        .where(and(APPROVED, AFRICAN, NOT_CANCELLED, isNotNull(projectsTable.ppaTermYears))),

      db
        .select({
          count: sql<number>`count(*)::int`,
          totalInvestmentUsdMn: sql<number>`${DISCLOSED_SUM}`,
          totalGrantUsdMn: sql<number>`coalesce(sum(grant_component), 0)`,
        })
        .from(projectsTable)
        .where(and(APPROVED, AFRICAN, NOT_CANCELLED, isNotNull(projectsTable.grantComponent))),

      db
        .select({
          count: sql<number>`count(*)::int`,
          totalInvestmentUsdMn: sql<number>`${DISCLOSED_SUM}`,
        })
        .from(projectsTable)
        .where(and(APPROVED, AFRICAN, NOT_CANCELLED, isNotNull(projectsTable.dfiInvolvement))),

      db
        .select({
          offtaker: projectsTable.offtaker,
          count: sql<number>`count(*)::int`,
          totalMw: sql<number>`coalesce(sum(capacity_mw), 0)`,
        })
        .from(projectsTable)
        .where(and(APPROVED, AFRICAN, NOT_CANCELLED, isNotNull(projectsTable.offtaker)))
        .groupBy(projectsTable.offtaker)
        .orderBy(sql`count(*) desc`)
        .limit(8),
    ]);

    const totalWithType = byType.reduce((s, r) => s + r.count, 0);

    res.json({
      byFinancingType: byType.map((r) => ({
        type: r.financingType,
        count: r.count,
        totalInvestmentUsdMn: r.totalInvestmentUsdMn,
        share: totalWithType > 0 ? Math.round((r.count / totalWithType) * 100) : 0,
      })),
      byClimateTag: byClimate.map((r) => ({
        tag: r.tag,
        count: r.count,
        totalInvestmentUsdMn: r.totalInvestmentUsdMn,
      })),
      ppaStats: {
        projectsWithPPA: ppaStats[0]?.count ?? 0,
        avgPPATermYears: ppaStats[0]?.avgTermYears ? Math.round(ppaStats[0].avgTermYears) : null,
        avgPPATariffUsdKwh: ppaStats[0]?.avgTariffUsdKwh
          ? Number(ppaStats[0].avgTariffUsdKwh.toFixed(4))
          : null,
        totalPPACapacityMw: ppaStats[0]?.totalCapacityMw ?? 0,
      },
      blendedFinanceStats: {
        projectsWithGrant: blendedStats[0]?.count ?? 0,
        totalGrantUsdMn: blendedStats[0]?.totalGrantUsdMn ?? 0,
        totalInvestmentUsdMn: blendedStats[0]?.totalInvestmentUsdMn ?? 0,
      },
      dfiStats: {
        projectsWithDFI: dfiStats[0]?.count ?? 0,
        totalInvestmentUsdMn: dfiStats[0]?.totalInvestmentUsdMn ?? 0,
      },
      topOfftakers: topOfftakers
        .filter((r) => r.offtaker)
        .map((r) => ({ name: r.offtaker!, count: r.count, totalMw: r.totalMw })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
