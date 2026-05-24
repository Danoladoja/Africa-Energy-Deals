// ── gov/egypt.ts ──
// Egypt: NREA (New and Renewable Energy Authority)

import { runGovernmentScrape } from "./_base.js";
import type { RegisteredAdapter } from "../types.js";

const SOURCES = [
  {
    name: "NREA (New and Renewable Energy Authority)",
    url: "http://www.nrea.gov.eg/en",
    keywords: /energy|electricity|power|solar|wind|renewable|project|capacity|generation/i,
  },
];

export const govEgyptAdapter: RegisteredAdapter = {
  config: {
    key: "gov-egypt",
    label: "Egypt (NREA)",
    group: "government",
    schedule: "weekly",
    defaultConfidence: 0.75,
  },
  run: () => runGovernmentScrape({ country: "Egypt", sources: SOURCES }),
};
