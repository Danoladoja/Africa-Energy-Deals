import { pgTable, serial, text, real, timestamp } from "drizzle-orm/pg-core";

export const externalIntelligenceTable = pgTable("external_intelligence", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  url: text("url"),
  publishDate: timestamp("publish_date"),
  category: text("category"), // 'dfi' | 'industry' | 'news' | 'thinktank'
  relevanceScore: real("relevance_score"),
  scrapedAt: timestamp("scraped_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export type ExternalIntelligence = typeof externalIntelligenceTable.$inferSelect;
