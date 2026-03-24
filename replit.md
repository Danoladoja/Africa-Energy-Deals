# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── energy-tracker/     # Africa Energy Investment Tracker (React + Vite)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
│   └── src/seed-energy.ts  # Seeds 50 real African energy investment projects
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Africa Energy Investment Tracker

Main app at `/` — tracks publicly disclosed energy investment transactions across Africa.

### Features
1. **Dashboard** — Summary KPIs (total investment, projects, countries, technologies), investment trajectory chart, technology breakdown donut, regional breakdown bar chart. Export as PDF (data-driven)/PNG/PPTX via ExportDropdown.
2. **Deal Tracker** — Searchable/filterable table of all energy deals with project name, country, technology, deal size, investors, status. Pagination + detail modal.
3. **Interactive Map** — Full-screen Leaflet map with choropleth + marker hybrid. GeoJSON Africa choropleth colors countries by total investment (dark→bright green log scale, source: codeforgermany CDN). Hover country for tooltip (name, investment, project count). Click country → `/countries/:name`. Layer toggle (Both/Choropleth/Markers) at top. Legend (investment gradient + sector dots) bottom-left. Zoom-to-fit button. Enhanced marker popups: project name, country, Deal Stage badge, Deal Size, Capacity, Year, investors, "View Details →" button navigates to `/deals/:id`.
4. **Visualization Studio** — Select chart type (bar/line/pie), metric (investment $ or project count), grouping (country/technology/region/year). Export as PNG/PDF/PPTX via ExportDropdown.
5. **Countries** (`/countries`, `/countries/:name`) — Country index with sector-mix bars + sortable cards. Profile pages with bar/donut charts, developer table, paginated projects.
6. **Investors** (`/developers`, `/developers/:entityName`) — Auto-generated profiles for all entities appearing in 2+ deals, parsed from the `investors` field (comma-separated). Index table sortable by investment/deals/countries. Profile page: portfolio map, by-country bar chart, by-technology donut, sortable deals table.
7. **AI Discovery** — AI agent that scrapes 6 RSS feeds (ESI Africa, PV Magazine Africa, Recharge News, The Africa Report, African Business, Reuters) daily at 06:00 UTC. Uses OpenAI gpt-5.2 to extract structured deal data. New deals land in a review queue (pending/approved/rejected). Human approves before publishing to the site.

### Database
- Table: `energy_projects` in PostgreSQL
- 50 seed projects covering real African energy deals (solar, wind, hydro, geothermal, oil & gas, natural gas)
- New columns: `is_auto_discovered` (bool), `review_status` (text: pending/approved/rejected), `discovered_at` (timestamp), `news_url` (text)
- Seed: `pnpm --filter @workspace/scripts run seed-energy`
- DB push: `pnpm --filter @workspace/db run push-force`

### Features
8. **Alert & Watch System** — Magic-link email auth (no password). Users enter email → receive sign-in link → click to verify. Authenticated users can "watch" countries, sectors, investors, or deal stages. When a new approved deal matches a watch, an email notification is sent. My Watches page at `/watches` shows all watches grouped by type with delete functionality. Bell icon in sidebar shows unread count.

### Auth & Watch DB Tables
- `user_emails` — tracks registered emails
- `magic_link_tokens` — one-time sign-in tokens (1h expiry)
- `sessions` — session tokens (30d expiry), stored in localStorage
- `watches` — user watches (`watchType`: country | technology | developer | dealStage, `watchValue`: string)

### Auth Flow
- Session token stored in `localStorage` as `afrienergy_session_token`
- All authed API calls: `Authorization: Bearer <token>`
- Dev mode: POST `/api/auth/email` returns `devLink` for instant sign-in without email

### API Endpoints (existing)
- `GET /api/projects` — list/search/filter projects
- `GET /api/projects/:id` — single project
- `POST /api/projects` — create project
- `GET /api/stats/summary` — KPI summary
- `GET /api/stats/by-country` — per-country stats
- `GET /api/stats/by-technology` — per-technology stats
- `GET /api/stats/by-region` — per-region stats
- `GET /api/stats/by-year` — per-year stats
- `GET /api/scraper/status` — scraper run status + pending count
- `GET /api/scraper/queue` — pending discovered projects
- `GET /api/scraper/reviewed` — all AI-discovered projects
- `POST /api/scraper/run` — trigger a manual scrape (SSE streaming progress)
- `POST /api/scraper/review/:id` — approve or reject a project (`{action: "approve"|"reject"}`)
- `POST /api/scraper/review-all` — bulk approve or reject all pending

