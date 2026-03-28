import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const TODAY = () => new Date().toISOString().split("T")[0];
const DATE_LONG = () =>
  new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const FOOTER = `Source: AfriEnergy Tracker (afrienergytracker.io) · Data as of ${TODAY()}`;

/* ── Canvas capture ─────────────────────────────────────────────────────── */
export async function captureToCanvas(
  el: HTMLElement,
  scale = 2,
): Promise<HTMLCanvasElement> {
  // Wait for any pending animations / chart renders
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 350));

  // html2canvas can't read flex-stretched heights (flex-1 / min-h-0) or
  // content inside overflow-y-auto children. Temporarily give everything
  // explicit pixel dimensions, then restore after capture.
  type Snapshot = { el: HTMLElement; overflowY: string; height: string; maxHeight: string };
  const scrollers: Snapshot[] = [];

  el.querySelectorAll<HTMLElement>("*").forEach((child) => {
    const ov = window.getComputedStyle(child).overflowY;
    if (ov === "auto" || ov === "scroll") {
      scrollers.push({
        el: child,
        overflowY: child.style.overflowY,
        height: child.style.height,
        maxHeight: child.style.maxHeight,
      });
      child.style.overflowY = "visible";
      child.style.height = `${child.scrollHeight}px`;
      child.style.maxHeight = "none";
    }
  });

  const rootH = el.getBoundingClientRect().height || el.scrollHeight;
  const savedH = el.style.height;
  const savedMinH = el.style.minHeight;
  el.style.height = `${Math.max(rootH, el.scrollHeight)}px`;
  el.style.minHeight = el.style.height;

  // One more frame so the browser re-paints with the new dimensions
  await new Promise((r) => requestAnimationFrame(r));

  try {
    return await html2canvas(el, {
      scale,
      backgroundColor: "#0b0f1a",
      useCORS: true,
      allowTaint: false,
      logging: false,
      ignoreElements: (child) => child.hasAttribute("data-no-export"),
    });
  } finally {
    el.style.height = savedH;
    el.style.minHeight = savedMinH;
    scrollers.forEach(({ el: child, overflowY, height, maxHeight }) => {
      child.style.overflowY = overflowY;
      child.style.height = height;
      child.style.maxHeight = maxHeight;
    });
  }
}

/* ── PNG download ───────────────────────────────────────────────────────── */
export async function exportToPng(el: HTMLElement, filename: string): Promise<void> {
  const canvas = await captureToCanvas(el);
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

/* ── Single-image PDF (landscape A4) ───────────────────────────────────── */
export async function exportImageToPdf(
  el: HTMLElement,
  title: string,
  filename: string,
): Promise<void> {
  const canvas = await captureToCanvas(el);
  const imgData = canvas.toDataURL("image/png");
  const aspectRatio = canvas.width / canvas.height;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297;
  const H = 210;
  const M = 12;

  // Background
  doc.setFillColor(11, 15, 26);
  doc.rect(0, 0, W, H, "F");

  // Header bar
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 16, "F");
  doc.setFillColor(0, 230, 118);
  doc.rect(0, 0, W, 1.2, "F");

  // Brand
  doc.setTextColor(0, 230, 118);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("AfriEnergy Tracker", M, 10);

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text(title, M + 46, 10);
  doc.text(DATE_LONG(), W - M, 10, { align: "right" });

  // Image — centred in available space
  const topPad = 20;
  const botPad = 14;
  const avW = W - M * 2;
  const avH = H - topPad - botPad;

  let imgW = avW;
  let imgH = imgW / aspectRatio;
  if (imgH > avH) {
    imgH = avH;
    imgW = imgH * aspectRatio;
  }
  const imgX = M + (avW - imgW) / 2;
  const imgY = topPad + (avH - imgH) / 2;

  doc.addImage(imgData, "PNG", imgX, imgY, imgW, imgH);

  // Footer
  doc.setFillColor(15, 23, 42);
  doc.rect(0, H - 10, W, 10, "F");
  doc.setFillColor(0, 230, 118);
  doc.rect(0, H - 1, W, 1, "F");
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(6);
  doc.text(FOOTER, M, H - 4);
  doc.text("Page 1", W - M, H - 4, { align: "right" });

  doc.save(filename);
}

/* ── Single-image PPTX (16:9 widescreen) ───────────────────────────────── */
export async function exportImageToPptx(
  el: HTMLElement,
  title: string,
  filename: string,
): Promise<void> {
  const canvas = await captureToCanvas(el);
  const imgData = canvas.toDataURL("image/png");
  const aspectRatio = canvas.width / canvas.height;

  // Dynamic import so pptxgenjs is code-split
  const pptxgen = (await import("pptxgenjs")).default;
  const prs = new pptxgen();
  prs.layout = "LAYOUT_WIDE"; // 10 × 5.625 inches

  const slide = prs.addSlide();
  slide.background = { color: "0B0F1A" };

  // Title
  slide.addText(title, {
    x: 0.4, y: 0.18, w: 9.2, h: 0.55,
    fontSize: 22, bold: true, color: "00E676",
    fontFace: "Calibri",
  });

  // Image — centred in slide body
  const maxW = 9.2;
  const maxH = 4.3;
  let imgW = maxW;
  let imgH = imgW / aspectRatio;
  if (imgH > maxH) { imgH = maxH; imgW = imgH * aspectRatio; }
  const imgX = 0.4 + (maxW - imgW) / 2;
  const imgY = 0.85;

  slide.addImage({ data: imgData, x: imgX, y: imgY, w: imgW, h: imgH });

  // Footer
  slide.addText(FOOTER, {
    x: 0.4, y: 5.3, w: 9.2, h: 0.25,
    fontSize: 7, color: "475569", fontFace: "Calibri",
  });

  // Brand watermark (top right)
  slide.addText("AfriEnergy Tracker", {
    x: 7.5, y: 0.18, w: 2.1, h: 0.3,
    fontSize: 7, color: "1E293B", fontFace: "Calibri",
    align: "right",
  });

  await prs.writeFile({ fileName: filename });
}
