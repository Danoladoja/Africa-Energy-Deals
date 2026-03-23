import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const watchesTable = pgTable("watches", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  watchType: text("watch_type").notNull(),
  watchValue: text("watch_value").notNull(),
  lastCheckedAt: timestamp("last_checked_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Watch = typeof watchesTable.$inferSelect;
export type NewWatch = typeof watchesTable.$inferInsert;
