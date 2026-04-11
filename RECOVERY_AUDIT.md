# Recovery Audit — AfriEnergy Tracker
**Date:** 2026-04-11  
**Codebase location:** Replit monorepo (`artifacts/api-server`, `artifacts/energy-tracker`, `lib/db`)  
**Note:** This is a Replit project, not a Railway repo. Railway and GitHub references in the audit brief do not directly apply. Deliverable covers state of the live codebase only.

---

## 1. Executive Summary

1. **Items 1, 2, 4, 5, 6, and 7 are shipped and functional.** Four PRs landed successfully. The feature set is largely complete, including reviewer management with per-reviewer magic-link auth, a full admin queue UI with URL editing and audit trail, six adapter types, community submissions, and badge images.
2. **Item 3 (/discovery deletion) was never done.** The `/discovery` route, its page component, and the legacy `/api/scraper/*` flat-function routes all still exist and are functional. No redirect to `/admin` has been added.
3. **The reviewer DB tables (reviewers, reviewer_magic_tokens, reviewer_sessions, reviewer_audit_log) are absent from the startup migration runner.** They exist in the Drizzle schema and are live in the current DB, but a fresh deployment will boot-crash the moment any reviewer route is hit because `CREATE TABLE IF NOT EXISTS` for those four tables is missing from `migrate.ts`.
4. **Two parallel magic-link implementations exist** — one for reviewers (`reviewer-auth.ts`, cookie `rv_sess`) and one for contributors (`contributor-auth.ts`, cookie `cb_sess`). They are functionally independent and non-conflicting, but share ~120 lines of identical cryptographic boilerplate with no shared utility module.
5. **Two badge types (scoop, corroborator) are specced but not implemented.** The `awardBadges()` service does not contain awarding logic for either. They are referenced in scratchpad notes only.

---

## 2. Item-by-Item State

### Item 1 — Admin Queue Fixes

**Status filter (Pending / Needs Source / Rejected / All)**
- Type: `QueueFilter = "pending" | "needs_source" | "rejected" | "all"` — `admin-dashboard.tsx:56`
- Filter tabs with live counts rendered: `admin-dashboard.tsx:815–817`
- Stats fetched from: `GET /api/review/stats` — `admin-dashboard.tsx:656`
- Filter-aware fetch: `GET /api/review/queue?status=<f>&page=<p>` — `admin-dashboard.tsx:667`

**URL editing on Queue tab**
- Admin edits `newsUrl` inline; URL stored in `urlEdits` state: `admin-dashboard.tsx:713`
- Save dispatched via `PATCH /api/review/:id/url` — `admin-dashboard.tsx:735`
- Server route: `review.ts:190` (`PATCH /api/review/:id/url`)

**URL reachability testing**
- Test button calls `POST /api/review/test-url` — `admin-dashboard.tsx:717`
- Server route: `review.ts:227`
- Result displayed as green/red badge: `admin-dashboard.tsx:543–545`

**Move to Pending (rejection recovery)**
- Button rendered for `needs_source` and `rejected` rows: `admin-dashboard.tsx:574–582`
- Calls `PATCH /api/review/:id/status` with body `{ reviewStatus: "pending" }` — `admin-dashboard.tsx:753`
- `needs_source` rows gated: button disabled until URL test passes (`admin-dashboard.tsx:578`)

**Audit trail**
- Fetched lazily on row expand: `GET /api/review/:id/url-history` — `admin-dashboard.tsx:695`
- Rendered as chronological list (up to 10 entries): `admin-dashboard.tsx:594–598`
- Server route: `review.ts:285`

**Auth cross-cut note:** The admin dashboard calls `/api/review/*` routes, which are gated by `reviewerAuthMiddleware`. That middleware (`middleware/reviewAuth.ts:55–63`) has an explicit Path 2 that accepts admin Bearer tokens via `isValidAdminTokenAsync()`. Admin access to all queue features is correctly authorised.

**Verdict: SHIPPED** ✅

---

### Item 2 — Reviewer Management

**Route `/admin/reviewers`**
- Route registered: `App.tsx:244` — `<Route path="/admin/reviewers">` → `AdminReviewersPage`
- Page file: `artifacts/energy-tracker/src/pages/admin-reviewers.tsx` (466 lines)

