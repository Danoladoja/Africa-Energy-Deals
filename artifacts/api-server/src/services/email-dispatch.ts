import { BrevoClient } from "@getbrevo/brevo";
import { markdownToHtml } from "./newsletter-generator.js";
import { db, userEmailsTable, newslettersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SENDER_INSIGHTS = { name: "AfriEnergy Insights", email: "insights@afrienergytracker.io" };
const SENDER_BRIEF    = { name: "AfriEnergy Brief",    email: "brief@afrienergytracker.io" };


function buildNewsletterEmailHtml(newsletter: {
  title: string;
  content: string;
  contentHtml?: string | null;
  editionNumber: number;
  id: number;
  isAiGenerated?: boolean; // false for hand-written special editions
}): string {
  const bodyContent = newsletter.contentHtml ?? markdownToHtml(newsletter.content);
  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Africa/Lagos" });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${newsletter.title}</title>
<style>
  img { max-width:100% !important; height:auto !important; display:block; }
  @media only screen and (max-width:620px) {
    .outer-td { padding:0 !important; }
    .content-td { padding:26px 18px !important; }
    .masthead-td { padding:14px 0 14px !important; }
    .title-td { padding:16px 18px !important; }
    .footer-td { padding:22px 18px !important; }
    .masthead-badge { display:none !important; }
    .masthead-img { width:250px !important; }
    h2 { font-size:19px !important; margin:30px 0 12px !important; }
    h3 { font-size:16px !important; }
    p, li { font-size:16px !important; line-height:1.75 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#e8ecf0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#e8ecf0;">
<tr><td class="outer-td" align="center" style="padding:32px 16px 48px;">
<table width="100%" style="max-width:620px;" cellpadding="0" cellspacing="0">

  <!-- HEADER: the ONLY dark surface is the banner image itself (accent strip,
       eyebrow, wordmark all baked in) — Gmail dark mode cannot take it apart.
       Everything below is light-by-design so forced inversion stays coherent. -->
  <tr><td class="masthead-td" style="padding:0;font-size:0;line-height:0;">
    <img src="https://afrienergytracker.io/email/banner-insights.png" width="600" height="165" alt="Africa Energy Pulse — AfriEnergy Insights"
         style="display:block;border:0;outline:none;text-decoration:none;width:100%;height:auto;" />
  </td></tr>
  <tr><td style="background:#f8fafc;padding:10px 44px;border-bottom:1px solid #e2e8f0;">
    <p style="margin:0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${newsletter.isAiGenerated === false ? "Special Edition" : "Edition #" + newsletter.editionNumber} &nbsp;·&nbsp; ${dateStr}</p>
  </td></tr>

  <!-- TITLE BAND (light by design) -->
  <tr><td class="title-td" style="background:#f0fdf9;padding:18px 44px;border-left:4px solid #10b981;border-bottom:1px solid #e2e8f0;">
    <p style="margin:0;color:#0f172a;font-size:17px;font-weight:800;line-height:1.4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-0.2px;">${newsletter.title}</p>
  </td></tr>

  <!-- CONTENT BODY -->
  <tr><td class="content-td" style="background:#ffffff;padding:44px 44px 36px;">
    ${bodyContent}
  </td></tr>

  <!-- AI DISCLAIMER -->
  <tr><td style="background:#fffdf5;border-top:1px solid #fef3c7;border-bottom:1px solid #fef3c7;padding:14px 44px;">
    <table cellpadding="0" cellspacing="0">
      <tr>
        ${newsletter.isAiGenerated === false ? `
        <td style="vertical-align:top;padding-right:10px;font-size:15px;line-height:1;">✍️</td>
        <td style="color:#78350f;font-size:12px;line-height:1.6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
          <strong style="color:#92400e;">Written by Daniel Oladoja</strong>, Founder, AfriEnergy Tracker. Figures verified against the live database at time of writing.
        </td>` : `
        <td style="vertical-align:top;padding-right:10px;font-size:15px;line-height:1;">⚠️</td>
        <td style="color:#78350f;font-size:12px;line-height:1.6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
          <strong style="color:#92400e;">AI-Generated Analysis:</strong> Content produced by Claude AI from the AfriEnergy Tracker database. Grounded in real tracked project data — always verify critical figures before making investment or policy decisions.
        </td>`}
      </tr>
    </table>
  </td></tr>

  <!-- FOOTER -->
  <!-- FOOTER (light by design — inverts gracefully in dark-mode clients) -->
  <tr><td class="footer-td" style="background:#f8fafc;border-top:2px solid #10b981;border-radius:0 0 4px 4px;padding:26px 44px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:top;">
          <p style="margin:0;color:#0f172a;font-size:13px;font-weight:700;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">AfriEnergy Tracker</p>
          <p style="margin:3px 0 0;color:#64748b;font-size:12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">by Africa Energy Pulse</p>
          <p style="margin:12px 0 0;color:#64748b;font-size:12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">You're receiving this as a subscriber to AfriEnergy Insights.</p>
        </td>
        <td align="right" style="vertical-align:top;padding-left:20px;white-space:nowrap;">
          <a href="https://afrienergytracker.io/insights" style="color:#0d9488;font-size:12px;font-weight:700;text-decoration:none;display:block;margin-bottom:10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">View on web →</a>
          <a href="{{UNSUBSCRIBE_URL}}" style="color:#64748b;font-size:11px;text-decoration:underline;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Unsubscribe</a>
        </td>
      </tr>
    </table>
    <div style="height:1px;background:#e2e8f0;margin:20px 0 16px;">&nbsp;</div>
    <p style="margin:0;color:#94a3b8;font-size:11px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
      © ${new Date().getFullYear()} Africa Energy Pulse &nbsp;·&nbsp; <a href="https://afrienergytracker.io" style="color:#0d9488;text-decoration:none;">afrienergytracker.io</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>

</body>
</html>`;
}

function buildBriefEmailHtml(newsletter: {
  isAiGenerated?: boolean;
  title: string;
  content: string;
  contentHtml?: string | null;
  editionNumber: number;
}): string {
  const bodyContent = newsletter.contentHtml ?? markdownToHtml(newsletter.content);
  const dateStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "Africa/Lagos" });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${newsletter.title}</title>
<style>
  img { max-width:100% !important; height:auto !important; display:block; }
  @media only screen and (max-width:620px) {
    .brief-outer { padding:0 !important; }
    .brief-header { padding:12px 0 12px !important; }
    .brief-content { padding:26px 18px !important; }
    .brief-footer { padding:18px 18px !important; }
    .masthead-badge { display:none !important; }
    .masthead-img { width:230px !important; }
    h2 { font-size:19px !important; margin:30px 0 12px !important; }
    h3 { font-size:16px !important; }
    p, li { font-size:16px !important; line-height:1.75 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#eaecef;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#eaecef;">
<tr><td class="brief-outer" align="center" style="padding:28px 16px 44px;">
<table width="100%" style="max-width:600px;" cellpadding="0" cellspacing="0">

  <!-- Dual-tone top strip -->
  <!-- Accent strip is baked into the banner image (a bare two-cell row here
       once turned the whole email into a 2-column table — never again) -->

  <!-- COMPACT HEADER -->
  <!-- HEADER: the ONLY dark surface is the banner image itself (accent strip,
       eyebrow, wordmark all baked in) — Gmail dark mode cannot take it apart.
       Everything below is light-by-design so forced inversion stays coherent. -->
  <tr><td class="brief-header" style="padding:0;font-size:0;line-height:0;">
    <img src="https://afrienergytracker.io/email/banner-brief.png" width="600" height="112" alt="Africa Energy Pulse — AfriEnergy Brief"
         style="display:block;border:0;outline:none;text-decoration:none;width:100%;height:auto;" />
  </td></tr>
  <tr><td style="background:#f8fafc;padding:9px 36px;border-bottom:1px solid #e2e8f0;">
    <p style="margin:0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${newsletter.isAiGenerated === false ? "Special Edition" : "Biweekly Update"} &nbsp;·&nbsp; ${dateStr}</p>
  </td></tr>

  <!-- TITLE BAND (light by design) -->
  <tr><td style="background:#f0fdf9;padding:13px 36px;border-left:4px solid #10b981;border-bottom:1px solid #e2e8f0;">
    <p style="margin:0;color:#0f172a;font-size:15px;font-weight:800;line-height:1.4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-0.1px;">${newsletter.title}</p>
  </td></tr>

  <!-- CONTENT -->
  <tr><td class="brief-content" style="background:#ffffff;padding:32px 36px;">
    ${bodyContent}
  </td></tr>

  <!-- DISCLAIMER -->
  <tr><td style="background:#f8f9fb;border-top:1px solid #e2e8f0;padding:12px 36px;">
    <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
      ${newsletter.isAiGenerated === false
        ? `✍️ <strong style="color:#64748b;">Written by Daniel Oladoja</strong>, Founder, AfriEnergy Tracker.`
        : `⚠️ <strong style="color:#64748b;">AI-generated briefing</strong> from AfriEnergy Tracker data. Verify critical figures before decisions.`}
    </p>
  </td></tr>

  <!-- FOOTER -->
  <!-- FOOTER (light by design — inverts gracefully in dark-mode clients) -->
  <tr><td class="brief-footer" style="background:#f8fafc;border-top:2px solid #10b981;border-radius:0 0 4px 4px;padding:18px 36px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <p style="margin:0;color:#0f172a;font-size:12px;font-weight:700;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">AfriEnergy Tracker <span style="color:#64748b;font-weight:400;">by Africa Energy Pulse</span></p>
          <p style="margin:6px 0 0;color:#64748b;font-size:11px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">You're receiving this as a subscriber to AfriEnergy Insights.</p>
        </td>
        <td align="right" style="vertical-align:top;padding-left:16px;">
          <a href="https://afrienergytracker.io/insights" style="color:#0d9488;font-size:11px;font-weight:700;text-decoration:none;display:block;margin-bottom:8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">View on web →</a>
          <a href="{{UNSUBSCRIBE_URL}}" style="color:#64748b;font-size:10px;text-decoration:underline;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Unsubscribe</a>
        </td>
      </tr>
    </table>
    <div style="height:1px;background:#e2e8f0;margin:14px 0 12px;">&nbsp;</div>
    <p style="margin:0;color:#94a3b8;font-size:10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
      © ${new Date().getFullYear()} Africa Energy Pulse &nbsp;·&nbsp; <a href="https://afrienergytracker.io" style="color:#0d9488;text-decoration:none;">afrienergytracker.io</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>

</body>
</html>`;
}

export async function dispatchNewsletter(newsletterId: number): Promise<number> {
  if (!process.env.BREVO_API_KEY) {
    console.log("[EmailDispatch] No BREVO_API_KEY configured — skipping email dispatch");
    return 0;
  }

  const brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });

  // Fetch newsletter
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
      status: newslettersTable.status,
      recipientCount: newslettersTable.recipientCount,
      type: newslettersTable.type,
    })
    .from(newslettersTable)
    .where(eq(newslettersTable.id, newsletterId))
    .limit(1);

  if (!newsletter) throw new Error(`Newsletter ${newsletterId} not found`);
  if (newsletter.status === "sent") {
    console.log(`[EmailDispatch] Newsletter #${newsletterId} already sent — skipping`);
    return newsletter.recipientCount ?? 0;
  }

  // Get subscribed users
  const subscribers = await db
    .select({ email: userEmailsTable.email, unsubscribeToken: userEmailsTable.unsubscribeToken })
    .from(userEmailsTable)
    .where(eq(userEmailsTable.newsletterOptIn, true));

  if (subscribers.length === 0) {
    console.log("[EmailDispatch] No opted-in subscribers — skipping dispatch");
    return 0;
  }

  // Specials go out in the Brief format (concise, single-column) per editorial policy
  const isBrief = newsletter.type === "brief" || newsletter.type === "special" || newsletter.title?.startsWith("AfriEnergy Brief");
  const isAiGenerated = newsletter.type !== "special"; // hand-written specials carry the author byline
  const htmlTemplate = isBrief
    ? buildBriefEmailHtml({
        title: newsletter.title,
        content: newsletter.content,
        contentHtml: newsletter.contentHtml ?? null,
        editionNumber: newsletter.editionNumber,
        isAiGenerated,
      })
    : buildNewsletterEmailHtml({
        title: newsletter.title,
        content: newsletter.content,
        contentHtml: newsletter.contentHtml ?? null,
        editionNumber: newsletter.editionNumber,
        id: newsletter.id,
        isAiGenerated,
      });

  const sender = isBrief ? SENDER_BRIEF : SENDER_INSIGHTS;
  console.log(`[EmailDispatch] Sending edition #${newsletter.editionNumber} ("${newsletter.type ?? "insights"}") via Brevo to ${subscribers.length} subscriber(s)…`);

  let sent = 0;
  const failures: { email: string; error: string }[] = [];

  for (const sub of subscribers) {
    try {
      const personalizedHtml = htmlTemplate.replace(
        "{{UNSUBSCRIBE_URL}}",
        `https://afrienergytracker.io/api/newsletter/unsubscribe?token=${sub.unsubscribeToken ?? ""}`
      );
      const result = await brevo.transactionalEmails.sendTransacEmail({
        sender,
        to: [{ email: sub.email }],
        subject: newsletter.title,
        htmlContent: personalizedHtml,
      });
      console.log(`[EmailDispatch] ✓ Sent to ${sub.email} — Brevo messageId: ${(result as any)?.messageId ?? "n/a"}`);
      sent++;
    } catch (err) {
      const msg = (err as Error).message ?? "Unknown error";
      console.error(`[EmailDispatch] ✗ Failed to send to ${sub.email}: ${msg}`);
      failures.push({ email: sub.email, error: msg });
    }
    // 200ms between sends
    await new Promise(r => setTimeout(r, 200));
  }

  if (failures.length > 0) {
    console.error(`[EmailDispatch] ${failures.length} failure(s): ${failures.map(f => f.email).join(", ")}`);
  }

  // Only mark as "sent" when at least one email was successfully delivered.
  // recipientCount = actual successful sends, NOT total subscriber count.
  if (sent > 0) {
    await db
      .update(newslettersTable)
      .set({ sentAt: new Date(), recipientCount: sent, status: "sent" })
      .where(eq(newslettersTable.id, newsletterId));

    await db
      .update(userEmailsTable)
      .set({ lastNewsletterSentAt: new Date() })
      .where(eq(userEmailsTable.newsletterOptIn, true));
  } else {
    // Zero delivers — keep as draft so admin can investigate and retry
    console.error(`[EmailDispatch] ALL sends failed for newsletter #${newsletterId} — status remains draft`);
  }

  console.log(`[EmailDispatch] Edition #${newsletter.editionNumber}: ${sent}/${subscribers.length} delivered, ${failures.length} failed, status="${sent > 0 ? "sent" : "draft"}"`);
  return sent;
}

