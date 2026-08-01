# AfriEnergy Tracker

**Live at [afrienergytracker.io](https://afrienergytracker.io)** — Africa's energy investment tracker.

AfriEnergy Tracker follows publicly disclosed energy investment transactions and infrastructure
projects across all 54 African countries: solar, wind, hydro, geothermal, bioenergy, nuclear,
coal, oil & gas, grid expansion, battery storage, hydrogen, and clean cooking.

Headline figures count **disclosed transaction values only** — capacity-based estimates are
flagged "est." and excluded from totals, and cancelled projects never count as investment.
The full accounting rules live on the public [Methodology page](https://afrienergytracker.io/methodology).

## What's inside

- **Dashboard** — market overview with sector, country, and stage breakdowns
- **Deal Tracker** — searchable, filterable database of tracked transactions
- **Interactive Map** — investment intensity choropleth with country drill-down
- **Country & Investor profiles** — per-market aggregates and project listings
- **Visualization Studio** — custom charts with PNG/PDF/PPTX export
- **AI Insights** — chat grounded in the live database
- **Community contributions** — submit deals (two corroborating sources required)
- **Public REST API** — see [/api-docs](https://afrienergytracker.io/api-docs)

## Architecture

pnpm workspace monorepo:

```
artifacts/
  api-server/       Express + TypeScript API, scraper pipeline, schedulers
  energy-tracker/   React + Vite frontend
lib/
  db/               Drizzle ORM schema (PostgreSQL)
  api-spec/         OpenAPI spec (drives generated clients via Orval)
  ...
```

Data pipeline: 19 source adapters (Global Energy Monitor, World Bank, AfDB, IFC, DFC, GCF,
AidData, 11 national regulators, curated news feeds) → LLM extraction → validation, completeness
scoring, fuzzy dedup → three-track routing (auto-approve / human review / reject).

Deployed on Railway (auto-deploys from `master`). Database: Railway PostgreSQL.

## Data sources & credits

Project inventory data builds on [Global Energy Monitor](https://globalenergymonitor.org/)
trackers, the [World Bank Projects API](https://projects.worldbank.org/), and public disclosures
from DFIs and national energy regulators. See the Methodology page for the full list.

## License

MIT — see [LICENSE](./LICENSE).
