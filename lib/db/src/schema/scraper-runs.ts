import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const scraperRunsTable = pgTable("scraper_runs", {
  id: serial("id").primaryKey(),
  sourceName: text("source_name").notNull(),
  adapterKey: text("adapter_key"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  recordsFound: integer("records_found").default(0).notNull(),
  recordsInserted: integer("records_inserted").default(0).notNull(),
  recordsUpdated: integer("records_updated").default(0).notNull(),
  flaggedForReview: integer("flagged_for_review").default(0).notNull(),
  errors: text("errors"),
  triggeredBy: text("triggered_by").default("schedule").notNull(),
});

export type ScraperRun = typeof scraperRunsTable.$inferSelect;
