/**
 * DFIAfDBAdapter — African Development Bank
 *
 * Data source: AfDB Operations API (real JSON endpoint, no auth required).
 * Falls back to Google News RSS if the API returns nothing.
 *
 * Key: dfi:afdb | defaultConfidence: 0.90 | Schedule: daily
 */

import { BaseSourceAdapter, type RawRow, type CandidateDraft, parseAmountUsd } from "../base.js";

interface AfDBProject {
  ProjectCode?: string;
  ProjectTitle?: string;
  Country?: string;
  Sector?: string;
  Status?: string;
  TotalLoanAmount?: number | string;
  ApprovalDate?: string;
  ClosingDate?: string;
  ProjectObjectives?: string;
  URL?: string;
  [key: string]: unknown;
}

export class DFIAfDBAdapter extends BaseSourceAdapter {
  readonly key = "dfi:afdb";
  readonly schedule = "0 6 * * *";
  readonly defaultConfidence = 0.90;
  readonly maxRps = 1;

  private static readonly API_URL = "https://projectsportal.afdb.org/dataportal/api/projects";
  private static readonly FALLBACK_RSS = "https://news.google.com/rss/search?q=AfDB+%22African+Development+Bank%22+energy+africa+investment+project&hl=en-US&gl=US&ceid=US:en";

  async fetch(): Promise<RawRow[]> {
    const results = await this._fetchJson();
    if (results.length > 0) return results;
    console.log(`[${this.key}] JSON API empty — using Google News RSS fallback`);
    return await this._fetchRss();
  }

  private async _fetchJson(): Promise<RawRow[]> {
    try {
      const params = new URLSearchParams({
        sector: "Energy",
        regioname: "Africa",
        format: "json",
        pageSize: "200",
      });
      const { response, cached } = await this.httpFetch(`${DFIAfDBAdapter.API_URL}?${params}`);
      if (cached) return [];
      const data = await response.json() as unknown;
      const items: AfDBProject[] = Array.isArray(data)
        ? data
        : (data as { data?: AfDBProject[] })?.data ?? [];

      return items
        .filter((p) => {
          const sector = (p.Sector ?? "").toLowerCase();
          return sector.includes("energy") || sector.includes("power") || sector.includes("electricity");
        })
        .map((p) => ({ ...p, _source: "api" }));
    } catch (err) {
      console.warn(`[${this.key}] API fetch error: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  private async _fetchRss(): Promise<RawRow[]> {
    try {
      const { default: Parser } = await import("rss-parser");
      const parser = new Parser({ timeout: 25000 });
      const { response, cached } = await this.httpFetch(DFIAfDBAdapter.FALLBACK_RSS);
      if (cached) return [];
      const text = await response.text();
      const feed = await parser.parseString(text);
      return feed.items.map((item) => ({
        _source: "rss",
        ProjectTitle: item.title ?? "",
        URL: item.link ?? "",
        Country: null,
        Sector: "Energy",
        ApprovalDate: item.isoDate ?? item.pubDate ?? null,
        ProjectObjectives: item.contentSnippet ?? "",
        TotalLoanAmount: null,
        Status: null,
      }));
    } catch (err) {
      console.warn(`[${this.key}] RSS fallback error: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  normalize(row: RawRow): CandidateDraft | null {
    const r = row as AfDBProject & { _source?: string };
    const name = String(r.ProjectTitle ?? "").trim();
    if (!name || name.length < 5) return null;

    const country = String(r.Country ?? "").trim() || null;
    const sector = String(r.Sector ?? "").trim();

    const energy = /energy|power|electric|solar|wind|hydro|gas|geotherm|nuclear|renew/i.test(sector)
      || /energy|power|electric|solar|wind|hydro|gas|geotherm|nuclear|renew/i.test(name);
    if (!energy && r._source === "api") return null;

    const url = r._source === "rss"
      ? String(r.URL ?? "").trim()
      : r.URL
        ? String(r.URL).trim()
        : r.ProjectCode
          ? `https://projectsportal.afdb.org/dataportal/en/project/${r.ProjectCode}`
          : null;

    const amountRaw = r.TotalLoanAmount;
    const dealSizeUsdMn = typeof amountRaw === "number"
      ? (amountRaw > 10_000 ? amountRaw / 1_000_000 : amountRaw)
      : parseAmountUsd(amountRaw);

    let announcedYear: number | null = null;
    if (r.ApprovalDate) {
      const y = new Date(String(r.ApprovalDate)).getFullYear();
      if (y > 1990 && y < 2100) announcedYear = y;
    }

    return {
      projectName: name.slice(0, 300),
      country,
      technology: null,
      dealSizeUsdMn: dealSizeUsdMn !== null && dealSizeUsdMn > 0 && dealSizeUsdMn < 50_000 ? dealSizeUsdMn : null,
      developer: null,
      financiers: "African Development Bank (AfDB)",
      dfiInvolvement: "AfDB",
      offtaker: null,
      dealStage: r.Status ? String(r.Status) : null,
      status: null,
      description: r.ProjectObjectives ? String(r.ProjectObjectives).slice(0, 500) : null,
      capacityMw: null,
      announcedYear,
      financialCloseDate: null,
      sourceUrl: url || null,
      newsUrl: url || null,
      source: this.key,
      confidence: this.defaultConfidence,
      rawJson: { ...r } as Record<string, unknown>,
    };
  }
}

export const dfiAfDBAdapter = new DFIAfDBAdapter();
