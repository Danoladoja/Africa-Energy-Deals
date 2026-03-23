import { db, watchesTable, userEmailsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail, dealAlertEmail } from "./email.js";

interface ProjectData {
  id: number;
  projectName: string;
  country: string;
  technology: string;
  dealSizeUsdMn: number | null;
  developer?: string | null;
  dealStage?: string | null;
}

const APP_URL = process.env.APP_URL ?? "http://localhost:22663/energy-tracker";

export async function checkWatchesAndNotify(project: ProjectData): Promise<void> {
  try {
    const allWatches = await db.select().from(watchesTable);
    if (allWatches.length === 0) return;

    const matchedUsers = new Map<string, { watchType: string; watchValue: string }>();

    for (const watch of allWatches) {
      let matches = false;
      if (watch.watchType === "country" && project.country === watch.watchValue) matches = true;
      else if (watch.watchType === "technology" && project.technology === watch.watchValue) matches = true;
      else if (watch.watchType === "developer" && project.developer === watch.watchValue) matches = true;
      else if (watch.watchType === "dealStage" && project.dealStage === watch.watchValue) matches = true;

      if (matches && !matchedUsers.has(watch.userEmail)) {
        matchedUsers.set(watch.userEmail, { watchType: watch.watchType, watchValue: watch.watchValue });
      }
    }

    for (const [email, { watchType, watchValue }] of matchedUsers) {
      const html = dealAlertEmail(project, APP_URL, watchType, watchValue);
      await sendEmail(
        email,
        `New Deal Alert: ${project.projectName} in ${project.country}`,
        html
      );
    }

    if (matchedUsers.size > 0) {
      console.log(`[Notifications] Sent deal alerts to ${matchedUsers.size} user(s) for project: ${project.projectName}`);
    }
  } catch (err) {
    console.error("[Notifications] Error checking watches:", err);
  }
}
