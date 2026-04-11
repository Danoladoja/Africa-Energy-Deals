/**
 * Tests for awardBadges() — corroborator and scoop badges.
 *
 * Mock strategy:
 *   Every DB select call in awardBadges() follows the Drizzle chain:
 *   db.select().from().where()[.orderBy().limit(n) | .groupBy() | (await directly)]
 *
 *   The mock consumes one response from `selectQueue` per .where() call.
 *   All downstream chain methods (.limit, .orderBy, .groupBy) use the same data
 *   without consuming another queue entry.
 *
 * Call order (for each test, starting at index 0):
 *   0  approvedCount query
 *   1  hasBadge('bronze')         — only if approvedCount >= 1
 *   2  hasBadge('silver')         — only if approvedCount >= 10
 *      hasBadge('gold')           — only if approvedCount >= 50
 *      hasBadge('platinum')       — only if approvedCount >= 200
 *   N  first_light global         — only if approvedCount >= 1
 *   N  first_light mine           — only if approvedCount >= 1
 *      hasBadge('first_light')    — only if IDs match
 *   N  country_specialist groupBy
 *      hasBadge('country_specialist_XX') per matching country (>=10)
 *   N  multi_sector
 *      hasBadge('multi_sector')   — only if >=3 sectors
 *   N  cross_border
 *      hasBadge('cross_border')   — only if >=5 countries
 *   N  corroborator count
 *      hasBadge('corroborator')   — only if count >=10
 *   N  scoop: get submission      — only if justApprovedSubmissionId provided
 *   N  scoop: get linked project  — only if submission has linkedProjectId
 *      hasBadge('scoop')          — only if qualifying condition met
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared mock state (vi.hoisted runs before vi.mock and module imports) ─────
const { selectQueue, insertCalls, resetMocks } = vi.hoisted(() => {
  const selectQueue: any[][] = [];
  const insertCalls: any[] = [];

  function makeThenable(data: any[]): any {
    const p: any = Promise.resolve(data);
    p.limit = (_n: number) => Promise.resolve(data);
    p.orderBy = (..._args: any[]) => makeThenable(data);
    p.groupBy = (..._args: any[]) => Promise.resolve(data);
    return p;
  }

  const mockDb = {
    select: (_fields?: any) => ({
      from: (_table: any) => ({
        where: (..._args: any[]) => {
          const data = selectQueue.shift() ?? [];
          return makeThenable(data);
        },
      }),
    }),
    insert: (_table: any) => ({
      values: (data: any) => {
        insertCalls.push(data);
        return Promise.resolve([{ id: 999 }]);
      },
    }),
    update: (_table: any) => ({
      set: (_data: any) => ({
        where: (_cond: any) => Promise.resolve([]),
      }),
    }),
  };

  function resetMocks(responses: any[][]) {
    selectQueue.length = 0;
    selectQueue.push(...responses);
    insertCalls.length = 0;
  }

  return { selectQueue, insertCalls, resetMocks, __mockDb: mockDb };
});

vi.mock("@workspace/db", () => {
  function makeThenable(data: any[]): any {
    const p: any = Promise.resolve(data);
    p.limit = (_n: number) => Promise.resolve(data);
    p.orderBy = (..._args: any[]) => makeThenable(data);
    p.groupBy = (..._args: any[]) => Promise.resolve(data);
    return p;
  }

  return {
    db: {
      select: (_fields?: any) => ({
        from: (_table: any) => ({
          where: (..._args: any[]) => {
            const data = selectQueue.shift() ?? [];
            return makeThenable(data);
          },
        }),
      }),
      insert: (_table: any) => ({
        values: (data: any) => {
          insertCalls.push(data);
          return Promise.resolve([{ id: 999 }]);
        },
      }),
      update: (_table: any) => ({
        set: (_data: any) => ({
          where: (_cond: any) => Promise.resolve([]),
        }),
      }),
    },
    contributorsTable: {},
    contributorSubmissionsTable: {
      id: "id",
      contributorId: "contributor_id",
      status: "status",
      needsExtraScrutiny: "needs_extra_scrutiny",
      country: "country",
      subSector: "sub_sector",
      reviewedAt: "reviewed_at",
      linkedProjectId: "linked_project_id",
      createdAt: "created_at",
    },
    contributorBadgesTable: {
      id: "id",
      contributorId: "contributor_id",
      badgeSlug: "badge_slug",
    },
    projectsTable: {
      id: "id",
      communitySubmissionId: "community_submission_id",
      discoveredAt: "discovered_at",
    },
  };
});

// Import AFTER the mock is set up
import { awardBadges } from "../badges.js";

// ── Shared response builder helpers ───────────────────────────────────────────

/**
 * Standard preamble responses for a contributor with approvedCount = 10.
 * Bronze and silver are ALREADY awarded (hasBadge returns [{id}]) so no new inserts
 * for tier badges. First_light IDs differ so no first_light award.
 * Country/sector/country counts are all below thresholds.
 * Leaves the corroborator and scoop slots open at the end.
 */
