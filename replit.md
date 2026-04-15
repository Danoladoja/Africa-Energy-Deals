# Overview

This project is a pnpm workspace monorepo using TypeScript, designed to track publicly disclosed energy investment transactions across Africa. The main application, the "Africa Energy Investment Tracker," provides comprehensive data visualization, deal tracking, and investor insights. It aims to become the leading platform for African energy investment data, offering valuable tools for investors, analysts, and policymakers. Key capabilities include interactive dashboards, detailed deal tables, dynamic mapping, visualization studio, country and investor profiles, and an AI-powered discovery system for new deals.

# User Preferences

I prefer iterative development, with a focus on delivering working features incrementally. I appreciate clear, concise explanations and well-documented code. Please ask for my input before making any major architectural changes or introducing new external dependencies.

# System Architecture

The project is structured as a pnpm monorepo, with distinct packages for deployable applications (`artifacts/`) and shared libraries (`lib/`).

**Technology Stack:**
- **Monorepo:** pnpm workspaces
- **Backend:** Node.js 24, Express 5, PostgreSQL, Drizzle ORM, Zod for validation
- **Frontend:** React, Vite
- **Build:** esbuild
- **TypeScript:** 5.9

**Core Architectural Patterns:**
- **Modular Monorepo:** Separates concerns into distinct packages for better organization and maintainability.
- **API-first Approach:** A well-defined OpenAPI specification drives API client and Zod schema generation using Orval.
- **Data-Driven UI:** Extensive use of charting libraries (recharts) and mapping (Leaflet) for rich data visualization.
- **AI Integration:** An AI agent leverages OpenAI's GPT for daily news scraping and structured data extraction, with a human-in-the-loop review process.
- **Authentication:** Magic-link email authentication system for user management and personalized features like watchlists.
- **Light/Dark Mode:** `ThemeContext` (`src/contexts/theme.tsx`) persists preference to localStorage and toggles a `.light` class on `<html>`. CSS variables in `index.css` under `.light` override the default dark palette. Toggle button lives in the desktop sidebar footer and mobile header/drawer. Landing page is excluded (hardcoded dark colors).
- **SEO & Performance:** Dynamic meta tags, bot prerendering middleware, dynamic sitemap generation, code splitting, and skeleton loaders ensure optimal SEO and user experience.

**Key Features:**
- **Africa Energy Investment Tracker:**
    - **Dashboard:** KPIs, investment trajectory, technology and regional breakdowns.
    - **Deal Tracker:** Searchable, filterable table with pagination and detail modals.
    - **Interactive Map:** Leaflet map with choropleth and markers, country drill-down, and enhanced marker popups.
    - **Visualization Studio:** Customizable charts with export options. 10 chart types in two groups — Basic (Vertical Bar, Horizontal Bar, Line, Area, Pie, Donut) and Advanced (Treemap, Stacked Bar, 100% Stacked Bar, Sankey Flow, Scatter/Bubble). Each advanced chart has its own config panel (metric, hierarchy, axes, stack-by, color-by, etc.). All charts support PNG/PDF/PPTX download.
    - **Country & Investor Profiles:** Detailed pages with aggregate stats and project listings.
    - **AI Discovery:** Automated scraping of RSS feeds, AI extraction, and human review queue for new deals.
    - **Alert & Watch System:** User authentication, watchlists for countries/sectors/investors, and email notifications for new matching deals.
    - **AI Insights (Chat):** `/insights` page with Claude-powered chatbot for market analysis, deal search, and investment intelligence. Grounded in live PostgreSQL data. SSE streaming via `POST /api/chat`. Shared conversation state in `ChatProvider` with localStorage persistence. ⌘K slide-out panel (`chat-slide-out.tsx`) accessible from any page.
    - **Newsletter System:** Weekly AI-generated briefings (every Monday 7 AM UTC). Backend services: `web-intelligence.ts`, `newsletter-generator.ts`, `email-dispatch.ts`, `newsletter-scheduler.ts`. Frontend: Newsletter tab in Insights page with subscriber sign-up form. Email via Resend (`RESEND_API_KEY`). `newsletters` + `user_emails` tables in PostgreSQL. Newsletter generator uses comprehensive Bloomberg-style system prompt with section-by-section writing instructions (9 mandatory sections, 2,500–3,500 words, 12,000 max tokens). Data context includes pre-formatted sector/region/pipeline tables, top 10 deals, DFI/climate finance counts, and data quality disclosures. Email HTML uses inline-CSS template with styled tables, callout boxes, dark header, and AI disclaimer. All DB queries use selective column lists (never SELECT * on `newsletters` table — prevents production failures on schema-lagged DBs).
