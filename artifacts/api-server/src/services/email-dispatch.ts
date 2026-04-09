import { Resend } from "resend";
import { db, userEmailsTable, newslettersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const FROM = "AfriEnergy Insights <insights@send.afrienergytracker.io>";

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

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
  editionNumber: number;
  id: number;
}): string {
  const bodyContent = markdownToEmailHtml(newsletter.content);
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
          <div style="color:#64748b;font-size:13px;margin-top:10px;font-family:Arial,sans-serif;">Edition #${newsletter.editionNumber} &nbsp;·&nbsp; ${dateStr}</div>
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

export async function dispatchNewsletter(newsletterId: number): Promise<number> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[EmailDispatch] No RESEND_API_KEY configured — skipping email dispatch");
    return 0;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  // Get the newsletter (select only guaranteed columns — avoids failures on
  // production DBs that may be missing optional columns added later)
  const [newsletter] = await db
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

  const htmlTemplate = buildNewsletterEmailHtml({
    title: newsletter.title,
    content: newsletter.content,
    editionNumber: newsletter.editionNumber,
    id: newsletter.id,
  });

  const batches = chunkArray(subscribers, 100);
  let sent = 0;

  for (const batch of batches) {
    try {
      const emails = batch.map(sub => ({
        from: FROM,
        to: sub.email,
        subject: newsletter.title,
        html: htmlTemplate.replace(
          "{{UNSUBSCRIBE_URL}}",
          `https://afrienergytracker.io/api/newsletter/unsubscribe?token=${sub.unsubscribeToken ?? ""}`
        ),
      }));

      await resend.batch.send(emails);
      sent += batch.length;
    } catch (err) {
      console.error("[EmailDispatch] Batch send error:", (err as Error).message);
    }
  }

  // Update newsletter as sent
  await db
    .update(newslettersTable)
    .set({ sentAt: new Date(), recipientCount: sent, status: "sent" })
    .where(eq(newslettersTable.id, newsletterId));

  // Update last_newsletter_sent_at for all recipients
  await db
    .update(userEmailsTable)
    .set({ lastNewsletterSentAt: new Date() })
    .where(eq(userEmailsTable.newsletterOptIn, true));

  console.log(`[EmailDispatch] Sent edition #${newsletter.editionNumber} to ${sent} subscribers`);
  return sent;
}
