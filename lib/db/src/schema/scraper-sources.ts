import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const scraperSourcesTable = pgTable("scraper_sources", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  adapterType: text("adapter_type").notNull(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  feedUrl: text("feed_url").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by").notNull().default("system"),
});

export type ScraperSource = typeof scraperSourcesTable.$inferSelect;
export type InsertScraperSource = typeof scraperSourcesTable.$inferInsert;
