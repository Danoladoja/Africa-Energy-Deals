/**
 * DFIBIIAdapter — British International Investment (formerly CDC Group)
 *
 * BII's portfolio website is Cloudflare-protected (requires JS challenge).
 * The BII RSS feed is already in the existing scraper but has limited energy
 * deal content. Source: Google News RSS targeted at BII Africa energy deals.
 * LLM extraction handles field inference.
 *
 * Key: dfi:bii | defaultConfidence: 0.90 | Schedule: daily
 */

import { SimpleRSSAdapter } from "./rss-adapter.js";

export class DFIBIIAdapter extends SimpleRSSAdapter {
  constructor() {
    super({
      key: "dfi:bii",
      label: "BII Africa Energy",
      feedUrl: "https://news.google.com/rss/search?q=%22British+International+Investment%22+OR+%22BII%22+energy+africa+power+investment+million&hl=en-US&gl=US&ceid=US:en",
      schedule: "0 11 * * *",
      defaultConfidence: 0.90,
      llmScored: true,
    });
  }
}

export const dfiBIIAdapter = new DFIBIIAdapter();
