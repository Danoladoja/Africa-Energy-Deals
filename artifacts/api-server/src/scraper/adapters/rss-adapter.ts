/**
 * RSSAdapter — generic base subclass for RSS/Atom feed adapters.
 * Handles XML parsing, guid/link dedup, and delegates to the existing
 * LLM scoring pipeline for candidate extraction.
 */

import Parser from "rss-parser";
import { BaseSourceAdapter, type RawRow, type CandidateDraft } from "../base.js";

export interface RSSConfig {
  key: string;
  label: string;
  feedUrl: string;
  schedule: string;
  defaultConfidence: number;
  llmScored?: boolean;
}

const rssParser = new Parser({
  timeout: 25000,
  headers: {
    "User-Agent": "AfriEnergyTracker/1.0 (+https://afrienergytracker.io)",
    "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  },
});

export interface RSSRawRow extends RawRow {
  guid?: string;
  link?: string;
  title?: string;
  contentSnippet?: string;
  content?: string;
  pubDate?: string;
  isoDate?: string;
  feedKey: string;
  feedLabel: string;
}

export abstract class RSSAdapter extends BaseSourceAdapter {
  protected abstract readonly feedUrl: string;
  protected abstract readonly label: string;
  readonly llmScored: boolean = false;

  async fetch(): Promise<RawRow[]> {
    try {
      const { response, cached } = await this.httpFetch(this.feedUrl);
      if (cached) return [];

      const text = await response.text();
      const feed = await rssParser.parseString(text);

      return feed.items.map((item) => ({
        guid: item.guid ?? item.link ?? "",
        link: item.link ?? "",
        title: item.title ?? "",
        contentSnippet: item.contentSnippet ?? item.summary ?? "",
        content: item.content ?? "",
        pubDate: item.pubDate ?? item.isoDate ?? "",
        isoDate: item.isoDate ?? "",
        feedKey: this.key,
        feedLabel: this.label,
      } satisfies RSSRawRow));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${this.key}] RSS fetch failed: ${msg}`);
      return [];
    }
  }

  normalize(row: RawRow): CandidateDraft | null {
    const r = row as RSSRawRow;
    const title = String(r.title ?? "").trim();
    const snippet = String(r.contentSnippet ?? "").trim();
    const url = String(r.link ?? "").trim();

    if (!title || !url) return null;

    return {
      projectName: title.slice(0, 300),
      country: null,
      technology: null,
      dealSizeUsdMn: null,
      developer: null,
      financiers: null,
      dfiInvolvement: null,
      offtaker: null,
      dealStage: null,
      status: null,
      description: snippet.slice(0, 1000) || null,
      capacityMw: null,
      announcedYear: r.isoDate ? new Date(r.isoDate).getFullYear() : null,
      financialCloseDate: null,
      sourceUrl: url,
      newsUrl: url,
      source: this.key,
      confidence: this.defaultConfidence,
      rawJson: { guid: r.guid, pubDate: r.pubDate, feedLabel: r.feedLabel },
    };
  }

  deduplicate(candidates: CandidateDraft[]): CandidateDraft[] {
    const seen = new Set<string>();
    return candidates.filter((c) => {
      const key = (c.sourceUrl ?? "").toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export class SimpleRSSAdapter extends RSSAdapter {
  readonly key: string;
  readonly schedule: string;
  readonly defaultConfidence: number;
  readonly llmScored: boolean;
  protected readonly feedUrl: string;
  protected readonly label: string;

  constructor(config: RSSConfig) {
    super();
    this.key = config.key;
    this.schedule = config.schedule;
    this.defaultConfidence = config.defaultConfidence;
    this.feedUrl = config.feedUrl;
    this.label = config.label;
    this.llmScored = config.llmScored ?? false;
  }
}
