import cron from "node-cron";
import { generateNewsletter, saveNewsletter } from "./newsletter-generator.js";
import { dispatchNewsletter } from "./email-dispatch.js";

export function startNewsletterScheduler(): void {
  const frequency = process.env.NEWSLETTER_FREQUENCY ?? "weekly";
  const sendDay = parseInt(process.env.NEWSLETTER_SEND_DAY ?? "1"); // 0=Sun, 1=Mon
  const sendHour = parseInt(process.env.NEWSLETTER_SEND_HOUR ?? "7"); // 7 AM UTC

  let cronExpression: string;
  switch (frequency) {
    case "biweekly":
      // Every two weeks — first and third Monday of the month
      cronExpression = `0 ${sendHour} 1-14 * ${sendDay}`;
      break;
    case "monthly":
      // First Monday of the month
      cronExpression = `0 ${sendHour} 1-7 * ${sendDay}`;
      break;
    default:
      // Weekly
      cronExpression = `0 ${sendHour} * * ${sendDay}`;
  }

  console.log(`[Newsletter Scheduler] Scheduling ${frequency} newsletter (cron: ${cronExpression})`);

  cron.schedule(cronExpression, async () => {
    console.log("[Newsletter] Starting scheduled generation...");
    try {
      const newsletter = await generateNewsletter(7);
      const id = await saveNewsletter(newsletter);
      const recipientCount = await dispatchNewsletter(id);
      console.log(`[Newsletter] Edition #${newsletter.editionNumber} sent to ${recipientCount} subscribers`);
    } catch (error) {
      console.error("[Newsletter] Scheduled generation failed:", error);
    }
  }, { timezone: "UTC" });

  console.log("[Newsletter Scheduler] Running");
}