function preamble10AlreadyTiered(): any[][] {
  return [
    [{ approvedCount: 10 }],     // 0: approvedCount
    [{ id: 1 }],                 // 1: hasBadge('bronze')   → already has it
    [{ id: 2 }],                 // 2: hasBadge('silver')   → already has it
    [{ id: 5 }],                 // 3: first_light global
    [{ id: 99 }],                // 4: first_light mine (different → no award)
    [],                          // 5: country_specialist groupBy → no 10+ countries
    [{ distinctSectors: 2 }],    // 6: multi_sector → 2 < 3
    [{ distinctCountries: 3 }],  // 7: cross_border → 3 < 5
  ];
}

/**
 * Standard preamble responses for a contributor with approvedCount = 1.
 * Bronze is new. First_light IDs differ. All counts below thresholds.
 */
function preamble1NewBronze(): any[][] {
  return [
    [{ approvedCount: 1 }],      // 0: approvedCount
    [],                          // 1: hasBadge('bronze') → new, will insert
    [{ id: 10 }],                // 2: first_light global
    [{ id: 99 }],                // 3: first_light mine (different → no award)
    [],                          // 4: country_specialist groupBy → empty
    [{ distinctSectors: 0 }],    // 5: multi_sector → 0 < 3
    [{ distinctCountries: 0 }],  // 6: cross_border → 0 < 5
  ];
}

// ── corroborator tests ────────────────────────────────────────────────────────

describe("corroborator badge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("awards corroborator when contributor has 10 approved trusted-source submissions", async () => {
    resetMocks([
      ...preamble10AlreadyTiered(),
      [{ corroboratorCount: 10 }], // 8: corroborator count ≥ 10
      [],                          // 9: hasBadge('corroborator') → not yet
    ]);

    await awardBadges(1);

    const scoopInsert = insertCalls.find((c) => c.badgeSlug === "corroborator");
    expect(scoopInsert).toBeDefined();
    expect(scoopInsert.metadata).toMatchObject({ approvedCorroboratedCount: 10 });
  });

  it("does NOT award corroborator when count is 9 (below threshold)", async () => {
    resetMocks([
      ...preamble10AlreadyTiered(),
      [{ corroboratorCount: 9 }],  // 8: corroborator count — 9 < 10
    ]);

    await awardBadges(1);

    expect(insertCalls.find((c) => c.badgeSlug === "corroborator")).toBeUndefined();
  });

  it("does NOT award corroborator when 10 approved but 2 have needsExtraScrutiny=true (8 qualify)", async () => {
    resetMocks([
      ...preamble10AlreadyTiered(),
      [{ corroboratorCount: 8 }],  // 8: corroborator count — 8 < 10
    ]);

    await awardBadges(1);

    expect(insertCalls.find((c) => c.badgeSlug === "corroborator")).toBeUndefined();
  });

  it("is idempotent — does not insert a second corroborator when count is 15", async () => {
    resetMocks([
      ...preamble10AlreadyTiered(),
      [{ corroboratorCount: 15 }], // 8: count ≥ 10 → award() called
      [{ id: 42 }],                // 9: hasBadge('corroborator') → already has it
    ]);

    await awardBadges(1);

    const corrobInserts = insertCalls.filter((c) => c.badgeSlug === "corroborator");
    expect(corrobInserts).toHaveLength(0); // hasBadge returned truthy → award() skipped
  });
});

// ── scoop tests ───────────────────────────────────────────────────────────────

