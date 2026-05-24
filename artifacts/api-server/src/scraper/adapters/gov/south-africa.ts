// ── gov/south-africa.ts ──
// South Africa: NERSA + IPP Office

import { runGovernmentScrape } from "./_base.js";
import type { RegisteredAdapter } from "../types.js";

const SOURCES = [
  {
    name: "NERSA (National Energy Regulator)",
    url: "https://www.nersa.org.za/",
    keywords: /energy|electricity|power|generation|license|tariff|renewable|capacity|project|ipp/i,
  },
  {
    name: "IPP Office (Independent Power Producer)",
    url: "https://www.ipp-projects.co.za/",
    keywords: /energy|power|solar|wind|bid|award|project|renewable|capacity|procurement/i,
  },
];

export const govSouthAfricaAdapter: RegisteredAdapter = {
  config: {
    key: "gov-south-africa",
    label: "South Africa (NERSA, IPP Office)",
    group: "government",
    schedule: "weekly",
    defaultConfidence: 0.75,
  },
  run: () => runGovernmentScrape({ country: "South Africa", sources: SOURCES }),
};
