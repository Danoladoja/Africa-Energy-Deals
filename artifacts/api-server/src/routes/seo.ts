import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

const SITE_URL = process.env["SITE_URL"] ?? "https://afrienergytracker.io";
const BASE = "/energy-tracker";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(path: string, lastmod?: string, priority = "0.7"): string {
  const loc = `${SITE_URL}${BASE}${path}`;
  const lines = [
    `  <url>`,
    `    <loc>${xmlEscape(loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : "",
    `    <priority>${priority}</priority>`,
    `  </url>`,
  ].filter(Boolean);
  return lines.join("\n");
}

router.get("/sitemap.xml", async (_req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const [projectRows, countryRows, developerRows, investorRows] = await Promise.all([
      pool.query<{ id: number; created_at: string }>(
        `SELECT id, created_at FROM energy_projects`
      ),
      pool.query<{ country: string }>(
        `SELECT DISTINCT country FROM energy_projects WHERE country IS NOT NULL`
      ),
      pool.query<{ developer: string }>(
        `SELECT DISTINCT developer FROM energy_projects WHERE developer IS NOT NULL AND developer <> ''`
      ),
      pool.query<{ investors: string }>(
        `SELECT investors FROM energy_projects WHERE investors IS NOT NULL AND investors <> ''`
      ),
    ]);

    const developerSet = new Set<string>();
    for (const { developer } of developerRows.rows) {
      if (developer?.trim()) developerSet.add(developer.trim());
    }
    for (const { investors } of investorRows.rows) {
      if (investors) {
        for (const inv of investors.split(",")) {
          const trimmed = inv.trim();
          if (trimmed) developerSet.add(trimmed);
        }
      }
    }

    const staticUrls = [
      urlEntry("/", today, "1.0"),
      urlEntry("/dashboard", today, "0.9"),
      urlEntry("/deals", today, "0.9"),
      urlEntry("/map", today, "0.8"),
      urlEntry("/studio", today, "0.6"),
      urlEntry("/api-docs", today, "0.5"),
    ];

    const projectUrls = projectRows.rows.map((p) => {
      const lastmod = p.created_at
        ? new Date(p.created_at).toISOString().split("T")[0]
        : today;
      return urlEntry(`/deals/${p.id}`, lastmod, "0.8");
    });

    const countryUrls = countryRows.rows
      .filter((c) => c.country)
      .map((c) => urlEntry(`/countries/${encodeURIComponent(c.country)}`, today, "0.7"));

    const developerUrls = [...developerSet]
      .slice(0, 500)
      .map((name) => urlEntry(`/developers/${encodeURIComponent(name)}`, today, "0.6"));

    const allUrls = [...staticUrls, ...projectUrls, ...countryUrls, ...developerUrls];

    const xml = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
      ...allUrls,
      `</urlset>`,
    ].join("\n");

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(xml);
  } catch (err) {
    console.error("[SEO] sitemap error:", err);
    res.status(500).send("Failed to generate sitemap");
  }
});

router.get("/robots.txt", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/plain");
  res.send(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}${BASE}/sitemap.xml\n`);
});

export default router;
