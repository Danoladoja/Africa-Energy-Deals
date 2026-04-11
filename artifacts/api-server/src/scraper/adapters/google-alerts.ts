/**
 * GoogleAlertsAdapter — configurable RSS adapter for Google Alert feeds.
 *
 * Multiple instances, one per feed stored in the `scraper_sources` table.
 * Feed URLs are loaded at runtime from DB (see adapter runner).
 *
 * Key pattern: rss:google_alerts:<query_slug>
 * Schedule: every 6 hours
 * defaultConfidence: LLM-scored (0.70)
 */

import { SimpleRSSAdapter } from "./rss-adapter.js";

export function createGoogleAlertsAdapter(querySlug: string, feedUrl: string): SimpleRSSAdapter {
  return new SimpleRSSAdapter({
    key: `rss:google_alerts:${querySlug}`,
    label: `Google Alerts — ${querySlug}`,
    feedUrl,
    schedule: "0 */6 * * *",
    defaultConfidence: 0.70,
    llmScored: true,
  });
}

export const SEED_GOOGLE_ALERTS: Array<{ slug: string; label: string; query: string }> = [
  {
    slug: "africa_energy_investment_mw",
    label: "Africa energy investment MW",
    query: '"Africa" "energy" "investment" "MW"',
  },
  {
    slug: "solar_africa_project_finance",
    label: "Solar Africa project finance",
    query: '"solar" "Africa" "project finance"',
  },
  {
    slug: "afrique_energie_investissement",
    label: "Afrique énergie investissement (French)",
    query: '"Afrique" "énergie" "investissement"',
  },
  {
    slug: "africa_energia_investimento",
    label: "África energia investimento (Portuguese)",
    query: '"África" "energia" "investimento"',
  },
];

function buildGoogleNewsUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

export const seedGoogleAlertsAdapters = SEED_GOOGLE_ALERTS.map(({ slug, label, query }) =>
  new SimpleRSSAdapter({
    key: `rss:google_alerts:${slug}`,
    label,
    feedUrl: buildGoogleNewsUrl(query),
    schedule: "0 */6 * * *",
    defaultConfidence: 0.70,
    llmScored: true,
  })
);

export function buildGoogleAlertsAdapterFromFeedUrl(slug: string, feedUrl: string, label: string): SimpleRSSAdapter {
  return new SimpleRSSAdapter({
    key: `rss:google_alerts:${slug}`,
    label,
    feedUrl,
    schedule: "0 */6 * * *",
    defaultConfidence: 0.70,
    llmScored: true,
  });
}