**Database tables**
- `reviewers` table: `lib/db/src/schema/reviewers.ts:3`
- `reviewer_magic_tokens` table: `lib/db/src/schema/reviewers.ts:14`
- `reviewer_sessions` table: `lib/db/src/schema/reviewers.ts:24`
- `reviewer_audit_log` table: `lib/db/src/schema/reviewers.ts:34`
- ⚠️ **None of the four reviewer tables have `CREATE TABLE IF NOT EXISTS` entries in `migrate.ts`.** They are live in the current DB (created via Drizzle push during initial setup) but a fresh Railway deployment will fail at any reviewer route hit because the tables won't exist. See Conflict Matrix §5.

**Auth mechanism**
- Per-reviewer magic-link. No shared password. No `REVIEWER_PASSWORD` env var anywhere in the codebase (grep: zero matches).
- Login handler: `routes/reviewer-auth.ts` — `POST /api/reviewer-auth/request`
  - Looks up reviewer by email (must exist and `isActive = true`): `reviewer-auth.ts:78–88`
  - Generates `crypto.randomBytes(32).toString("base64url")` token: `reviewer-auth.ts:22–24`
  - Stores SHA-256 hash in `reviewer_magic_tokens`: `reviewer-auth.ts:97–106`
  - Sends link via Brevo `sendEmail()`: `reviewer-auth.ts:47–57`
  - Token expires in 15 minutes, single-use (consumed on validation): `reviewer-auth.ts:17`
- Session cookie: `rv_sess` (httpOnly, 7-day): `reviewer-auth.ts:15–16`
- Callback validates token hash, creates session row, sets cookie: `POST /api/reviewer-auth/verify`

**Suspend / reinstate / delete flow**
- Suspend: `PATCH /api/admin/reviewers/:id/suspend` — `admin-reviewers.ts:152`
  - Sets `isActive = false`, `suspendedAt`, `suspendedBy = "admin"`: `admin-reviewers.ts:160`
  - Bulk revokes all open sessions (`revokedAt = now`): `admin-reviewers.ts:166`
  - Writes audit log entry: `admin-reviewers.ts:168`
- Reinstate: `PATCH /api/admin/reviewers/:id/reinstate` — `admin-reviewers.ts:~184`
  - Sets `isActive = true`, clears suspension fields: `admin-reviewers.ts:184`
- Delete: `PATCH /api/admin/reviewers/:id/delete` — `admin-reviewers.ts:220`
  - Sets `revokedAt` on all sessions: `admin-reviewers.ts:220`

**Sessions invalidated on suspend:** YES — `admin-reviewers.ts:166` bulk-updates `reviewer_sessions` setting `revokedAt = now` for all unexpired sessions belonging to that reviewer.

**In-flight projects returned to unassigned bucket on suspend:** NOT DONE. The current schema has no reviewer assignment column on `energy_projects` or `contributor_submissions`. Projects are not assigned to individual reviewers — they're pooled. Suspension does not need to re-queue anything because nothing is exclusively locked to a reviewer. This is not a regression; it's consistent with the pooled-queue model.

**`REVIEWER_PASSWORD` env var:** Zero references in any file.

**Verdict: SHIPPED** ✅ (with the reviewer DB table migration gap flagged separately)

---

### Item 3 — `/discovery` Deletion

**Route still exists:** YES
- Lazy import: `App.tsx:27` — `const DiscoveryPage = lazy(() => import("@/pages/discovery"))`
- Route registered: `App.tsx:213` — `<Route path="/discovery">`
- Page file: `artifacts/energy-tracker/src/pages/discovery.tsx` (still full implementation)

**`/api/scraper/*` routes:** Still active. `routes/scraper.ts` has 14 endpoints (`/scraper/feeds`, `/scraper/sources`, `/scraper/status`, `/scraper/runs`, `/scraper/queue`, `/scraper/reviewed`, `/scraper/run`, `/scraper/run/:source`, `/scraper/review/:id`, `/scraper/review-all`, `/scraper/seed`, `/scraper/world-bank`, `/scraper/health-check`). All gated by `adminAuthMiddleware`.

