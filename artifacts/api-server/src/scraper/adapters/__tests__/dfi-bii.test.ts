/**
 * Tests for DFIBIIAdapter (dfi:bii)
 *
 * Covers:
 *  - Adapter identity (key, schedule, defaultConfidence)
 *  - Happy path: valid RSS XML → non-empty RawRow[], normalized CandidateDraft shape
 *  - Failure path: network error → empty array (no throw)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dfiBIIAdapter } from "../dfi-bii.js";
import { makeRssXml, makeFetchMock, makeFailingFetchMock, SAMPLE_ITEMS } from "./rss-fixture.js";

vi.mock("@workspace/db", () => ({
  db: {},
  scraperRunsTable: {},
  energyProjectsTable: {},
}));

describe("DFIBIIAdapter — identity", () => {
  it("has key dfi:bii", () => {
    expect(dfiBIIAdapter.key).toBe("dfi:bii");
  });

  it("has defaultConfidence 0.90", () => {
    expect(dfiBIIAdapter.defaultConfidence).toBe(0.90);
  });

  it("has a daily cron schedule", () => {
    expect(dfiBIIAdapter.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });

  it("has llmScored enabled", () => {
    expect((dfiBIIAdapter as any).llmScored).toBe(true);
  });
});

describe("DFIBIIAdapter — happy path (valid RSS feed)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeFetchMock(makeRssXml(SAMPLE_ITEMS)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetch() returns one RawRow per RSS item", async () => {
    const rows = await dfiBIIAdapter.fetch();
    expect(rows.length).toBe(SAMPLE_ITEMS.length);
  });

  it("each RawRow has title and link fields", async () => {
    const rows = await dfiBIIAdapter.fetch();
    for (const row of rows) {
      expect(row).toHaveProperty("title");
      expect(row).toHaveProperty("link");
    }
  });

  it("normalize() produces a valid CandidateDraft from a RawRow", async () => {
    const rows = await dfiBIIAdapter.fetch();
    const draft = dfiBIIAdapter.normalize(rows[0]);
    expect(draft).not.toBeNull();
    expect(draft!.source).toBe("dfi:bii");
    expect(typeof draft!.projectName).toBe("string");
    expect(draft!.projectName.length).toBeGreaterThan(0);
    expect(draft!.confidence).toBe(0.90);
    expect(draft!.sourceUrl).toBeTruthy();
    expect(draft!.newsUrl).toBeTruthy();
  });

  it("normalize() maps all required CandidateDraft fields", async () => {
    const rows = await dfiBIIAdapter.fetch();
    const draft = dfiBIIAdapter.normalize(rows[0]);
    const requiredFields = [
      "projectName", "country", "technology", "dealSizeUsdMn", "developer",
      "financiers", "dfiInvolvement", "offtaker", "dealStage", "status",
      "description", "capacityMw", "announcedYear", "financialCloseDate",
      "sourceUrl", "newsUrl", "source", "confidence", "rawJson",
    ];
    for (const field of requiredFields) {
      expect(draft).toHaveProperty(field);
    }
  });

  it("deduplicate() removes rows with identical sourceUrl", async () => {
    const rows = await dfiBIIAdapter.fetch();
    const drafts = rows.map((r) => dfiBIIAdapter.normalize(r)).filter(Boolean) as any[];
    const doubled = [...drafts, ...drafts];
    const deduped = dfiBIIAdapter.deduplicate(doubled);
    expect(deduped.length).toBe(drafts.length);
  });
});

describe("DFIBIIAdapter — failure path (network error)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeFailingFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetch() returns [] on network error (does not throw)", async () => {
    const rows = await dfiBIIAdapter.fetch();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(0);
  });
});

describe("DFIBIIAdapter — failure path (empty RSS feed)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeFetchMock(makeRssXml([])));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetch() returns [] when RSS has no items", async () => {
    const rows = await dfiBIIAdapter.fetch();
    expect(rows.length).toBe(0);
  });
});
