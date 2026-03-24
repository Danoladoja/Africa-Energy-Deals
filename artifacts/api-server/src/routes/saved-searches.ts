import { Router } from "express";
import { db } from "@workspace/db";
import { savedSearchesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { sessionAuthMiddleware, type AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

router.use("/saved-searches", sessionAuthMiddleware as any);

router.get("/saved-searches", async (req: AuthenticatedRequest, res) => {
  try {
    const searches = await db
      .select()
      .from(savedSearchesTable)
      .where(eq(savedSearchesTable.userEmail, req.userEmail!))
      .orderBy(desc(savedSearchesTable.lastUsedAt));
    res.json({ savedSearches: searches });
  } catch (err) {
    console.error("[SavedSearches] GET error:", err);
    res.status(500).json({ error: "Failed to fetch saved searches." });
  }
});

router.post("/saved-searches", async (req: AuthenticatedRequest, res) => {
  const { name, filters } = req.body as {
    name?: string;
    filters?: Record<string, string>;
  };

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required." });
    return;
  }
  if (!filters || typeof filters !== "object") {
    res.status(400).json({ error: "filters object is required." });
    return;
  }

  const cleanFilters: Record<string, string> = {};
  for (const key of ["search", "technology", "status", "country", "dealSizePreset"]) {
    if (filters[key] && typeof filters[key] === "string" && filters[key].trim()) {
      cleanFilters[key] = filters[key].trim();
    }
  }

  // Enforce 10 saved searches per user
  const existing = await db
    .select({ id: savedSearchesTable.id })
    .from(savedSearchesTable)
    .where(eq(savedSearchesTable.userEmail, req.userEmail!));
  if (existing.length >= 10) {
    res.status(400).json({ error: "You have reached the maximum of 10 saved searches. Delete one to save a new search." });
    return;
  }

  try {
    const [saved] = await db
      .insert(savedSearchesTable)
      .values({
        userEmail: req.userEmail!,
        name: name.trim(),
        filters: cleanFilters,
        lastUsedAt: new Date(),
      })
      .returning();

    res.status(201).json({ savedSearch: saved });
  } catch (err) {
    console.error("[SavedSearches] POST error:", err);
    res.status(500).json({ error: "Failed to save search." });
  }
});

router.patch("/saved-searches/:id", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid saved search ID." });
    return;
  }

  const { name, filters } = req.body as {
    name?: string;
    filters?: Record<string, string>;
  };

  const updates: Partial<typeof savedSearchesTable.$inferInsert> = {};
  if (name && typeof name === "string" && name.trim()) {
    updates.name = name.trim();
  }
  if (filters && typeof filters === "object") {
    const cleanFilters: Record<string, string> = {};
    for (const key of ["search", "technology", "status", "country"]) {
      if (filters[key] && typeof filters[key] === "string" && filters[key].trim()) {
        cleanFilters[key] = filters[key].trim();
      }
    }
    updates.filters = cleanFilters;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update." });
    return;
  }

  try {
    const updated = await db
      .update(savedSearchesTable)
      .set(updates)
      .where(and(eq(savedSearchesTable.id, id), eq(savedSearchesTable.userEmail, req.userEmail!)))
      .returning();

    if (updated.length === 0) {
      res.status(404).json({ error: "Saved search not found." });
      return;
    }

    res.json({ savedSearch: updated[0] });
  } catch (err) {
    console.error("[SavedSearches] PATCH error:", err);
    res.status(500).json({ error: "Failed to update saved search." });
  }
});

router.patch("/saved-searches/:id/touch", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid saved search ID." });
    return;
  }

  try {
    await db
      .update(savedSearchesTable)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(savedSearchesTable.id, id), eq(savedSearchesTable.userEmail, req.userEmail!)));
    res.json({ success: true });
  } catch (err) {
    console.error("[SavedSearches] PATCH touch error:", err);
    res.status(500).json({ error: "Failed to update lastUsedAt." });
  }
});

router.delete("/saved-searches/:id", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid saved search ID." });
    return;
  }

  try {
    const deleted = await db
      .delete(savedSearchesTable)
      .where(and(eq(savedSearchesTable.id, id), eq(savedSearchesTable.userEmail, req.userEmail!)))
      .returning({ id: savedSearchesTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Saved search not found." });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[SavedSearches] DELETE error:", err);
    res.status(500).json({ error: "Failed to delete saved search." });
  }
});

export default router;