describe("scoop badge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("awards scoop when submission created a brand-new project (communitySubmissionId match)", async () => {
    resetMocks([
      ...preamble1NewBronze(),
      [{ corroboratorCount: 0 }],  // 7: corroborator count — 0 < 10
      // scoop checks:
      [{ id: 42, linkedProjectId: 7, createdAt: new Date("2026-01-01") }],  // 8: submission row
      [{ id: 7, communitySubmissionId: 42, discoveredAt: new Date("2026-01-01") }], // 9: project row
      [],                          // 10: hasBadge('scoop') → not yet
    ]);

    await awardBadges(1, 42);

    const scoopInsert = insertCalls.find((c) => c.badgeSlug === "scoop");
    expect(scoopInsert).toBeDefined();
    expect(scoopInsert.metadata).toMatchObject({ projectId: 7, leadDays: null });
  });

  it("awards scoop when submission predates discoveredAt by 72 hours (timing scoop)", async () => {
    resetMocks([
      ...preamble1NewBronze(),
      [{ corroboratorCount: 0 }],
      [{ id: 55, linkedProjectId: 8, createdAt: new Date("2026-01-01T00:00:00Z") }],
      // communitySubmissionId=999≠55, discoveredAt 72h later → timing scoop
      [{ id: 8, communitySubmissionId: 999, discoveredAt: new Date("2026-01-04T00:00:00Z") }],
      [],
    ]);

    await awardBadges(1, 55);

    const scoopInsert = insertCalls.find((c) => c.badgeSlug === "scoop");
    expect(scoopInsert).toBeDefined();
    expect(scoopInsert.metadata.leadDays).toBe(3);
  });

  it("does NOT award scoop when submission predates discoveredAt by only 24 hours", async () => {
    resetMocks([
      ...preamble1NewBronze(),
      [{ corroboratorCount: 0 }],
      [{ id: 55, linkedProjectId: 8, createdAt: new Date("2026-01-01T00:00:00Z") }],
      // discoveredAt only 24h later — below 48h threshold
      [{ id: 8, communitySubmissionId: 999, discoveredAt: new Date("2026-01-02T00:00:00Z") }],
      // hasBadge('scoop') NOT called since condition not met
    ]);

    await awardBadges(1, 55);

    expect(insertCalls.find((c) => c.badgeSlug === "scoop")).toBeUndefined();
  });

  it("does NOT run scoop check when no submissionId is provided", async () => {
    resetMocks([
      ...preamble10AlreadyTiered(),
      [{ corroboratorCount: 0 }],
      // no scoop queries follow
    ]);

    await awardBadges(1); // no second argument

    expect(insertCalls.find((c) => c.badgeSlug === "scoop")).toBeUndefined();
    // selectQueue should be fully consumed (no leftover = no extra scoop queries fired)
    expect(selectQueue).toHaveLength(0);
  });

  it("is idempotent — does not insert a second scoop on a second qualifying submission", async () => {
    resetMocks([
      ...preamble1NewBronze(),
      [{ corroboratorCount: 0 }],
      [{ id: 42, linkedProjectId: 7, createdAt: new Date("2026-01-01") }],
      [{ id: 7, communitySubmissionId: 42, discoveredAt: new Date("2026-01-01") }],
      [{ id: 9 }],  // hasBadge('scoop') → already has it
    ]);

    await awardBadges(1, 42);

    const scoopInserts = insertCalls.filter((c) => c.badgeSlug === "scoop");
    expect(scoopInserts).toHaveLength(0);
  });
});

// ── regression: existing badges unaffected ────────────────────────────────────

describe("existing badges (regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("still awards bronze on first approval", async () => {
    resetMocks([
      [{ approvedCount: 1 }],
      [],                          // hasBadge('bronze') → not yet
      [{ id: 10 }],               // first_light global
      [{ id: 10 }],               // first_light mine — SAME ID → award first_light
      [],                          // hasBadge('first_light') → not yet
      [],                          // country_specialist groupBy → empty
      [{ distinctSectors: 0 }],
      [{ distinctCountries: 0 }],
      [{ corroboratorCount: 0 }],
    ]);

    await awardBadges(99);

    expect(insertCalls.find((c) => c.badgeSlug === "bronze")).toBeDefined();
    expect(insertCalls.find((c) => c.badgeSlug === "first_light")).toBeDefined();
  });

  it("still awards multi_sector with 3+ distinct sectors", async () => {
    resetMocks([
      [{ approvedCount: 5 }],
      [],                          // hasBadge('bronze') → new
      [{ id: 5 }],                // first_light global
      [{ id: 99 }],               // first_light mine (differs)
      [],                          // country_specialist groupBy → empty
      [{ distinctSectors: 4 }],   // multi_sector → 4 ≥ 3 → award
      [],                          // hasBadge('multi_sector') → not yet
      [{ distinctCountries: 2 }], // cross_border → 2 < 5
      [{ corroboratorCount: 0 }],
    ]);

    await awardBadges(99);

    expect(insertCalls.find((c) => c.badgeSlug === "multi_sector")).toBeDefined();
  });
});
