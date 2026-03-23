import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const magicLinkTokensTable = pgTable("magic_link_tokens", {
  token: text("token").primaryKey(),
  userEmail: text("user_email").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessionsTable = pgTable("sessions", {
  token: text("token").primaryKey(),
  userEmail: text("user_email").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MagicLinkToken = typeof magicLinkTokensTable.$inferSelect;
export type Session = typeof sessionsTable.$inferSelect;
