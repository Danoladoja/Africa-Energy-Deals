import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const urlAuditTable = pgTable("url_audit", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull(),
  oldUrl: text("old_url"),
  newUrl: text("new_url"),
  action: text("action").notNull(), // "tested" | "edited" | "replaced" | "removed"
  testedStatus: integer("tested_status"),
  responseTime: integer("response_time"),
  note: text("note"),
  reviewerEmail: text("reviewer_email").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type UrlAudit = typeof urlAuditTable.$inferSelect;
export type InsertUrlAudit = typeof urlAuditTable.$inferInsert;
