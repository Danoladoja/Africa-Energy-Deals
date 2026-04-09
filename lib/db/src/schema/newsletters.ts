import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const newslettersTable = pgTable("newsletters", {
  id: serial("id").primaryKey(),
  editionNumber: integer("edition_number").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  contentHtml: text("content_html"),
  executiveSummary: text("executive_summary"),
  spotlightSector: text("spotlight_sector"),
  spotlightCountry: text("spotlight_country"),
  projectsAnalyzed: integer("projects_analyzed"),
  totalInvestmentCovered: text("total_investment_covered"),
  externalSourcesUsed: integer("external_sources_used"),
  pdfUrl: text("pdf_url"),
  recipientCount: integer("recipient_count"),
  generatedAt: timestamp("generated_at").defaultNow(),
  sentAt: timestamp("sent_at"),
  status: text("status").default("draft").notNull(), // 'draft' | 'sent' | 'failed'
  type: text("type").default("insights").notNull(), // 'insights' (monthly) | 'brief' (biweekly)
});

export type Newsletter = typeof newslettersTable.$inferSelect;
export type NewNewsletter = typeof newslettersTable.$inferInsert;
