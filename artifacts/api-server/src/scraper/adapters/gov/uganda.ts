// ── gov/uganda.ts ──
// Uganda: ERA (Electricity Regulatory Authority)

import { runGovernmentScrape } from "./_base.js";
import type { RegisteredAdapter } from "../types.js";

const SOURCES = [
  {
    name: "ERA (Electricity Regulatory Authority)",
    url: "https://www.era.go.ug/",
    keywords: /energy|electricity|power|solar|hydro|generation|license|tariff|capacity|project|renewable/i,
  },
];

export const govUgandaAdapter: RegisteredAdapter = {
  config: {
    key: "gov-uganda",
    label: "Uganda (ERA)",
    group: "government",
    schedule: "weekly",
    defaultConfidence: 0.75,
  },
  run: () => runGovernmentScrape({ country: "Uganda", sources: SOURCES }),
};
