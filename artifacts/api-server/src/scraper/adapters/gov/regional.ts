// ── gov/regional.ts ──
// Regional energy centres: ECREEE (West), SACREEE (Southern)
// Multi-country — does NOT override LLM's country extraction.

import { runGovernmentScrape } from "./_base.js";
import type { RegisteredAdapter } from "../types.js";

const SOURCES = [
  {
    name: "ECREEE (ECOWAS Centre for Renewable Energy)",
    url: "https://www.ecreee.org/",
    keywords: /energy|renewable|solar|wind|electrification|capacity|project|power/i,
  },
  {
    name: "SACREEE (Southern African Centre for RE&EE)",
    url: "https://www.sacreee.org/",
    keywords: /energy|renewable|solar|wind|efficiency|capacity|project|power/i,
  },
];

export const govRegionalAdapter: RegisteredAdapter = {
  config: {
    key: "gov-regional",
    label: "Regional Energy Centres (ECREEE, SACREEE)",
    group: "government",
    schedule: "weekly",
    defaultConfidence: 0.75,
  },
  // Empty country string = don't override LLM's country extraction
  run: () => runGovernmentScrape({ country: "", sources: SOURCES }),
};