- **API Key System:** Tiered API access with rate limiting for institutional users.
- **Embeddable Widgets:** Public routes for embedding deal cards and charts.
- **Export System:** Comprehensive data export functionalities (PDF, PNG, PPTX) for dashboards and visualizations, supporting both data-driven and image-based exports.
- **Data Pipeline & Scraper:** 13 source groups, 12-sector taxonomy. Full self-validation pipeline in `writeCandidate()`: field validation & cleaning (`field-validator.ts`), name normalization (`name-normalizer.ts`), URL domain-diversity + reachability (`url-validator.ts`), completeness scoring 0–100 (`completeness-scorer.ts`), fuzzy dedup with country filter at 0.5 threshold, composite routing (`routing-engine.ts`). Three-track output: auto-approve (score ≥ 75, no issues), review (score 40–74), reject (<40 or completeness <40%). DB columns: `completeness_score INTEGER`, `review_notes JSONB`, `normalized_name TEXT`. Review notes (routing reasons) displayed in Review Queue UI.
- **Review Portal:** Magic-link based per-reviewer identity system. Reviewers are managed via dedicated `reviewers` table (separate from `user_emails`). Auth flow: admin adds reviewer → welcome email sent → reviewer clicks link → 15-min magic token consumed → 7-day httpOnly `rv_sess` cookie issued. Routes: `POST /api/reviewer-auth/request`, `POST /api/reviewer-auth/callback`, `GET /api/reviewer-auth/me`, `POST /api/reviewer-auth/logout`. Admin management at `GET/POST/DELETE /api/admin/reviewers`, `PATCH .../suspend`, `PATCH .../reinstate`, `POST .../send-link`, `GET .../audit`. DB tables: `reviewers`, `reviewer_magic_tokens`, `reviewer_sessions`, `reviewer_audit_log`. Frontend: `/review` shows login form for unauthenticated users, `/review/auth` callback page, `/admin/reviewers` reviewer management page. Legacy Bearer-token reviewer auth (via `user_emails.role`) still supported alongside cookie auth.
- **Seed Data & World Bank Integration:** Initial seed data and integration with the World Bank Projects API to enrich the dataset.
- **Community Contributions System (PR2):** Magic-link auth for contributors (`cb_sess` httpOnly 30-day cookie). Flow: `POST /api/contributor-auth/request` → email with token → `POST /api/contributor-auth/callback` → cookie. Submission: `POST /api/contributions` (two-source requirement, same-domain check, duplicate detection, honeypot, rate limit). Submissions enter review queue as `reviewStatus=pending, extractionSource=community`. On approval, badges are awarded via `awardBadges()`. Badge tiers: bronze(1), silver(10), gold(50), platinum(200) approved submissions. Narrative badges: first_light, multi_sector, cross_border, country_specialist_<cc>. DB tables: `contributors`, `contributor_magic_tokens`, `contributor_sessions`, `contributor_submissions`, `contributor_badges`. Frontend pages: `/contribute` (sign-in + submission form), `/contribute/auth` (callback), `/contributors/me` (dashboard + profile edit), `/contributors/:slug` (public profile), `/admin/contributors` (admin management table). Routes: `contributor-auth.ts`, `contributions.ts`. `review.ts` patched to update `contributor_submissions` and call `awardBadges()` on community approvals. Nav: "Contribute" item with "Community" badge in sidebar; "Contributors" in Admin Dashboard dropdown.

# External Dependencies

- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **Validation:** Zod
- **API Codegen:** Orval (from OpenAPI spec)
- **AI/ML:** OpenAI (gpt-5.2 via Replit AI Integrations)
- **Mapping:** Leaflet
- **Charting:** recharts
- **PDF Generation:** jspdf, jspdf-autotable
- **PPTX Generation:** pptxgenjs
- **Image Capture:** html2canvas, html-to-image
- **Icons:** lucide-react
- **Animations:** framer-motion
- **Date Utilities:** date-fns
- **SEO:** react-helmet-async
- **RSS Parsing:** rss-parser
- **Scheduling:** node-cron
- **API:** World Bank Projects API