**Redirect from `/discovery` to `/admin`:** NOT present. Visiting `/discovery` renders the discovery page normally.

**`/admin` sidebar:** The "AI Discovery" nav item was previously in `adminNavItems` and has been removed in the most recent change (today). But the page and route persist.

**Verdict: NOT DELETED** ❌ — page, route, lazy import, and legacy scraper routes all still present.

---

### Item 4 — PR1a (Adapter Foundation + First Batch)

**`BaseSourceAdapter`**
- File: `artifacts/api-server/src/scraper/base.ts`
- Abstract base class with `run()`, `fetch()` (with conditional-request caching), rate limiter, `RunReport` type.

**Adapter registry**
- File: `artifacts/api-server/src/scraper/adapters/index.ts`
- `ADAPTER_REGISTRY: BaseSourceAdapter[]` — iterated by `adapter-runner.ts`
- `getAdapter(key)`, `getAdapterKeys()`, `getAdapterMeta()` exported

**World Bank adapter**
- Lives in the legacy flat-function scraper (`routes/scraper.ts:242` — `POST /api/scraper/world-bank`).
- **Additive approach confirmed:** the old scraper code is untouched. The new adapter system runs alongside it. World Bank is not in `ADAPTER_REGISTRY` — it was not migrated.

**Registered adapters (ADAPTER_REGISTRY):**

| Key | File | Schedule | Type |
|---|---|---|---|
| `dfi:afdb` | `adapters/dfi-afdb.ts` | `0 6 * * *` | JSON (AfDB API) |
| `dfi:ifc` | `adapters/dfi-ifc.ts` | `0 7 * * *` | JSON (IFC API) |
| `dfi:dfc` | `adapters/dfi-dfc.ts` | `0 8 * * *` | RSS (Google News RSS) |
| `dfi:proparco` | `adapters/dfi-proparco.ts` | `0 9 * * *` | RSS (SimpleRSSAdapter) |
| `dfi:fmo` | `adapters/dfi-fmo.ts` | `0 10 * * *` | RSS (SimpleRSSAdapter) |
| `dfi:bii` | `adapters/dfi-bii.ts` | `0 11 * * *` | RSS (SimpleRSSAdapter) |
| `rss:apo` | `adapters/apo-group.ts` | varies | RSS (APO Group press releases) |
| `rss:google_alerts:*` | `adapters/google-alerts.ts` | `0 */6 * * *` | RSS (seeded from `scraper_sources`) |

**`scraper_sources` table:** `lib/db/src/schema/scraper-sources.ts` + `CREATE TABLE IF NOT EXISTS` in `migrate.ts:85–98`

**`scraper_runs.adapter_key` column:** `migrate.ts` — `ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS adapter_key TEXT`

**Admin Pipeline source feeds card:** Present. `GET/POST/DELETE/PATCH /api/scraper/source-feeds` in `routes/adapters.ts:54–148`. UI card in `admin-dashboard.tsx` (pipeline section).

**Conditional-request caching (If-Modified-Since / ETag):**
- Cache data structure: `base.ts:50–55` — `CacheEntry { etag?, lastModified?, fetchedAt }`
- Request headers set: `base.ts:137–138`
- Response headers captured and stored: `base.ts:162–165`
- 304 Not Modified handled: `base.ts` (returns cached flag in `RunReport`)

**Per-adapter rate limiting:** In-process rate limiter map in `base.ts:69–76`. Each adapter tracks its own request timestamps.

**DFC adapter:** RSS-based — wraps `SimpleRSSAdapter` targeting a Google News RSS URL (`adapters/dfi-dfc.ts:12`). Not HTML/Cheerio. No zero-row consecutive-failure health check implemented (the health-check route at `scraper.ts:275` is for the legacy pipeline, not the adapter system).

**Verdict: SHIPPED** ✅

---

### Item 5 — PR1b (Adapter Batch 2)

