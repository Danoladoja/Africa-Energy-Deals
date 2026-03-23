import { Router } from "express";
import { db, watchesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sessionAuthMiddleware, type AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

router.use("/watches", sessionAuthMiddleware as any);

router.get("/watches", async (req: AuthenticatedRequest, res) => {
  try {
    const watches = await db
      .select()
      .from(watchesTable)
      .where(eq(watchesTable.userEmail, req.userEmail!));
    res.json({ watches });
  } catch (err) {
    console.error("[Watches] GET error:", err);
    res.status(500).json({ error: "Failed to fetch watches." });
  }
});

router.post("/watches", async (req: AuthenticatedRequest, res) => {
  const { watchType, watchValue } = req.body as {
    watchType?: string;
    watchValue?: string;
  };

  const VALID_TYPES = ["country", "technology", "developer", "dealStage"];
  if (!watchType || !VALID_TYPES.includes(watchType)) {
    res.status(400).json({ error: `watchType must be one of: ${VALID_TYPES.join(", ")}` });
    return;
  }
  if (!watchValue || typeof watchValue !== "string" || !watchValue.trim()) {
    res.status(400).json({ error: "watchValue is required." });
    return;
  }

  try {
    const existing = await db
      .select({ id: watchesTable.id })
      .from(watchesTable)
      .where(
        and(
          eq(watchesTable.userEmail, req.userEmail!),
          eq(watchesTable.watchType, watchType),
          eq(watchesTable.watchValue, watchValue.trim())
        )
      )
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "Watch already exists.", id: existing[0].id });
      return;
    }

    const [watch] = await db
      .insert(watchesTable)
      .values({
        userEmail: req.userEmail!,
        watchType,
        watchValue: watchValue.trim(),
        lastCheckedAt: new Date(),
      })
      .returning();

    res.status(201).json({ watch });
  } catch (err) {
    console.error("[Watches] POST error:", err);
    res.status(500).json({ error: "Failed to create watch." });
  }
});

router.delete("/watches/:id", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid watch ID." });
    return;
  }

  try {
    const deleted = await db
      .delete(watchesTable)
      .where(and(eq(watchesTable.id, id), eq(watchesTable.userEmail, req.userEmail!)))
      .returning({ id: watchesTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Watch not found." });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[Watches] DELETE error:", err);
    res.status(500).json({ error: "Failed to delete watch." });
  }
});

router.get("/watches/bell-count", async (req: AuthenticatedRequest, res) => {
  try {
    const watches = await db
      .select()
      .from(watchesTable)
      .where(eq(watchesTable.userEmail, req.userEmail!));

    if (watches.length === 0) {
      res.json({ count: 0 });
      return;
    }

    const { projectsTable } = await import("@workspace/db");
    const { gte, or, inArray } = await import("drizzle-orm");

    const oldestCheck = watches.reduce(
      (min, w) => (w.lastCheckedAt < min ? w.lastCheckedAt : min),
      watches[0].lastCheckedAt
    );

    const allProjects = await db
      .select({
        id: projectsTable.id,
        country: projectsTable.country,
        technology: projectsTable.technology,
        developer: projectsTable.developer,
        dealStage: projectsTable.dealStage,
        createdAt: projectsTable.createdAt,
      })
      .from(projectsTable)
      .where(gte(projectsTable.createdAt, oldestCheck));

    let count = 0;
    for (const watch of watches) {
      for (const p of allProjects) {
        if (p.createdAt <= watch.lastCheckedAt) continue;
        if (watch.watchType === "country" && p.country === watch.watchValue) count++;
        else if (watch.watchType === "technology" && p.technology === watch.watchValue) count++;
        else if (watch.watchType === "developer" && p.developer === watch.watchValue) count++;
        else if (watch.watchType === "dealStage" && p.dealStage === watch.watchValue) count++;
      }
    }

    res.json({ count });
  } catch (err) {
    console.error("[Watches] Bell count error:", err);
    res.json({ count: 0 });
  }
});

router.post("/watches/mark-seen", async (req: AuthenticatedRequest, res) => {
  try {
    const now = new Date();
    const watches = await db
      .select({ id: watchesTable.id })
      .from(watchesTable)
      .where(eq(watchesTable.userEmail, req.userEmail!));

    for (const w of watches) {
      await db
        .update(watchesTable)
        .set({ lastCheckedAt: now })
        .where(eq(watchesTable.id, w.id));
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[Watches] Mark-seen error:", err);
    res.status(500).json({ error: "Failed to update watches." });
  }
});

export default router;