export async function dispatchBrief(newsletterId: number): Promise<number> {
  return dispatchNewsletter(newsletterId);
}

export async function dispatchTestEmails(
  newsletterId: number,
  testEmails: string[]
): Promise<{ sent: number; failed: string[] }> {
  if (!process.env.BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY not configured");
  }
  if (!testEmails.length) throw new Error("No test email addresses provided");

  const brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });

  const [newsletter] = await db
    .select({
      id: newslettersTable.id,
      editionNumber: newslettersTable.editionNumber,
      title: newslettersTable.title,
      content: newslettersTable.content,
      contentHtml: newslettersTable.contentHtml,
      type: newslettersTable.type,
    })
    .from(newslettersTable)
    .where(eq(newslettersTable.id, newsletterId))
    .limit(1);

  if (!newsletter) throw new Error(`Newsletter ${newsletterId} not found`);

  const isBrief = newsletter.type === "brief" || newsletter.title?.startsWith("AfriEnergy Brief");
  const sender = isBrief ? SENDER_BRIEF : SENDER_INSIGHTS;
  const subject = `[TEST] ${newsletter.title}`;

  // Build the full HTML template and replace the unsubscribe placeholder
  // with the insights page (no real unsubscribe token needed for a test send)
  const rawHtml = buildFullEmailHtml({
    title: newsletter.title,
    content: newsletter.content,
    contentHtml: newsletter.contentHtml,
    editionNumber: newsletter.editionNumber,
    id: newsletter.id,
    type: newsletter.type,
  });
  const testHtml = rawHtml.replace(/\{\{UNSUBSCRIBE_URL\}\}/g, "https://afrienergytracker.io/insights");

  let sent = 0;
  const failed: string[] = [];

  for (const email of testEmails) {
    try {
      const result = await brevo.transactionalEmails.sendTransacEmail({
        sender,
        to: [{ email }],
        subject,
        htmlContent: testHtml,
      });
      console.log(`[TestDispatch] ✓ Sent to ${email} — messageId: ${(result as any)?.messageId ?? "n/a"}`);
      sent++;
    } catch (err) {
      const msg = (err as Error).message ?? "Unknown error";
      console.error(`[TestDispatch] ✗ Failed to send to ${email}: ${msg}`);
      failed.push(email);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`[TestDispatch] Newsletter #${newsletterId}: ${sent}/${testEmails.length} test emails sent`);
  return { sent, failed };
}

export function buildFullEmailHtml(newsletter: {
  title: string;
  content: string;
  contentHtml?: string | null;
  editionNumber: number;
  id?: number;
  type?: string | null;
}): string {
  const isBrief = newsletter.type === "brief" || newsletter.type === "special" || newsletter.title?.startsWith("AfriEnergy Brief") || newsletter.title?.startsWith("Africa Energy Brief");
  const isAiGenerated = newsletter.type !== "special";
  if (isBrief) {
    return buildBriefEmailHtml({
      title: newsletter.title,
      content: newsletter.content,
      contentHtml: newsletter.contentHtml,
      editionNumber: newsletter.editionNumber,
      isAiGenerated,
    });
  }
  return buildNewsletterEmailHtml({
    title: newsletter.title,
    content: newsletter.content,
    contentHtml: newsletter.contentHtml,
    editionNumber: newsletter.editionNumber,
    id: newsletter.id ?? 0,
    isAiGenerated,
  });
}
