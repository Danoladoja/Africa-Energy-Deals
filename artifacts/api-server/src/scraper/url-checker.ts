/**
 * Async URL validation sweep — runs AFTER ingestion, never blocks the pipeline.
 *
 * Projects are inserted with url_status='unchecked'. A background sweep marks
 * each URL as valid / broken / blocked / timeout and stores the HTTP status
 * + timestamp so journalists have an audit trail and link rot is visible.
 *
 * Uses GET (not HEAD) with a browser-like User-Agent because many news sites
 * (Reuters, Bloomberg, BBC) return 403/429 to HEAD requests from non-browsers.
 */

import { db, projectsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const USER_AGENT = "Mozilla/5.0 (compatible; AfriEnergyBot/1.0; +https://afrienergytracker.io)";

export type UrlStatus = "valid" | "broken" | "blocked" | "timeout";

interface CheckOutcome {
  status: UrlStatus;
  httpStatus: number | null;
}

async function checkUrl(url: string, timeoutMs = 8000): Promise<CheckOutcome> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    clearTimeout(timer);

    if (res.ok || res.status === 304) {
      return { status: "valid", httpStatus: res.status };
    }
    if (res.status === 403 || res.status === 429 || res.status === 451) {
      // WAF / rate limit / legal block — URL likely fine for humans
      return { status: "blocked", httpStatus: res.status };
    }
    if (res.status === 404 || res.status === 410) {
      return { status: "broken", httpStatus: res.status };
    }
    // 5xx and everything else → treat as temporary
    return { status: "blocked", httpStatus: res.status };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { status: "timeout", httpStatus: null };
    }
    return { status: "broken", httpStatus: null };
  }
}

export interface SweepOptions {
  /** Max projects to check this run. Default 100. */
  batchSize?: number;
  /** Re-check URLs older than this many days. Default 30. */
  maxAgeDays?: number;
  /** Pause between requests to avoid hammering domains. Default 500 ms. */
  delayMs?: number;
  /** Per-URL progress callback. */
  onProgress?: (msg: string) => void;
}

export interface SweepReport {
  checked: number;
  valid: number;
  broken: number;
  blocked: number;
  timeout: number;
}

interface ProjectRow {
  id: number;
  news_url: string | null;
  source_url: string | null;
}

/**
 * Pick up to `batchSize` projects that need a URL check (unchecked first,
 * then stale ones), check them sequentially with a polite delay, and write
 * the results back to the project rows.
 */
export async function runUrlCheckSweep(opts: SweepOptions = {}): Promise<SweepReport> {
  const batchSize = opts.batchSize ?? 100;
  const maxAge = opts.maxAgeDays ?? 30;
  const delay = opts.delayMs ?? 500;
  const cutoff = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000);

  const projects = await db.execute(sql`
    SELECT id, news_url, source_url FROM energy_projects
    WHERE (news_url IS NOT NULL OR source_url IS NOT NULL)
      AND (url_status = 'unchecked' OR url_checked_at < ${cutoff})
    ORDER BY
      CASE WHEN url_status = 'unchecked' THEN 0 ELSE 1 END,
      discovered_at DESC NULLS LAST
    LIMIT ${batchSize}
  `);

  const report: SweepReport = { checked: 0, valid: 0, broken: 0, blocked: 0, timeout: 0 };

  for (const row of projects.rows as unknown as ProjectRow[]) {
    const url = row.news_url ?? row.source_url;
    if (!url) continue;

    const result = await checkUrl(url);
    report.checked++;
    report[result.status]++;

    await db.update(projectsTable).set({
      urlStatus: result.status,
      urlCheckedAt: new Date(),
      urlHttpStatus: result.httpStatus,
    }).where(eq(projectsTable.id, row.id));

    opts.onProgress?.(`Checked ${url} → ${result.status} (${result.httpStatus ?? "—"})`);

    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }

  return report;
}
