import { pgTable, serial, text, doublePrecision, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("energy_projects", {
  id: serial("id").primaryKey(),
  projectName: text("project_name").notNull(),
  country: text("country").notNull(),
  region: text("region").notNull(),
  technology: text("technology").notNull(),
  dealSizeUsdMn: doublePrecision("deal_size_usd_mn"),
  investors: text("investors"),
  status: text("status").notNull(),
  description: text("description"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  capacityMw: doublePrecision("capacity_mw"),
  announcedYear: integer("announced_year"),
  closedYear: integer("closed_year"),
  sourceUrl: text("source_url"),
  newsUrl: text("news_url"),
  isAutoDiscovered: boolean("is_auto_discovered").default(false).notNull(),
  reviewStatus: text("review_status").default("approved").notNull(),
  discoveredAt: timestamp("discovered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
