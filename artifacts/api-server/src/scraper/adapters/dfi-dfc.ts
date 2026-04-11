/**
 * DFIDFCAdapter — US International Development Finance Corporation (DFC)
 *
 * DFC has no public REST API or RSS. Source: Google News RSS search
 * targeted at DFC Africa energy deals. LLM extraction handles field inference.
 *
 * Key: dfi:dfc | defaultConfidence: 0.90 | Schedule: daily
 */

import { SimpleRSSAdapter } from "./rss-adapter.js";

export class DFIDFCAdapter extends SimpleRSSAdapter {
  constructor() {
    super({
      key: "dfi:dfc",
      label: "DFC Africa Energy",
      feedUrl: "https://news.google.com/rss/search?q=DFC+%22Development+Finance+Corporation%22+energy+africa+power+investment&hl=en-US&gl=US&ceid=US:en",
      schedule: "0 8 * * *",
      defaultConfidence: 0.90,
      llmScored: true,
    });
  }
}

export const dfiDFCAdapter = new DFIDFCAdapter();
