/**
 * APOGroupAdapter — APO Group Africa energy category RSS
 *
 * APO Group distributes African press releases including energy project announcements.
 * LLM extraction needed to separate investment news from general press releases.
 *
 * Key: rss:apo | defaultConfidence: LLM-scored | Schedule: every 2 hours
 */

import { SimpleRSSAdapter } from "./rss-adapter.js";

export class APOGroupAdapter extends SimpleRSSAdapter {
  constructor() {
    super({
      key: "rss:apo",
      label: "APO Group Africa Energy",
      feedUrl: "https://www.apo-opa.co/search-results/?post_type=press_release&category=energy&feed=rss",
      schedule: "0 */2 * * *",
      defaultConfidence: 0.70,
      llmScored: true,
    });
  }
}

export const apoGroupAdapter = new APOGroupAdapter();
