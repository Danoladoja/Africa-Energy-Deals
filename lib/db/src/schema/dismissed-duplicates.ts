import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";

export const dismissedDuplicatesTable = pgTable("dismissed_duplicates", {
  id: serial("id").primaryKey(),
  idA: integer("id_a").notNull(),
  idB: integer("id_b").notNull(),
  dismissedBy: varchar("dismissed_by", { length: 255 }).notNull().default("admin"),
  dismissedAt: timestamp("dismissed_at").defaultNow().notNull(),
});
