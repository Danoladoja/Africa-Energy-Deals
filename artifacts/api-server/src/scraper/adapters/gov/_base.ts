/**
 * Shared logic for all government/regulatory adapters.
 *
 * Each country adapter defines its sources (URLs + relevance keywords),
 * and this module handles: fetch → filter links → LLM extraction → emit candidates.
 */

import { fetchWithRetry } from "../../shared/http.js";
import { extractDealFromGovernmentSource, hasBudget } from "../../llm.js";
import type { CandidateDraft, AdapterResult } from "../types.js";

export interface GovSource {
  name: string;
  url: string;
  keywords: RegExp;
}

export interface GovAdapterConfig {
  country: string;        // Empty string = don't override LLM's extraction
  sources: GovSource[];
  adapterKey: string;     // For LLM cost tracking (e.g. "gov-kenya")
  maxArticles?: number;   // Cap LLM calls per run (default: 15)
}

const DEFAULT_MAX_ARTICLES = 15;

/**
 * Scrape a page for links matching the source's keyword regex.
 * Returns up to `max` article URLs that look relevant.
 */
async function scrapeRelevantLinks(source: GovSource, max: number): Promise<{ urls: string[]; errors: string[] }> {
  const errors: string[] = [];
  try {
    const { body, status } = await fetchWithRetry(source.url, { timeoutMs: 20_000 });
    if (status >= 400 || !body) {
      errors.push(`${source.name}: HTTP ${status}`);
      return { urls: [], errors };
    }
    const html = body;

    // Extract all href links from the HTML
    const linkRegex = /href=["']([^"']+)["']/gi;
    const seen = new Set<string>();
    const urls: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(html)) !== null) {
      let href = match[1];

      // Skip anchors, javascript:, mailto:, and asset files
      if (href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) continue;
      if (/\.(css|js|png|jpg|gif|svg|ico|woff|pdf)(\?|$)/i.test(href)) continue;

      // Make relative URLs absolute
      if (href.startsWith("/")) {
        try {
          const base = new URL(source.url);
          href = `${base.origin}${href}`;
        } catch { continue; }
      } else if (!href.startsWith("http")) {
        continue;
      }

      if (seen.has(href)) continue;
      seen.add(href);

      // Check if the link text or surrounding context matches keywords
      // For simplicity, test the URL path itself + fetch title later via LLM
      const path = href.toLowerCase();
      if (source.keywords.test(path) || source.keywords.test(html.slice(Math.max(0, match.index - 200), match.index + 200))) {
        urls.push(href);
        if (urls.length >= max) break;
      }
    }

    return { urls, errors };
  } catch (e) {
    errors.push(`${source.name}: ${e instanceof Error ? e.message : String(e)}`);
    return { urls: [], errors };
  }
}

/**
 * Fetch a page's text content for LLM extraction (max 3000 chars).
 */
async function fetchPageText(url: string): Promise<string | null> {
  try {
    const { body, status } = await fetchWithRetry(url, { timeoutMs: 15_000 });
    if (status >= 400 || !body) return null;
    const html = body;
    // Strip HTML tags for a rough plaintext representation
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 3000);
  } catch {
    return null;
  }
}

/**
 * Main entry for government adapters. Scrapes sources for relevant links,
 * sends them through LLM extraction, and returns candidates.
 */
export async function runGovernmentScrape(config: GovAdapterConfig): Promise<AdapterResult> {
  const candidates: CandidateDraft[] = [];
  const errors: string[] = [];
  const maxArticles = config.maxArticles ?? DEFAULT_MAX_ARTICLES;
  let fetched = 0;
  let filtered = 0;
  let llmCalls = 0;

  for (const source of config.sources) {
    const { urls, errors: scrapeErrors } = await scrapeRelevantLinks(source, maxArticles);
    errors.push(...scrapeErrors);
    fetched += urls.length;

    for (const url of urls) {
      if (llmCalls >= maxArticles || !hasBudget()) break;

      const text = await fetchPageText(url);
      if (!text || text.length < 100) {
        filtered++;
        continue;
      }

      llmCalls++;
      try {
        const candidate = await extractDealFromGovernmentSource(
          source.name,
          text,
          url,
          config.country || undefined,
          config.adapterKey,
        );
        if (candidate) {
          candidates.push(candidate);
        } else {
          filtered++;
        }
      } catch (e) {
        errors.push(`LLM ${url}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return {
    candidates,
    errors,
    meta: { recordsFetched: fetched, filteredOut: filtered },
  };
}
