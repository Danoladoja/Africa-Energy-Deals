import { jsPDF } from "jspdf";
import { triggerBlobDownload } from "@/utils/export-utils";

/* ── Types ─────────────────────────────────────────────────────────── */
export interface PdfSectorRow {
  technology: string;
  count: number;
  investment: number;
  color: string;
}

export interface PdfTransitionRow {
  name: string;
  investment: number;
  count: number;
  pct: number;
  color: string;
}

export interface PdfCountryRow {
  country: string;
  investment: number;
  count: number;
}

export interface DashboardPdfData {
  totalInvestmentUsdMn: number;
  totalProjects: number;
  totalCountries: number;
  totalSectors: number;
  sectors: PdfSectorRow[];
  transition: PdfTransitionRow[];
  countries: PdfCountryRow[];
  yearRange: [number, number];
  filters: { countries: string[]; techs: string[] };
}

/* ── Helpers ───────────────────────────────────────────────────────── */
function fmtBn(mn: number): string {
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  return `$${mn.toFixed(0)}M`;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/* ── PDF builder ───────────────────────────────────────────────────── */
export function generateDashboardPdf(data: DashboardPdfData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const MARGIN = 14;
  const CONTENT_W = W - MARGIN * 2;
  const GREEN: [number, number, number] = [0, 230, 118];
  const DARK: [number, number, number] = [11, 15, 26];
  const SLATE: [number, number, number] = [100, 116, 139];
  const BORDER: [number, number, number] = [30, 41, 59];
  const CARD_BG: [number, number, number] = [17, 24, 39];

  let y = 0;

  /* ── Background ── */
  doc.setFillColor(...DARK);
  doc.rect(0, 0, W, 297, "F");

  /* ── Header band ── */
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 38, "F");

  /* Brand accent line */
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 1.2, "F");

  /* Logo circle */
  doc.setFillColor(...GREEN);
  doc.circle(MARGIN + 6, 19, 5, "F");
  doc.setFillColor(...DARK);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text("AE", MARGIN + 3.5, 21);

  /* Title */
  doc.setTextColor(...GREEN);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text("AfriEnergy Tracker", MARGIN + 14, 16);

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("Africa Energy Pulse · Market Overview Report", MARGIN + 14, 22);

  /* Date + URL — right side */
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7);
  doc.text(`Generated ${dateStr}`, W - MARGIN, 16, { align: "right" });
  doc.text("afrienergytracker.io", W - MARGIN, 22, { align: "right" });

  /* Filter badge (if filters active) */
  const hasFilters = data.filters.countries.length > 0 || data.filters.techs.length > 0;
  if (hasFilters) {
    const filterParts: string[] = [];
    if (data.filters.countries.length) filterParts.push(data.filters.countries.slice(0, 3).join(", "));
    if (data.filters.techs.length) filterParts.push(data.filters.techs.slice(0, 3).join(", "));
    doc.setTextColor(0, 230, 118);
    doc.setFontSize(6.5);
    doc.text(`Filtered: ${filterParts.join(" · ")}`, W - MARGIN, 28, { align: "right" });
  }

  /* Year range */
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7);
  doc.text(`${data.yearRange[0]}–${data.yearRange[1]}`, MARGIN + 14, 29);

  y = 46;

  /* ── Section label helper ── */
  function sectionLabel(label: string) {
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    const txt = label.toUpperCase();
    doc.text(txt, MARGIN, y);
    const lblW = doc.getTextWidth(txt);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(MARGIN + lblW + 2, y - 0.5, W - MARGIN, y - 0.5);
    y += 5;
    doc.setFont("helvetica", "normal");
  }

  /* ── KPI cards ── */
  sectionLabel("Key Metrics");

  const KPI_DATA = [
    { label: "Total Investment", value: fmtBn(data.totalInvestmentUsdMn), sub: "Disclosed capital" },
    { label: "Total Projects",   value: String(data.totalProjects),        sub: "In database" },
    { label: "Countries",        value: String(data.totalCountries),        sub: "Across Africa" },
    { label: "Sectors",          value: String(data.totalSectors),          sub: "Energy types" },
  ];
  const kpiW = CONTENT_W / 4 - 2;
  KPI_DATA.forEach((k, i) => {
    const kx = MARGIN + i * (kpiW + 2.5);

    doc.setFillColor(...CARD_BG);
    doc.roundedRect(kx, y, kpiW, 22, 2, 2, "F");
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.roundedRect(kx, y, kpiW, 22, 2, 2, "S");

    /* Green top accent */
    doc.setFillColor(...GREEN);
    doc.roundedRect(kx, y, kpiW, 1.5, 1, 1, "F");

    doc.setTextColor(...GREEN);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(k.value, kx + kpiW / 2, y + 11, { align: "center" });

    doc.setTextColor(226, 232, 240);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.text(k.label, kx + kpiW / 2, y + 16, { align: "center" });

    doc.setTextColor(100, 116, 139);
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.text(k.sub, kx + kpiW / 2, y + 20, { align: "center" });
  });

  y += 28;

  /* ── Two-column layout: sectors + energy split ── */
  const COL_W = CONTENT_W / 2 - 3;
  const leftX = MARGIN;
  const rightX = MARGIN + COL_W + 6;

  /* Left: Sector Breakdown */
  const sectorLabelY = y;
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.text("SECTOR BREAKDOWN", leftX, sectorLabelY);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(leftX + doc.getTextWidth("SECTOR BREAKDOWN") + 2, sectorLabelY - 0.5, leftX + COL_W, sectorLabelY - 0.5);

  /* Right: Energy Transition */
  doc.text("ENERGY TRANSITION SPLIT", rightX, sectorLabelY);
  doc.line(rightX + doc.getTextWidth("ENERGY TRANSITION SPLIT") + 2, sectorLabelY - 0.5, rightX + COL_W, sectorLabelY - 0.5);

  y += 5;

  /* Left: sector bar chart */
  const sectorStartY = y;
  const maxInv = Math.max(1, ...data.sectors.map(s => s.investment));
  const BAR_ROW_H = 8.5;

  data.sectors.slice(0, 8).forEach((s, i) => {
    const rowY = sectorStartY + i * BAR_ROW_H;
    const barMaxW = COL_W - 28;
    const barW = Math.max(1, (s.investment / maxInv) * barMaxW);
    const [r, g, b] = hexToRgb(s.color);

    /* Color dot */
    doc.setFillColor(r, g, b);
    doc.circle(leftX + 2, rowY + 2.5, 1.5, "F");

    /* Sector name */
    doc.setTextColor(203, 213, 225);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.text(s.technology, leftX + 6, rowY + 3.5);

    /* Bar track */
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(leftX, rowY + 5, barMaxW, 2, 0.5, 0.5, "F");

    /* Bar fill */
    doc.setFillColor(r, g, b);
    doc.roundedRect(leftX, rowY + 5, barW, 2, 0.5, 0.5, "F");

    /* Value */
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(5.5);
    doc.text(`${s.count} deals · ${fmtBn(s.investment)}`, leftX + barMaxW + 2, rowY + 6.5);
  });

  const sectorEndY = sectorStartY + Math.min(data.sectors.length, 8) * BAR_ROW_H;

  /* Right: Transition donut-style blocks */
  const transStartY = y;
  const totalTransInv = data.transition.reduce((s, t) => s + t.investment, 0);

  /* Stacked proportion bar */
  const propBarH = 7;
  const propBarW = COL_W;
  let barCursor = rightX;
  data.transition.forEach(t => {
    if (!t.investment) return;
    const segW = (t.investment / Math.max(1, totalTransInv)) * propBarW;
    const [r, g, b] = hexToRgb(t.color);
    doc.setFillColor(r, g, b);
    doc.rect(barCursor, transStartY, segW, propBarH, "F");
    barCursor += segW;
  });

  /* Transition rows */
  let transY = transStartY + propBarH + 5;
  data.transition.forEach(t => {
    const [r, g, b] = hexToRgb(t.color);

    /* Card */
    doc.setFillColor(...CARD_BG);
    doc.roundedRect(rightX, transY, COL_W, 14, 2, 2, "F");
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.roundedRect(rightX, transY, COL_W, 14, 2, 2, "S");

    /* Left color strip */
    doc.setFillColor(r, g, b);
    doc.roundedRect(rightX, transY, 2.5, 14, 1, 1, "F");

    /* Name */
    doc.setTextColor(226, 232, 240);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(t.name, rightX + 6, transY + 6);

    /* Percentage */
    doc.setFillColor(r, g, b, 0.15);
    doc.setTextColor(r, g, b);
    doc.setFontSize(11);
    doc.text(`${t.pct}%`, rightX + COL_W - 4, transY + 7, { align: "right" });

    /* Sub info */
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.text(`${t.count} projects · ${fmtBn(t.investment)}`, rightX + 6, transY + 11);

    transY += 17;
  });

  y = Math.max(sectorEndY, transY) + 6;

  /* ── Top Countries ── */
  sectionLabel("Top Countries by Capital Deployed");

  const topN = Math.min(data.countries.length, 10);
  const maxCountryInv = Math.max(1, ...data.countries.slice(0, topN).map(c => c.investment));
  const COL_COUNT = 2;
  const countryColW = CONTENT_W / COL_COUNT - 3;
  const COUNTRY_ROW_H = 9;

  for (let i = 0; i < topN; i++) {
    const c = data.countries[i];
    const col = i % COL_COUNT;
    const row = Math.floor(i / COL_COUNT);
    const cx = MARGIN + col * (countryColW + 6);
    const cy = y + row * COUNTRY_ROW_H;

    const barMaxW = countryColW - 22;
    const barW = Math.max(1, (c.investment / maxCountryInv) * barMaxW);

    /* Rank + name */
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.text(`${i + 1}`, cx + 1.5, cy + 3.5, { align: "center" });

    doc.setTextColor(203, 213, 225);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.text(c.country, cx + 6, cy + 3.5);

    /* Bar */
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(cx, cy + 5, barMaxW, 2, 0.5, 0.5, "F");
    doc.setFillColor(...GREEN);
    doc.roundedRect(cx, cy + 5, barW, 2, 0.5, 0.5, "F");

    /* Value */
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(5.5);
    doc.text(`${c.count}d · ${fmtBn(c.investment)}`, cx + barMaxW + 2, cy + 6.5);
  }

  y += Math.ceil(topN / COL_COUNT) * COUNTRY_ROW_H + 6;

  /* ── Footer ── */
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 285, W, 12, "F");
  doc.setFillColor(...GREEN);
  doc.rect(0, 295.8, W, 1.2, "F");

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.text("Africa Energy Pulse · AfriEnergy Tracker · afrienergytracker.io", MARGIN, 291);
  doc.text("Data sourced from publicly disclosed transactions. For informational purposes only.", MARGIN, 295);
  doc.setTextColor(...GREEN);
  doc.text(dateStr, W - MARGIN, 291, { align: "right" });

  /* ── Download ── */
  const fileName = `afrienergy-market-overview-${new Date().toISOString().slice(0, 10)}.pdf`;
  triggerBlobDownload(doc.output("blob"), fileName);
}
