/**
 * Startup migration runner — ensures the live database matches the Drizzle schema.
 *
 * Every column added to a Drizzle schema file must also appear here as an idempotent
 * ALTER TABLE … ADD COLUMN IF NOT EXISTS statement. This prevents the recurring bug
 * where Drizzle SELECT queries reference columns that don't yet exist in PostgreSQL.
 *
 * Rules:
 *  - Always use ADD COLUMN IF NOT EXISTS (idempotent, safe to run repeatedly).
 *  - Never DROP or RENAME columns here — do that manually after confirming no data loss.
 *  - Add new entries at the bottom of the relevant table section.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function runMigration(description: string, statement: string): Promise<void> {
  try {
    await db.execute(sql.raw(statement));
    console.log(`[Migrate] ✓ ${description}`);
  } catch (err: any) {
    // Column-already-exists errors are fine (IF NOT EXISTS handles most DBs, but belt-and-suspenders)
    if (err?.message?.includes("already exists")) {
      console.log(`[Migrate] ✓ ${description} (already exists)`);
    } else {
      console.error(`[Migrate] ✗ ${description}:`, err?.message ?? err);
      throw err;
    }
  }
}

export async function runStartupMigrations(): Promise<void> {
  console.log("[Migrate] Running startup schema migrations…");

  // ── energy_projects ───────────────────────────────────────────────────────
  // Enriched deal lifecycle columns (added in scraper enrichment phase)
  await runMigration("energy_projects.deal_stage", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS deal_stage TEXT`);
  await runMigration("energy_projects.developer", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS developer TEXT`);
  await runMigration("energy_projects.financiers", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS financiers TEXT`);
  await runMigration("energy_projects.dfi_involvement", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS dfi_involvement TEXT`);
  await runMigration("energy_projects.offtaker", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS offtaker TEXT`);
  await runMigration("energy_projects.financial_close_date", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS financial_close_date DATE`);
  await runMigration("energy_projects.commissioning_date", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS commissioning_date DATE`);
  await runMigration("energy_projects.announcement_date", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS announcement_date DATE`);
  await runMigration("energy_projects.debt_equity_split", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS debt_equity_split TEXT`);
  await runMigration("energy_projects.grant_component", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS grant_component DOUBLE PRECISION`);
  await runMigration("energy_projects.financing_type", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS financing_type TEXT`);
  await runMigration("energy_projects.financing_sub_types", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS financing_sub_types TEXT`);
  await runMigration("energy_projects.concessional_terms", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS concessional_terms TEXT`);
  await runMigration("energy_projects.ppa_term_years", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS ppa_term_years INTEGER`);
  await runMigration("energy_projects.ppa_tariff_usd_kwh", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS ppa_tariff_usd_kwh DOUBLE PRECISION`);
  await runMigration("energy_projects.guarantor", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS guarantor TEXT`);
  await runMigration("energy_projects.climate_finance_tag", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS climate_finance_tag TEXT`);
  // Auto-discovery / review workflow columns
  await runMigration("energy_projects.confidence_score", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS confidence_score DOUBLE PRECISION`);
  await runMigration("energy_projects.extraction_source", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS extraction_source TEXT`);
  await runMigration("energy_projects.is_auto_discovered", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS is_auto_discovered BOOLEAN NOT NULL DEFAULT FALSE`);
  await runMigration("energy_projects.review_status", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved'`);
  await runMigration("energy_projects.discovered_at", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMP`);
  // Source URL columns
  await runMigration("energy_projects.source_url", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS source_url TEXT`);
  await runMigration("energy_projects.news_url", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS news_url TEXT`);
  await runMigration("energy_projects.news_url_2", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS news_url_2 TEXT`);

  // ── newsletters ───────────────────────────────────────────────────────────
  await runMigration("newsletters.content_html", `ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS content_html TEXT`);
  await runMigration("newsletters.executive_summary", `ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS executive_summary TEXT`);
  await runMigration("newsletters.spotlight_sector", `ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS spotlight_sector TEXT`);
  await runMigration("newsletters.spotlight_country", `ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS spotlight_country TEXT`);
  await runMigration("newsletters.projects_analyzed", `ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS projects_analyzed INTEGER`);
  await runMigration("newsletters.total_investment_covered", `ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS total_investment_covered TEXT`);
  await runMigration("newsletters.recipient_count", `ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS recipient_count INTEGER`);
  await runMigration("newsletters.sent_at", `ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP`);
  await runMigration("newsletters.type", `ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'insights'`);

  // ── user_emails ───────────────────────────────────────────────────────────
  await runMigration("user_emails.unsubscribe_token", `ALTER TABLE user_emails ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT UNIQUE`);
  await runMigration("user_emails.newsletter_frequency", `ALTER TABLE user_emails ADD COLUMN IF NOT EXISTS newsletter_frequency TEXT DEFAULT 'weekly'`);
  await runMigration("user_emails.last_newsletter_sent_at", `ALTER TABLE user_emails ADD COLUMN IF NOT EXISTS last_newsletter_sent_at TIMESTAMP`);

  // ── scraper_runs ─────────────────────────────────────────────────────────
  await runMigration("scraper_runs.adapter_key", `ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS adapter_key TEXT`);

  // ── scraper_sources ───────────────────────────────────────────────────────
  await runMigration("create scraper_sources", `
    CREATE TABLE IF NOT EXISTS scraper_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      adapter_type TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      feed_url TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_by TEXT NOT NULL DEFAULT 'system'
    )
  `);

  // ── community contributions ───────────────────────────────────────────────
  await runMigration("energy_projects.submitted_by_contributor_id", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS submitted_by_contributor_id INTEGER`);
  await runMigration("energy_projects.community_submission_id", `ALTER TABLE energy_projects ADD COLUMN IF NOT EXISTS community_submission_id INTEGER`);

  await runMigration("create contributors", `
    CREATE TABLE IF NOT EXISTS contributors (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      email_verified_at TIMESTAMP,
      display_name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      country TEXT,
      bio TEXT,
      is_public BOOLEAN NOT NULL DEFAULT TRUE,
      is_banned BOOLEAN NOT NULL DEFAULT FALSE,
      current_tier TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_submission_at TIMESTAMP
    )
  `);

  await runMigration("create contributor_magic_tokens", `
    CREATE TABLE IF NOT EXISTS contributor_magic_tokens (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      display_name TEXT,
      country TEXT,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      consumed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await runMigration("create contributor_sessions", `
    CREATE TABLE IF NOT EXISTS contributor_sessions (
      id SERIAL PRIMARY KEY,
      contributor_id INTEGER NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      issued_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL,
      revoked_at TIMESTAMP
    )
  `);

  await runMigration("create contributor_submissions", `
    CREATE TABLE IF NOT EXISTS contributor_submissions (
      id SERIAL PRIMARY KEY,
      contributor_id INTEGER NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
      project_name TEXT NOT NULL,
      country TEXT NOT NULL,
      sub_sector TEXT NOT NULL,
      description TEXT NOT NULL,
      news_url TEXT NOT NULL,
      news_url_2 TEXT NOT NULL,
      investment_amount_usd_mn DOUBLE PRECISION,
      submitter_note TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TIMESTAMP,
      reviewed_by TEXT,
      rejection_reason TEXT,
      linked_project_id INTEGER REFERENCES energy_projects(id) ON DELETE SET NULL,
      needs_extra_scrutiny BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await runMigration("create contributor_badges", `
    CREATE TABLE IF NOT EXISTS contributor_badges (
      id SERIAL PRIMARY KEY,
      contributor_id INTEGER NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
      badge_slug TEXT NOT NULL,
      awarded_at TIMESTAMP NOT NULL DEFAULT NOW(),
      metadata JSONB
    )
  `);

  await runMigration("seed scraper_sources google alerts", `
    INSERT INTO scraper_sources (adapter_type, key, label, feed_url, created_by) VALUES
      ('google_alerts', 'rss:google_alerts:africa_energy_investment_mw',
       'Africa energy investment MW',
       'https://news.google.com/rss/search?q=%22Africa%22+%22energy%22+%22investment%22+%22MW%22&hl=en-US&gl=US&ceid=US:en',
       'system'),
      ('google_alerts', 'rss:google_alerts:solar_africa_project_finance',
       'Solar Africa project finance',
       'https://news.google.com/rss/search?q=%22solar%22+%22Africa%22+%22project+finance%22&hl=en-US&gl=US&ceid=US:en',
       'system'),
      ('google_alerts', 'rss:google_alerts:afrique_energie_investissement',
       'Afrique énergie investissement (French)',
       'https://news.google.com/rss/search?q=%22Afrique%22+%22%C3%A9nergie%22+%22investissement%22&hl=fr&gl=FR&ceid=FR:fr',
       'system'),
      ('google_alerts', 'rss:google_alerts:africa_energia_investimento',
       'África energia investimento (Portuguese)',
       'https://news.google.com/rss/search?q=%22%C3%81frica%22+%22energia%22+%22investimento%22&hl=pt&gl=PT&ceid=PT:pt',
       'system')
    ON CONFLICT (key) DO NOTHING
  `);

  console.log("[Migrate] All startup migrations complete.");
}
