/**
 * DFIFMOAdapter — FMO (Dutch entrepreneurial development bank)
 *
 * FMO's portfolio is only accessible via HTML (no JSON API, no RSS).
 * Source: Google News RSS targeted at FMO Africa energy investments.
 * LLM extraction handles field inference.
 *
 * Key: dfi:fmo | defaultConfidence: 0.90 | Schedule: daily
 */

import { SimpleRSSAdapter } from "./rss-adapter.js";

export class DFIFMOAdapter extends SimpleRSSAdapter {
  constructor() {
    super({
      key: "dfi:fmo",
      label: "FMO Africa Energy",
      feedUrl: "https://news.google.com/rss/search?q=FMO+%22entrepreneurial+development+bank%22+energy+africa+power+investment&hl=en-US&gl=US&ceid=US:en",
      schedule: "0 10 * * *",
      defaultConfidence: 0.90,
      llmScored: true,
    });
  }
}

export const dfiFMOAdapter = new DFIFMOAdapter();
