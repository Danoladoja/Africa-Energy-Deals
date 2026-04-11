import {
  pgTable, serial, text, boolean, timestamp, integer, doublePrecision, jsonb,
} from "drizzle-orm/pg-core";
import { projectsTable } from "./projects";

export const contributorsTable = pgTable("contributors", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerifiedAt: timestamp("email_verified_at"),
  displayName: text("display_name").notNull(),
  slug: text("slug").notNull().unique(),
  country: text("country"),
  bio: text("bio"),
  isPublic: boolean("is_public").notNull().default(true),
  isBanned: boolean("is_banned").notNull().default(false),
  currentTier: text("current_tier"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSubmissionAt: timestamp("last_submission_at"),
});

export const contributorMagicTokensTable = pgTable("contributor_magic_tokens", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  country: text("country"),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contributorSessionsTable = pgTable("contributor_sessions", {
  id: serial("id").primaryKey(),
  contributorId: integer("contributor_id")
    .references(() => contributorsTable.id, { onDelete: "cascade" })
    .notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
});

export const contributorSubmissionsTable = pgTable("contributor_submissions", {
  id: serial("id").primaryKey(),
  contributorId: integer("contributor_id")
    .references(() => contributorsTable.id, { onDelete: "cascade" })
    .notNull(),
  projectName: text("project_name").notNull(),
  country: text("country").notNull(),
  subSector: text("sub_sector").notNull(),
  description: text("description").notNull(),
  newsUrl: text("news_url").notNull(),
  newsUrl2: text("news_url_2").notNull(),
  investmentAmountUsdMn: doublePrecision("investment_amount_usd_mn"),
  submitterNote: text("submitter_note"),
  status: text("status").notNull().default("pending"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: text("reviewed_by"),
  rejectionReason: text("rejection_reason"),
  linkedProjectId: integer("linked_project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  needsExtraScrutiny: boolean("needs_extra_scrutiny").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contributorBadgesTable = pgTable("contributor_badges", {
  id: serial("id").primaryKey(),
  contributorId: integer("contributor_id")
    .references(() => contributorsTable.id, { onDelete: "cascade" })
    .notNull(),
  badgeSlug: text("badge_slug").notNull(),
  awardedAt: timestamp("awarded_at").defaultNow().notNull(),
  metadata: jsonb("metadata"),
});

export type Contributor = typeof contributorsTable.$inferSelect;
export type ContributorSubmission = typeof contributorSubmissionsTable.$inferSelect;
export type ContributorBadge = typeof contributorBadgesTable.$inferSelect;
