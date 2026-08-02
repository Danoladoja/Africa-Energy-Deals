# Feature Upgrades — Queued for Next Week

Tracked follow-ups from the August 1, 2026 credibility and data-quality overhaul.

1. **Newsletter compose & scheduling UI.** The backend now supports hand-written
   special editions with scheduled auto-dispatch (`POST /api/admin/newsletter/special`
   + 10-minute dispatch tick), but there is no admin UI for it yet. Build a
   compose screen in the admin newsletter panel: title, markdown body, live
   email preview, test-send button, and a date/time picker for scheduling.

2. **Gap-fill provenance hygiene.** The scraper's gap-fill can still overwrite a
   record's `extraction_source` label when a higher-confidence candidate matches.
   Harmless to dollar totals now (estimate flagging is scoped to auto-discovered
   records), but provenance should be append-only. Small pipeline change.

3. **Missing-figures enrichment mode.** ~536 approved projects have neither a
   disclosed size nor capacity. Extend the monthly enrichment sweep with a
   second queue that revisits their source articles for size/capacity, mirroring
   the financing enrichment pattern (fill nulls only, budget-capped).

4. **Developer name cleanup.** Strip ownership artifacts like "[100%]" from
   developer/investor names at ingestion and via one-time backfill.

5. **Adapter endpoint migration (PRIORITY — most sources rotted since April).**
   The Aug 2, 2026 manual run exposed widespread source link-rot; until these
   are fixed, scheduled scrapes will collect little or nothing:
   - `gem`: all tracker download URLs return HTTP 410 Gone — GEM has moved its
     data files; locate the new release URLs (or switch to their API) and update.
   - `aiddata`, `dfc`: dataset endpoints return 404 — find current URLs.
   - `ifc`: both project-listing endpoints return 404.
   - `afdb`: returns 403 — likely bot-blocking or a moved path; may need a new
     data source (AfDB data portal / open-data API).
   - News feeds: ESI Africa (403), Engineering News, PV Magazine Africa,
     Recharge News, Business Insider Africa (404s), APO Group (TLS mismatch) —
     prune dead feeds and source replacements.
   Two code bugs found in the same run are already fixed (news batch URL lookup
   double-bind; World Bank countryname arriving as an array).