| Adapter | File | Type | Schedule | Base class changes? |
|---|---|---|---|---|
| `dfi:proparco` | `adapters/dfi-proparco.ts` | RSS (SimpleRSSAdapter) | `0 9 * * *` | None |
| `dfi:fmo` | `adapters/dfi-fmo.ts` | RSS (SimpleRSSAdapter) | `0 10 * * *` | None |
| `dfi:bii` | `adapters/dfi-bii.ts` | RSS (SimpleRSSAdapter) | `0 11 * * *` | None |

All three extend `SimpleRSSAdapter` (which extends `BaseSourceAdapter`). No base class or shared helper changes were required. Each is a constructor-only subclass — a single `super({...})` call with key, label, feedUrl, schedule, defaultConfidence, and `llmScored: true`.

**Verdict: SHIPPED** ✅

---

### Item 6 — PR2 (Community Submissions, Profiles, Basic Badge Tiers)

**Routes**
- `/contribute`: `App.tsx:236` — `<Route path="/contribute" component={ContributePage} />`
- `/contributors/:slug`: `App.tsx:242` — `<Route path="/contributors/:slug" component={ContributorProfilePage} />`
- `/contributors/me`: `App.tsx:240` — `<Route path="/contributors/me" component={ContributorMePage} />`
- `/admin/contributors`: `App.tsx:244` — `<Route path="/admin/contributors">`

**Database tables / columns**
- `contributors` table: `lib/db/src/schema/contributors.ts:4` + `migrate.ts:102`
- `contributor_submissions` table: `lib/db/src/schema/contributors.ts:43` + `migrate.ts:143`
- `contributor_badges` table: `lib/db/src/schema/contributors.ts:67` + `migrate.ts:165`
- `energy_projects.submitted_by_contributor_id`: `migrate.ts:99`
- `energy_projects.community_submission_id`: `migrate.ts:100`

**Auth question — full answer**

Contributor sign-in is **magic-link, self-registration**. Any email address may request a link (no pre-registration required). On first use, a `contributors` record is created.

Login handler: `POST /api/contributor-auth/request` — `routes/contributor-auth.ts:88`

Full flow:
1. Frontend POSTs `{ email, displayName, country }` — `contributor-auth.ts:88`
2. Rate-limit check (5 requests/hour/email, 20/hour/IP): `contributor-auth.ts:59–67`
3. Token generated: `crypto.randomBytes(32).toString("base64url")` — `contributor-auth.ts:28–30`
4. SHA-256 hash stored in `contributor_magic_tokens` with 15-min expiry — `contributor-auth.ts:118–126`
5. Magic link emailed via `sendEmail()` (Brevo, sender: `noreply@afrienergytracker.io`): `contributor-auth.ts:76–85`
6. Callback (`GET /api/contributor-auth/verify?token=...`) validates hash, creates/updates contributor record and session, sets `cb_sess` httpOnly cookie (30-day): `contributor-auth.ts:~140–200`

**Is this the reviewer magic-link implementation reused?** NO. It is a **new, independent implementation**:
- `contributor-auth.ts` references `contributorMagicTokensTable`, `contributorSessionsTable` — distinct from `reviewerMagicTokensTable`, `reviewerSessionsTable`
- Cookie name: `cb_sess` vs `rv_sess`
- Session duration: 30 days vs 7 days
- Registration: open (auto-creates contributor) vs closed (reviewer must be pre-registered by admin)
- In-memory rate limit stores: separate `Map` instances in each file

**Distinct magic-link implementations in codebase:** 2 — `routes/reviewer-auth.ts` and `routes/contributor-auth.ts`. ~120 lines of cryptographic boilerplate are copy-pasted: `generateToken()`, `hashToken()`, `isRateLimited()`, `recordRequest()`. No shared auth utility module exists.

**Anti-abuse measures**
- Honeypot field (`website`): present and checked — `contributions.ts:148, 161`
- Per-user + per-IP rate limits: in-memory sliding window — `contributions.ts:42`
- Domain allowlist (trusted-domains.ts): both URLs parsed via `registeredDomain()`; off-list submissions flagged `needsExtraScrutiny = true`, not blocked — `contributions.ts:185–194`
- Dual-source validation (two different domains required): `contributions.ts:193`

