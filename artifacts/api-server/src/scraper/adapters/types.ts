/**
 * Adapter contract. Adapters are plain async functions that return a list of
 * CandidateDraft + errors + meta. No base class, no inheritance.
 */

export interface CandidateDraft {
  // Required
  projectName: string;
  country: string;          // Must be a canonical African country name
  technology: string;       // Must be a canonical technology enum value

  // Optional but important
  dealSizeUsdMn: number | null;
  capacityMw: number | null;
  developer: string | null;
  financiers: string | null;
  dfiInvolvement: string | null;
  dealStage: string | null;
  status: string | null;
  description: string | null;

  // Metadata
  newsUrl: string | null;
  sourceUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  announcedYear: number | null;
  offtaker: string | null;
  financialCloseDate: string | null;
  // Financing structure (optional — set by DFI adapters and LLM extraction)
  financingType?: string | null;
  ppaTermYears?: number | null;
  ppaTariffUsdKwh?: number | null;
  grantComponent?: number | null;
  confidence: number;        // 0.0–1.0
  // True when dealSizeUsdMn is a benchmark estimate (capacity × cost/MW) rather
  // than a disclosed value. The pipeline also sets this automatically when it
  // estimates a missing size itself.
  isEstimated?: boolean;
}

export interface AdapterConfig {
  key: string;               // e.g. "gem", "afdb", "ifc"
  label: string;             // human-readable
  group: "gem" | "world-bank" | "multilateral" | "government" | "news";
  schedule: "daily" | "weekly" | "monthly";
  defaultConfidence: number;
}

export interface AdapterResult {
  candidates: CandidateDraft[];
  errors: string[];
  meta: { recordsFetched: number; filteredOut: number };
}

export type AdapterFn = () => Promise<AdapterResult>;

export interface RegisteredAdapter {
  config: AdapterConfig;
  run: AdapterFn;
}
