import { pgTable, serial, text, doublePrecision, integer, timestamp, boolean, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("energy_projects", {
  id: serial("id").primaryKey(),
  projectName: text("project_name").notNull(),
  country: text("country").notNull(),
  region: text("region").notNull(),
  technology: text("technology").notNull(),
  dealSizeUsdMn: doublePrecision("deal_size_usd_mn"),
  investors: text("investors"),
  status: text("status").notNull(),
  description: text("description"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  capacityMw: doublePrecision("capacity_mw"),
  announcedYear: integer("announced_year"),
  closedYear: integer("closed_year"),
  sourceUrl: text("source_url"),
  newsUrl: text("news_url"),
  newsUrl2: text("news_url_2"),
  isAutoDiscovered: boolean("is_auto_discovered").default(false).notNull(),
  reviewStatus: text("review_status").default("approved").notNull(),
  discoveredAt: timestamp("discovered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),

  // ── Deal Lifecycle & Enriched Fields ──────────────────────────────────────
  // Enum-style: "Announced" | "Mandated" | "Financial Close" | "Construction" | "Commissioned" | "Suspended"
  dealStage: text("deal_stage"),
  developer: text("developer"),
  financiers: text("financiers"),
  dfiInvolvement: text("dfi_involvement"),
  offtaker: text("offtaker"),
  financialCloseDate: date("financial_close_date"),
  commissioningDate: date("commissioning_date"),
  announcementDate: date("announcement_date"),
  debtEquitySplit: text("debt_equity_split"),
  grantComponent: doublePrecision("grant_component"),

  // ── Financing Structure ───────────────────────────────────────────────────
  // Financing type: "Project Finance" | "Blended Finance" | "Concessional Loan" | "Grant / Donor Funding" |
  //   "Corporate Finance" | "Sovereign Lending" | "IPP / Concession" | "PPP / Public-Private" |
  //   "Green / Climate Bond" | "Equity Investment" | "Export Credit" | "Bilateral Aid / ODA"
  financingType: text("financing_type"),
  // JSON-serialised array of sub-types, e.g. '["DFI Debt","Equity","Concessional Tranche"]'
  financingSubTypes: text("financing_sub_types"),
  // Free-text description of concessional terms (grace period, blended rates, etc.)
  concessionalTerms: text("concessional_terms"),
  // PPA term length in years
  ppaTermYears: integer("ppa_term_years"),
  // PPA tariff in USD / kWh
  ppaTariffUsdKwh: doublePrecision("ppa_tariff_usd_kwh"),
  // Guarantee provider (e.g. MIGA, World Bank PRG, USAID DCA)
  guarantor: text("guarantor"),
  // Climate finance classification: "Mitigation" | "Adaptation" | "Cross-Cutting" | "Non-Climate"
  climateFinanceTag: text("climate_finance_tag"),

  // ── Review Accountability ─────────────────────────────────────────────────
  approvedBy: text("approved_by"),
  binnedAt: timestamp("binned_at"),

  // ── AI Extraction Metadata ────────────────────────────────────────────────
  confidenceScore: doublePrecision("confidence_score"),
  extractionSource: text("extraction_source"),

  // ── Community Submissions ─────────────────────────────────────────────────
  submittedByContributorId: integer("submitted_by_contributor_id"),
  communitySubmissionId: integer("community_submission_id"),

  // ── Deduplication ─────────────────────────────────────────────────────────
  normalizedName: text("normalized_name"),

  // ── Scraper Self-Validation Pipeline ──────────────────────────────────────
  // Completeness score (0–100) computed at ingestion time
  completenessScore: integer("completeness_score"),
  // Routing reasons: why a candidate was sent to review instead of auto-approved
  reviewNotes: jsonb("review_notes").$type<string[]>().default([]),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
