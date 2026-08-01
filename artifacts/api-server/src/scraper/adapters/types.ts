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
  confidence: number;        // 0.0–1.0
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
