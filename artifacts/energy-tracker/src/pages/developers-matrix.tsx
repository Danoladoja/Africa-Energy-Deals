import { useState, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import {
  PieChart, Pie, Cell as PieCell,
  AreaChart, Area, XAxis,
  ResponsiveContainer, Tooltip as RechartsTooltip,
} from "recharts";
import {
  Download, ArrowRight, X, ChevronDown, Shield, Landmark, Briefcase, HelpCircle,
} from "lucide-react";
import { exportToPng } from "@/utils/export-utils";
import { TECHNOLOGY_COLORS, TECHNOLOGY_SECTORS } from "@/config/technologyConfig";

// ── Constants ────────────────────────────────────────────────────────────────

const SECTOR_COLORS: Record<string, string> = TECHNOLOGY_COLORS;

const ALL_SECTORS = [...TECHNOLOGY_SECTORS];
const ALL_REGIONS = ["North Africa", "West Africa", "East Africa", "Central Africa", "Southern Africa"];

const STAGE_COLORS: Record<string, string> = {
  "Announced":      "#38bdf8",
  "Mandated":       "#818cf8",
  "Financial Close":"#a78bfa",
  "Construction":   "#fb923c",
  "Commissioned":   "#00e676",
  "Operational":    "#4ade80",
  "Suspended":      "#f87171",
};

// DFI/Multilateral keywords
const DFI_KEYWORDS = [
  "ifc", "afdb", "african development", "world bank", "eib", "kfw", "dbsa", "aiib",
  "proparco", "fmo", "deg ", "norfund", "cdc group", "bio invest", "dfc", "opic",
  "ofid", "isdb", "islamic development", "green climate", "ebrd", "jica", "adb",
  "itfc", "boad", "cabei", "caf ", "ecowas bank", "eadb", "shelter afrique",
  "agf", "ukef", "sida", "danida", "swedfund", "finnfund", "cofides", "simest",
];

// State / Sovereign keywords
const STATE_KEYWORDS = [
  "nnpc", "petrosen", "exim bank", "eskom", "ketraco", "tanesco", "kengen", "zesco",
  "snel", "sonelgaz", "onee", "cnooc", "cnpc", "sinopec", "snpc", "sonatrach",
  "petroci", "ghana national", "national oil", "government of", "ministry of",
  "state power", "sapp", "wapp", "gecol", "steg", "nawec", "ned ", "tcn",
  "ndphc", "rura", "ewsa", "ewsc", "electricity company of ghana",
];

export type InvestorType = "DFI" | "State" | "Private" | "Unknown";

function classifyInvestor(name: string): InvestorType {
  const lc = name.toLowerCase();
  if (DFI_KEYWORDS.some(k => lc.includes(k))) return "DFI";
  if (STATE_KEYWORDS.some(k => lc.includes(k))) return "State";
  if (name.length > 2) return "Private";
  return "Unknown";
}

const TYPE_META: Record<InvestorType, { label: string; color: string; Icon: any }> = {
  DFI:     { label: "DFI / Multilateral", color: "#38bdf8", Icon: Shield },
  State:   { label: "State / Sovereign",   color: "#a78bfa", Icon: Landmark },
  Private: { label: "Private / Commercial",color: "#fb923c", Icon: Briefcase },
  Unknown: { label: "Unknown",             color: "#6b7280", Icon: HelpCircle },
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface Project {
  id: number;
  projectName: string;
  country: string;
  region: string;
  technology: string;
  dealSizeUsdMn?: number | null;
  investors?: string | null;
  developer?: string | null;
  status: string;
  dealStage?: string | null;
  announcedYear?: number | null;
  reviewStatus?: string;
}

export interface MatrixEntityRow {
  name: string;
  totalInvestment: number;
  projectCount: number;
  countries: string[];
  topSector: string;
  sectors: Record<string, { count: number; investment: number }>;
  regions: Record<string, number>;
  stages: Record<string, number>;
  timeline: { year: number; inv: number }[];
  biggestDeal: { name: string; size: number } | null;
  avgDealSize: number;
  investorType: InvestorType;
}

function fmt(mn: number, dp = 1): string {
  if (mn >= 1000) return `$${(mn / 1000).toFixed(dp)}B`;
  if (mn > 0) return `$${mn.toFixed(0)}M`;
  return "—";
}

// ── Data extraction ──────────────────────────────────────────────────────────

export function extractMatrixEntities(projects: Project[]): MatrixEntityRow[] {
  type Acc = {
    investment: number; count: number; countries: Set<string>;
    sectors: Record<string, { count: number; investment: number }>;
    regions: Record<string, number>;
    stages: Record<string, number>;
    timeline: Record<number, number>;
    deals: { name: string; size: number }[];
  };
  const map: Record<string, Acc> = {};

  const add = (name: string, p: Project) => {
    const key = name.trim();
    if (!key || key.length < 2) return;
    if (!map[key]) map[key] = {
      investment: 0, count: 0, countries: new Set(),
      sectors: {}, regions: {}, stages: {}, timeline: {}, deals: [],
    };
    const acc = map[key];
    acc.count++;
    const inv = p.dealSizeUsdMn ?? 0;
    acc.investment += inv;
    acc.countries.add(p.country);

    const sec = p.technology;
    if (!acc.sectors[sec]) acc.sectors[sec] = { count: 0, investment: 0 };
    acc.sectors[sec].count++;
    acc.sectors[sec].investment += inv;

    const reg = ALL_REGIONS.includes(p.region) ? p.region : null;
    if (reg) acc.regions[reg] = (acc.regions[reg] ?? 0) + inv;

    const stage = p.dealStage ?? p.status ?? "Unknown";
    acc.stages[stage] = (acc.stages[stage] ?? 0) + 1;

    if (p.announcedYear) {
      acc.timeline[p.announcedYear] = (acc.timeline[p.announcedYear] ?? 0) + inv;
    }

    if (inv > 0) acc.deals.push({ name: p.projectName, size: inv });
  };

  for (const p of projects) {
    if (p.reviewStatus && p.reviewStatus !== "approved") continue;
    if (p.developer) add(p.developer, p);
    if (p.investors) p.investors.split(",").forEach(inv => add(inv.trim(), p));
  }

  return Object.entries(map)
    .filter(([, v]) => v.count >= 2)
    .map(([name, v]) => {
      const topSector = Object.entries(v.sectors).sort((a, b) => b[1].investment - a[1].investment)[0]?.[0] ?? "—";
      const biggestDeal = v.deals.length > 0 ? v.deals.sort((a, b) => b.size - a.size)[0] : null;
      const timeline = Object.entries(v.timeline)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([year, inv]) => ({ year: Number(year), inv }));
      return {
        name,
        totalInvestment: v.investment,
        projectCount: v.count,
        countries: [...v.countries].sort(),
        topSector,
        sectors: v.sectors,
        regions: v.regions,
        stages: v.stages,
        timeline,
        biggestDeal,
        avgDealSize: v.count > 0 ? v.investment / v.count : 0,
        investorType: classifyInvestor(name),
      };
    })
    .sort((a, b) => b.totalInvestment - a.totalInvestment);
}

// ── Helper: heat color ───────────────────────────────────────────────────────

function heatColor(value: number, max: number): string {
  if (!value || !max) return "rgba(255,255,255,0.02)";
  const t = Math.min(value / max, 1);
  const r = Math.round(0 + t * 0);
  const g = Math.round(230 * t);
  const b = Math.round(118 * t);
  return `rgba(${r}, ${g}, ${b}, ${0.12 + t * 0.6})`;
}

// ── Sector × Investor Bubble Matrix ─────────────────────────────────────────

const CELL_W = 76;
const CELL_H = 52;
const LEFT_PAD = 150;
const TOP_PAD = 64;
const MAX_R = 22;

function SectorBubbleMatrix({ entities }: { entities: MatrixEntityRow[] }) {
  const [tooltip, setTooltip] = useState<{
    investor: string; sector: string; inv: number; count: number;
    x: number; y: number;
  } | null>(null);

  const top15 = entities.slice(0, 15);

  const maxInv = useMemo(() => {
    let m = 0;
    for (const e of top15) for (const s of ALL_SECTORS) {
      m = Math.max(m, e.sectors[s]?.investment ?? 0);
    }
    return m;
  }, [top15]);

  const maxDeals = useMemo(() => {
    let m = 1;
    for (const e of top15) for (const s of ALL_SECTORS) {
      m = Math.max(m, e.sectors[s]?.count ?? 0);
    }
    return m;
  }, [top15]);

  const svgW = LEFT_PAD + ALL_SECTORS.length * CELL_W + 16;
  const svgH = TOP_PAD + top15.length * CELL_H + 8;

  const bubbleR = (inv: number) =>
    inv > 0 ? Math.max(4, MAX_R * Math.sqrt(inv / maxInv)) : 0;

  const bubbleOpacity = (count: number) =>
    0.3 + 0.7 * Math.min(count / maxDeals, 1);

  return (
    <div className="relative overflow-x-auto">
      <svg width={svgW} height={svgH} className="min-w-[600px]">
        {/* Column headers (sectors) */}
        {ALL_SECTORS.map((sec, si) => {
          const cx = LEFT_PAD + si * CELL_W + CELL_W / 2;
          return (
            <g key={sec}>
              <text x={cx} y={TOP_PAD - 36} textAnchor="middle" fill="var(--axis-label-muted)" fontSize={11} fontWeight={600}>
                {sec.replace(" & ", "/").replace("Grid/Storage", "Grid")}
              </text>
              <circle cx={cx} cy={TOP_PAD - 20} r={5} fill={SECTOR_COLORS[sec] ?? "#94a3b8"} opacity={0.8} />
            </g>
          );
        })}

        {top15.map((entity, ei) => {
          const cy = TOP_PAD + ei * CELL_H + CELL_H / 2;
          return (
            <g key={entity.name}>
              {/* Row label */}
              <text x={LEFT_PAD - 10} y={cy + 4} textAnchor="end" fill="var(--axis-label)" fontSize={11} fontWeight={500}>
                {entity.name.length > 18 ? entity.name.slice(0, 17) + "…" : entity.name}
              </text>

              {/* Horizontal separator */}
              <line
                x1={LEFT_PAD} y1={TOP_PAD + ei * CELL_H}
                x2={LEFT_PAD + ALL_SECTORS.length * CELL_W} y2={TOP_PAD + ei * CELL_H}
                stroke="var(--chart-grid)" strokeWidth={1}
              />

              {/* Bubbles */}
              {ALL_SECTORS.map((sec, si) => {
                const cellData = entity.sectors[sec];
                const inv = cellData?.investment ?? 0;
                const count = cellData?.count ?? 0;
                const r = bubbleR(inv);
                const cx = LEFT_PAD + si * CELL_W + CELL_W / 2;
                const color = SECTOR_COLORS[sec] ?? "#94a3b8";

                return (
                  <g key={sec}>
                    {r > 0 && (
                      <circle
                        cx={cx} cy={cy} r={r}
                        fill={color}
                        opacity={bubbleOpacity(count)}
                        style={{ cursor: "pointer" }}
                        onMouseEnter={(e) => {
                          const rect = (e.target as SVGCircleElement).closest("svg")!.getBoundingClientRect();
                          setTooltip({
                            investor: entity.name, sector: sec,
                            inv, count,
                            x: cx + LEFT_PAD * 0.1,
                            y: cy,
                          });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Vertical column separators */}
        {ALL_SECTORS.map((_, si) => (
          <line
            key={si}
            x1={LEFT_PAD + si * CELL_W} y1={TOP_PAD - 8}
            x2={LEFT_PAD + si * CELL_W} y2={TOP_PAD + top15.length * CELL_H}
            stroke="var(--chart-grid)" strokeWidth={1}
          />
        ))}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div className="absolute pointer-events-none z-30 bg-popover border border-border rounded-xl p-3 shadow-2xl text-xs min-w-[180px]"
          style={{ left: tooltip.x + 12, top: Math.max(0, tooltip.y - 60) }}>
          <p className="font-semibold text-foreground mb-1">{tooltip.investor}</p>
          <p style={{ color: SECTOR_COLORS[tooltip.sector] ?? "#94a3b8" }} className="font-medium mb-1.5">{tooltip.sector}</p>
          <div className="space-y-0.5 text-muted-foreground">
            <p>Investment: <span className="text-foreground font-mono font-bold">{fmt(tooltip.inv)}</span></p>
            <p>Deals: <span className="text-foreground font-bold">{tooltip.count}</span></p>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-6 mt-3 px-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
          <svg width="40" height="16">
            <circle cx={8} cy={8} r={4} fill="#94a3b8" opacity={0.35} />
            <circle cx={22} cy={8} r={7} fill="#94a3b8" opacity={0.55} />
            <circle cx={36} cy={8} r={10} fill="#94a3b8" opacity={0.85} />
          </svg>
          Bubble size = investment · Opacity = deal count
        </div>
      </div>
    </div>
  );
}

// ── Geography × Investor Heatmap ─────────────────────────────────────────────

function GeographyHeatmap({ entities }: { entities: MatrixEntityRow[] }) {
  const top15 = entities.slice(0, 15);

  const globalMax = useMemo(() => {
    let m = 0;
    for (const e of top15) for (const r of ALL_REGIONS) m = Math.max(m, e.regions[r] ?? 0);
    return m;
  }, [top15]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-separate border-spacing-0.5" style={{ minWidth: 520 }}>
        <thead>
          <tr>
            <th className="text-left py-1.5 pr-3 text-muted-foreground/70 font-medium text-[11px] sticky left-0 bg-card z-10 min-w-[140px]">Investor</th>
            {ALL_REGIONS.map(r => (
              <th key={r} className="text-center pb-1.5 text-[10px] text-muted-foreground/70 font-medium whitespace-nowrap">
                {r.replace(" Africa", "")}
              </th>
            ))}
            <th className="text-right py-1.5 pl-2 text-muted-foreground/70 font-medium text-[11px]">Total</th>
          </tr>
        </thead>
        <tbody>
          {top15.map(entity => (
            <tr key={entity.name}>
              <td className="py-1 pr-3 text-foreground/80 font-medium whitespace-nowrap text-[11px] sticky left-0 bg-card z-10">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: TYPE_META[entity.investorType].color }} />
                  {entity.name.length > 20 ? entity.name.slice(0, 19) + "…" : entity.name}
                </div>
              </td>
              {ALL_REGIONS.map(reg => {
                const inv = entity.regions[reg] ?? 0;
                return (
                  <td key={reg} className="p-0.5">
                    {inv > 0 ? (
                      <div
                        className="h-10 rounded-lg flex items-center justify-center text-[10px] font-mono font-bold text-foreground transition-all"
                        style={{ backgroundColor: heatColor(inv, globalMax) }}
                        title={`${entity.name} · ${reg}: ${fmt(inv)}`}
                      >
                        {fmt(inv, 0)}
                      </div>
                    ) : (
                      <div className="h-10 rounded-lg flex items-center justify-center text-[10px] text-muted-foreground/60"
                        style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
                        —
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="py-1 pl-2 text-right font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                {fmt(entity.totalInvestment)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground/50 mt-3">
        Showing top 15 investors by total investment · Color intensity = investment volume in that region
      </p>
    </div>
  );
}

// ── Investor Comparison Cards ─────────────────────────────────────────────────

function MiniSectorBar({ sectors }: { sectors: Record<string, { count: number; investment: number }> }) {
  const total = Object.values(sectors).reduce((s, v) => s + v.investment, 0);
  if (!total) return <div className="h-2 bg-muted/30 rounded-full" />;
  const sorted = Object.entries(sectors).sort((a, b) => b[1].investment - a[1].investment);
  return (
    <div className="h-2 rounded-full overflow-hidden flex" title="Sector breakdown by investment">
      {sorted.map(([sec, v]) => (
        <div key={sec} style={{
          width: `${(v.investment / total) * 100}%`,
          backgroundColor: SECTOR_COLORS[sec] ?? "#94a3b8",
        }} title={`${sec}: ${fmt(v.investment)}`} />
      ))}
    </div>
  );
}

function MiniDonut({ stages }: { stages: Record<string, number> }) {
  const data = Object.entries(stages).map(([name, value]) => ({ name, value }));
  if (!data.length) return <div className="h-16 w-16 rounded-full bg-muted/30" />;
  return (
    <PieChart width={64} height={64}>
      <Pie data={data} dataKey="value" cx={32} cy={32} innerRadius={18} outerRadius={30} paddingAngle={2} strokeWidth={0}>
        {data.map(d => <PieCell key={d.name} fill={STAGE_COLORS[d.name] ?? "#64748b"} />)}
      </Pie>
    </PieChart>
  );
}

function MiniSparkline({ timeline }: { timeline: { year: number; inv: number }[] }) {
  if (!timeline.length) return <div className="h-12 bg-muted/20 rounded-lg" />;
  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={timeline} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00e676" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#00e676" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="year" hide />
        <Area type="monotone" dataKey="inv" stroke="#00e676" strokeWidth={1.5} fill="url(#sparkGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ComparisonCard({ entity, onRemove }: { entity: MatrixEntityRow; onRemove: () => void }) {
  const [, navigate] = useLocation();
  const tm = TYPE_META[entity.investorType];
  const stageEntries = Object.entries(entity.stages).sort((a, b) => b[1] - a[1]);
  const topSectors = Object.entries(entity.sectors).sort((a, b) => b[1].investment - a[1].investment).slice(0, 3);
  return (
    <div className="bg-card border border-border/80 rounded-2xl p-5 flex flex-col gap-4 min-w-[240px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground text-sm leading-tight">{entity.name}</h3>
          <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: `${tm.color}18`, color: tm.color }}>
            <tm.Icon className="w-2.5 h-2.5" />
            {tm.label}
          </span>
        </div>
        <button onClick={onRemove} className="text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide mb-0.5">Total</p>
          <p className="text-base font-bold font-mono text-[#00e676]">{fmt(entity.totalInvestment)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide mb-0.5">Deals</p>
          <p className="text-base font-bold text-foreground">{entity.projectCount}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide mb-0.5">Countries</p>
          <p className="text-base font-bold text-foreground">{entity.countries.length}</p>
        </div>
      </div>

      {/* Avg deal size + biggest deal */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground/70">Avg deal size</span>
          <span className="font-mono text-foreground/80">{fmt(entity.avgDealSize)}</span>
        </div>
        {entity.biggestDeal && (
          <div className="flex items-start justify-between text-xs gap-2">
            <span className="text-muted-foreground/70 shrink-0">Largest deal</span>
            <span className="font-mono text-foreground/80 text-right">{entity.biggestDeal.name.length > 22
              ? entity.biggestDeal.name.slice(0, 21) + "…" : entity.biggestDeal.name}
              &nbsp;<span className="text-[#00e676] font-bold">{fmt(entity.biggestDeal.size)}</span>
            </span>
          </div>
        )}
      </div>

      {/* Countries */}
      <div>
        <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide mb-1.5">Countries Active</p>
        <div className="flex flex-wrap gap-1">
          {entity.countries.slice(0, 5).map(c => (
            <span key={c} className="text-[10px] bg-muted/30 text-muted-foreground px-1.5 py-0.5 rounded-full">{c}</span>
          ))}
          {entity.countries.length > 5 && (
            <span className="text-[10px] bg-muted/30 text-muted-foreground/50 px-1.5 py-0.5 rounded-full">+{entity.countries.length - 5}</span>
          )}
        </div>
      </div>

      {/* Sector breakdown mini bar */}
      <div>
        <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide mb-1.5">Sector Mix</p>
        <MiniSectorBar sectors={entity.sectors} />
        <div className="flex flex-wrap gap-1 mt-1.5">
          {topSectors.map(([sec]) => (
            <span key={sec} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${SECTOR_COLORS[sec] ?? "#94a3b8"}20`, color: SECTOR_COLORS[sec] ?? "#94a3b8" }}>
              {sec}
            </span>
          ))}
        </div>
      </div>

      {/* Stage donut + deal stage breakdown */}
      <div className="flex items-start gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide mb-1">Deal Stages</p>
          <MiniDonut stages={entity.stages} />
        </div>
        <div className="flex-1 pt-5 space-y-0.5">
          {stageEntries.slice(0, 4).map(([stage, count]) => (
            <div key={stage} className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage] ?? "#64748b" }} />
                <span className="text-muted-foreground/70">{stage}</span>
              </div>
              <span className="text-muted-foreground font-medium">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline sparkline */}
      <div>
        <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide mb-1.5">
          Deal Timeline&nbsp;{entity.timeline.length > 0 &&
            <span className="text-muted-foreground/50 normal-case">({entity.timeline[0]?.year}–{entity.timeline[entity.timeline.length - 1]?.year})</span>
          }
        </p>
        <MiniSparkline timeline={entity.timeline} />
      </div>

      {/* Link to profile */}
      <button
        onClick={() => navigate(`/developers/${encodeURIComponent(entity.name)}`)}
        className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70 hover:text-[#00e676] transition-colors mt-auto pt-2 border-t border-border/50"
      >
        View full profile <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}

function ComparisonTable({ entities }: { entities: MatrixEntityRow[] }) {
  if (entities.length < 2) return null;
  const rows: { label: string; values: string[] }[] = [
    {
      label: "Total Investment",
      values: entities.map(e => fmt(e.totalInvestment)),
    },
    {
      label: "Number of Deals",
      values: entities.map(e => String(e.projectCount)),
    },
    {
      label: "Countries Active",
      values: entities.map(e => String(e.countries.length)),
    },
    {
      label: "Top Sector",
      values: entities.map(e => e.topSector),
    },
    {
      label: "Avg Deal Size",
      values: entities.map(e => fmt(e.avgDealSize)),
    },
    {
      label: "Investor Type",
      values: entities.map(e => TYPE_META[e.investorType].label),
    },
  ];

  return (
    <table className="w-full text-xs mt-4">
      <thead>
        <tr className="border-b border-border/50">
          <th className="text-left py-2.5 pr-4 text-muted-foreground/70 font-medium w-40">Metric</th>
          {entities.map(e => (
            <th key={e.name} className="text-left py-2.5 px-3 text-foreground/80 font-semibold">
              {e.name.length > 18 ? e.name.slice(0, 17) + "…" : e.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.label} className="border-b border-border/40 hover:bg-muted/20">
            <td className="py-2.5 pr-4 text-muted-foreground/70 font-medium">{row.label}</td>
            {row.values.map((val, i) => (
              <td key={i} className="py-2.5 px-3 text-foreground/80 font-mono">{val}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InvestorComparison({ entities }: { entities: MatrixEntityRow[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const toggle = (name: string) => {
    setSelected(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) :
        prev.length >= 3 ? prev : [...prev, name]
    );
  };

  const selectedEntities = selected.map(name => entities.find(e => e.name === name)!).filter(Boolean);

  return (
    <div>
      {/* Multi-select dropdown */}
      <div className="relative mb-5" ref={dropRef}>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 text-sm bg-muted/30 border border-border rounded-xl px-4 py-2.5 text-foreground/80 hover:text-foreground hover:border-border transition-all min-w-[260px]"
        >
          <span className="flex-1 text-left">
            {selected.length === 0 ? "Select up to 3 investors to compare…" : selected.join(", ")}
          </span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div
            role="listbox"
            aria-multiselectable="true"
            aria-label="Select investors to compare"
            className="absolute top-full left-0 mt-1.5 z-40 bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
            style={{ width: 320, maxHeight: 320 }}
          >
            <div className="p-2 border-b border-border/50">
              <p className="text-[10px] text-muted-foreground/70 px-2">
                {selected.length}/3 selected · click to toggle
              </p>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
              {entities.slice(0, 30).map(e => {
                const isSel = selected.includes(e.name);
                const tm = TYPE_META[e.investorType];
                return (
                  <button
                    key={e.name}
                    role="option"
                    aria-selected={isSel}
                    data-investor={e.name}
                    onClick={() => toggle(e.name)}
                    disabled={!isSel && selected.length >= 3}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors
                      ${isSel ? "bg-[#00e676]/10" : "hover:bg-muted/50"}
                      ${!isSel && selected.length >= 3 ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors
                      ${isSel ? "border-[#00e676] bg-[#00e676]" : "border-border"}`}>
                      {isSel && <div className="w-2 h-0.5 bg-black rounded-full" />}
                    </div>
                    <span className="text-sm text-foreground/80 flex-1 truncate">{e.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-mono text-muted-foreground/70">{fmt(e.totalInvestment)}</span>
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tm.color }} />
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-2 border-t border-border/50">
              <button
                onClick={() => { setSelected([]); setOpen(false); }}
                className="text-xs text-muted-foreground/70 hover:text-foreground/80 px-2 transition-colors"
              >
                Clear selection
              </button>
            </div>
          </div>
        )}
      </div>

      {selected.length === 0 && (
        <div className="border border-dashed border-border rounded-2xl p-8 text-center">
          <p className="text-muted-foreground/70 text-sm">Select 2 or 3 investors above to compare them side-by-side.</p>
        </div>
      )}

      {selected.length === 1 && (
        <div className="border border-dashed border-border rounded-2xl p-8 text-center">
          <p className="text-muted-foreground/70 text-sm">Select 1 more investor to compare (up to 3 total).</p>
        </div>
      )}

      {selectedEntities.length >= 2 && (
        <>
          <div className={`grid gap-4 ${selectedEntities.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3"}`}>
            {selectedEntities.map(e => (
              <ComparisonCard
                key={e.name}
                entity={e}
                onRemove={() => setSelected(prev => prev.filter(n => n !== e.name))}
              />
            ))}
          </div>
          <div className="mt-6 bg-card/60 border border-border/50 rounded-2xl p-4 overflow-x-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">Quick Comparison</p>
            <ComparisonTable entities={selectedEntities} />
          </div>
        </>
      )}
    </div>
  );
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportMatrixCsv(entities: MatrixEntityRow[]) {
  const top15 = entities.slice(0, 15);

  // Sheet 1: Sector matrix
  const sectorRows = ["Investor,Type," + ALL_SECTORS.join(",")];
  for (const e of top15) {
    const vals = ALL_SECTORS.map(s => (e.sectors[s]?.investment ?? 0).toFixed(0));
    sectorRows.push(`"${e.name}",${e.investorType},${vals.join(",")}`);
  }

  // Sheet 2: Geography matrix
  const geoRows = ["\n\nInvestor,Type," + ALL_REGIONS.join(",")];
  for (const e of top15) {
    const vals = ALL_REGIONS.map(r => (e.regions[r] ?? 0).toFixed(0));
    geoRows.push(`"${e.name}",${e.investorType},${vals.join(",")}`);
  }

  const content = sectorRows.join("\n") + geoRows.join("\n");
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `afrienergy-investor-matrix-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Section Card wrapper ──────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 md:p-6">
      <div className="mb-4">
        <h3 className="font-bold text-base text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground/70 mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

// ── Main MatrixView component ─────────────────────────────────────────────────

export function MatrixView({ entities }: { entities: MatrixEntityRow[] }) {
  const [typeFilter, setTypeFilter] = useState<InvestorType | "All">("All");
  const [exporting, setExporting] = useState(false);
  const matrixRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() =>
    typeFilter === "All" ? entities : entities.filter(e => e.investorType === typeFilter),
    [entities, typeFilter]
  );

  const handleExportPng = async () => {
    if (!matrixRef.current) return;
    setExporting(true);
    try {
      await exportToPng(matrixRef.current, `afrienergy-investor-matrix-${new Date().toISOString().split("T")[0]}.png`);
    } finally {
      setExporting(false);
    }
  };

  const typeCounts = useMemo(() => {
    const c: Partial<Record<InvestorType | "All", number>> = { All: entities.length };
    for (const e of entities) c[e.investorType] = (c[e.investorType] ?? 0) + 1;
    return c;
  }, [entities]);

  return (
    <div className="space-y-6">
      {/* Controls bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Type filter pills */}
        <div className="flex flex-wrap gap-2">
          {(["All", "DFI", "State", "Private"] as const).map(t => {
            const count = typeCounts[t] ?? 0;
            const color = t === "All" ? "#00e676" : TYPE_META[t as InvestorType]?.color ?? "#00e676";
            const active = typeFilter === t;
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all flex items-center gap-1.5
                  ${active
                    ? "text-black font-bold"
                    : "border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                style={active ? { backgroundColor: color, borderColor: color } : {}}
              >
                {t === "All" ? "All Types" : TYPE_META[t as InvestorType].label}
                <span className={`text-[10px] ${active ? "text-black/60" : "text-muted-foreground/50"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => exportMatrixCsv(filtered)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-border transition-all"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            onClick={handleExportPng}
            disabled={exporting}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-border transition-all disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" /> {exporting ? "Exporting…" : "Export PNG"}
          </button>
        </div>
      </div>

      <div ref={matrixRef} className="space-y-6">
        {/* 2a — Sector × Investor Bubble Chart */}
        <Section
          title="Sector × Investor Bubble Chart"
          subtitle="Bubble size = investment volume · opacity = deal count · hover for details"
        >
          {filtered.length === 0
            ? <p className="text-muted-foreground/50 text-sm py-8 text-center">No investors match this filter.</p>
            : <SectorBubbleMatrix entities={filtered} />
          }
        </Section>

        {/* 2b — Geography × Investor Heatmap */}
        <Section
          title="Geography × Investor Heatmap"
          subtitle="Investment distribution across African sub-regions — reveals concentration vs. diversification"
        >
          {filtered.length === 0
            ? <p className="text-muted-foreground/50 text-sm py-8 text-center">No investors match this filter.</p>
            : <GeographyHeatmap entities={filtered} />
          }
        </Section>

        {/* 2c — Investor Comparison */}
        <Section
          title="Investor Deep Comparison"
          subtitle="Select 2–3 investors for a side-by-side breakdown across all dimensions"
        >
          <InvestorComparison entities={filtered} />
        </Section>
      </div>

      {/* Type legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground/70">
        {(Object.entries(TYPE_META) as [InvestorType, typeof TYPE_META[InvestorType]][]).map(([type, meta]) => (
          <div key={type} className="flex items-center gap-1.5">
            <meta.Icon className="w-3 h-3" style={{ color: meta.color }} />
            <span style={{ color: meta.color }}>{meta.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
