import { Resend } from "resend";
import { db, userEmailsTable, newslettersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const FROM_INSIGHTS = "AfriEnergy Insights <insights@send.afrienergytracker.io>";
const FROM_BRIEF = "AfriEnergy Brief <brief@send.afrienergytracker.io>";


function markdownToEmailHtml(md: string): string {
  let html = md;

  // Tables — dark header rows, clean alternating body rows
  html = html.replace(/(\|.+\|\n)(\|[-| :]+\|\n)((?:\|.+\|\n?)+)/g, (_match, header, _sep, body) => {
    const headerCells = header.trim().split("|").filter(Boolean).map(c =>
      `<th style="background:#0f172a;color:#10b981;font-size:11px;font-weight:700;padding:11px 14px;text-align:left;text-transform:uppercase;letter-spacing:0.6px;white-space:nowrap;">${c.trim()}</th>`
    ).join("");
    const bodyRows = body.trim().split("\n").map((row: string, i: number) => {
      const cells = row.split("|").filter(Boolean).map(c =>
        `<td style="padding:10px 14px;font-size:13px;color:#334155;border-bottom:1px solid #e2e8f0;background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"};">${c.trim()}</td>`
      ).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    return `<div style="border-radius:10px;overflow:hidden;margin:22px 0;border:1px solid #e2e8f0;"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
  });

  // Blockquotes → key insight callout
  html = html.replace(/^> (.+)$/gm,
    '<div style="border-left:4px solid #10b981;background:#f0fdf9;padding:14px 20px;margin:22px 0;border-radius:0 8px 8px 0;color:#065f46;font-size:14px;line-height:1.7;font-style:italic;font-family:\'Manrope\',\'Helvetica Neue\',Helvetica,Arial,sans-serif;">$1</div>'
  );

  // H2 → section header with green left accent bar
  html = html.replace(/^## (.+)$/gm,
    '<h2 style="color:#0f172a;font-size:22px;font-weight:800;margin:40px 0 14px;padding:2px 0 2px 16px;border-left:4px solid #10b981;font-family:\'Syne\',\'Helvetica Neue\',Helvetica,Arial,sans-serif;letter-spacing:-0.4px;line-height:1.25;">$1</h2>'
  );

  // H3
  html = html.replace(/^### (.+)$/gm,
    '<h3 style="color:#1e293b;font-size:17px;font-weight:700;margin:28px 0 10px;font-family:\'Syne\',\'Helvetica Neue\',Helvetica,Arial,sans-serif;letter-spacing:-0.2px;">$1</h3>'
  );

  // H4
  html = html.replace(/^#### (.+)$/gm,
    '<h4 style="color:#1e293b;font-size:14px;font-weight:700;margin:20px 0 8px;font-family:\'Syne\',\'Helvetica Neue\',Helvetica,Arial,sans-serif;letter-spacing:0;">$1</h4>'
  );

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#0f172a;font-weight:700;">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em style="color:#334155;">$1</em>');

  // Bullet lists
  html = html.replace(/^[-*] (.+)$/gm, '<li style="margin:6px 0;color:#374151;font-size:15px;line-height:1.7;padding-left:4px;">$1</li>');
  html = html.replace(/(<li[^>]*>[\s\S]*?<\/li>\s*)+/g,
    '<ul style="padding-left:24px;margin:14px 0;list-style-type:disc;">$&</ul>'
  );

  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin:6px 0;color:#374151;font-size:15px;line-height:1.7;padding-left:4px;">$1</li>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0;" />');

  // Paragraphs
  html = html.split("\n\n").map(block => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("<")) return trimmed;
    return `<p style="color:#374151;font-size:15px;line-height:1.8;margin:0 0 18px;">${trimmed.replace(/\n/g, " ")}</p>`;
  }).join("\n");

  return html;
}

function buildNewsletterEmailHtml(newsletter: {
  title: string;
  content: string;
  contentHtml?: string | null;
  editionNumber: number;
  id: number;
}): string {
  const bodyContent = newsletter.contentHtml ?? markdownToEmailHtml(newsletter.content);
  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${newsletter.title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700;800&family=Manrope:wght@400;500;600;700&display=swap');
  img { max-width:100% !important; height:auto !important; display:block; }
  @media only screen and (max-width:620px) {
    .outer-td { padding:16px 8px !important; }
    .content-td { padding:28px 20px !important; }
    .masthead-td { padding:28px 20px 22px !important; }
    .title-td { padding:16px 20px !important; }
    .footer-td { padding:22px 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#e8ecf0;font-family:'Manrope','Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#e8ecf0;">
<tr><td class="outer-td" align="center" style="padding:32px 16px 48px;">
<table width="100%" style="max-width:620px;" cellpadding="0" cellspacing="0">

  <!-- Top green accent line -->
  <tr><td style="background:#10b981;height:3px;border-radius:2px 2px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>

  <!-- MASTHEAD -->
  <tr><td class="masthead-td" style="background:#080d1a;padding:36px 44px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:top;">
          <p style="margin:0 0 14px;color:#10b981;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Africa Energy Pulse &nbsp;·&nbsp; Monthly Intelligence</p>
          <p style="margin:0;font-size:38px;font-weight:800;line-height:1.0;letter-spacing:-1.5px;font-family:'Syne','Helvetica Neue',Helvetica,Arial,sans-serif;">
            <span style="color:#ffffff;">AfriEnergy</span><br>
            <span style="color:#10b981;">Insights</span>
          </p>
        </td>
        <td align="right" style="vertical-align:top;padding-left:16px;white-space:nowrap;">
          <div style="background:#0f2318;border:1px solid #1a4a2e;border-radius:8px;padding:12px 16px;text-align:center;display:inline-block;">
            <p style="margin:0;color:#10b981;font-size:13px;font-weight:800;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">#${newsletter.editionNumber}</p>
            <p style="margin:4px 0 0;color:#475569;font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Edition</p>
          </div>
        </td>
      </tr>
    </table>
    <div style="height:1px;background:#1a2744;margin:22px 0 18px;">&nbsp;</div>
    <p style="margin:0;color:#64748b;font-size:13px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${dateStr}</p>
  </td></tr>

  <!-- TITLE BAND -->
  <tr><td class="title-td" style="background:#0d1526;padding:18px 44px;border-top:1px solid #1a2744;border-bottom:3px solid #10b981;">
    <p style="margin:0;color:#f1f5f9;font-size:17px;font-weight:700;line-height:1.4;font-family:'Syne','Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-0.2px;">${newsletter.title}</p>
  </td></tr>

  <!-- CONTENT BODY -->
  <tr><td class="content-td" style="background:#ffffff;padding:44px 44px 36px;">
    ${bodyContent}
  </td></tr>

  <!-- AI DISCLAIMER -->
  <tr><td style="background:#fffdf5;border-top:1px solid #fef3c7;border-bottom:1px solid #fef3c7;padding:14px 44px;">
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:top;padding-right:10px;font-size:15px;line-height:1;">⚠️</td>
        <td style="color:#78350f;font-size:12px;line-height:1.6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
          <strong style="color:#92400e;">AI-Generated Analysis:</strong> Content produced by Claude AI from the AfriEnergy Tracker database. Grounded in real tracked project data — always verify critical figures before making investment or policy decisions.
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td class="footer-td" style="background:#080d1a;border-radius:0 0 4px 4px;padding:28px 44px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:top;">
          <p style="margin:0;color:#e2e8f0;font-size:13px;font-weight:700;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">AfriEnergy Tracker</p>
          <p style="margin:3px 0 0;color:#475569;font-size:12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">by Africa Energy Pulse</p>
          <p style="margin:12px 0 0;color:#334155;font-size:12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">You're receiving this as a subscriber to AfriEnergy Insights.</p>
        </td>
        <td align="right" style="vertical-align:top;padding-left:20px;white-space:nowrap;">
          <a href="https://afrienergytracker.io/insights" style="color:#10b981;font-size:12px;font-weight:600;text-decoration:none;display:block;margin-bottom:10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">View on web →</a>
          <a href="{{UNSUBSCRIBE_URL}}" style="color:#475569;font-size:11px;text-decoration:underline;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Unsubscribe</a>
        </td>
      </tr>
    </table>
    <div style="height:1px;background:#1e293b;margin:20px 0 16px;">&nbsp;</div>
    <p style="margin:0;color:#334155;font-size:11px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
      © ${new Date().getFullYear()} Africa Energy Pulse &nbsp;·&nbsp; <a href="https://afrienergytracker.io" style="color:#10b981;text-decoration:none;">afrienergytracker.io</a>
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
<style>
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700;800&family=Manrope:wght@400;500;600;700&display=swap');
  img { max-width:100% !important; height:auto !important; display:block; }
  @media only screen and (max-width:580px) {
    .brief-outer { padding:16px 8px !important; }
    .brief-header { padding:22px 20px 18px !important; }
    .brief-content { padding:26px 20px !important; }
    .brief-footer { padding:18px 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#eaecef;font-family:'Manrope','Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#eaecef;">
<tr><td class="brief-outer" align="center" style="padding:28px 16px 44px;">
<table width="100%" style="max-width:580px;" cellpadding="0" cellspacing="0">

  <!-- Dual-tone top strip -->
  <tr>
    <td style="background:#10b981;height:3px;width:70%;font-size:0;line-height:0;">&nbsp;</td>
    <td style="background:#065f46;height:3px;width:30%;font-size:0;line-height:0;">&nbsp;</td>
  </tr>

  <!-- COMPACT HEADER -->
  <tr><td class="brief-header" style="background:#080d1a;padding:26px 36px 22px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:middle;">
          <p style="margin:0 0 10px;color:#10b981;font-size:9px;font-weight:700;letter-spacing:4px;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Africa Energy Pulse</p>
          <p style="margin:0;font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;font-family:'Syne','Helvetica Neue',Helvetica,Arial,sans-serif;">
            <span style="color:#ffffff;">AfriEnergy </span><span style="color:#10b981;">Brief</span>
          </p>
          <p style="margin:7px 0 0;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Biweekly Update &nbsp;·&nbsp; ${dateStr}</p>
        </td>
        <td align="right" style="vertical-align:middle;padding-left:16px;white-space:nowrap;">
          <div style="border:1px solid #1a3a28;border-radius:6px;padding:8px 12px;text-align:center;display:inline-block;">
            <p style="margin:0;color:#94a3b8;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">3–5 MIN</p>
            <p style="margin:3px 0 0;color:#475569;font-size:9px;text-transform:uppercase;letter-spacing:1px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Read</p>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- GREEN RULE + TITLE -->
  <tr><td style="background:#10b981;height:2px;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="background:#0d1526;padding:14px 36px;border-bottom:1px solid #1a2744;">
    <p style="margin:0;color:#e2e8f0;font-size:15px;font-weight:700;line-height:1.4;font-family:'Syne','Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-0.1px;">${newsletter.title}</p>
  </td></tr>

  <!-- CONTENT -->
  <tr><td class="brief-content" style="background:#ffffff;padding:32px 36px;">
    ${bodyContent}
  </td></tr>

  <!-- DISCLAIMER -->
  <tr><td style="background:#f8f9fb;border-top:1px solid #e2e8f0;padding:12px 36px;">
    <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
      ⚠️ <strong style="color:#64748b;">AI-generated briefing</strong> from AfriEnergy Tracker data. Verify critical figures before decisions.
    </p>
  </td></tr>

  <!-- FOOTER -->
  <tr><td class="brief-footer" style="background:#080d1a;border-radius:0 0 4px 4px;padding:20px 36px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <p style="margin:0;color:#e2e8f0;font-size:12px;font-weight:600;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">AfriEnergy Tracker <span style="color:#475569;font-weight:400;">by Africa Energy Pulse</span></p>
          <p style="margin:6px 0 0;color:#334155;font-size:11px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">You're receiving this as a subscriber to AfriEnergy Insights.</p>
        </td>
        <td align="right" style="vertical-align:top;padding-left:16px;white-space:nowrap;">
          <a href="https://afrienergytracker.io/insights" style="color:#10b981;font-size:11px;font-weight:600;text-decoration:none;display:block;margin-bottom:8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">View on web →</a>
          <a href="{{UNSUBSCRIBE_URL}}" style="color:#334155;font-size:10px;text-decoration:underline;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Unsubscribe</a>
        </td>
      </tr>
    </table>
    <div style="height:1px;background:#1e293b;margin:14px 0 12px;">&nbsp;</div>
    <p style="margin:0;color:#334155;font-size:10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
      © ${new Date().getFullYear()} Africa Energy Pulse &nbsp;·&nbsp; <a href="https://afrienergytracker.io" style="color:#10b981;text-decoration:none;">afrienergytracker.io</a>
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

  const isBrief = newsletter.type === "brief" || newsletter.title?.startsWith("AfriEnergy Brief") || newsletter.title?.startsWith("Africa Energy Brief");
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

export function buildFullEmailHtml(newsletter: {
  title: string;
  content: string;
  contentHtml?: string | null;
  editionNumber: number;
  id?: number;
  type?: string | null;
}): string {
  const isBrief = newsletter.type === "brief" || newsletter.title?.startsWith("AfriEnergy Brief") || newsletter.title?.startsWith("Africa Energy Brief");
  if (isBrief) {
    return buildBriefEmailHtml({
      title: newsletter.title,
      content: newsletter.content,
      contentHtml: newsletter.contentHtml,
      editionNumber: newsletter.editionNumber,
    });
  }
  return buildNewsletterEmailHtml({
    title: newsletter.title,
    content: newsletter.content,
    contentHtml: newsletter.contentHtml,
    editionNumber: newsletter.editionNumber,
    id: newsletter.id ?? 0,
  });
}
