import { readFileSync, mkdirSync, existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CACHE_DIR = "/tmp/badge-cache";
mkdirSync(CACHE_DIR, { recursive: true });

const SITE_URL = process.env["SITE_URL"] ?? "https://afrienergytracker.io";

// ── Brand colours (from CSS vars in dark mode) ────────────────────────────────
const BRAND = {
  bg: "#0b0f1a",
  card: "#141930",
  primary: "#11c26d",
  text: "#f1f5f9",
  muted: "#64748b",
  border: "#1e2d4a",
};

// ── Per-tier/badge styling ────────────────────────────────────────────────────
interface BadgeTheme {
  label: string;
  ring: string;
  fill: string;
  glyph: string;
  textColor: string;
}

function getBadgeTheme(slug: string): BadgeTheme {
  const map: Record<string, BadgeTheme> = {
    bronze:        { label: "Bronze",        ring: "#92400e", fill: "#b45309", glyph: "B", textColor: "#fcd34d" },
    silver:        { label: "Silver",        ring: "#475569", fill: "#64748b", glyph: "S", textColor: "#f1f5f9" },
    gold:          { label: "Gold",          ring: "#a16207", fill: "#d97706", glyph: "G", textColor: "#fef08a" },
    platinum:      { label: "Platinum",      ring: "#0891b2", fill: "#06b6d4", glyph: "P", textColor: "#e0f2fe" },
    first_light:   { label: "First Light",   ring: "#a16207", fill: "#d97706", glyph: "★", textColor: "#fef08a" },
    scoop:         { label: "Scoop",         ring: "#7e22ce", fill: "#9333ea", glyph: "⚡", textColor: "#f3e8ff" },
    multi_sector:  { label: "Multi-Sector",  ring: "#1d4ed8", fill: "#2563eb", glyph: "⟡", textColor: "#dbeafe" },
    cross_border:  { label: "Cross-Border",  ring: "#166534", fill: "#16a34a", glyph: "◐", textColor: "#dcfce7" },
    corroborator:  { label: "Corroborator",  ring: "#0f766e", fill: "#0d9488", glyph: "✓", textColor: "#ccfbf1" },
  };
  if (slug.startsWith("country_specialist_")) {
    return { label: `Country Specialist`, ring: "#166534", fill: "#15803d", glyph: "◉", textColor: "#bbf7d0" };
  }
  return map[slug] ?? { label: slug, ring: "#1d4ed8", fill: "#2563eb", glyph: "◆", textColor: "#dbeafe" };
}

// ── Font loading ──────────────────────────────────────────────────────────────
let _fontSyne700: Buffer | null = null;
let _fontSyne400: Buffer | null = null;

function loadFonts() {
  if (_fontSyne700) return;
  try {
    const base = join(__dirname, "../../node_modules/@fontsource/syne/files");
    _fontSyne700 = readFileSync(join(base, "syne-latin-700-normal.woff2"));
    _fontSyne400 = readFileSync(join(base, "syne-latin-400-normal.woff2"));
  } catch {
    try {
      const base = join(__dirname, "../../../node_modules/@fontsource/syne/files");
      _fontSyne700 = readFileSync(join(base, "syne-latin-700-normal.woff2"));
      _fontSyne400 = readFileSync(join(base, "syne-latin-400-normal.woff2"));
    } catch (err) {
      console.warn("[BadgeImage] Could not load Syne fonts, using fallback:", err);
    }
  }
}

function getSatoriFonts() {
  loadFonts();
  const fonts = [];
  if (_fontSyne700) fonts.push({ name: "Syne", data: _fontSyne700, weight: 700 as const, style: "normal" as const });
  if (_fontSyne400) fonts.push({ name: "Syne", data: _fontSyne400, weight: 400 as const, style: "normal" as const });
  return fonts;
}

// ── Cache helpers ─────────────────────────────────────────────────────────────
function cacheKey(params: Record<string, string | number>): string {
  return crypto.createHash("md5").update(JSON.stringify(params)).digest("hex");
}

async function getCached(key: string): Promise<Buffer | null> {
  const p = join(CACHE_DIR, key);
  if (!existsSync(p)) return null;
  return readFile(p);
}

async function setCache(key: string, data: Buffer) {
  await writeFile(join(CACHE_DIR, key), data);
}

export async function invalidateBadgeCache(contributorId: number) {
  // Remove all cached images for this contributor
  const { readdirSync, unlinkSync } = await import("fs");
  try {
    const files = readdirSync(CACHE_DIR);
    for (const f of files) {
      if (f.startsWith(`${contributorId}_`)) unlinkSync(join(CACHE_DIR, f));
    }
  } catch {}
}

// ── Template builder ──────────────────────────────────────────────────────────
function buildElement(opts: {
  displayName: string;
  badgeSlug: string;
  statLine: string;
  awardedAt: string;
  width: number;
  height: number;
}) {
  const { displayName, badgeSlug, statLine, awardedAt, width, height } = opts;
  const theme = getBadgeTheme(badgeSlug);
  const isSquare = width === height;
  const circleSize = isSquare ? 200 : 150;
  const nameFontSize = isSquare ? 48 : 38;
  const statFontSize = isSquare ? 28 : 22;

  // Element factory helper
  const div = (style: Record<string, unknown>, children: unknown) => ({
    type: "div",
    key: null,
    props: { style, children },
  });

  const text = (style: Record<string, unknown>, content: string) => ({
    type: "div",
    key: null,
    props: { style: { ...style, fontFamily: "Syne" }, children: content },
  });

  const circle = div(
    {
      width: circleSize,
      height: circleSize,
      borderRadius: circleSize / 2,
      background: `radial-gradient(circle at 35% 35%, ${theme.fill}, ${theme.ring})`,
      border: `6px solid ${theme.ring}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `0 0 40px ${theme.ring}55`,
      marginBottom: 24,
    },
    text(
      { fontSize: circleSize * 0.35, fontWeight: 700, color: theme.textColor },
      theme.glyph
    )
  );

  const header = div(
    {
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      width: "100%",
      paddingBottom: 20,
      borderBottom: `1px solid ${BRAND.border}`,
      marginBottom: isSquare ? 60 : 40,
    },
    [
      div({ display: "flex", alignItems: "center", gap: 10 }, [
        div({
          width: 32, height: 32, borderRadius: 8,
          background: BRAND.primary,
          display: "flex", alignItems: "center", justifyContent: "center",
        }, text({ fontSize: 16, fontWeight: 700, color: BRAND.bg }, "⚡")),
        text({ fontSize: 16, fontWeight: 700, color: BRAND.primary, letterSpacing: 0.5 }, "AfriEnergy Tracker"),
      ]),
      text({ fontSize: 14, color: BRAND.muted }, SITE_URL.replace("https://", "")),
    ]
  );

  const body = div(
    {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
      paddingTop: isSquare ? 20 : 0,
    },
    [
      circle,
      text({ fontSize: 16, fontWeight: 700, color: theme.textColor, letterSpacing: 3, textTransform: "uppercase", marginBottom: 16 }, theme.label + " Contributor"),
      text({ fontSize: nameFontSize, fontWeight: 700, color: BRAND.text, textAlign: "center", marginBottom: 12, maxWidth: width - 120 }, displayName),
      text({ fontSize: statFontSize, color: BRAND.muted, textAlign: "center", maxWidth: width - 160 }, statLine),
    ]
  );

  const footer = div(
    {
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      width: "100%",
      paddingTop: 20,
      borderTop: `1px solid ${BRAND.border}`,
    },
    text({ fontSize: 13, color: BRAND.muted }, `Awarded ${awardedAt} · afrienergytracker.io`),
  );

  return div(
    {
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      width,
      height,
      background: `linear-gradient(145deg, ${BRAND.bg} 0%, #0f172a 50%, ${BRAND.bg} 100%)`,
      padding: isSquare ? 60 : 48,
      fontFamily: "Syne",
    },
    [header, body, footer]
  );
}

// ── Public API ────────────────────────────────────────────────────────────────
export interface BadgeRenderParams {
  contributorId: number;
  badgeSlug: string;
  displayName: string;
  statLine: string;
  awardedAt: string;   // display string e.g. "January 2026"
  cacheVersion: string; // e.g. MD5 of (displayName + statLine)
}

async function renderBadgeSvg(params: BadgeRenderParams, w: number, h: number): Promise<string> {
  const el = buildElement({
    displayName: params.displayName,
    badgeSlug: params.badgeSlug,
    statLine: params.statLine,
    awardedAt: params.awardedAt,
    width: w,
    height: h,
  });
  return satori(el as any, {
    width: w,
    height: h,
    fonts: getSatoriFonts(),
  });
}

export async function renderBadgePng(params: BadgeRenderParams, format: "social" | "square"): Promise<Buffer> {
  const [w, h] = format === "social" ? [1200, 630] : [1080, 1080];
  const key = `${params.contributorId}_${params.badgeSlug}_${format}_${params.cacheVersion}`;
  const cached = await getCached(key);
  if (cached) return cached;

  const svg = await renderBadgeSvg(params, w, h);
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: w } });
  const png = Buffer.from(resvg.render().asPng());
  await setCache(key, png);
  return png;
}

