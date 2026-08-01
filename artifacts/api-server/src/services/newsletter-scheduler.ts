import cron from "node-cron";
import { generateNewsletter, generateBrief, saveNewsletter } from "./newsletter-generator.js";
import { dispatchNewsletter, dispatchBrief } from "./email-dispatch.js";
import { db, newslettersTable } from "@workspace/db";
import { sql } from "drizzle-orm";

/** True if any edition was sent in the last N days (avoids stacking sends
 *  when a special edition goes out near a scheduled publication). */
async function sentRecently(days: number): Promise<boolean> {
  const r = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(newslettersTable)
    .where(sql`sent_at IS NOT NULL AND sent_at > NOW() - make_interval(days => ${days})`);
  return (r[0]?.n ?? 0) > 0;
}

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
  console.log("[Newsletter Scheduler] Starting bi-weekly scheduler...");

  // ── Bi-weekly: one publication every other Monday at 07:00 UTC ──────────────
  // Fires every Monday; only even ISO weeks publish (exactly one email every
  // two weeks). When the publish Monday is also the month's first Monday, the
  // full AfriEnergy Insights deep-dive goes out; otherwise the quick Brief.
  cron.schedule("0 7 * * 1", async () => {
    const today = new Date();
    const weekNumber = getISOWeekNumber(today);
    if (weekNumber % 2 !== 0) {
      return; // off-week Monday — nothing publishes
    }
    if (await sentRecently(6)) {
      console.log("[Newsletter Scheduler] An edition already went out in the last 6 days (e.g. a special) — skipping this cycle.");
      return;
    }
    if (today.getDate() <= 7) {
      console.log(`[Newsletter Scheduler] Even week ${weekNumber}, first Monday of month — generating AfriEnergy Insights...`);
      await generateAndSendInsightsNewsletter();
    } else {
      console.log(`[Newsletter Scheduler] Even week ${weekNumber} — generating Africa Energy Brief...`);
      await generateAndSendBrief();
    }
  }, { timezone: "UTC" });

  console.log("[Newsletter Scheduler] Running — one publication every other Monday (even ISO weeks, 07:00 UTC)");
}
