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
3. **Interactive Map** — Full-screen Leaflet map centered on Africa. Color-coded circle markers by technology. Click for popup details. Project sidebar list.
4. **Visualization Studio** — Select chart type (bar/line/pie), metric (investment $ or project count), grouping (country/technology/region/year). Download as PNG via html2canvas.

### Database
- Table: `energy_projects` in PostgreSQL
- 50 seed projects covering real African energy deals (solar, wind, hydro, geothermal, oil & gas, natural gas)
- Seed: `pnpm --filter @workspace/scripts run seed-energy`

### API Endpoints
- `GET /api/projects` — list/search/filter projects
- `GET /api/projects/:id` — single project
- `POST /api/projects` — create project
- `GET /api/stats/summary` — KPI summary
- `GET /api/stats/by-country` — per-country stats
- `GET /api/stats/by-technology` — per-technology stats
- `GET /api/stats/by-region` — per-region stats
- `GET /api/stats/by-year` — per-year stats

### Frontend Libraries
- recharts (charts), react-leaflet + leaflet (map), html2canvas (PNG export), lucide-react (icons), framer-motion (animations), date-fns (date formatting)

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
