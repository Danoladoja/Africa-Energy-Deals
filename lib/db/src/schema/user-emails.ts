import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const userEmailsTable = pgTable("user_emails", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  role: text("role").default("user").notNull(), // "user" | "reviewer" | "admin-reviewer"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  // Newsletter subscription fields
  newsletterOptIn: boolean("newsletter_opt_in").default(true).notNull(),
  unsubscribeToken: text("unsubscribe_token").unique(),
  newsletterFrequency: text("newsletter_frequency").default("weekly"), // 'weekly' | 'biweekly' | 'monthly'
  lastNewsletterSentAt: timestamp("last_newsletter_sent_at"),
});

export type UserEmail = typeof userEmailsTable.$inferSelect;
