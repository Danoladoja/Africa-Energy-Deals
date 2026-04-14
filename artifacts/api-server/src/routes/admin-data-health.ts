import { Router } from "express";
import { db, projectsTable } from "@workspace/db";
import { sql, ne, inArray, isNull, and, eq } from "drizzle-orm";
import { adminAuthMiddleware } from "../middleware/adminAuth.js";

const router = Router();

export const VALID_TECHNOLOGIES = [
  "Solar", "Wind", "Hydro", "Geothermal", "Oil & Gas",
  "Grid Expansion", "Battery & Storage", "Hydrogen",
  "Nuclear", "Bioenergy", "Clean Cooking", "Coal",
] as const;

router.use("/admin/data-health", adminAuthMiddleware);

// GET /api/admin/data-health — full data quality audit
router.get("/admin/data-health", async (req, res) => {
  try {
    const validList = VALID_TECHNOLOGIES.map(t => `'${t.replace(/'/g, "''")}'`).join(", ");

    const [nonCanonical, mismatches, missingBoth, techDistribution, duplicateUrls] = await Promise.all([
      // 1. Projects with non-canonical technology values
      db.execute(sql`
        SELECT id, project_name, country, technology, deal_size_usd_mn, review_status
        FROM energy_projects
        WHERE technology NOT IN (${sql.raw(validList)})
        ORDER BY technology, review_status
      `),

      // 2. Project name/description contains a clear technology keyword that contradicts the field
      db.execute(sql`
        SELECT id, project_name, country, technology, deal_size_usd_mn, capacity_mw, review_status,
          CASE
            WHEN project_name ILIKE '%geothermal%' AND technology != 'Geothermal' THEN 'Geothermal'
            WHEN project_name ILIKE '%hydrogen%' AND technology NOT IN ('Hydrogen') THEN 'Hydrogen'
            WHEN project_name ILIKE '%nuclear%' AND technology NOT IN ('Nuclear') THEN 'Nuclear'
            WHEN project_name ILIKE '%pumped hydro%' AND technology NOT IN ('Hydro') THEN 'Hydro'
            WHEN project_name ILIKE '%battery energy storage%' AND technology NOT IN ('Battery & Storage') THEN 'Battery & Storage'
            WHEN project_name ILIKE '%battery storage%' AND project_name NOT ILIKE '%solar%' AND project_name NOT ILIKE '%wind%' AND technology NOT IN ('Battery & Storage') THEN 'Battery & Storage'
            WHEN description ILIKE '%geothermal%' AND project_name ILIKE '%geothermal%' AND technology != 'Geothermal' THEN 'Geothermal'
          END as suggested_technology
        FROM energy_projects
        WHERE (
          (project_name ILIKE '%geothermal%' AND technology != 'Geothermal')
          OR (project_name ILIKE '%hydrogen%' AND technology NOT IN ('Hydrogen'))
          OR (project_name ILIKE '%nuclear%' AND technology NOT IN ('Nuclear'))
          OR (project_name ILIKE '%pumped hydro%' AND technology NOT IN ('Hydro'))
          OR (project_name ILIKE '%battery energy storage%' AND technology NOT IN ('Battery & Storage'))
          OR (project_name ILIKE '%battery storage%' AND project_name NOT ILIKE '%solar%' AND project_name NOT ILIKE '%wind%' AND technology NOT IN ('Battery & Storage'))
        )
        ORDER BY review_status, country
      `),

      // 3. Approved projects missing BOTH deal size AND capacity
      db.execute(sql`
        SELECT id, project_name, country, technology, review_status, announced_year
        FROM energy_projects
        WHERE review_status = 'approved'
          AND deal_size_usd_mn IS NULL
          AND capacity_mw IS NULL
        ORDER BY country, technology
      `),

      // 4. Full technology × status distribution
      db.execute(sql`
        SELECT technology, review_status, COUNT(*) as count,
               ROUND(SUM(deal_size_usd_mn)::numeric, 1) as total_investment_usd_mn
        FROM energy_projects
        GROUP BY technology, review_status
        ORDER BY technology, review_status
      `),

      // 5. Duplicate source URLs (approved only — same source = likely same project)
      db.execute(sql`
        SELECT source_url, COUNT(*) as count,
               array_agg(id ORDER BY id) as ids,
               array_agg(project_name ORDER BY id) as names,
               array_agg(technology ORDER BY id) as technologies,
               array_agg(deal_size_usd_mn ORDER BY id) as deal_sizes
        FROM energy_projects
        WHERE review_status = 'approved'
          AND source_url IS NOT NULL
          AND source_url != ''
        GROUP BY source_url
        HAVING COUNT(*) > 1
        ORDER BY count DESC
        LIMIT 50
      `),
    ]);

    res.json({
      summary: {
        nonCanonicalCount: nonCanonical.rows.length,
        mismatchCount: mismatches.rows.filter((r: any) => r.suggested_technology).length,
        missingDataCount: missingBoth.rows.length,
        duplicateUrlCount: duplicateUrls.rows.length,
        lastAuditAt: new Date().toISOString(),
        totalApproved: techDistribution.rows.reduce((s: number, r: any) => 
          r.review_status === "approved" ? s + Number(r.count) : s, 0),
      },
      nonCanonicalTechnologies: nonCanonical.rows,
      keywordMismatches: mismatches.rows.filter((r: any) => r.suggested_technology),
      missingDealAndCapacity: missingBoth.rows,
      duplicateSourceUrls: duplicateUrls.rows,
      techDistribution: techDistribution.rows,
      validTechnologies: VALID_TECHNOLOGIES,
    });
  } catch (error) {
    console.error("[data-health]", error);
    res.status(500).json({ error: "Data health audit failed" });
  }
});

// POST /api/admin/data-health/fix — apply a single technology reclassification
router.post("/admin/data-health/fix", adminAuthMiddleware, async (req, res) => {
  try {
    const { id, technology } = req.body as { id: number; technology: string };
    if (!id || !technology) {
      return res.status(400).json({ error: "id and technology are required" });
    }
    if (!(VALID_TECHNOLOGIES as readonly string[]).includes(technology)) {
      return res.status(400).json({ error: `Invalid technology. Must be one of: ${VALID_TECHNOLOGIES.join(", ")}` });
    }
    const [updated] = await db
      .update(projectsTable)
      .set({ technology })
      .where(eq(projectsTable.id, id))
      .returning({ id: projectsTable.id, projectName: projectsTable.projectName, technology: projectsTable.technology });
    if (!updated) return res.status(404).json({ error: "Project not found" });
    res.json({ success: true, updated });
  } catch (error) {
    console.error("[data-health/fix]", error);
    res.status(500).json({ error: "Fix failed" });
  }
});

// POST /api/admin/data-health/bulk-fix — apply bulk technology normalization (non-canonical → canonical)
router.post("/admin/data-health/bulk-fix", adminAuthMiddleware, async (req, res) => {
  try {
    const validList = VALID_TECHNOLOGIES.map(t => `'${t.replace(/'/g, "''")}'`).join(", ");
    const result = await db.execute(sql`
      SELECT id, technology FROM energy_projects
      WHERE technology NOT IN (${sql.raw(validList)})
    `);
    res.json({ 
      message: "No automatic bulk mapping available for unknown technologies. Use individual fix endpoint.",
      nonCanonicalFound: result.rows.length,
      rows: result.rows,
    });
  } catch (error) {
    console.error("[data-health/bulk-fix]", error);
    res.status(500).json({ error: "Bulk fix failed" });
  }
});

export default router;