**Badge awarding**
- Called on submission approval: `contributions.ts:577` — `await awardBadges(sub.contributorId)`
- Service: `services/badges.ts` — idempotent, uses `hasBadge()` guard before any insert

**Badges implemented:**

| Badge slug | Rule | Location |
|---|---|---|
| `bronze` | 1 approved submission | `badges.ts:11` |
| `silver` | 10 approved submissions | `badges.ts:12` |
| `gold` | 50 approved submissions | `badges.ts:13` |
| `platinum` | 200 approved submissions | `badges.ts:14` |
| `first_light` | First community approval ever (global) | `badges.ts:91` |
| `country_specialist_<cc>` | 10 approved in same country | `badges.ts:113` |
| `multi_sector` | 3+ distinct sub-sectors | `badges.ts:129` |
| `cross_border` | 5+ distinct countries | `badges.ts:144` |

**Badges NOT implemented:** `scoop` (first to report a deal) and `corroborator` (10 submissions with both source URLs verified) — zero references in `badges.ts`. Specced in project notes only.

**Verdict: SHIPPED** ✅  
**Auth architecture verdict: DUPLICATED** — two independent magic-link implementations, no shared utility. Functional but carries technical debt.

---

### Item 7 — PR3 (Shareable Badges, Leaderboard, LinkedIn)

**Badge image endpoints**
- `GET /api/badges/:contributorId/:badgeSlug.png` — `routes/badge-images.ts` (PNG via Satori → @resvg/resvg-js)
- `GET /api/badges/:contributorId/:badgeSlug/download` — same file (PNG/SVG download with Content-Disposition)
- Rendering library: **Satori** + **@resvg/resvg-js** for PNG rasterisation
- Disk cache at `/tmp/badge-cache/`

**Leaderboard**
- Page: `artifacts/energy-tracker/src/pages/contributors.tsx`
- Route: `App.tsx:240` — `<Route path="/contributors" component={ContributorsLeaderboard} />`
- Filters: period (all/month/year), country, sub-sector — `contributors.tsx:74–95`
- API: `GET /api/contributors?period=&country=&subSector=&page=` — `routes/contributions.ts:594`

**Open Graph / Twitter Card meta**
- Per-badge OG HTML page served by Express for social bot crawlers: `GET /api/contributors/:slug/badges/:badgeSlug/preview` — `routes/badge-images.ts` (returns full HTML with `<meta property="og:image">`, `<meta name="twitter:card">`)
- SPA pages (`contributor-badge.tsx`, `contributor-profile.tsx`) do **not** inject OG meta into `<head>` — they rely entirely on the `/preview` server-side HTML for crawler consumption. React SPA `<head>` is static. For single-page apps this is the only practical approach without SSR.

**LinkedIn "Add to Profile"**
- URL constructed for tier badges (bronze/silver/gold/platinum): `contributor-badge.tsx` — `linkedinCertUrl` variable
- Pattern: `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=...&organizationName=AfriEnergy+Tracker&issueYear=...&issueMonth=...&certUrl=...&certId=...`
- Rendered as "Add to Profile" button for tier badges only

**Share panel on profile pages**
- `contributor-badge.tsx`: full share panel with LinkedIn Share, Twitter/X Share, Copy Link, Download dropdown (1200×630 PNG, 1080×1080 PNG, SVG)
- `contributor-profile.tsx`: badges section shows each earned badge with a "Share" link navigating to `/contributors/:slug/badges/:badgeSlug`
- `contributor-me.tsx`: same pattern as profile page

**Verdict: SHIPPED** ✅

---

## 3. Deploy State

This project runs on **Replit**, not Railway. Two workflows are running:

- `artifacts/api-server: API Server` — **RUNNING**. Last boot output: all startup migrations completed successfully, all adapters and newsletter schedulers initialised.
- `artifacts/energy-tracker: web` — **RUNNING**. Vite HMR active.

**Railway** is referenced in the audit brief as the production target. The codebase is not currently deployed there from this environment. No Railway deploy logs are available from this Replit context.

