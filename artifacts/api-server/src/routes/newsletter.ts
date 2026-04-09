import { Router, type IRouter, type Request, type Response } from "express";
import { db, newslettersTable, userEmailsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { generateNewsletter, generateBrief, saveNewsletter, reviseNewsletter, markdownToHtml } from "../services/newsletter-generator.js";
import { dispatchNewsletter, dispatchBrief, buildFullEmailHtml } from "../services/email-dispatch.js";
import { adminAuthMiddleware } from "../middleware/adminAuth.js";

function parseNewsletterSections(markdown: string): Array<{ heading: string; body: string; index: number }> {
  const sections: Array<{ heading: string; body: string; index: number }> = [];
  const lines = markdown.split("\n");
  let currentSection = { heading: "", body: "", index: 0 };
  let sectionIndex = 0;
  for (const line of lines) {
    if (line.match(/^##\s+\d+\.\s+/)) {
      if (currentSection.heading) sections.push({ ...currentSection });
      currentSection = { heading: line.replace(/^##\s+/, ""), body: "", index: sectionIndex++ };
    } else {
      currentSection.body += line + "\n";
    }
  }
  if (currentSection.heading) sections.push(currentSection);
  return sections;
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
        type: newslettersTable.type,
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
        type: newslettersTable.type,
      })
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
      .select({
        id: newslettersTable.id,
        editionNumber: newslettersTable.editionNumber,
        title: newslettersTable.title,
        content: newslettersTable.content,
        contentHtml: newslettersTable.contentHtml,
        executiveSummary: newslettersTable.executiveSummary,
        spotlightSector: newslettersTable.spotlightSector,
        spotlightCountry: newslettersTable.spotlightCountry,
        projectsAnalyzed: newslettersTable.projectsAnalyzed,
        totalInvestmentCovered: newslettersTable.totalInvestmentCovered,
        generatedAt: newslettersTable.generatedAt,
        sentAt: newslettersTable.sentAt,
        status: newslettersTable.status,
        recipientCount: newslettersTable.recipientCount,
        type: newslettersTable.type,
      })
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

// ─── Async job store ────────────────────────────────────────────────────────
type JobStatus = "running" | "done" | "error";
interface Job {
  status: JobStatus;
  result?: Record<string, unknown>;
  error?: string;
  startedAt: number;
}
const jobs = new Map<string, Job>();

// Prune jobs older than 1 hour to avoid memory leaks
function pruneOldJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.startedAt < cutoff) jobs.delete(id);
  }
}

function makeJobId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// GET /api/admin/newsletter/job/:jobId — poll generation status (admin only)
router.get("/admin/newsletter/job/:jobId", adminAuthMiddleware, (req: Request, res: Response): void => {
  const job = jobs.get(req.params.jobId);
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  if (job.status === "running") { res.json({ status: "running" }); return; }
  if (job.status === "error") { res.status(500).json({ status: "error", error: job.error }); return; }
  res.json({ status: "done", ...job.result });
});

// POST /api/admin/newsletter/preview — generate monthly Insights without sending (admin only, async)
router.post("/admin/newsletter/preview", adminAuthMiddleware, (req: Request, res: Response): void => {
  pruneOldJobs();
  const jobId = makeJobId();
  jobs.set(jobId, { status: "running", startedAt: Date.now() });
  res.json({ jobId, status: "running" });

  (async () => {
    try {
      const newsletter = await generateNewsletter(30);
      const id = await saveNewsletter(newsletter);
      jobs.set(jobId, {
        status: "done",
        startedAt: jobs.get(jobId)!.startedAt,
        result: { ...newsletter, id, status: "preview" },
      });
      console.log(`[Newsletter] Preview job ${jobId} completed — edition #${newsletter.editionNumber}`);
    } catch (err: any) {
      console.error(`[Newsletter] Preview job ${jobId} failed:`, err);
      jobs.set(jobId, { status: "error", startedAt: jobs.get(jobId)!.startedAt, error: err.message ?? "Generation failed" });
    }
  })();
});

