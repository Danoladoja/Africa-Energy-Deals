// ── gov/ethiopia.ts ──
// Ethiopia: EEP (Ethiopian Electric Power)

import { runGovernmentScrape } from "./_base.js";
import type { RegisteredAdapter } from "../types.js";

const SOURCES = [
  {
    name: "Ethiopian Electric Power (EEP)",
    url: "https://www.eep.com.et/",
    keywords: /energy|electricity|power|hydro|dam|generation|solar|wind|geothermal|capacity|project/i,
  },
];

export const govEthiopiaAdapter: RegisteredAdapter = {
  config: {
    key: "gov-ethiopia",
    label: "Ethiopia (EEP)",
    group: "government",
    schedule: "weekly",
    defaultConfidence: 0.75,
  },
  run: () => runGovernmentScrape({ country: "Ethiopia", sources: SOURCES, adapterKey: "gov-ethiopia" }),
};
