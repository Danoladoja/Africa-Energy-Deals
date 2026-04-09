/**
 * Chart Generator — uses QuickChart.io API (no native bindings needed)
 * Generates chart images as base64 PNGs and styled HTML tables for embedding
 * in newsletter HTML emails and PDF exports.
 */

export interface SectorStat {
  sector: string;
  count: number;
  investment: number;
  disclosed: number;
}

export interface StageStat {
  stage: string;
  count: number;
  investment: number;
}

export interface RegionStat {
  region: string;
  count: number;
  investment: number;
}

export interface DealRow {
  projectName: string | null;
  country: string | null;
  technology: string | null;
  dealSizeUsdMn: number | null;
  dealStage: string | null;
  investors: string | null;
}

const QUICKCHART_URL = "https://quickchart.io/chart";

const AFRIENERGY_GREEN = "#10B981";
const DARK_BG = "#0b0f1a";
const CHART_COLORS = [
  "#10B981", "#3B82F6", "#F59E0B", "#8B5CF6",
  "#EF4444", "#06B6D4", "#84CC16", "#F97316",
  "#EC4899", "#14B8A6", "#6366F1", "#A78BFA",
];

async function fetchChartAsBase64(config: object, width = 600, height = 340): Promise<string | null> {
  try {
    const body = {
      chart: config,
      width,
      height,
      backgroundColor: DARK_BG,
      format: "png",
    };
    const response = await fetch(QUICKCHART_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.warn(`[ChartGenerator] QuickChart returned ${response.status}`);
      return null;
    }
    const buffer = await response.arrayBuffer();
    return `data:image/png;base64,${Buffer.from(buffer).toString("base64")}`;
  } catch (err) {
    console.warn("[ChartGenerator] Failed to fetch chart:", (err as Error).message);
    return null;
  }
}

/**
 * Horizontal bar chart — Investment by Sector (top 10 by investment value)
 */
export async function generateSectorChart(bySector: SectorStat[]): Promise<string | null> {
  const top = [...bySector]
    .sort((a, b) => b.investment - a.investment)
    .slice(0, 10);

  if (top.length === 0) return null;

  const config = {
    type: "horizontalBar",
    data: {
      labels: top.map(s => s.sector),
      datasets: [{
        label: "Investment ($M)",
        data: top.map(s => Math.round(s.investment)),
        backgroundColor: AFRIENERGY_GREEN,
        borderColor: AFRIENERGY_GREEN,
        borderWidth: 1,
      }],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: "Investment by Sector (USD $M)",
          fontColor: "#ffffff",
          fontSize: 14,
          fontStyle: "bold",
        },
        legend: { display: false },
      },
      scales: {
        xAxes: [{ ticks: { fontColor: "#94a3b8", beginAtZero: true }, gridLines: { color: "#1e293b" } }],
        yAxes: [{ ticks: { fontColor: "#e2e8f0" }, gridLines: { color: "#1e293b" } }],
      },
    },
  };

  return fetchChartAsBase64(config, 600, 380);
}

/**
 * Vertical bar chart — Deal Pipeline by Stage (count + investment)
 */
export async function generatePipelineChart(byStage: StageStat[]): Promise<string | null> {
  const active = byStage.filter(s => s.count > 0);
  if (active.length === 0) return null;

  const config = {
    type: "bar",
    data: {
      labels: active.map(s => s.stage),
      datasets: [
        {
          label: "Project Count",
          data: active.map(s => s.count),
          backgroundColor: active.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
          yAxisID: "count",
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: "Deal Pipeline by Stage (Project Count)",
          fontColor: "#ffffff",
          fontSize: 14,
          fontStyle: "bold",
        },
        legend: { display: false },
      },
      scales: {
        xAxes: [{ ticks: { fontColor: "#e2e8f0" }, gridLines: { color: "#1e293b" } }],
        yAxes: [{
          id: "count",
          type: "linear",
          position: "left",
          ticks: { fontColor: "#94a3b8", beginAtZero: true },
          gridLines: { color: "#1e293b" },
        }],
      },
    },
  };

  return fetchChartAsBase64(config, 600, 340);
}

/**
 * Horizontal bar chart — Investment by Region
 */
export async function generateRegionalChart(byRegion: RegionStat[]): Promise<string | null> {
  const active = byRegion.filter(r => r.count > 0);
  if (active.length === 0) return null;

  const config = {
    type: "horizontalBar",
    data: {
      labels: active.map(r => r.region),
      datasets: [{
        label: "Investment ($M)",
        data: active.map(r => Math.round(r.investment)),
        backgroundColor: active.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
        borderWidth: 1,
      }],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: "Investment by Region (USD $M)",
          fontColor: "#ffffff",
          fontSize: 14,
          fontStyle: "bold",
        },
        legend: { display: false },
      },
      scales: {
        xAxes: [{ ticks: { fontColor: "#94a3b8", beginAtZero: true }, gridLines: { color: "#1e293b" } }],
        yAxes: [{ ticks: { fontColor: "#e2e8f0" }, gridLines: { color: "#1e293b" } }],
      },
    },
  };

  return fetchChartAsBase64(config, 600, 300);
}

/**
 * Styled HTML table of top deals — returns an HTML string for embedding
 */
export function generateTopDealsTable(deals: DealRow[], maxRows = 10): string {
  const rows = deals.slice(0, maxRows);
  if (rows.length === 0) return "";

  const rowsHtml = rows.map((d, i) => {
    const size = d.dealSizeUsdMn
      ? d.dealSizeUsdMn >= 1000
        ? `$${(d.dealSizeUsdMn / 1000).toFixed(1)}B`
        : `$${Math.round(d.dealSizeUsdMn)}M`
      : "Undisclosed";
    const bg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
    return `<tr>
      <td style="padding:9px 12px;font-size:13px;color:#0b0f1a;border-bottom:1px solid #e5e7eb;background:${bg};font-weight:600;">${d.projectName ?? "—"}</td>
      <td style="padding:9px 12px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;background:${bg};">${d.country ?? "—"}</td>
      <td style="padding:9px 12px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;background:${bg};">${d.technology ?? "—"}</td>
      <td style="padding:9px 12px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;background:${bg};text-align:right;font-weight:600;">${size}</td>
      <td style="padding:9px 12px;font-size:12px;color:#64748b;border-bottom:1px solid #e5e7eb;background:${bg};">${d.dealStage ?? "—"}</td>
    </tr>`;
  }).join("");

  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
  <thead>
    <tr style="background:#10B981;">
      <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;">Project</th>
      <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;">Country</th>
      <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;">Sector</th>
      <th style="padding:10px 12px;text-align:right;font-size:12px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;">Deal Size</th>
      <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;">Stage</th>
    </tr>
  </thead>
  <tbody>${rowsHtml}</tbody>
</table>`;
}

/**
 * Wraps a chart base64 image in a styled email-safe container
 */
export function chartImageHtml(base64: string, caption: string): string {
  return `<div style="margin:20px 0;text-align:center;">
  <img src="${base64}" alt="${caption}" style="max-width:100%;height:auto;border-radius:8px;border:1px solid #1e293b;" />
  <p style="font-size:11px;color:#94a3b8;margin:6px 0 0;font-style:italic;">${caption}</p>
</div>`;
}
