/**
 * HTMLAdapter — base subclass for sources that only expose static HTML pages.
 * Implements the health-check safety net: if a source returns zero rows in
 * two consecutive runs, it is marked unhealthy and stops running.
 *
 * No Playwright / JS execution — fetch + static HTML parsing only.
 */

import { BaseSourceAdapter, type RawRow, type CandidateDraft } from "../base.js";

export abstract class HTMLAdapter extends BaseSourceAdapter {
  private _consecutiveZeroRuns = 0;
  private _healthy = true;

  get isHealthy(): boolean {
    return this._healthy;
  }

  protected abstract parseHtml(html: string): RawRow[];

  async fetch(): Promise<RawRow[]> {
    if (!this._healthy) {
      console.warn(`[${this.key}] Adapter is unhealthy (2 consecutive empty runs) — skipping`);
      return [];
    }

    const { response, cached } = await this.httpFetch(this.sourcePageUrl);
    if (cached) return [];

    const html = await response.text();
    const rows = this.parseHtml(html);

    if (rows.length === 0) {
      this._consecutiveZeroRuns++;
      if (this._consecutiveZeroRuns >= 2) {
        this._healthy = false;
        console.error(`[${this.key}] Marked UNHEALTHY after ${this._consecutiveZeroRuns} consecutive empty runs`);
      }
    } else {
      this._consecutiveZeroRuns = 0;
    }

    return rows;
  }

  protected abstract readonly sourcePageUrl: string;

  normalize(_row: RawRow): CandidateDraft | null {
    return null;
  }
}
