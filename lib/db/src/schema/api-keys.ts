import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const apiKeysTable = pgTable("api_keys", {
  id:           serial("id").primaryKey(),
  key:          text("key").notNull().unique(),
  organization: text("organization").notNull(),
  email:        text("email").notNull(),
  tier:         text("tier").notNull().default("free"),       // "free" | "institutional"
  rateLimit:    integer("rate_limit").notNull().default(100), // requests per day
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  lastUsedAt:   timestamp("last_used_at"),
});

export type ApiKey = typeof apiKeysTable.$inferSelect;
