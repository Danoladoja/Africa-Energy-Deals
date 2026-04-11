# AfriEnergy Tracker — Admin Surface Audit
**Date:** April 2026  
**Scope:** Data Pipeline, AI Discovery, Review Queue, and Reviewer Portal surfaces

---

## 1. Surface Inventory

The admin backend exposes **three distinct review/pipeline surfaces**. Two overlap significantly in purpose; one is separate by design.

| Surface | Route | Auth | Primary Audience |
|---------|-------|------|-----------------|
| AI Discovery | `/discovery` | Admin Bearer token | Admin (full access) |
| Admin Dashboard → Pipeline & Queue | `/admin` (sections: `pipeline`, `queue`) | Admin Bearer token | Admin (full access) |
| Reviewer Portal | `/review` | Magic-link JWT (`reviewerAuthMiddleware`) | External reviewers |

---

## 2. AI Discovery Page (`/discovery`)

### What it does
A standalone admin page (accessible from the main nav) that gives the admin a single view over the entire AI scraping workflow — from triggering scraper runs to reviewing what the AI discovered.

### API Routes Used

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/scraper/status` | Last run time, `isRunning` flag, `pendingCount`, last result summary |
| GET | `/api/scraper/queue` | Returns all rows where `reviewStatus = 'pending'` (no pagination) |
| GET | `/api/scraper/reviewed` | Returns all AI-discovered rows (both approved and rejected — `isAutoDiscovered = true`) |
| POST | `/api/scraper/run` | Triggers `runScraper()` for all source groups — SSE streaming of progress logs |
| POST | `/api/scraper/review/:id` | Sets `reviewStatus` to `'approved'` or `'rejected'` (two-way only) |
| POST | `/api/scraper/review-all` | Bulk-sets `reviewStatus` on all `pending` rows to `'approved'` or `'rejected'` |

### Auth Model
Admin Bearer token (`Authorization: Bearer <token>`) stored in `localStorage` as `afrienergy_admin_token`. Token is persisted in the `sessions` DB table under `userEmail = '__admin__'`, so it survives Railway restarts.

### DB Write Behaviour
- `POST /api/scraper/review/:id` — sets `reviewStatus` to `'approved'` or `'rejected'`; no other fields touched
- `POST /api/scraper/review-all` — bulk updates all `pending` rows; no other fields touched

### UI Capabilities
- Run all sources (streaming live log output in an "Agent Log" panel)
- View pending queue (tab) or all AI-discovered deals (tab)
- Approve or Reject individual projects
- Approve All / Reject All bulk actions
- Stats panel: last run time, pending count, schedule info, source count

### Limitations
- **No `needs_source` handling**: Projects inserted with `reviewStatus = 'needs_source'` (those where the AI could not find or validate a source URL) do **not** appear in the pending tab here. The `/api/scraper/queue` endpoint only returns `reviewStatus = 'pending'` rows.
- **No URL editing**: Source URLs cannot be corrected from this surface.
- **No pagination**: `GET /api/scraper/queue` and `GET /api/scraper/reviewed` return all rows without limit — could become slow at scale.
- **Two-way review only**: Can only approve or reject; cannot set `needs_source`.

---

## 3. Admin Dashboard (`/admin`) — Pipeline & Queue Sections

### Pipeline Section

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/scraper/status` | Live status (shared with AI Discovery) |
| GET | `/api/scraper/runs` | Per-source run history and aggregate stats (`bySource` map) |
| POST | `/api/scraper/run/:source` | Triggers `runSourceGroup()` for a single named source group (SSE) |
| POST | `/api/scraper/run` | Triggers full `runScraper()` across all groups (SSE) |
| POST | `/api/scraper/seed` | Triggers `runSeedImport()` to upsert the curated seed dataset |
| POST | `/api/scraper/world-bank` | Triggers `runWorldBankAdapter()` for direct World Bank project API import |

The Pipeline section gives **per-source control** (run one source group at a time), run history logs, and import tools (seed data, World Bank direct). AI Discovery only exposes a full all-sources trigger.

