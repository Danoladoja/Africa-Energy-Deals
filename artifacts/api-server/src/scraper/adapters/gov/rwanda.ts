// ── gov/rwanda.ts ──
// Rwanda: REG (Rwanda Energy Group)

import { runGovernmentScrape } from "./_base.js";
import type { RegisteredAdapter } from "../types.js";

const SOURCES = [
  {
    name: "REG (Rwanda Energy Group)",
    url: "https://www.reg.rw/",
    keywords: /energy|electricity|power|project|generation|solar|hydro|capacity|renewable/i,
  },
];

export const govRwandaAdapter: RegisteredAdapter = {
  config: {
    key: "gov-rwanda",
    label: "Rwanda (REG)",
    group: "government",
    schedule: "weekly",
    defaultConfidence: 0.75,
  },
  run: () => runGovernmentScrape({ country: "Rwanda", sources: SOURCES, adapterKey: "gov-rwanda" }),
};
