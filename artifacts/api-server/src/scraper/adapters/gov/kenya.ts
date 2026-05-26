// ── gov/kenya.ts ──
// Kenya: EPRA (Energy and Petroleum Regulatory Authority)

import { runGovernmentScrape } from "./_base.js";
import type { RegisteredAdapter } from "../types.js";

const SOURCES = [
  {
    name: "EPRA (Energy & Petroleum Regulatory Authority)",
    url: "https://www.epra.go.ke/",
    keywords: /energy|electricity|power|solar|wind|generation|license|tariff|capacity|project|renewable/i,
  },
];

export const govKenyaAdapter: RegisteredAdapter = {
  config: {
    key: "gov-kenya",
    label: "Kenya (EPRA)",
    group: "government",
    schedule: "weekly",
    defaultConfidence: 0.75,
  },
  run: () => runGovernmentScrape({ country: "Kenya", sources: SOURCES, adapterKey: "gov-kenya" }),
};
