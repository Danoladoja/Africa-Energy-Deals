/**
 * BaseSourceAdapter — abstract base class for all DFI / RSS / HTML source adapters.
 *
 * Additive pattern: runs ALONGSIDE the existing flat-function scraper without
 * touching any of its code. Each adapter registers itself in the adapter registry
 * (adapters/index.ts) and is iterated by the adapter runner.
 */

import { db, scraperRunsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { deduplicateBatch, deduplicateBatchByUrl } from "../services/batch-dedup.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RawRow {
  [key: string]: unknown;
}

export interface CandidateDraft {
  projectName: string;
  country: string | null;
  technology: string | null;
  dealSizeUsdMn: number | null;
  developer: string | null;
  financiers: string | null;
  dfiInvolvement: string | null;
  offtaker: string | null;
  dealStage: string | null;
  status: string | null;
  description: string | null;
  capacityMw: number | null;
  announcedYear: number | null;
  financialCloseDate: string | null;
  sourceUrl: string | null;
  newsUrl: string | null;
  source: string;
  confidence: number;
  rawJson: Record<string, unknown> | null;
}

export interface RejectionEntry {
  title: string;
  sourceUrl?: string;
  reason: string;
  matchedKeywords: string[];
  adapter: string;
  rejectedAt: string;
}

export interface WriteResult {
  inserted: boolean;
  updated: boolean;
  flagged: boolean;
  rejected?: RejectionEntry;
}

export interface RunReport {
  adapterKey: string;
  startedAt: Date;
  completedAt: Date;
  rowsFetched: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsFlagged: number;
  rowsRejected: number;
  rejectionLog: RejectionEntry[];
  errors: string[];
  cached: boolean;
}

interface CacheEntry {
  etag?: string;
  lastModified?: string;
  fetchedAt: number;
}

// ── In-process cache (per-adapter, keyed by URL) ──────────────────────────────

const _cache = new Map<string, CacheEntry>();

// ── Rate limiter (per-adapter token bucket) ───────────────────────────────────

interface RateLimiterState {
  tokens: number;
  lastRefill: number;
}

const _rateLimiters = new Map<string, RateLimiterState>();

function consumeToken(adapterKey: string, maxRps: number): boolean {
  const now = Date.now();
  let state = _rateLimiters.get(adapterKey);
  if (!state) {
    state = { tokens: maxRps, lastRefill: now };
    _rateLimiters.set(adapterKey, state);
  }
  const elapsed = (now - state.lastRefill) / 1000;
  state.tokens = Math.min(maxRps, state.tokens + elapsed * maxRps);
  state.lastRefill = now;
  if (state.tokens >= 1) {
    state.tokens -= 1;
    return true;
  }
  return false;
}

async function waitForToken(adapterKey: string, maxRps: number): Promise<void> {
  while (!consumeToken(adapterKey, maxRps)) {
    await new Promise((r) => setTimeout(r, Math.ceil(1000 / maxRps)));
  }
}

// ── Abstract base ─────────────────────────────────────────────────────────────

export abstract class BaseSourceAdapter {
  abstract readonly key: string;
  abstract readonly schedule: string;
  abstract readonly defaultConfidence: number;
  readonly maxRps: number = 2;

  abstract fetch(): Promise<RawRow[]>;
  abstract normalize(row: RawRow): CandidateDraft | null;

