// ── gov/morocco.ts ──
// Morocco: MASEN + ANRE

import { runGovernmentScrape } from "./_base.js";
import type { RegisteredAdapter } from "../types.js";

const SOURCES = [
  {
    name: "MASEN (Moroccan Agency for Sustainable Energy)",
    url: "https://www.masen.ma/en",
    keywords: /energy|solar|wind|renewable|project|capacity|power|noor|generation/i,
  },
  {
    name: "ANRE (Autorité Nationale de Régulation de l'Électricité)",
    url: "https://www.anre.ma/",
    keywords: /energy|énergie|electricity|électricité|power|renewable|capacity|project|tarif/i,
  },
];

export const govMoroccoAdapter: RegisteredAdapter = {
  config: {
    key: "gov-morocco",
    label: "Morocco (MASEN, ANRE)",
    group: "government",
    schedule: "weekly",
    defaultConfidence: 0.75,
  },
  run: () => runGovernmentScrape({ country: "Morocco", sources: SOURCES, adapterKey: "gov-morocco" }),
};
