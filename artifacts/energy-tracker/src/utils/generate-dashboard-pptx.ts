import type { DashboardPdfData } from "./generate-dashboard-pdf";

const TODAY = () => new Date().toISOString().split("T")[0];
const FOOTER_TEXT = `Source: AfriEnergy Tracker (afrienergytracker.io) · Data as of ${TODAY()}`;

function fmtBn(mn: number): string {
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  return `$${mn.toFixed(0)}M`;
}

export async function generateDashboardPptx(data: DashboardPdfData): Promise<void> {
  const pptxgen = (await import("pptxgenjs")).default;
  const prs = new pptxgen();
  prs.layout = "LAYOUT_WIDE"; // 10 × 5.625 in

  const BG = "0B0F1A";
  const CARD = "1E293B";
  const GREEN = "00E676";
  const MUTED = "64748B";
  const WHITE = "E2E8F0";
  const BORDER = "334155";
  const FONT = "Calibri";

  function addFooter(slide: any) {
    slide.addText(FOOTER_TEXT, {
      x: 0.4, y: 5.3, w: 9.2, h: 0.25,
      fontSize: 7, color: MUTED, fontFace: FONT,
    });
  }

  function slideTitle(slide: any, title: string, subtitle?: string) {
    slide.addText(title, {
      x: 0.4, y: 0.18, w: 9.2, h: 0.45,
      fontSize: 18, bold: true, color: GREEN, fontFace: FONT,
    });
    if (subtitle) {
      slide.addText(subtitle, {
        x: 0.4, y: 0.58, w: 9.2, h: 0.28,
        fontSize: 9, color: MUTED, fontFace: FONT,
      });
    }
  }

  // ── Slide 1: Title + KPIs ───────────────────────────────────────────────
  {
    const slide = prs.addSlide();
    slide.background = { color: BG };

    // Brand header band
    slide.addShape(prs.ShapeType.rect, {
      x: 0, y: 0, w: 10, h: 1.1,
      fill: { color: "0F172A" },
      line: { color: "0F172A" },
    });
    slide.addShape(prs.ShapeType.rect, {
      x: 0, y: 0, w: 10, h: 0.06,
      fill: { color: GREEN },
      line: { color: GREEN },
    });

    // Brand title
    slide.addText("AfriEnergy Tracker", {
      x: 0.4, y: 0.18, w: 5, h: 0.45,
      fontSize: 22, bold: true, color: GREEN, fontFace: FONT,
    });
    slide.addText("Africa Energy Pulse · Market Overview", {
      x: 0.4, y: 0.62, w: 6, h: 0.3,
      fontSize: 10, color: MUTED, fontFace: FONT,
    });
    slide.addText(TODAY(), {
      x: 7, y: 0.18, w: 2.6, h: 0.45,
      fontSize: 10, color: MUTED, fontFace: FONT, align: "right",
    });

    // KPI cards
    const kpis = [
      { label: "Total Investment", value: fmtBn(data.totalInvestmentUsdMn), sub: "Disclosed capital" },
      { label: "Total Projects",   value: String(data.totalProjects),       sub: "In database" },
      { label: "Countries",        value: String(data.totalCountries),      sub: "Across Africa" },
      { label: "Sectors",          value: String(data.totalSectors),        sub: "Energy types" },
    ];

    kpis.forEach((k, i) => {
      const x = 0.4 + i * 2.35;
      const y = 1.4;
      // Card bg
      slide.addShape(prs.ShapeType.rect, {
        x, y, w: 2.1, h: 1.35,
        fill: { color: CARD }, line: { color: BORDER, pt: 0.5 },
      });
      // Green top bar
      slide.addShape(prs.ShapeType.rect, {
        x, y, w: 2.1, h: 0.07,
        fill: { color: GREEN }, line: { color: GREEN },
      });
      slide.addText(k.value, {
        x: x + 0.05, y: y + 0.2, w: 2.0, h: 0.5,
        fontSize: 26, bold: true, color: GREEN, fontFace: FONT, align: "center",
      });
      slide.addText(k.label, {
        x: x + 0.05, y: y + 0.72, w: 2.0, h: 0.3,
        fontSize: 9, bold: true, color: WHITE, fontFace: FONT, align: "center",
      });
      slide.addText(k.sub, {
        x: x + 0.05, y: y + 1.0, w: 2.0, h: 0.25,
        fontSize: 7.5, color: MUTED, fontFace: FONT, align: "center",
      });
    });

    // Year range
    slide.addText(`${data.yearRange[0]}–${data.yearRange[1]}`, {
      x: 0.4, y: 3.0, w: 2, h: 0.3,
      fontSize: 9, color: MUTED, fontFace: FONT,
    });

    addFooter(slide);
  }

  // ── Slide 2: Energy Transition Overview ────────────────────────────────
  {
    const slide = prs.addSlide();
    slide.background = { color: BG };
    slideTitle(slide, "Energy Transition Overview", "Capital split across Renewable, Fossil, and Infrastructure");

    const startY = 1.0;
    data.transition.forEach((t, i) => {
      const y = startY + i * 1.32;
      // Card
      slide.addShape(prs.ShapeType.rect, {
        x: 0.4, y, w: 9.2, h: 1.1,
        fill: { color: CARD }, line: { color: BORDER, pt: 0.5 },
      });
      // Color accent bar
      slide.addShape(prs.ShapeType.rect, {
        x: 0.4, y, w: 0.18, h: 1.1,
        fill: { color: t.color.replace("#", "") },
        line: { color: t.color.replace("#", "") },
      });
      slide.addText(t.name, {
        x: 0.72, y: y + 0.12, w: 4, h: 0.38,
        fontSize: 14, bold: true, color: WHITE, fontFace: FONT,
      });
      slide.addText(`${t.count} projects · ${fmtBn(t.investment)}`, {
        x: 0.72, y: y + 0.5, w: 5, h: 0.28,
        fontSize: 9, color: MUTED, fontFace: FONT,
      });
      slide.addText(`${t.pct}%`, {
        x: 7, y: y + 0.2, w: 2.2, h: 0.55,
        fontSize: 28, bold: true, color: t.color.replace("#", ""), fontFace: FONT, align: "right",
      });
    });

    addFooter(slide);
  }

  // ── Slide 3: Deals by Sector ───────────────────────────────────────────
  {
    const slide = prs.addSlide();
    slide.background = { color: BG };
    slideTitle(slide, "Deals by Sector", "Capital committed and project count per energy technology");

    const sectors = data.sectors.slice(0, 8);
    const maxInv = Math.max(1, ...sectors.map((s) => s.investment));
    const barMaxW = 5.5;
    const rowH = 0.55;
    const startY = 0.9;

    sectors.forEach((s, i) => {
      const y = startY + i * rowH;
      const barW = Math.max(0.05, (s.investment / maxInv) * barMaxW);
      const col = s.color.replace("#", "");

      // Label
      slide.addText(s.technology, {
        x: 0.4, y: y + 0.05, w: 2.0, h: 0.3,
        fontSize: 9, color: WHITE, fontFace: FONT,
      });
      // Bar track
      slide.addShape(prs.ShapeType.rect, {
        x: 2.5, y: y + 0.12, w: barMaxW, h: 0.2,
        fill: { color: "1E293B" }, line: { color: BORDER, pt: 0.5 },
      });
      // Bar fill
      slide.addShape(prs.ShapeType.rect, {
        x: 2.5, y: y + 0.12, w: barW, h: 0.2,
        fill: { color: col }, line: { color: col },
      });
      // Value
      slide.addText(`${s.count} deals · ${fmtBn(s.investment)}`, {
        x: 8.15, y: y + 0.05, w: 1.45, h: 0.3,
        fontSize: 7.5, color: MUTED, fontFace: FONT, align: "right",
      });
    });

    addFooter(slide);
  }

  // ── Slide 4: Top Countries ─────────────────────────────────────────────
  {
    const slide = prs.addSlide();
    slide.background = { color: BG };
    slideTitle(slide, "Top Countries by Capital Deployed", "Ranked by total disclosed investment");

    const countries = data.countries.slice(0, 10);
    const maxInv = Math.max(1, ...countries.map((c) => c.investment));

    const cols = 2;
    const colW = 4.4;
    const rowH = 0.52;
    const startY = 0.9;

    countries.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 0.4 + col * (colW + 0.8);
      const y = startY + row * rowH;
      const barMaxW = colW - 1.8;
      const barW = Math.max(0.05, (c.investment / maxInv) * barMaxW);

      slide.addText(`${i + 1}. ${c.country}`, {
        x, y: y + 0.02, w: colW - 0.2, h: 0.27,
        fontSize: 9, color: WHITE, fontFace: FONT,
      });
      slide.addShape(prs.ShapeType.rect, {
        x: x + 0.9, y: y + 0.3, w: barMaxW, h: 0.14,
        fill: { color: "1E293B" }, line: { color: BORDER, pt: 0.5 },
      });
      slide.addShape(prs.ShapeType.rect, {
        x: x + 0.9, y: y + 0.3, w: barW, h: 0.14,
        fill: { color: GREEN }, line: { color: GREEN },
      });
      slide.addText(`${c.count}d · ${fmtBn(c.investment)}`, {
        x: x + 0.9 + barMaxW + 0.05, y: y + 0.02, w: 1.1, h: 0.27,
        fontSize: 7, color: MUTED, fontFace: FONT,
      });
    });

    addFooter(slide);
  }

  const fileName = `AfriEnergy_Dashboard_${TODAY()}.pptx`;
  await prs.writeFile({ fileName });
}
