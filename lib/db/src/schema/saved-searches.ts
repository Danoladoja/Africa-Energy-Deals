import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const savedSearchesTable = pgTable("saved_searches", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  name: text("name").notNull(),
  filters: jsonb("filters").notNull().$type<{
    search?: string;
    technology?: string;
    status?: string;
    country?: string;
    dealSizePreset?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
});

export type SavedSearch = typeof savedSearchesTable.$inferSelect;
export type NewSavedSearch = typeof savedSearchesTable.$inferInsert;