// POST /api/admin/newsletter/generate — generate monthly Insights and send (admin only, async)
router.post("/admin/newsletter/generate", adminAuthMiddleware, (req: Request, res: Response): void => {
  pruneOldJobs();
  const jobId = makeJobId();
  jobs.set(jobId, { status: "running", startedAt: Date.now() });
  res.json({ jobId, status: "running" });

  (async () => {
    try {
      const newsletter = await generateNewsletter(30);
      const id = await saveNewsletter(newsletter);
      const recipientCount = await dispatchNewsletter(id);
      jobs.set(jobId, {
        status: "done",
        startedAt: jobs.get(jobId)!.startedAt,
        result: { ...newsletter, id, recipientCount, status: "sent" },
      });
      console.log(`[Newsletter] Send job ${jobId} completed — sent to ${recipientCount} subscribers`);
    } catch (err: any) {
      console.error(`[Newsletter] Send job ${jobId} failed:`, err);
      jobs.set(jobId, { status: "error", startedAt: jobs.get(jobId)!.startedAt, error: err.message ?? "Generation failed" });
    }
  })();
});

// POST /api/admin/newsletter/preview-brief — generate Africa Energy Brief without sending (admin only, async)
router.post("/admin/newsletter/preview-brief", adminAuthMiddleware, (req: Request, res: Response): void => {
  pruneOldJobs();
  const jobId = makeJobId();
  jobs.set(jobId, { status: "running", startedAt: Date.now() });
  res.json({ jobId, status: "running" });

  (async () => {
    try {
      const brief = await generateBrief(14);
      const id = await saveNewsletter(brief);
      jobs.set(jobId, {
        status: "done",
        startedAt: jobs.get(jobId)!.startedAt,
        result: { ...brief, id, status: "preview" },
      });
      console.log(`[Brief] Preview job ${jobId} completed — edition #${brief.editionNumber}`);
    } catch (err: any) {
      console.error(`[Brief] Preview job ${jobId} failed:`, err);
      jobs.set(jobId, { status: "error", startedAt: jobs.get(jobId)!.startedAt, error: err.message ?? "Generation failed" });
    }
  })();
});

// POST /api/admin/newsletter/generate-brief — generate and send Africa Energy Brief (admin only, async)
router.post("/admin/newsletter/generate-brief", adminAuthMiddleware, (req: Request, res: Response): void => {
  pruneOldJobs();
  const jobId = makeJobId();
  jobs.set(jobId, { status: "running", startedAt: Date.now() });
  res.json({ jobId, status: "running" });

  (async () => {
    try {
      const brief = await generateBrief(14);
      const id = await saveNewsletter(brief);
      const recipientCount = await dispatchBrief(id);
      jobs.set(jobId, {
        status: "done",
        startedAt: jobs.get(jobId)!.startedAt,
        result: { ...brief, id, recipientCount, status: "sent" },
      });
      console.log(`[Brief] Send job ${jobId} completed — sent to ${recipientCount} subscribers`);
    } catch (err: any) {
      console.error(`[Brief] Send job ${jobId} failed:`, err);
      jobs.set(jobId, { status: "error", startedAt: jobs.get(jobId)!.startedAt, error: err.message ?? "Generation failed" });
    }
  })();
});

// ─── Editorial Workflow Endpoints ────────────────────────────────────────────

// GET /api/admin/newsletter/:id/full — full content + sections + preview HTML
router.get("/admin/newsletter/:id/full", adminAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid newsletter ID" }); return; }
  try {
    const [nl] = await db
      .select({
        id: newslettersTable.id,
        editionNumber: newslettersTable.editionNumber,
        title: newslettersTable.title,
        content: newslettersTable.content,
        contentHtml: newslettersTable.contentHtml,
        executiveSummary: newslettersTable.executiveSummary,
        spotlightSector: newslettersTable.spotlightSector,
        spotlightCountry: newslettersTable.spotlightCountry,
        projectsAnalyzed: newslettersTable.projectsAnalyzed,
        totalInvestmentCovered: newslettersTable.totalInvestmentCovered,
        generatedAt: newslettersTable.generatedAt,
        sentAt: newslettersTable.sentAt,
        status: newslettersTable.status,
        recipientCount: newslettersTable.recipientCount,
        type: newslettersTable.type,
      })
      .from(newslettersTable)
      .where(eq(newslettersTable.id, id))
      .limit(1);

    if (!nl) { res.status(404).json({ error: "Newsletter not found" }); return; }

    const previewHtml = buildFullEmailHtml({
      title: nl.title,
      content: nl.content ?? "",
      contentHtml: nl.contentHtml,
      editionNumber: nl.editionNumber,
      id: nl.id,
      type: nl.type,
    });

    res.json({
      ...nl,
      sections: parseNewsletterSections(nl.content ?? ""),
      previewHtml,
    });
  } catch (err) {
    console.error("[Newsletter] Full get error:", err);
    res.status(500).json({ error: "Failed to fetch newsletter" });
  }
});