### Institutional API Endpoints
- `GET /api/deals` — alias for `/api/projects`, returns `{ data: [...], meta: { total, page, limit, pages } }`
- `GET /api/countries` — all countries with aggregated stats (investment, count, capacity, sectors)
- `GET /api/investors` — developer/financier entities with portfolio stats
- `POST /api/keys/request` — request an API key `{organization, email, tier: "free"|"institutional"}`
- `GET /api/keys/validate` — validate an API key, check usage (X-API-Key header required)

### API Key System
- DB table: `api_keys` (key, organization, email, tier, rateLimit, createdAt, lastUsedAt)
- Free tier: 100 req/day, no key needed
- Institutional tier: 10,000 req/day, `X-API-Key: aet_...` header
- Keys are generated with `crypto.randomBytes(24)`, prefixed `aet_`
- Daily usage tracked in-memory (resets on restart); rate limit enforced via `apiKeyMiddleware`

### Swagger / OpenAPI
- Spec file: `artifacts/api-server/src/openapi.yaml`
- Interactive docs: `GET /api/docs` (swagger-ui-express)
- Raw spec: `GET /api/openapi.json` or `GET /api/openapi.yaml`

### Data Pipeline & Scraper Architecture

**Source Groups** — 11 named groups, each independently runnable with staggered daily scheduling:
- Energy Media (06:00 UTC), Development Banks (06:30), Energy Agencies (07:00), Financial Institutions (07:30)
- Pan-African News (08:00), Government & Regulators (08:30), Nigeria (09:00), East Africa (09:30)
- Southern & North Africa (10:00), EV & Clean Mobility (10:30), Recent Deals (11:00)

**Confidence Scores** — Claude returns a `confidence` field (0–1) per extraction. Low-confidence items (< 0.7) are flagged in the DB.

**Fuzzy Deduplication** — Jaccard token similarity on project name tokens + country + technology. Matches trigger DB updates (merge), not duplicates.

**New Fields** — `confidenceScore`, `extractionSource` added to `energy_projects` table.

**`scraper_runs` Table** — logs each source group run: sourceName, startedAt, completedAt, recordsFound, recordsInserted, recordsUpdated, flaggedForReview, errors, triggeredBy.

**Admin Scraper Page** — `/admin/scraper` (admin-only): per-source stats table, manual "Run" button per group, live log stream via SSE, review queue with confidence badges and source filters.

**New API Routes (admin-only)**:
- `GET /api/scraper/sources` — list source groups with feed counts and isRunning status
- `GET /api/scraper/runs?limit=N` — run history with per-source aggregates
- `POST /api/scraper/run/:source` — trigger a single source group (SSE stream)
- `POST /api/scraper/seed` — import all 66 curated seed projects (SSE stream); auto-approved at confidence 95%
- `POST /api/scraper/world-bank` — fetch live Africa energy projects from World Bank Projects API (SSE stream); results go to review queue

**Seed Data Pipeline** (`artifacts/api-server/src/services/seeds/seed-data.ts`):
- 66 verified curated projects for: Angola (10), Algeria (8), Namibia (6), Tunisia (5), Libya (4), Gabon (4), Equatorial Guinea (3), Ghana (4), Mauritania (2), Botswana (3), Burkina Faso (4+), Niger, Sudan, Djibouti, Congo Republic, Togo, Benin, Zimbabwe, Sierra Leone, Somalia, Malawi, Cape Verde, Madagascar, Mauritius
- `runSeedImport()` function: exact-name dedup → fuzzy dedup → INSERT/UPDATE; logs all decisions; inserts with `review_status = 'approved'`, `confidence_score = 0.95`, `extraction_source = 'seed'`
- Idempotent: re-running updates existing records with richer seed data

**World Bank API Adapter** (`runWorldBankAdapter()` in scraper.ts):
- Calls `search.worldbank.org/api/v3/projects` with `regionname=Africa&sectorname=Energy`
- Deduplicates via exact-name + fuzzy match before inserting
- New projects land in `review_status = 'pending'` queue with `extraction_source = 'world-bank-api'`

**Database Scale** (as of seed import):
- 170 approved projects (was 105)
- 43 countries (was 26) — 17 new countries added
- $224.9B tracked (was $103.8B)