### Queue Section

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/scraper/queue` | Pending items (same endpoint as AI Discovery) |
| POST | `/api/scraper/review/:id` | Approve/reject (same endpoint as AI Discovery) |
| POST | `/api/scraper/review-all` | Bulk approve/reject (same endpoint as AI Discovery) |

**The Queue section in the Admin Dashboard and the AI Discovery page are functionally identical** for the review workflow. They call exactly the same API routes, operate on the same data, and offer the same approve/reject options. This is the primary overlap in the admin surface.

### Auth Model
Identical to AI Discovery — admin Bearer token.

---

## 4. Reviewer Portal (`/review`)

### What it does
A separate portal designed for **non-admin reviewers** (researchers, editors, partner organisations). Accessible without the admin password. Uses a magic-link email flow to issue time-limited JWT tokens. All routes protected by `reviewerAuthMiddleware`.

### API Routes Used

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/review/stats` | Count of `pending`, `needs_source`, and `approved` items |
| GET | `/api/review/queue` | Paginated list of projects filtered by `reviewStatus` (25/page) |
| GET | `/api/review/:id` | Full project detail + URL audit log |
| PATCH | `/api/review/:id/status` | Three-way status update: `approved`, `pending`, or `needs_source` |
| PATCH | `/api/review/:id/url` | Edit `sourceUrl` + write audit record to `url_audit` table |
| POST | `/api/review/test-url` | HEAD-check a URL for reachability; optionally writes `url_audit` record |
| GET | `/api/review/:id/url-history` | Full URL audit trail for a deal |

### Auth Model
Magic-link email: admin sends a link to the reviewer's email address. The link contains a time-limited JWT. `reviewerAuthMiddleware` validates the JWT on every request and attaches `req.reviewerEmail` for audit logging. Tokens are **not** persisted in the DB (in-memory verification only via JWT secret).

### DB Write Behaviour

| Operation | Table | Fields Written |
|-----------|-------|----------------|
| `PATCH /review/:id/status` | `energy_projects` | `reviewStatus` only |
| `PATCH /review/:id/url` | `energy_projects`, `url_audit` | `sourceUrl`; audit row with `oldUrl`, `newUrl`, `action='edited'`, `reviewerEmail` |
| `POST /review/test-url` (with dealId) | `url_audit` | Audit row with `action='tested'`, `testedStatus`, `responseTime`, `reviewerEmail` |

### Unique Capabilities (not available in AI Discovery or Admin Queue)
- **`needs_source` workflow**: Reviewers can see and act on projects that failed URL validation
- **URL editing with audit trail**: Full history of every URL change per deal
- **URL reachability testing**: In-UI HEAD-check with HTTP status + response time
- **Pagination**: All queue views are paginated (25/page) — safe at any scale
- **Reviewer attribution**: Every status change and URL edit records `reviewerEmail`

---

## 5. Scraper Service — Data Pipeline Summary

### Source Coverage
- **9 source groups**, staggered across the day with `node-cron` (starting 06:00 UTC, 2 groups/hour):
  - Pan-African Media, DFI & Energy Agencies, East Africa, Southern & North Africa, EV & Clean Mobility, Recent Deals, West & Central Africa, Hydrogen & New Tech
- **45+ RSS feeds** in total

### Extraction Logic
1. Fetch feeds → filter by `ENERGY_KEYWORDS` + `AFRICA_TERMS` → reject by `EXCLUDE_KEYWORDS`
2. Batch filtered articles (15/batch) → send to Claude Sonnet (`claude-sonnet-4-6`) with strict SYSTEM_PROMPT
3. Validate each extracted project: country whitelist, sector normalisation, non-energy exclusion, deal size cap ($5B)
4. **URL validation**: HEAD-check the sourceUrl; homepage-only URLs are immediately rejected without HTTP call
5. **Deduplication**: exact project name match first → fuzzy Jaccard similarity match (≥0.65 + same country, or ≥0.85 + same sector)

### `reviewStatus` Assignment on Insert

| Condition | `reviewStatus` assigned |
|-----------|------------------------|
| `confidence ≥ 0.85` AND valid sourceUrl | `'approved'` (auto-published) |
| `confidence ≥ 0.65 and < 0.85` AND valid sourceUrl | `'pending'` (human review required) |
| Any confidence + no valid sourceUrl | `'needs_source'` (needs URL before approval) |
| `confidence < 0.65` | Rejected entirely (not inserted) |

### Update Logic (existing projects)
When a duplicate is detected (exact or fuzzy), the scraper **updates** non-null fields: `developer`, `financiers`, `dfiInvolvement`, `offtaker`, `dealStage`, `financialCloseDate`, `newsUrl`, `dealSizeUsdMn`, `capacityMw`, `confidenceScore`, `extractionSource`. It does **not** change `reviewStatus` on updates — approved projects stay approved.