// PUT /api/admin/newsletter/:id/content — save manual edits
router.put("/admin/newsletter/:id/content", adminAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid newsletter ID" }); return; }
  const { content, title } = req.body ?? {};
  if (!content) { res.status(400).json({ error: "content is required" }); return; }

  try {
    const [existing] = await db
      .select({ editionNumber: newslettersTable.editionNumber, type: newslettersTable.type, title: newslettersTable.title })
      .from(newslettersTable)
      .where(eq(newslettersTable.id, id))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    const contentHtml = markdownToHtml(content);
    const finalTitle = title ?? existing.title;

    await db.execute(sql`
      UPDATE newsletters SET content = ${content}, content_html = ${contentHtml}, title = ${finalTitle}
      WHERE id = ${id}
    `);

    const previewHtml = buildFullEmailHtml({
      title: finalTitle,
      content,
      contentHtml,
      editionNumber: existing.editionNumber,
      id,
      type: existing.type,
    });

    res.json({ success: true, contentHtml, previewHtml });
  } catch (err) {
    console.error("[Newsletter] Content update error:", err);
    res.status(500).json({ error: "Failed to save content" });
  }
});

// POST /api/admin/newsletter/:id/revise — AI-powered revision
router.post("/admin/newsletter/:id/revise", adminAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid newsletter ID" }); return; }
  const { instruction, sectionIndex } = req.body ?? {};
  if (!instruction) { res.status(400).json({ error: "instruction is required" }); return; }

  try {
    const [nl] = await db
      .select({
        content: newslettersTable.content,
        title: newslettersTable.title,
        editionNumber: newslettersTable.editionNumber,
        type: newslettersTable.type,
      })
      .from(newslettersTable)
      .where(eq(newslettersTable.id, id))
      .limit(1);
    if (!nl) { res.status(404).json({ error: "Not found" }); return; }

    const revisedContent = await reviseNewsletter(
      nl.content ?? "",
      instruction,
      sectionIndex,
      nl.type ?? undefined
    );

    const contentHtml = markdownToHtml(revisedContent);

    await db.execute(sql`
      UPDATE newsletters SET content = ${revisedContent}, content_html = ${contentHtml} WHERE id = ${id}
    `);

    const previewHtml = buildFullEmailHtml({
      title: nl.title,
      content: revisedContent,
      contentHtml,
      editionNumber: nl.editionNumber,
      id,
      type: nl.type,
    });

    res.json({
      success: true,
      content: revisedContent,
      contentHtml,
      previewHtml,
      sections: parseNewsletterSections(revisedContent),
    });
  } catch (err: any) {
    console.error("[Newsletter] Revise error:", err);
    res.status(500).json({ error: "Revision failed: " + (err.message ?? "Unknown error") });
  }
});

// POST /api/admin/newsletter/:id/send — approve and dispatch a draft
router.post("/admin/newsletter/:id/send", adminAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid newsletter ID" }); return; }

  try {
    const [nl] = await db
      .select({ status: newslettersTable.status })
      .from(newslettersTable)
      .where(eq(newslettersTable.id, id))
      .limit(1);
    if (!nl) { res.status(404).json({ error: "Newsletter not found" }); return; }
    if (nl.status === "sent") { res.status(400).json({ error: "Already sent" }); return; }

    const sent = await dispatchNewsletter(id);

    res.json({ success: sent > 0, sent, failed: 0, errors: [] });
  } catch (err: any) {
    console.error("[Newsletter] Send error:", err);
    res.status(500).json({ error: "Send failed: " + (err.message ?? "Unknown error") });
  }
});

// GET /api/admin/subscribers — subscriber stats (admin only)
router.get("/admin/subscribers", adminAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
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
