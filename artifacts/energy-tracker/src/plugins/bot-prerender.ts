import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "http";

const BOT_UA_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i,
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /applebot/i,
  /discordbot/i,
  /slackbot/i,
  /embedly/i,
  /rogerbot/i,
  /showyoubot/i,
  /outbrain/i,
  /pinterest/i,
  /vkShare/i,
  /W3C_Validator/i,
  /semrushbot/i,
  /ahrefsbot/i,
  /dotbot/i,
];

function isBot(ua: string): boolean {
  return BOT_UA_PATTERNS.some((p) => p.test(ua));
}

const SITE_NAME = "AfriEnergy Tracker";
const DEFAULT_DESC =
  "Track African energy investment deals. 156+ projects across 40 countries — solar, wind, hydro, gas, grid & storage.";
const SITE_URL = "https://afrienergytracker.io";

function buildHtml(opts: {
  title: string;
  description: string;
  url: string;
  image?: string;
}): string {
  const { title, description, url, image = `${SITE_URL}/og-image.png` } = opts;
  const fullTitle = `${title} | ${SITE_NAME}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${fullTitle}</title>
  <meta name="description" content="${description}" />
  <meta property="og:title" content="${fullTitle}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${SITE_URL}${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${fullTitle}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />
  <meta name="twitter:site" content="@AfriEnergyPulse" />
</head>
<body>
  <div id="root"></div>
</body>
</html>`;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

function formatMn(mn: number | null | undefined): string | null {
  if (!mn) return null;
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  return `$${mn.toFixed(0)}M`;
}

function xmlEncode(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function botPrerender(): Plugin {
  return {
    name: "bot-prerender",
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const ua = req.headers["user-agent"] ?? "";
        if (!isBot(ua)) return next();

        const rawUrl = req.url ?? "/";
        const urlPath = rawUrl.split("?")[0];

        const apiBase = "http://localhost:8080/api";

        // /deals/:id
        const dealMatch = urlPath.match(/\/deals\/(\d+)$/);
        if (dealMatch) {
          const id = dealMatch[1];
          const data = await fetchJson<{
            id: number;
            projectName: string;
            technology: string;
            country: string;
            dealSizeUsdMn?: number | null;
            status: string;
            capacityMw?: number | null;
          }>(`${apiBase}/projects/${id}`);
          if (data) {
            const sizeStr = formatMn(data.dealSizeUsdMn);
            const html = buildHtml({
              title: data.projectName,
              description: xmlEncode(
                `${data.technology} project in ${data.country}${sizeStr ? `, ${sizeStr} investment` : ""}. Status: ${data.status}.`
              ),
              url: `/deals/${id}`,
            });
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.end(html);
          }
        }

        // /countries/:name
        const countryMatch = urlPath.match(/\/countries\/([^/]+)$/);
        if (countryMatch) {
          const name = decodeURIComponent(countryMatch[1]);
          const data = await fetchJson<{ projects: Array<{ dealSizeUsdMn?: number | null; technology: string }> }>(
            `${apiBase}/projects?country=${encodeURIComponent(name)}&limit=500`
          );
          const projects = data?.projects ?? [];
          const total = projects.reduce((s, p) => s + (p.dealSizeUsdMn ?? 0), 0);
          const totalStr = formatMn(total);
          const html = buildHtml({
            title: `${name} Energy Investment`,
            description: xmlEncode(
              projects.length
                ? `Energy deals in ${name}: ${totalStr ? totalStr : projects.length + " deals"} across ${projects.length} projects.`
                : `Energy investment portfolio for ${name} — explore projects, sectors, and deal flow.`
            ),
            url: `/countries/${encodeURIComponent(name)}`,
          });
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.end(html);
        }

        // /developers/:name
        const devMatch = urlPath.match(/\/developers\/([^/]+)$/);
        if (devMatch) {
          const name = decodeURIComponent(devMatch[1]);
          const html = buildHtml({
            title: `${name} Africa Portfolio`,
            description: xmlEncode(`${name} energy investment portfolio across Africa. Explore projects, countries, and sectors.`),
            url: `/developers/${encodeURIComponent(name)}`,
          });
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.end(html);
        }

        // Static pages
        const staticMeta: Record<string, { title: string; description: string }> = {
          "/": {
            title: "Africa Energy Investment Database",
            description: DEFAULT_DESC,
          },
          "/dashboard": {
            title: "Market Overview",
            description: "Interactive dashboard — African energy investment by sector, country, and year.",
          },
          "/deals": {
            title: "Deal Tracker",
            description: "Search and filter 156+ African energy investment deals by country, technology, and status.",
          },
          "/map": {
            title: "Investment Map",
            description: "Explore African energy investment deals on an interactive map across 40 countries.",
          },
          "/studio": {
            title: "Viz Studio",
            description: "Create custom charts and visualizations of African energy investment data.",
          },
          "/api-docs": {
            title: "API Documentation",
            description: "AfriEnergy Tracker REST API — access African energy investment data programmatically.",
          },
        };

        const meta = staticMeta[urlPath];
        if (meta) {
          const html = buildHtml({ ...meta, url: urlPath });
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.end(html);
        }

        next();
      });
    },
  };
}