### Embeddable Widgets
- `GET /energy-tracker/embed/deals?technology=&country=&limit=&theme=` — compact deal card widget
- `GET /energy-tracker/embed/chart?type=&groupBy=&metric=&title=` — standalone recharts embed
- Both are public routes (no auth); suitable for iframe embedding
- Viz Studio "Embed" button opens a modal with live iframe preview + copy-able code snippets

### API Endpoints (auth + watches)
- `POST /api/auth/email` — send magic link (returns `devLink` in dev mode)
- `GET /api/auth/verify?token=` — verify magic link token → `{sessionToken, email}`
- `GET /api/auth/me` — check current session
- `POST /api/auth/logout` — invalidate session
- `GET /api/watches` — list user's watches (auth required)
- `POST /api/watches` — create watch `{watchType, watchValue}` (auth required)
- `DELETE /api/watches/:id` — delete watch (auth required)
- `GET /api/watches/bell-count` — count unseen new-deal matches (auth required)
- `POST /api/watches/mark-seen` — reset bell count (auth required)

### SEO & Performance

**Dynamic Meta Tags** — `react-helmet-async` (HelmetProvider in `main.tsx`). `SEOMeta` component (`src/components/seo-meta.tsx`) manages `<title>`, `<meta description>`, Open Graph, and Twitter Card tags on every page. JSON-LD structured data (Organization, WebSite, Dataset, Article schemas) injected via Helmet.

**Bot Prerender Middleware** — Vite plugin (`src/plugins/bot-prerender.ts`) detects crawler User-Agents (Googlebot, Twitterbot, LinkedInBot, Facebook, etc.) and returns a pre-rendered HTML shell with correct OG tags fetched from the API. Applied in dev mode via `configureServer` hook.

**Dynamic Sitemap** — `GET /api/sitemap.xml` on the Express server queries all projects, countries, and developer entities from the DB and returns a standards-compliant XML sitemap (~296 URLs). Vite proxies `/sitemap.xml` → `/api/sitemap.xml`. Robots.txt is a static file at `artifacts/energy-tracker/public/robots.txt`.

**Code Splitting** — All pages except `Landing`, `AuthVerify`, and `NotFound` are wrapped in `React.lazy()` + `Suspense` (with a green spinner fallback) for route-level lazy loading. Heavy pages (Dashboard, DealTracker, VizStudio, MapPage) are split into separate JS chunks.

**Skeleton Loaders** — `src/components/skeleton-card.tsx` exports `SkeletonCard`, `SkeletonStat`, `SkeletonTable`, `SkeletonChart`, `SkeletonText` components for use during data-fetching states.

### Export System
- `src/utils/export-utils.ts` — shared helpers: `captureToCanvas` (html2canvas), `exportToPng`, `exportImageToPdf` (jsPDF landscape A4), `exportImageToPptx` (pptxgenjs 16:9)
- `src/utils/generate-dashboard-pdf.ts` — data-driven A4 PDF with KPIs, sector bars, transition split, country table
- `src/utils/generate-dashboard-pptx.ts` — 4-slide data-driven PPTX (KPIs, transition overview, sector breakdown, top countries)
- `src/components/export-dropdown.tsx` — reusable ExportDropdown component with PDF/PNG/PPTX options, loading state, toast feedback
- Dashboard: PDF (data-driven) + PNG (html2canvas) + PPTX (data-driven 4 slides)
- Visualization Studio: PNG + PDF (image embed) + PPTX (single slide)
- Country Compare: PNG + PDF + PPTX (all image capture)

### Frontend Libraries
- recharts (charts), react-leaflet + leaflet (map), html2canvas (PNG export), jspdf + jspdf-autotable (PDF), pptxgenjs (PowerPoint), html-to-image (share image), lucide-react (icons), framer-motion (animations), date-fns (date formatting), react-helmet-async (SEO meta tags)

### AI Discovery Stack
- `lib/integrations-openai-ai-server/` — OpenAI SDK wrapper (via Replit AI Integrations, no API key needed)
- `node-cron` — daily scheduler at 06:00 UTC in `artifacts/api-server/src/index.ts`
- `rss-parser` — RSS feed parsing in `artifacts/api-server/src/services/scraper.ts`
- SSE streaming for live progress during manual runs

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — only `.d.ts` files during typecheck
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in `references`

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build`
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly`
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client + Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema to database
