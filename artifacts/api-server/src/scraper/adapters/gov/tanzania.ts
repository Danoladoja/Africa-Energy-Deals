// ── gov/tanzania.ts ──
// Tanzania: EWURA (Energy and Water Utilities Regulatory Authority)

import { runGovernmentScrape } from "./_base.js";
import type { RegisteredAdapter } from "../types.js";

const SOURCES = [
  {
    name: "EWURA (Energy & Water Utilities Regulatory Authority)",
    url: "https://www.ewura.go.tz/",
    keywords: /energy|electricity|power|solar|renewable|generation|license|tariff|capacity|project/i,
  },
];

export const govTanzaniaAdapter: RegisteredAdapter = {
  config: {
    key: "gov-tanzania",
    label: "Tanzania (EWURA)",
    group: "government",
    schedule: "weekly",
    defaultConfidence: 0.75,
  },
  run: () => runGovernmentScrape({ country: "Tanzania", sources: SOURCES }),
};
