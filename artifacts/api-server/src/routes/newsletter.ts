import { Router, type IRouter, type Request, type Response } from "express";
import { db, newslettersTable, userEmailsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { generateNewsletter, saveNewsletter } from "../services/newsletter-generator.js";
import { dispatchNewsletter } from "../services/email-dispatch.js";
import { isValidAdminToken } from "../middleware/adminAuth.js";

function requireAdmin(req: Request, res: Response): boolean {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const headerPw = req.headers["x-admin-password"] as string | undefined;
  if ((bearer && isValidAdminToken(bearer)) || (process.env.ADMIN_PASSWORD && headerPw === process.env.ADMIN_PASSWORD)) {
    return true;
  }
  res.status(401).json({ error: "Unauthorized" });
  return false;
}

const router: IRouter = Router();

// GET /api/newsletters — list all newsletters (paginated)
router.get("/newsletters", async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(20, parseInt(req.query.limit as string) || 10);
    const offset = (page - 1) * limit;

    const newsletters = await db
      .select({
        id: newslettersTable.id,
        editionNumber: newslettersTable.editionNumber,
        title: newslettersTable.title,
        executiveSummary: newslettersTable.executiveSummary,
        spotlightSector: newslettersTable.spotlightSector,
        spotlightCountry: newslettersTable.spotlightCountry,
        projectsAnalyzed: newslettersTable.projectsAnalyzed,
        totalInvestmentCovered: newslettersTable.totalInvestmentCovered,
        generatedAt: newslettersTable.generatedAt,
        sentAt: newslettersTable.sentAt,
        status: newslettersTable.status,
        recipientCount: newslettersTable.recipientCount,
      })
      .from(newslettersTable)
      .orderBy(desc(newslettersTable.editionNumber))
      .limit(limit)
      .offset(offset);

    res.json({ newsletters, page, limit });
  } catch (err) {
    console.error("[Newsletter] List error:", err);
    res.status(500).json({ error: "Failed to fetch newsletters" });
  }
});

// GET /api/newsletters/latest — get most recent newsletter
router.get("/newsletters/latest", async (_req: Request, res: Response): Promise<void> => {
  try {
    const [newsletter] = await db
      .select()
      .from(newslettersTable)
      .orderBy(desc(newslettersTable.editionNumber))
      .limit(1);

    if (!newsletter) {
      res.status(404).json({ error: "No newsletters found" });
      return;
    }
    res.json(newsletter);
  } catch (err) {
    console.error("[Newsletter] Latest error:", err);
    res.status(500).json({ error: "Failed to fetch latest newsletter" });
  }
});

// GET /api/newsletters/:id — get specific newsletter
router.get("/newsletters/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid newsletter ID" });
      return;
    }
    const [newsletter] = await db
      .select()
      .from(newslettersTable)
      .where(eq(newslettersTable.id, id))
      .limit(1);

    if (!newsletter) {
      res.status(404).json({ error: "Newsletter not found" });
      return;
    }
    res.json(newsletter);
  } catch (err) {
    console.error("[Newsletter] Get error:", err);
    res.status(500).json({ error: "Failed to fetch newsletter" });
  }
});

// POST /api/newsletters/subscribe — subscribe email
router.post("/newsletters/subscribe", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: "Valid email is required" });
    return;
  }

  try {
    const crypto = await import("crypto");
    const token = crypto.randomUUID();

    await db
      .update(userEmailsTable)
      .set({ newsletterOptIn: true, unsubscribeToken: token })
      .where(eq(userEmailsTable.email, email.trim().toLowerCase()));

    res.json({ success: true });
  } catch (err) {
    console.error("[Newsletter] Subscribe error:", err);
    res.status(500).json({ error: "Failed to update subscription" });
  }
});

// GET /api/newsletter/unsubscribe?token=... — one-click unsubscribe
router.get("/newsletter/unsubscribe", async (req: Request, res: Response): Promise<void> => {
  const { token } = req.query;
  if (!token || typeof token !== "string") {
    res.status(400).send("Invalid unsubscribe link.");
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(userEmailsTable)
      .where(eq(userEmailsTable.unsubscribeToken, token))
      .limit(1);

    if (!user) {
      res.status(404).send("Unsubscribe link not found or already used.");
      return;
    }

    await db
      .update(userEmailsTable)
      .set({ newsletterOptIn: false })
      .where(eq(userEmailsTable.unsubscribeToken, token));

    res.send(`<!DOCTYPE html>
<html><head><title>Unsubscribed — AfriEnergy Insights</title>
<style>body{font-family:Arial,sans-serif;background:#0b0f1a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:40px;max-width:480px;text-align:center;}
h1{color:#00e676;margin:0 0 16px;}p{color:#94a3b8;line-height:1.6;}a{color:#00e676;}</style></head>
<body><div class="card">
<h1>✓ Unsubscribed</h1>
<p>You've been unsubscribed from AfriEnergy Insights.</p>
<p>You can <a href="https://afrienergytracker.io/energy-tracker/insights">re-subscribe anytime</a> from the Insights page.</p>
</div></body></html>`);
  } catch (err) {
    console.error("[Newsletter] Unsubscribe error:", err);
    res.status(500).send("An error occurred. Please try again.");
  }
});

// POST /api/admin/newsletter/preview — generate without sending (admin only)
router.post("/admin/newsletter/preview", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const newsletter = await generateNewsletter(7);
    const id = await saveNewsletter(newsletter);
    res.json({ ...newsletter, id, status: "preview" });
  } catch (err: any) {
    console.error("[Newsletter] Preview error:", err);
    res.status(500).json({ error: err.message ?? "Generation failed" });
  }
});

// POST /api/admin/newsletter/generate — generate and send (admin only)
router.post("/admin/newsletter/generate", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const newsletter = await generateNewsletter(7);
    const id = await saveNewsletter(newsletter);
    const recipientCount = await dispatchNewsletter(id);
    res.json({ ...newsletter, id, recipientCount, status: "sent" });
  } catch (err: any) {
    console.error("[Newsletter] Generate error:", err);
    res.status(500).json({ error: err.message ?? "Generation failed" });
  }
});

// GET /api/admin/subscribers — subscriber stats (admin only)
router.get("/admin/subscribers", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(userEmailsTable);
    const [{ opted }] = await db
      .select({ opted: sql<number>`count(*)::int` })
      .from(userEmailsTable)
      .where(eq(userEmailsTable.newsletterOptIn, true));
    const recent = await db
      .select({
        id: userEmailsTable.id,
        email: userEmailsTable.email,
        role: userEmailsTable.role,
        newsletterOptIn: userEmailsTable.newsletterOptIn,
        newsletterFrequency: userEmailsTable.newsletterFrequency,
        createdAt: userEmailsTable.createdAt,
        lastNewsletterSentAt: userEmailsTable.lastNewsletterSentAt,
      })
      .from(userEmailsTable)
      .orderBy(desc(userEmailsTable.createdAt))
      .limit(50);
    res.json({ total, optedIn: opted, optedOut: total - opted, subscribers: recent });
  } catch (err) {
    console.error("[Newsletter] Subscribers error:", err);
    res.status(500).json({ error: "Failed to fetch subscribers" });
  }
});

export default router;
