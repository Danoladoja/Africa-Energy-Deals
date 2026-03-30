import { Router, type IRouter } from "express";
import { db, projectsTable } from "@workspace/db";
import { ilike, and, gte, lte } from "drizzle-orm";

const router: IRouter = Router();

const CSV_COLUMNS = [
  { header: "Project Name",        key: "projectName" },
  { header: "Country",             key: "country" },
  { header: "Region",              key: "region" },
  { header: "Technology",          key: "technology" },
  { header: "Status",              key: "status" },
  { header: "Deal Stage",          key: "dealStage" },
  { header: "Deal Size (USD M)",   key: "dealSizeUsdMn" },
  { header: "Capacity (MW)",       key: "capacityMw" },
  { header: "Developer",           key: "developer" },
  { header: "Financiers",          key: "investors" },
  { header: "Year Announced",      key: "announcedYear" },
  { header: "Latitude",            key: "latitude" },
  { header: "Longitude",           key: "longitude" },
  { header: "Description",         key: "description" },
  { header: "Source URL",          key: "sourceUrl" },
] as const;

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

router.get("/export", async (req, res) => {
  try {
    const {
      format = "csv",
      country, region, technology, status,
      search, minDealSize, maxDealSize,
      dealStage, developer, financingType,
    } = req.query;

    const conditions = [];
    if (country)       conditions.push(ilike(projectsTable.country,       String(country)));
    if (region)        conditions.push(ilike(projectsTable.region,        String(region)));
    if (technology)    conditions.push(ilike(projectsTable.technology,    String(technology)));
    if (status)        conditions.push(ilike(projectsTable.status,        String(status)));
    if (dealStage)     conditions.push(ilike(projectsTable.dealStage,     String(dealStage)));
    if (developer)     conditions.push(ilike(projectsTable.developer,     `%${String(developer)}%`));
    if (financingType) conditions.push(ilike(projectsTable.financingType, String(financingType)));
    if (minDealSize)   conditions.push(gte(projectsTable.dealSizeUsdMn,   Number(minDealSize)));
    if (maxDealSize)   conditions.push(lte(projectsTable.dealSizeUsdMn,   Number(maxDealSize)));
    if (search)        conditions.push(ilike(projectsTable.projectName,   `%${String(search)}%`));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const projects = await db
      .select()
      .from(projectsTable)
      .where(whereClause)
      .limit(500)
      .orderBy(projectsTable.id);

    const date = new Date().toISOString().split("T")[0];
    const baseName = `africa_energy_projects_${date}`;

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${baseName}.json"`);
      return res.json(projects);
    }

    // CSV (default)
    const headerRow = CSV_COLUMNS.map(c => escapeCSV(c.header)).join(",");
    const rows = projects.map(p =>
      CSV_COLUMNS.map(c => escapeCSV((p as any)[c.key])).join(",")
    );
    const csv = [headerRow, ...rows].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.csv"`);
    res.setHeader("Cache-Control", "no-cache");
    res.send("\uFEFF" + csv); // UTF-8 BOM for Excel compatibility
  } catch (err) {
    console.error("[export] Error:", err);
    res.status(500).json({ error: "Export failed" });
  }
});

export default router;
