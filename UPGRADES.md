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
