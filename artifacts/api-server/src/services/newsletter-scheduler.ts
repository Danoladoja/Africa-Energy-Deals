import cron from "node-cron";
import { generateNewsletter, generateBrief, saveNewsletter } from "./newsletter-generator.js";
import { dispatchNewsletter, dispatchBrief } from "./email-dispatch.js";

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export async function generateAndSendInsightsNewsletter(): Promise<void> {
  console.log("[Newsletter Scheduler] Generating monthly AfriEnergy Insights...");
  try {
    const newsletter = await generateNewsletter(30);
    const id = await saveNewsletter(newsletter);
    const recipientCount = await dispatchNewsletter(id);
    console.log(`[Newsletter Scheduler] Monthly Insights #${newsletter.editionNumber} sent to ${recipientCount} subscribers`);
  } catch (error) {
    console.error("[Newsletter Scheduler] Monthly Insights generation failed:", error);
  }
}

export async function generateAndSendBrief(): Promise<void> {
  console.log("[Newsletter Scheduler] Generating biweekly Africa Energy Brief...");
  try {
    const brief = await generateBrief(14);
    const id = await saveNewsletter(brief);
    const recipientCount = await dispatchBrief(id);
    console.log(`[Newsletter Scheduler] Brief #${brief.editionNumber} sent to ${recipientCount} subscribers`);
  } catch (error) {
    console.error("[Newsletter Scheduler] Brief generation failed:", error);
  }
}

export function startNewsletterScheduler(): void {
  console.log("[Newsletter Scheduler] Starting dual-publication scheduler...");

  // ── Monthly: First Monday of each month at 7:00 AM UTC ──────────────────────
  // Fires every Monday; guard checks if it's the first Monday (date <= 7)
  cron.schedule("0 7 * * 1", async () => {
    const today = new Date();
    if (today.getDate() <= 7) {
      console.log("[Newsletter Scheduler] First Monday of month — generating AfriEnergy Insights...");
      await generateAndSendInsightsNewsletter();
    }
  }, { timezone: "UTC" });

  // ── Biweekly: Even ISO week Mondays (not first Monday) at 7:00 AM UTC ───────
  // Alternates every other Monday; skips first Monday (that's the Insights day)
  cron.schedule("0 7 * * 1", async () => {
    const today = new Date();
    const isFirstMonday = today.getDate() <= 7;
    if (isFirstMonday) {
      return; // Monthly Insights day — skip Brief
    }
    const weekNumber = getISOWeekNumber(today);
    if (weekNumber % 2 === 0) {
      console.log(`[Newsletter Scheduler] Even week ${weekNumber} — generating Africa Energy Brief...`);
      await generateAndSendBrief();
    }
  }, { timezone: "UTC" });

  console.log("[Newsletter Scheduler] Running — Monthly Insights (1st Monday) + Biweekly Brief (even-week Mondays)");
}
