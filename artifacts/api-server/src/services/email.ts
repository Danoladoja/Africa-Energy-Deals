import { BrevoClient } from "@getbrevo/brevo";

const FROM_NAME  = "AfriEnergy Tracker";
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL ?? "noreply@afrienergytracker.io";

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!process.env.BREVO_API_KEY) {
    console.log(`[Email] (no BREVO_API_KEY configured — would send to ${to})`);
    console.log(`[Email] Subject: ${subject}`);
    console.log(`[Email] HTML: ${html.replace(/<[^>]+>/g, " ").trim().slice(0, 300)}`);
    return;
  }

  try {
    const brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });
    await brevo.transactionalEmails.sendTransacEmail({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    });
    console.log(`[Email] Sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`[Email] Unexpected error sending to ${to}:`, err);
    throw new Error(`Failed to send email to ${to}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function magicLinkEmail(link: string, appUrl: string): string {
  return `
    <div style="font-family:Arial,sans-serif;background:#0b0f1a;color:#e2e8f0;padding:32px;max-width:520px;margin:0 auto;border-radius:12px;">
      <h1 style="color:#00e676;font-size:22px;margin:0 0 8px;">Sign in to AfriEnergy Tracker</h1>
      <p style="color:#94a3b8;margin:0 0 24px;">Click the button below to sign in. This link expires in 1 hour.</p>
      <a href="${link}" style="display:inline-block;background:#00e676;color:#0b0f1a;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">Sign In →</a>
      <p style="color:#475569;font-size:12px;margin:24px 0 0;">Or copy this link: <span style="color:#64748b;">${link}</span></p>
      <p style="color:#475569;font-size:11px;margin:16px 0 0;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;
}

export function dealAlertEmail(project: {
  projectName: string;
  country: string;
  technology: string;
  dealSizeUsdMn: number | null;
  id: number;
}, appUrl: string, watchType: string, watchValue: string): string {
  const size = project.dealSizeUsdMn
    ? `$${project.dealSizeUsdMn >= 1000 ? `${(project.dealSizeUsdMn / 1000).toFixed(1)}B` : `${project.dealSizeUsdMn.toFixed(0)}M`}`
    : "Undisclosed";
  const link = `${appUrl}/deals/${project.id}`;

  return `
    <div style="font-family:Arial,sans-serif;background:#0b0f1a;color:#e2e8f0;padding:32px;max-width:520px;margin:0 auto;border-radius:12px;">
      <div style="background:#00e67620;border:1px solid #00e67640;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
        <span style="color:#00e676;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">🔔 New Deal Alert</span>
        <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Matching your watch: <strong style="color:#e2e8f0;">${watchType} — ${watchValue}</strong></p>
      </div>
      <h2 style="color:#f1f5f9;font-size:18px;margin:0 0 12px;">${project.projectName}</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="color:#64748b;font-size:13px;padding:6px 0;">Country</td><td style="color:#e2e8f0;font-size:13px;text-align:right;">${project.country}</td></tr>
        <tr><td style="color:#64748b;font-size:13px;padding:6px 0;">Technology</td><td style="color:#e2e8f0;font-size:13px;text-align:right;">${project.technology}</td></tr>
        <tr><td style="color:#64748b;font-size:13px;padding:6px 0;">Deal Size</td><td style="color:#00e676;font-size:13px;font-weight:700;text-align:right;">${size}</td></tr>
      </table>
      <a href="${link}" style="display:inline-block;background:#00e676;color:#0b0f1a;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">View Deal Details →</a>
      <p style="color:#475569;font-size:11px;margin:20px 0 0;">You're receiving this because you set up a watch on AfriEnergy Tracker. <a href="${appUrl}/watches" style="color:#64748b;">Manage your watches</a></p>
    </div>
  `;
}
