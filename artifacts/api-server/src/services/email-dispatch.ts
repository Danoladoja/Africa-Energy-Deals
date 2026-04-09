import { Resend } from "resend";
import { db, userEmailsTable, newslettersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const FROM_INSIGHTS = "AfriEnergy Insights <insights@send.afrienergytracker.io>";
const FROM_BRIEF = "Africa Energy Brief <brief@send.afrienergytracker.io>";


function markdownToEmailHtml(md: string): string {
  let html = md;

  // Tables — convert markdown tables to styled HTML tables
  html = html.replace(/(\|.+\|\n)(\|[-| :]+\|\n)((?:\|.+\|\n?)+)/g, (_match, header, _sep, body) => {
    const headerCells = header.trim().split("|").filter(Boolean).map(c =>
      `<th style="background:#0b0f1a;color:#00e676;font-size:12px;font-weight:700;padding:10px 14px;text-align:left;border:1px solid #1e293b;white-space:nowrap;">${c.trim()}</th>`
    ).join("");
    const bodyRows = body.trim().split("\n").map((row: string, i: number) => {
      const cells = row.split("|").filter(Boolean).map(c =>
        `<td style="padding:9px 14px;font-size:13px;color:#374151;border:1px solid #e5e7eb;background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"};">${c.trim()}</td>`
      ).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
<thead><tr>${headerCells}</tr></thead>
<tbody>${bodyRows}</tbody>
</table>`;
  });

  // Blockquotes → styled callout boxes
  html = html.replace(/^> (.+)$/gm,
    '<div style="border-left:4px solid #00e676;background:#f0fdf4;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0;color:#166534;font-size:14px;line-height:1.6;font-style:italic;">$1</div>'
  );

  // H2 → section headers with green underline
  html = html.replace(/^## (.+)$/gm,
    '<h2 style="color:#0b0f1a;font-size:20px;font-weight:800;margin:36px 0 12px;padding-bottom:8px;border-bottom:3px solid #00e676;font-family:Arial,sans-serif;">$1</h2>'
  );

  // H3 → sub-headers
  html = html.replace(/^### (.+)$/gm,
    '<h3 style="color:#1e293b;font-size:16px;font-weight:700;margin:24px 0 8px;font-family:Arial,sans-serif;">$1</h3>'
  );

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#0b0f1a;font-weight:700;">$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em style="color:#374151;">$1</em>');

  // Bullet lists
  html = html.replace(/^[-*] (.+)$/gm, '<li style="margin:5px 0;color:#374151;font-size:14px;line-height:1.6;">$1</li>');
  html = html.replace(/(<li[^>]*>[\s\S]*?<\/li>\s*)+/g,
    '<ul style="padding-left:22px;margin:12px 0;list-style-type:disc;">$&</ul>'
  );

  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin:5px 0;color:#374151;font-size:14px;line-height:1.6;">$1</li>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />');

  // Paragraphs — wrap standalone lines
  html = html
    .split("\n\n")
    .map(block => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("<")) return trimmed;
      return `<p style="color:#374151;font-size:15px;line-height:1.75;margin:0 0 16px;">${trimmed.replace(/\n/g, " ")}</p>`;
    })
    .join("\n");

  return html;
}

function buildNewsletterEmailHtml(newsletter: {
  title: string;
  content: string;
  contentHtml?: string | null;
  editionNumber: number;
  id: number;
}): string {
  // Prefer pre-rendered HTML with charts; fall back to markdown conversion
  const bodyContent = newsletter.contentHtml ?? markdownToEmailHtml(newsletter.content);
  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${newsletter.title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
<tr><td align="center" style="padding:32px 16px;">
<table width="100%" style="max-width:680px;" cellpadding="0" cellspacing="0">

  <!-- Header -->
  <tr><td style="background:#0b0f1a;border-radius:16px 16px 0 0;padding:36px 44px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:middle;">
          <div style="color:#00e676;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;margin-bottom:10px;font-family:Arial,sans-serif;">Africa Energy Pulse</div>
          <div style="color:#ffffff;font-size:32px;font-weight:900;line-height:1.15;letter-spacing:-0.5px;font-family:Arial,sans-serif;">AfriEnergy<br><span style="color:#00e676;">Insights</span></div>
          <div style="color:#94a3b8;font-size:12px;font-weight:600;margin-top:6px;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:1px;">Monthly Intelligence Report</div>
          <div style="color:#64748b;font-size:13px;margin-top:8px;font-family:Arial,sans-serif;">Edition #${newsletter.editionNumber} &nbsp;·&nbsp; ${dateStr}</div>
        </td>
        <td align="right" style="vertical-align:top;padding-left:20px;">
          <div style="background:#00e676;color:#0b0f1a;font-size:9px;font-weight:800;padding:7px 13px;border-radius:20px;letter-spacing:1.5px;white-space:nowrap;text-transform:uppercase;display:inline-block;">AI-Powered<br>Intelligence</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Title bar -->
  <tr><td style="background:#0f172a;padding:16px 44px 20px;border-bottom:1px solid #1e293b;">
    <p style="color:#e2e8f0;font-size:18px;font-weight:700;margin:0;font-family:Arial,sans-serif;line-height:1.3;">${newsletter.title}</p>
  </td></tr>

  <!-- Content body -->
  <tr><td style="background:#ffffff;padding:40px 44px;">
    ${bodyContent}
  </td></tr>

  <!-- AI disclaimer callout -->
  <tr><td style="background:#fffbeb;border-left:none;padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="background:#fffbeb;border-top:1px solid #fef3c7;border-bottom:1px solid #fef3c7;padding:16px 44px;">
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;padding-right:12px;font-size:18px;">⚠️</td>
          <td style="color:#92400e;font-size:12px;line-height:1.6;font-family:Arial,sans-serif;">
            <strong>AI-Generated Analysis:</strong> This newsletter is produced by AI from the AfriEnergy Tracker database.
            While grounded in real, tracked project data, AI interpretation may contain errors or omissions.
            Always verify critical figures against primary source data before making investment or policy decisions.
          </td>
        </tr>
      </table>
    </td></tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#0f172a;border-radius:0 0 16px 16px;padding:28px 44px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:top;">
          <p style="color:#e2e8f0;font-size:13px;font-weight:700;margin:0 0 4px;font-family:Arial,sans-serif;">AfriEnergy Tracker</p>
          <p style="color:#64748b;font-size:12px;margin:0;font-family:Arial,sans-serif;">by Africa Energy Pulse</p>
          <p style="color:#475569;font-size:12px;margin:12px 0 0;font-family:Arial,sans-serif;">You're receiving this because you subscribed to AfriEnergy Insights.</p>
        </td>
        <td align="right" style="vertical-align:top;padding-left:20px;white-space:nowrap;">
          <a href="https://afrienergytracker.io/insights" style="color:#00e676;font-size:12px;text-decoration:none;display:block;margin-bottom:10px;font-family:Arial,sans-serif;font-weight:600;">View on web →</a>
          <a href="{{UNSUBSCRIBE_URL}}" style="color:#475569;font-size:11px;text-decoration:underline;font-family:Arial,sans-serif;">Unsubscribe</a>
        </td>
      </tr>
    </table>
    <p style="color:#334155;font-size:11px;margin:20px 0 0;border-top:1px solid #1e293b;padding-top:16px;font-family:Arial,sans-serif;">
      © ${new Date().getFullYear()} Africa Energy Pulse · AfriEnergy Tracker · <a href="https://afrienergytracker.io" style="color:#00e676;text-decoration:none;">afrienergytracker.io</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>

</body>
</html>`;
}

function buildBriefEmailHtml(newsletter: {
  title: string;
  content: string;
  contentHtml?: string | null;
  editionNumber: number;
}): string {
  const bodyContent = newsletter.contentHtml ?? markdownToEmailHtml(newsletter.content);
  const dateStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${newsletter.title}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;">
<tr><td align="center" style="padding:28px 16px;">
<table width="100%" style="max-width:620px;" cellpadding="0" cellspacing="0">

  <!-- Compact header -->
  <tr><td style="background:#0b0f1a;border-radius:12px 12px 0 0;padding:24px 36px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:middle;">
          <div style="color:#00e676;font-size:9px;font-weight:700;letter-spacing:4px;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif;">Africa Energy Pulse</div>
          <div style="color:#ffffff;font-size:22px;font-weight:900;line-height:1.2;font-family:Arial,sans-serif;">Africa Energy <span style="color:#00e676;">Brief</span></div>
          <div style="color:#94a3b8;font-size:11px;font-weight:600;margin-top:4px;letter-spacing:1px;text-transform:uppercase;font-family:Arial,sans-serif;">Biweekly Update · ${dateStr}</div>
        </td>
        <td align="right" style="vertical-align:top;">
          <div style="background:#1e293b;border:1px solid #334155;color:#94a3b8;font-size:9px;font-weight:700;padding:5px 10px;border-radius:12px;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;">3–5 MIN READ</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Thin accent bar -->
  <tr><td style="background:#00e676;height:3px;"></td></tr>

  <!-- Content body — clean, minimal -->
  <tr><td style="background:#ffffff;padding:32px 36px;">
    ${bodyContent}
  </td></tr>

  <!-- AI disclaimer — minimal -->
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 36px;">
    <p style="color:#94a3b8;font-size:11px;margin:0;line-height:1.5;font-family:Arial,sans-serif;">
      ⚠️ <strong>AI-generated briefing</strong> from the AfriEnergy Tracker database. Verify critical figures before decisions.
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#0f172a;border-radius:0 0 12px 12px;padding:20px 36px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <p style="color:#64748b;font-size:11px;margin:0;font-family:Arial,sans-serif;">
            <span style="color:#e2e8f0;font-weight:600;">AfriEnergy Tracker</span> by Africa Energy Pulse
          </p>
          <p style="color:#475569;font-size:11px;margin:6px 0 0;font-family:Arial,sans-serif;">You're receiving this because you subscribed to AfriEnergy Insights.</p>
        </td>
        <td align="right" style="white-space:nowrap;padding-left:16px;">
          <a href="https://afrienergytracker.io/insights" style="color:#00e676;font-size:11px;text-decoration:none;font-family:Arial,sans-serif;">View on web →</a><br>
          <a href="{{UNSUBSCRIBE_URL}}" style="color:#475569;font-size:10px;text-decoration:underline;font-family:Arial,sans-serif;margin-top:4px;display:inline-block;">Unsubscribe</a>
        </td>
      </tr>
    </table>
    <p style="color:#334155;font-size:10px;margin:14px 0 0;border-top:1px solid #1e293b;padding-top:12px;font-family:Arial,sans-serif;">
      © ${new Date().getFullYear()} Africa Energy Pulse · <a href="https://afrienergytracker.io" style="color:#00e676;text-decoration:none;">afrienergytracker.io</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>

</body>
</html>`;
}

export async function dispatchNewsletter(newsletterId: number): Promise<number> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[EmailDispatch] No RESEND_API_KEY configured — skipping email dispatch");
    return 0;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  // Fetch newsletter — try to include content_html (best-effort; may not exist on older DBs)
  let newsletter: any;
  try {
    const [row] = await db
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
      })
      .from(newslettersTable)
      .where(eq(newslettersTable.id, newsletterId))
      .limit(1);
    newsletter = row;
  } catch {
    // Fall back to safe columns if content_html column doesn't exist yet
    const [row] = await db
      .select({
        id: newslettersTable.id,
        editionNumber: newslettersTable.editionNumber,
        title: newslettersTable.title,
        content: newslettersTable.content,
        executiveSummary: newslettersTable.executiveSummary,
        spotlightSector: newslettersTable.spotlightSector,
        spotlightCountry: newslettersTable.spotlightCountry,
        status: newslettersTable.status,
      })
      .from(newslettersTable)
      .where(eq(newslettersTable.id, newsletterId))
      .limit(1);
    newsletter = row;
  }

  if (!newsletter) throw new Error(`Newsletter ${newsletterId} not found`);

  // Get subscribed users
  const subscribers = await db
    .select({ email: userEmailsTable.email, unsubscribeToken: userEmailsTable.unsubscribeToken })
    .from(userEmailsTable)
    .where(eq(userEmailsTable.newsletterOptIn, true));

  if (subscribers.length === 0) {
    console.log("[EmailDispatch] No subscribers to send to");
    return 0;
  }

  const isBrief = newsletter.title?.startsWith("Africa Energy Brief");
  const htmlTemplate = isBrief
    ? buildBriefEmailHtml({
        title: newsletter.title,
        content: newsletter.content,
        contentHtml: newsletter.contentHtml ?? null,
        editionNumber: newsletter.editionNumber,
      })
    : buildNewsletterEmailHtml({
        title: newsletter.title,
        content: newsletter.content,
        contentHtml: newsletter.contentHtml ?? null,
        editionNumber: newsletter.editionNumber,
        id: newsletter.id,
      });

  const fromAddress = isBrief ? FROM_BRIEF : FROM_INSIGHTS;
  let sent = 0;
  const failures: { email: string; error: string }[] = [];

  for (const sub of subscribers) {
    try {
      const personalizedHtml = htmlTemplate.replace(
        "{{UNSUBSCRIBE_URL}}",
        `https://afrienergytracker.io/api/newsletter/unsubscribe?token=${sub.unsubscribeToken ?? ""}`
      );
      await resend.emails.send({
        from: fromAddress,
        to: sub.email,
        subject: newsletter.title,
        html: personalizedHtml,
      });
      sent++;
    } catch (err) {
      const msg = (err as Error).message ?? "Unknown error";
      console.error(`[EmailDispatch] Failed to send to ${sub.email}:`, msg);
      failures.push({ email: sub.email, error: msg });
    }
    // 150ms between sends to stay well within Resend rate limits
    await new Promise(r => setTimeout(r, 150));
  }

  if (failures.length > 0) {
    console.error(`[EmailDispatch] ${failures.length} delivery failure(s):`, failures.map(f => f.email).join(", "));
  }

  // Only mark as "sent" if at least one email was delivered
  const finalStatus = sent > 0 ? "sent" : "failed";
  await db
    .update(newslettersTable)
    .set({ sentAt: sent > 0 ? new Date() : null, recipientCount: sent, status: finalStatus })
    .where(eq(newslettersTable.id, newsletterId));

  // Update last_newsletter_sent_at for successfully reached subscribers
  if (sent > 0) {
    await db
      .update(userEmailsTable)
      .set({ lastNewsletterSentAt: new Date() })
      .where(eq(userEmailsTable.newsletterOptIn, true));
  }

  console.log(`[EmailDispatch] Edition #${newsletter.editionNumber}: ${sent} sent, ${failures.length} failed, status="${finalStatus}"`);
  return sent;
}

export async function dispatchBrief(newsletterId: number): Promise<number> {
  return dispatchNewsletter(newsletterId);
}