**Critical deploy risk for any fresh deployment (Railway or otherwise):** The four reviewer tables (`reviewers`, `reviewer_magic_tokens`, `reviewer_sessions`, `reviewer_audit_log`) have no `CREATE TABLE IF NOT EXISTS` entries in `migrate.ts`. On a fresh DB the server will boot, pass all migrations, then crash with a "relation does not exist" error the first time any reviewer route is called. The tables are defined in Drizzle schema (`lib/db/src/schema/reviewers.ts`) but were never added to the startup migration runner.

---

## 4. Conflict Matrix

**1. Two auth systems in the codebase?**

YES — two magic-link systems exist in parallel:

| Property | Reviewer auth | Contributor auth |
|---|---|---|
| File | `routes/reviewer-auth.ts` | `routes/contributor-auth.ts` |
| Cookie | `rv_sess` (httpOnly, 7-day) | `cb_sess` (httpOnly, 30-day) |
| Token table | `reviewer_magic_tokens` | `contributor_magic_tokens` |
| Session table | `reviewer_sessions` | `contributor_sessions` |
| Registration | Closed (admin pre-registers) | Open (any email) |
| Rate limit store | In-memory Map in reviewer-auth.ts | In-memory Map in contributor-auth.ts |

They are **non-conflicting** — separate cookies, separate tables, separate in-memory state. However, ~120 lines of cryptographic boilerplate (`generateToken`, `hashToken`, `isRateLimited`, `recordRequest`) are duplicated verbatim. If a security fix is needed in the token generation logic it must be applied in two places.

**2. Admin Queue missing `needs_source` filter while community submissions flow into it?**

NO REGRESSION. Community submissions live in `contributor_submissions` (a separate table with its own `status` column), not in `energy_projects.review_status`. The Admin Queue tab at `/admin?section=queue` reads from `energy_projects` via `/api/review/queue`. The Admin Contributors page at `/admin/contributors` reads from `contributor_submissions` via `/api/contributions/admin`. The two queues are entirely separate surfaces. Community submissions that fail source URL validation are flagged `needsExtraScrutiny = true` but still land in contributor_submissions as `pending` — visible to admin via the Contributors tab, not the Review Queue tab.

**3. `/discovery` still present while community submissions feed into `/admin`?**

YES, `/discovery` is still live. It renders the AI-discovered pipeline (scraper runs, source groups, candidate queue). Community submissions do not appear there. The page is not stale in a breaking sense — it accurately shows what it always showed — but it is now a partial view: it shows the legacy flat-function scraper runs and does not surface the new adapter system's runs (those appear in the Pipeline section of the Admin Dashboard). The Admin Dashboard is the canonical operations surface; `/discovery` is now redundant and should be deleted.

**4. PR1a adapter registry changes affecting community submission write path?**

NO. The adapter system is fully additive — zero modifications were made to any existing scraper file. The community submission write path (`contributions.ts` → `energy_projects` via `INSERT`) is entirely separate from both the legacy scraper and the new adapter runner. No cross-contamination.

**5. Database migrations applied out of dependency order?**

