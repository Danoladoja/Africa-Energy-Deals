import { pgTable, serial, text, boolean, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

export const reviewersTable = pgTable("reviewers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by").notNull(),
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: text("suspended_by"),
  deletedAt: timestamp("deleted_at"),
});

export const reviewerMagicTokensTable = pgTable("reviewer_magic_tokens", {
  id: serial("id").primaryKey(),
  reviewerId: integer("reviewer_id").references(() => reviewersTable.id, { onDelete: "cascade" }).notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reviewerSessionsTable = pgTable("reviewer_sessions", {
  id: serial("id").primaryKey(),
  reviewerId: integer("reviewer_id").references(() => reviewersTable.id, { onDelete: "cascade" }).notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
});

export const reviewerAuditLogTable = pgTable("reviewer_audit_log", {
  id: serial("id").primaryKey(),
  reviewerId: integer("reviewer_id"),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Reviewer = typeof reviewersTable.$inferSelect;
export type ReviewerMagicToken = typeof reviewerMagicTokensTable.$inferSelect;
export type ReviewerSession = typeof reviewerSessionsTable.$inferSelect;
export type ReviewerAuditLogEntry = typeof reviewerAuditLogTable.$inferSelect;