### Seed Data Import
`POST /api/scraper/seed` triggers `runSeedImport()`. Seed projects are inserted with `reviewStatus = 'approved'` and `confidenceScore = 0.95`. They use the same upsert logic (exact → fuzzy → insert).

### World Bank Adapter
`POST /api/scraper/world-bank` triggers `runWorldBankAdapter()`. Projects imported directly from the World Bank Projects API are treated as high-authority and insert as `reviewStatus = 'approved'`.

---

## 6. Overlap Analysis & Recommendations

### Overlap: AI Discovery vs. Admin Dashboard Queue
These two surfaces duplicate the same review functionality:

| Feature | AI Discovery | Admin Dashboard Queue | Verdict |
|---------|--------------|-----------------------|---------|
| View pending items | ✓ | ✓ | **Duplicated** |
| Approve/reject single | ✓ | ✓ | **Duplicated** |
| Bulk approve/reject | ✓ | ✓ | **Duplicated** |
| Source URL editing | ✗ | ✗ | Missing from both |
| `needs_source` visibility | ✗ | ✗ | Missing from both |
| Per-source run trigger | ✗ | ✓ | Admin Dashboard only |
| Run history logs | ✗ | ✓ | Admin Dashboard only |
| Seed / World Bank import | ✗ | ✓ | Admin Dashboard only |

**Recommendation**: The Admin Dashboard Queue section is redundant given AI Discovery exists as a dedicated page. If the admin dashboard Pipeline section is the primary operational surface, consider removing the Queue tab from the admin dashboard and directing to `/discovery` for review work. Alternatively, add `needs_source` visibility and URL editing to AI Discovery to make it the single complete review surface.

### Gap: `needs_source` Projects in Admin Surfaces
Projects with `reviewStatus = 'needs_source'` are invisible to both the AI Discovery page and the Admin Dashboard Queue. They can only be seen and acted on via the Reviewer Portal. If no external reviewer is active, these projects silently sit in limbo — never approved, never rejected.

**Recommendation**: Add a `needs_source` tab (or badge) to AI Discovery so the admin can act on these without needing a reviewer account.

### Gap: No `rejected` Recovery Path
Once a project is rejected (via AI Discovery or Admin Dashboard), there is no UI to un-reject it (set back to `pending` or `approved`). The Reviewer Portal's `PATCH /api/review/:id/status` supports `pending` as a target status, providing a recovery path — but only for reviewers, not for the admin in AI Discovery.

**Recommendation**: Add a "Restore" action on rejected cards in AI Discovery, calling `POST /api/scraper/review/:id` with `action: 'approve'` (or a new `pending` action).

### Security Note: Scraper Review Routes Lack Rate Limiting
`POST /api/scraper/review/:id` and `POST /api/scraper/review-all` are protected only by the admin Bearer token check. There is no per-action rate limit beyond the global IP-based limiter on `app.ts`. Since these write `reviewStatus` directly without validation of current state (e.g. approving an already-approved project is a no-op but not rejected), this is low risk.

### Security Note: Reviewer Portal JWT Secret
The `reviewerAuthMiddleware` validates JWTs using a secret from environment variables. If the secret rotates, all outstanding magic-link tokens are immediately invalidated — this is correct behaviour but reviewers mid-session would need a new link.

---

## 7. File Reference

| File | Role |
|------|------|
| `artifacts/api-server/src/services/scraper.ts` | Core scraper: RSS fetch, Claude extraction, deduplication, DB write, seed import, World Bank adapter |
| `artifacts/api-server/src/routes/scraper.ts` | `/api/scraper/*` endpoints: status, queue, run, per-source run, review, review-all, seed, world-bank |
| `artifacts/api-server/src/routes/review.ts` | `/api/review/*` endpoints: stats, paginated queue, status patch, URL patch, URL test, URL history |
| `artifacts/api-server/src/middleware/reviewAuth.ts` | Magic-link JWT middleware for reviewer portal |
| `artifacts/energy-tracker/src/pages/discovery.tsx` | AI Discovery admin page at `/discovery` |
| `artifacts/energy-tracker/src/pages/admin-dashboard.tsx` | Admin Dashboard at `/admin` (Pipeline + Queue + Newsletter sections) |
| `artifacts/api-server/src/index.ts` | Server startup + `node-cron` staggered daily scheduler for source groups |
