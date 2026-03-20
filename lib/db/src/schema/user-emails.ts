import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const userEmailsTable = pgTable("user_emails", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
});

export type UserEmail = typeof userEmailsTable.$inferSelect;
