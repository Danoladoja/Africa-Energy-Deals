import { Router } from "express";
import { db, userEmailsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.post("/auth/email", async (req, res) => {
  const { email } = req.body as { email?: string };

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }

  try {
    const existing = await db
      .select({ id: userEmailsTable.id })
      .from(userEmailsTable)
      .where(eq(userEmailsTable.email, trimmed))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(userEmailsTable)
        .set({ lastSeenAt: new Date() })
        .where(eq(userEmailsTable.email, trimmed));
    } else {
      await db.insert(userEmailsTable).values({ email: trimmed });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving email:", err);
    res.status(500).json({ error: "Failed to register email." });
  }
});

export default router;