The `migrate.ts` startup runner applies in this order:
1. `energy_projects` column additions (deal_stage, developer, financiers, … confidence_score, review_status, source_url, news_url, news_url_2)
2. `newsletters` column additions
3. `user_emails` column additions
4. `scraper_runs.adapter_key` column
5. `CREATE TABLE scraper_sources`
6. `energy_projects.submitted_by_contributor_id` (FK to contributors — but contributors table doesn't exist yet at this step!)
7. `energy_projects.community_submission_id`
8. `CREATE TABLE contributors`
9. `CREATE TABLE contributor_magic_tokens`
10. `CREATE TABLE contributor_sessions`
11. `CREATE TABLE contributor_submissions`
12. `CREATE TABLE contributor_badges`
13. Seed `scraper_sources` rows

**⚠️ Dependency order issue at step 6:** `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS submitted_by_contributor_id INTEGER` runs before `CREATE TABLE IF NOT EXISTS contributors`. Because the column is `INTEGER` (not a foreign key constraint in the SQL), this succeeds silently — PostgreSQL will add a plain integer column without enforcing referential integrity. The Drizzle schema defines it as a FK, but the raw SQL migration does not declare `REFERENCES contributors(id)`. This is technically safe for the migration itself but means the FK constraint is not enforced at the DB level.

**Absent from migrate.ts:** `reviewers`, `reviewer_magic_tokens`, `reviewer_sessions`, `reviewer_audit_log` — none have `CREATE TABLE IF NOT EXISTS` entries. This is the most critical migration gap.

---

## 5. Open PRs vs. Merged PRs

This is a Replit monorepo — no GitHub PR history is directly accessible from this environment. Based on codebase evidence:

| Item | Status in codebase | Git / PR state |
|---|---|---|
| Item 1 — Admin Queue Fixes | Code present, functional | On master (shipped) |
| Item 2 — Reviewer Management | Code present, functional, migration gap | On master (shipped, with gap) |
| Item 3 — /discovery deletion | NOT done | Never shipped |
| Item 4 — PR1a adapters | Code present, functional | On master (shipped) |
| Item 5 — PR1b adapters | Code present, functional | On master (shipped) |
| Item 6 — PR2 community submissions | Code present, functional | On master (shipped) |
| Item 7 — PR3 badge images + leaderboard | Code present, functional | On master (shipped) |

---

## 6. Recommended Recovery Plan

Priority order — fix these before any new feature work:

### P0 — Fix reviewer table migration gap (blocking for any fresh deployment)

Add `CREATE TABLE IF NOT EXISTS` entries for `reviewers`, `reviewer_magic_tokens`, `reviewer_sessions`, and `reviewer_audit_log` to `migrate.ts`, placed **before** any contributor table entries (reviewers have no dependency on contributors). Until this is done, deploying to a new environment will silently boot then crash on first reviewer route call.

### P1 — Fix FK declaration order in migration (data integrity)

In `migrate.ts`, move the `energy_projects.submitted_by_contributor_id` and `energy_projects.community_submission_id` `ALTER TABLE` statements to **after** `CREATE TABLE contributors`. Then add `REFERENCES contributors(id)` to the SQL if you want the FK enforced at the DB level (currently it's a bare integer column despite the Drizzle schema declaring it as a FK). This is low risk to data but worth fixing before production load.

### P2 — Delete `/discovery` and its API routes

Remove `artifacts/energy-tracker/src/pages/discovery.tsx`, its lazy import and route from `App.tsx`, and retire the legacy `/api/scraper/*` flat-function routes in `routes/scraper.ts`. The Admin Dashboard Pipeline section (`/admin?section=pipeline`) is the replacement surface. Add a redirect from `/discovery` to `/admin?section=pipeline` as a one-liner before removing the page, so any bookmarks don't 404.

### P3 — Implement `scoop` and `corroborator` badges

Both badge slugs are referenced in project documentation and on the share/detail pages (hardcoded in the badge info maps in `contributor-badge.tsx` and `contributor-profile.tsx`) but `awardBadges()` in `services/badges.ts` has no logic for either. They will never be awarded until this is added.

- `corroborator`: award when a contributor has 10 approved submissions where both `newsUrl` and `newsUrl2` resolved as `trustedDomain = true`. The `needsExtraScrutiny` flag (inverse of trusted) is already stored on `contributor_submissions`.
- `scoop`: requires knowing whether the deal was already in `energy_projects` before the submission was made. Check `energy_projects.discoveredAt` vs `contributor_submissions.createdAt` — if the submission predates discovery, award `scoop` on approval.

### P4 — Extract shared magic-link utility

`reviewer-auth.ts` and `contributor-auth.ts` share ~120 lines of identical crypto boilerplate. Extract `generateToken()`, `hashToken()`, `isRateLimited()`, and `recordRequest()` into a shared module (e.g. `services/magic-link-utils.ts`). This is not urgent but should be done before any further auth surface is added to avoid a third copy.

### Do not revert PR2

PR2 built its own magic-link implementation rather than reusing the reviewer one, but the two systems are cleanly separated. Reverting would destroy working community submission, contributor profile, and badge infrastructure. The duplication is manageable with the extraction in P4.

### Do not merge /discovery deletion into other work

Delete it as an isolated one-commit change. It has no dependencies and no risk of merge conflict.
