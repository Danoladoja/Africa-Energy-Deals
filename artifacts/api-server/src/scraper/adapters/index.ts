/**
 * Adapter registry — all adapters register here.
 *
 * Adding a new adapter in PR1c (or beyond) requires:
 * 1. Create a new file in this directory extending BaseSourceAdapter (or RSSAdapter).
 * 2. Export a singleton instance.
 * 3. Import and add it to ADAPTER_REGISTRY below.
 *
 * That's it — the runner in adapter-runner.ts iterates ADAPTER_REGISTRY.
 *
 * ─── Adding Proparco in a follow-on PR (worked example) ───────────────
 * File: adapters/dfi-proparco.ts  (already exists — already registered)
 * Registry diff:
 *   + import { dfiProparcoAdapter } from "./dfi-proparco.js";
 *   + dfiProparcoAdapter,   // in ADAPTER_REGISTRY
 * ─────────────────────────────────────────────────────────────────────
 */

import { type BaseSourceAdapter } from "../base.js";

import { dfiAfDBAdapter } from "./dfi-afdb.js";
import { dfiIFCAdapter } from "./dfi-ifc.js";
import { dfiDFCAdapter } from "./dfi-dfc.js";
import { dfiProparcoAdapter } from "./dfi-proparco.js";
import { dfiFMOAdapter } from "./dfi-fmo.js";
import { dfiBIIAdapter } from "./dfi-bii.js";
import { apoGroupAdapter } from "./apo-group.js";
import { seedGoogleAlertsAdapters } from "./google-alerts.js";
import { worldBankApiAdapter } from "./api-worldbank.js";
import { gcfApiAdapter } from "./api-gcf.js";
import { dfcTransactionAdapter } from "./api-dfc.js";
import { afdbEnergyAdapter } from "./api-afdb-energy.js";
import { gemAdapter } from "./api-gem.js";
import { ifcInvestmentAdapter } from "./api-ifc.js";
import { aidDataAdapter } from "./api-aiddata.js";

export const ADAPTER_REGISTRY: BaseSourceAdapter[] = [
  dfiAfDBAdapter,
  dfiIFCAdapter,
  dfiDFCAdapter,
  dfiProparcoAdapter,
  dfiFMOAdapter,
  dfiBIIAdapter,
  apoGroupAdapter,
  worldBankApiAdapter,
  // Structured data adapters (Tier 1: JSON APIs, confidence 1.0)
  gcfApiAdapter,           // Green Climate Fund — open data library
  dfcTransactionAdapter,   // US DFC transaction data
  afdbEnergyAdapter,       // Africa Energy Portal (AfDB)
  ifcInvestmentAdapter,    // IFC investment projects
  // Structured data adapters (Tier 2: bulk CSV, confidence 0.90–0.95)
  gemAdapter,              // Global Energy Monitor — power plant tracker
  aidDataAdapter,          // AidData — Chinese development finance
  ...seedGoogleAlertsAdapters,
];

export function getAdapter(key: string): BaseSourceAdapter | undefined {
  return ADAPTER_REGISTRY.find((a) => a.key === key);
}

export function getAdapterKeys(): string[] {
  return ADAPTER_REGISTRY.map((a) => a.key);
}

export function getAdapterMeta(): Array<{ key: string; schedule: string; defaultConfidence: number }> {
  return ADAPTER_REGISTRY.map((a) => ({
    key: a.key,
    schedule: a.schedule,
    defaultConfidence: a.defaultConfidence,
  }));
}
