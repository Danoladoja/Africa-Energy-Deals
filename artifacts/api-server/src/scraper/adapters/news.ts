/**
 * Consolidated news adapter — combines APO Group RSS, Google Alerts feeds,
 * and any arbitrary RSS sources into a single LLM-extracted pipeline.
 *
 * Each feed item becomes a candidate by calling extractDealFromArticle() on
 * the title + URL. Non-Africa-energy items return null and are filtered.
 */

import Parser from "rss-parser";
import { extractDealFromArticle } from "../llm.js";
import type { CandidateDraft, AdapterResult, RegisteredAdapter } from "./types.js";

const rssParser = new Parser({
  timeout: 25_000,
  headers: {
    "User-Agent": "AfriEnergyTracker/1.0 (+https://afrienergytracker.io)",
    "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  },
});

interface NewsFeed { label: string; url: string; }

function googleAlertsUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

const FEEDS: NewsFeed[] = [
  // ── Direct RSS feeds (higher signal) ──────────────────────────
  {
    label: "ESI Africa — Energy",
    url: "https://www.esi-africa.com/feed/",
  },
  {
    label: "APO Group — Africa Energy",
    url: "https://www.apo-opa.co/search-results/?post_type=press_release&category=energy&feed=rss",
  },
  {
    label: "Engineering News — Energy",
    url: "https://www.engineeringnews.co.za/rss/energy",
  },
  {
    label: "PV Magazine — Africa",
    url: "https://www.pv-magazine.com/region/africa/feed/",
  },
  {
    label: "Recharge News — Wind & Solar",
    url: "https://www.rechargenews.com/rss",
  },
  {
    label: "Energy Capital & Power",
    url: "https://energycapitalpower.com/feed/",
  },
  {
    label: "Business Insider Africa — Energy",
    url: "https://africa.businessinsider.com/energy/rss",
  },
  // ── Google Alerts (broader coverage) ──────────────────────────
  {
    label: "Google Alerts — Africa energy investment MW",
    url: googleAlertsUrl('"Africa" "energy" "investment" "MW"'),
  },
  {
    label: "Google Alerts — Solar Africa project finance",
    url: googleAlertsUrl('"solar" "Africa" "project finance"'),
  },
  {
    label: "Google Alerts — Afrique énergie investissement",
    url: googleAlertsUrl('"Afrique" "énergie" "investissement"'),
  },
  {
    label: "Google Alerts — África energia investimento",
    url: googleAlertsUrl('"África" "energia" "investimento"'),
  },
];

// Cap per feed so a single noisy feed can't blow our LLM budget on one run.
const MAX_ITEMS_PER_FEED = 25;
// Cap overall LLM calls per run.
const MAX_LLM_CALLS = 60;

async function run(): Promise<AdapterResult> {
  const candidates: CandidateDraft[] = [];
  const errors: string[] = [];
  let fetched = 0;
  let filtered = 0;
  let llmCalls = 0;

  for (const feed of FEEDS) {
    if (llmCalls >= MAX_LLM_CALLS) break;
    try {
      const parsed = await rssParser.parseURL(feed.url);
      const items = parsed.items.slice(0, MAX_ITEMS_PER_FEED);
      fetched += items.length;

      for (const item of items) {
        if (llmCalls >= MAX_LLM_CALLS) break;
        const title = (item.title ?? "").trim();
        const url = (item.link ?? "").trim();
        if (!title || !url) { filtered++; continue; }

        llmCalls++;
        const draft = await extractDealFromArticle(title, item.contentSnippet ?? null, url);
        if (!draft) { filtered++; continue; }

        // Default status when LLM doesn't infer one.
        candidates.push({ ...draft, status: draft.status ?? "announced" });
      }
    } catch (e) {
      errors.push(`${feed.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { candidates, errors, meta: { recordsFetched: fetched, filteredOut: filtered } };
}

export const newsAdapter: RegisteredAdapter = {
  config: {
    key: "news",
    label: "News Outlets",
    group: "news",
    schedule: "daily",
    defaultConfidence: 0.70,
  },
  run,
};
