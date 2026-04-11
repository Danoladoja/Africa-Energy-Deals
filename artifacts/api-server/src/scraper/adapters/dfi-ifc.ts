/**
 * DFIIFCAdapter — International Finance Corporation
 *
 * IFC's disclosures site is an Angular SPA with no REST API.
 * Source: IFC Pressroom RSS (pressroom.ifc.org) + Google News IFC RSS fallback.
 * LLM extraction handles structured field inference.
 *
 * Key: dfi:ifc | defaultConfidence: 0.90 | Schedule: daily
 */

import { RSSAdapter } from "./rss-adapter.js";
import { type RawRow, type CandidateDraft } from "../base.js";
import Parser from "rss-parser";

interface IFCRSSRow extends RawRow {
  guid?: string;
  link?: string;
  title?: string;
  contentSnippet?: string;
  isoDate?: string;
  pubDate?: string;
  feedKey: string;
  feedLabel: string;
}

export class DFIIFCAdapter extends RSSAdapter {
  readonly key = "dfi:ifc";
  readonly schedule = "0 7 * * *";
  readonly defaultConfidence = 0.90;
  readonly llmScored = true;
  protected readonly feedUrl = "https://pressroom.ifc.org/all/pages/RSS.aspx";
  protected readonly label = "IFC Pressroom";

  private static readonly FALLBACK_RSS = "https://news.google.com/rss/search?q=IFC+%22International+Finance+Corporation%22+energy+africa+million&hl=en-US&gl=US&ceid=US:en";

  private readonly rssParser = new Parser({
    timeout: 25000,
    headers: {
      "User-Agent": "AfriEnergyTracker/1.0 (+https://afrienergytracker.io)",
      "Accept": "application/rss+xml, application/xml, text/xml, */*",
    },
  });

  async fetch(): Promise<RawRow[]> {
    const primary = await this._tryFeed(this.feedUrl);
    if (primary.length > 0) return primary;
    console.log(`[${this.key}] Primary RSS empty — using Google News fallback`);
    return this._tryFeed(DFIIFCAdapter.FALLBACK_RSS);
  }

  private async _tryFeed(url: string): Promise<RawRow[]> {
    try {
      const { response, cached } = await this.httpFetch(url);
      if (cached) return [];
      const text = await response.text();
      const feed = await this.rssParser.parseString(text);
      return feed.items.map((item) => ({
        guid: item.guid ?? item.link ?? "",
        link: item.link ?? "",
        title: item.title ?? "",
        contentSnippet: item.contentSnippet ?? item.summary ?? "",
        isoDate: item.isoDate ?? "",
        pubDate: item.pubDate ?? "",
        feedKey: this.key,
        feedLabel: this.label,
      } satisfies IFCRSSRow));
    } catch (err) {
      console.warn(`[${this.key}] Feed ${url} failed: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  normalize(row: RawRow): CandidateDraft | null {
    const r = row as IFCRSSRow;
    const title = String(r.title ?? "").trim();
    const url = String(r.link ?? "").trim();
    if (!title || !url) return null;

    const text = `${title} ${r.contentSnippet ?? ""}`.toLowerCase();
    const isEnergy = /energy|power|solar|wind|hydro|gas|electric|renew|geotherm|nuclear|megawatt|mw\b/i.test(text);
    const isAfrica = /africa|nigeria|kenya|ghana|south africa|ethiopia|egypt|morocco|senegal|tanzania|mozambique|zambia|angola|uganda|rwanda|cameroon|mali|ivory coast|côte/i.test(text);

    if (!isEnergy || !isAfrica) return null;

    const announcedYear = r.isoDate ? new Date(r.isoDate).getFullYear() : null;

    return {
      projectName: title.slice(0, 300),
      country: null,
      technology: null,
      dealSizeUsdMn: null,
      developer: null,
      financiers: "International Finance Corporation (IFC)",
      dfiInvolvement: "IFC",
      offtaker: null,
      dealStage: null,
      status: null,
      description: String(r.contentSnippet ?? "").slice(0, 800) || null,
      capacityMw: null,
      announcedYear: announcedYear && announcedYear > 1990 && announcedYear < 2100 ? announcedYear : null,
      financialCloseDate: null,
      sourceUrl: url,
      newsUrl: url,
      source: this.key,
      confidence: this.defaultConfidence,
      rawJson: { guid: r.guid, pubDate: r.pubDate, feedLabel: r.feedLabel },
    };
  }
}

export const dfiIFCAdapter = new DFIIFCAdapter();
