/**
 * DFIProparcoAdapter — Proparco (French DFI, AFD Group)
 *
 * Proparco's RSS is accessible but carries general content (board changes, news).
 * Google News RSS targeted at Proparco Africa energy deals gives better signal.
 * LLM extraction handles field inference.
 *
 * Key: dfi:proparco | defaultConfidence: 0.90 | Schedule: daily
 */

import { SimpleRSSAdapter } from "./rss-adapter.js";

export class DFIProparcoAdapter extends SimpleRSSAdapter {
  constructor() {
    super({
      key: "dfi:proparco",
      label: "Proparco Africa Energy",
      feedUrl: "https://news.google.com/rss/search?q=Proparco+energy+africa+power+million+investment&hl=en-US&gl=US&ceid=US:en",
      schedule: "0 9 * * *",
      defaultConfidence: 0.90,
      llmScored: true,
    });
  }
}

export const dfiProparcoAdapter = new DFIProparcoAdapter();