  deduplicate(candidates: CandidateDraft[]): CandidateDraft[] {
    const seen = new Set<string>();
    return candidates.filter((c) => {
      const sig = `${(c.sourceUrl ?? "").toLowerCase()}|${(c.projectName ?? "").toLowerCase().slice(0, 60)}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
  }

  protected cacheGet(url: string): CacheEntry | undefined {
    return _cache.get(`${this.key}:${url}`);
  }

  protected cacheSet(url: string, entry: CacheEntry): void {
    _cache.set(`${this.key}:${url}`, entry);
  }

  protected async httpFetch(
    url: string,
    options: RequestInit = {},
    maxRetries = 3,
  ): Promise<{ response: Response; cached: boolean }> {
    await waitForToken(this.key, this.maxRps);

    const cached = this.cacheGet(url);
    const headers: Record<string, string> = {
      "User-Agent": "AfriEnergyTracker/1.0 (+https://afrienergytracker.io)",
      "Accept": "application/json, text/xml, application/rss+xml, text/html, */*",
      ...(options.headers as Record<string, string> | undefined ?? {}),
    };

    if (cached?.etag) headers["If-None-Match"] = cached.etag;
    if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        const backoff = Math.min(500 * Math.pow(2, attempt - 1) + Math.random() * 200, 8000);
        await new Promise((r) => setTimeout(r, backoff));
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (response.status === 304) {
          return { response, cached: true };
        }

        if (response.ok) {
          const etag = response.headers.get("etag") ?? undefined;
          const lastModified = response.headers.get("last-modified") ?? undefined;
          if (etag || lastModified) {
            this.cacheSet(url, { etag, lastModified, fetchedAt: Date.now() });
          }
          return { response, cached: false };
        }

        if (response.status >= 500 && attempt < maxRetries - 1) {
          lastErr = new Error(`HTTP ${response.status} from ${url}`);
          continue;
        }

        if (response.status === 403 || response.status === 401) {
          throw new Error(`Access denied (${response.status}): ${url}`);
        }

        throw new Error(`HTTP ${response.status} from ${url}`);
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") {
          lastErr = new Error(`Timeout fetching ${url}`);
        } else {
          lastErr = err instanceof Error ? err : new Error(String(err));
        }
        if (attempt === maxRetries - 1) throw lastErr;
      }
    }
    throw lastErr ?? new Error(`Failed to fetch ${url}`);
  }

  async run(
    writeCandidate: (draft: CandidateDraft) => Promise<WriteResult>,
    triggeredBy: "manual" | "schedule" = "manual",
  ): Promise<RunReport> {
    const startedAt = new Date();
    const report: RunReport = {
      adapterKey: this.key,
      startedAt,
      completedAt: startedAt,
      rowsFetched: 0,
      rowsInserted: 0,
      rowsUpdated: 0,
      rowsFlagged: 0,
      rowsRejected: 0,
      rejectionLog: [],
      errors: [],
      cached: false,
    };

    const [runRow] = await db.insert(scraperRunsTable).values({
      sourceName: this.key,
      adapterKey: this.key,
      startedAt,
      triggeredBy,
    }).returning();

    try {
      console.log(`[Adapter:${this.key}] Starting run (${triggeredBy})`);
      const rows = await this.fetch();
      report.rowsFetched = rows.length;
      console.log(`[Adapter:${this.key}] Fetched ${rows.length} rows`);

      if (rows.length === 0) {
        report.cached = true;
      } else {
        const normalized = rows
          .map((r) => {
            try { return this.normalize(r); } catch (e) { report.errors.push(String(e)); return null; }
          })
          .filter((c): c is CandidateDraft => c !== null);

        // Stage 1: adapter-level URL exact dedup (existing)
        const adapterDeduped = this.deduplicate(normalized);

        // Stage 2: intra-batch name+country dedup — merges candidates that
        //          refer to the same project from different articles/feeds
        const urlDeduped = deduplicateBatchByUrl(adapterDeduped);
        const batchResult = deduplicateBatch(urlDeduped);
        if (batchResult.mergedCount > 0) {
          console.log(`[Adapter:${this.key}] Batch dedup merged ${batchResult.mergedCount} duplicates`);
        }
        const deduped = batchResult.deduplicated;

        for (const candidate of deduped) {
          try {
            const res = await writeCandidate(candidate);
            if (res.inserted) report.rowsInserted++;
            if (res.updated) report.rowsUpdated++;
            if (res.flagged) report.rowsFlagged++;
            if (res.rejected) {
              report.rowsRejected++;
              if (report.rejectionLog.length < 100) {
                report.rejectionLog.push(res.rejected);
              }
              console.log(`[sector_gate.reject] adapter=${this.key} reason=${res.rejected.reason} title="${res.rejected.title}"`);
            }
          } catch (e) {
            report.errors.push(String(e));
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.errors.push(msg);
      console.error(`[Adapter:${this.key}] Fatal error:`, msg);
    }

    report.completedAt = new Date();

    await db.update(scraperRunsTable).set({
      completedAt: report.completedAt,
      recordsFound: report.rowsFetched,
      recordsInserted: report.rowsInserted,
      recordsUpdated: report.rowsUpdated,
      flaggedForReview: report.rowsFlagged,
      rejectedNonEnergyCount: report.rowsRejected,
      rejectionLog: report.rejectionLog,
      errors: report.errors.length > 0 ? report.errors.join("\n") : null,
    }).where(eq(scraperRunsTable.id, runRow.id));

    console.log(`[Adapter:${this.key}] Done — inserted:${report.rowsInserted} updated:${report.rowsUpdated} flagged:${report.rowsFlagged} rejected:${report.rowsRejected} errors:${report.errors.length}`);
    return report;
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

export function parseAmountUsd(raw: unknown): number | null {
  if (typeof raw === "number" && isFinite(raw) && raw > 0) return raw / 1_000_000;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[,$\s]/g, "").toLowerCase();
    const match = cleaned.match(/^([\d.]+)(m|mn|million|b|bn|billion|k|thousand)?$/);
    if (!match) return null;
    const val = parseFloat(match[1]);
    if (!isFinite(val)) return null;
    const suffix = match[2] ?? "";
    if (suffix.startsWith("b")) return val * 1000;
    if (suffix.startsWith("k")) return val / 1000;
    return val;
  }
  return null;
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
