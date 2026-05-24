// ── gov/ghana.ts ──
// Ghana: Energy Commission

import { runGovernmentScrape } from "./_base.js";
import type { RegisteredAdapter } from "../types.js";

const SOURCES = [
  {
    name: "Energy Commission of Ghana",
    url: "https://www.energycom.gov.gh/",
    keywords: /energy|electricity|power|solar|renewable|generation|license|capacity|project/i,
  },
];

export const govGhanaAdapter: RegisteredAdapter = {
  config: {
    key: "gov-ghana",
    label: "Ghana (Energy Commission)",
    group: "government",
    schedule: "weekly",
    defaultConfidence: 0.75,
  },
  run: () => runGovernmentScrape({ country: "Ghana", sources: SOURCES }),
};