export async function renderBadgeSvgOutput(params: BadgeRenderParams, format: "social" | "square"): Promise<string> {
  const [w, h] = format === "social" ? [1200, 630] : [1080, 1080];
  const key = `${params.contributorId}_${params.badgeSlug}_${format}_${params.cacheVersion}.svg`;
  const cached = await getCached(key);
  if (cached) return cached.toString("utf8");

  const svg = await renderBadgeSvg(params, w, h);
  await setCache(key, Buffer.from(svg));
  return svg;
}

// ── Stat line builder (exported for use in routes) ───────────────────────────
export function buildStatLine(badgeSlug: string, opts: {
  approvedCount?: number;
  distinctCountries?: number;
  distinctSectors?: number;
  country?: string;
}): string {
  const { approvedCount = 0, distinctCountries = 0, distinctSectors = 0, country } = opts;
  if (badgeSlug === "bronze" || badgeSlug === "silver" || badgeSlug === "gold" || badgeSlug === "platinum") {
    return `${approvedCount} approved ${approvedCount === 1 ? "contribution" : "contributions"}`;
  }
  if (badgeSlug.startsWith("country_specialist_")) {
    const cc = badgeSlug.replace("country_specialist_", "").toUpperCase();
    return country ? `Country specialist — ${country}` : `Country specialist — ${cc}`;
  }
  if (badgeSlug === "cross_border") return `Contributions across ${distinctCountries} African ${distinctCountries === 1 ? "country" : "countries"}`;
  if (badgeSlug === "multi_sector") return `Contributions across ${distinctSectors} energy ${distinctSectors === 1 ? "sector" : "sectors"}`;
  if (badgeSlug === "scoop") return "First to report an energy deal";
  if (badgeSlug === "corroborator") return `10 submissions with verified sources`;
  if (badgeSlug === "first_light") return "First community deal ever approved";
  return `${approvedCount} approved contributions`;
}

// ── OG HTML page template ─────────────────────────────────────────────────────
export function buildOgHtml(opts: {
  title: string;
  description: string;
  imageUrl: string;
  canonicalUrl: string;
  redirectUrl: string;
}): string {
  const { title, description, imageUrl, canonicalUrl, redirectUrl } = opts;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${esc(imageUrl)}">
  <meta property="og:url" content="${esc(canonicalUrl)}">
  <meta property="og:type" content="profile">
  <meta property="og:site_name" content="AfriEnergy Tracker">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(imageUrl)}">
  <meta name="twitter:site" content="@AfriEnergyPulse">
  <meta http-equiv="refresh" content="0; url=${esc(redirectUrl)}">
  <link rel="canonical" href="${esc(canonicalUrl)}">
  <style>body{margin:0;background:#0b0f1a;color:#f1f5f9;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}</style>
</head>
<body>
  <p>Redirecting to <a href="${esc(redirectUrl)}" style="color:#11c26d">${esc(title)}</a>…</p>
  <script>window.location.replace(${JSON.stringify(redirectUrl)});</script>
</body>
</html>`;
}
