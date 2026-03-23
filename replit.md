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
1. **Dashboard** — Summary KPIs (total investment, projects, countries, technologies), investment trajectory chart, technology breakdown donut, regional breakdown bar chart
2. **Deal Tracker** — Searchable/filterable table of all energy deals with project name, country, technology, deal size, investors, status. Pagination + detail modal.
3. **Interactive Map** — Full-screen Leaflet map with choropleth + marker hybrid. GeoJSON Africa choropleth colors countries by total investment (dark→bright green log scale, source: codeforgermany CDN). Hover country for tooltip (name, investment, project count). Click country → `/countries/:name`. Layer toggle (Both/Choropleth/Markers) at top. Legend (investment gradient + sector dots) bottom-left. Zoom-to-fit button. Enhanced marker popups: project name, country, Deal Stage badge, Deal Size, Capacity, Year, investors, "View Details →" button navigates to `/deals/:id`.
4. **Visualization Studio** — Select chart type (bar/line/pie), metric (investment $ or project count), grouping (country/technology/region/year). Download as PNG via html2canvas.
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

### Frontend Libraries
- recharts (charts), react-leaflet + leaflet (map), html2canvas (PNG export), lucide-react (icons), framer-motion (animations), date-fns (date formatting)

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
