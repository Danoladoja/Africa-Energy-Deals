// ── gov/nigeria.ts ──
// Nigeria: REA (Rural Electrification Agency) only.
// Deliberately limited to avoid over-concentration on Nigerian agencies.

import { runGovernmentScrape } from "./_base.js";
import type { RegisteredAdapter } from "../types.js";

const SOURCES = [
  {
    name: "REA (Rural Electrification Agency)",
    url: "https://rea.gov.ng/",
    keywords: /energy|electricity|power|solar|mini.grid|electrification|renewable|project|capacity/i,
  },
];

export const govNigeriaAdapter: RegisteredAdapter = {
  config: {
    key: "gov-nigeria",
    label: "Nigeria (REA)",
    group: "government",
    schedule: "weekly",
    defaultConfidence: 0.75,
  },
  run: () => runGovernmentScrape({ country: "Nigeria", sources: SOURCES, maxArticles: 8 }),
};
