import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useGetSummaryStats } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { SEOMeta, datasetSchema } from "@/components/seo-meta";
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  ComposedChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid,
  BarChart,
} from "recharts";
import {
  Activity, Globe, Zap, DollarSign, TrendingUp, Briefcase,
  ChevronDown, ChevronUp, Filter, X, Leaf, Flame, Cpu,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareButton } from "@/components/share-button";
import { ExportDropdown } from "@/components/export-dropdown";
import { generateDashboardPdf } from "@/utils/generate-dashboard-pdf";
import { generateDashboardPptx } from "@/utils/generate-dashboard-pptx";
import { exportToPng } from "@/utils/export-utils";

const API = "/api";

// ── Color constants ───────────────────────────────────────────────────────────
const SECTOR_COLORS: Record<string, string> = {
  "Solar":          "#facc15",
  "Wind":           "#38bdf8",
  "Hydro":          "#22d3ee",
  "Grid & Storage": "#a78bfa",
  "Oil & Gas":      "#f87171",
  "Coal":           "#6b7280",
  "Nuclear":        "#fb923c",
  "Bioenergy":      "#4ade80",
};
const ENERGY_GROUPS = {
  Renewable:      { sectors: ["Solar", "Wind", "Hydro", "Bioenergy"],   color: "#00e676" },
  "Fossil Fuel":  { sectors: ["Oil & Gas", "Coal"],                     color: "#f87171" },
  Infrastructure: { sectors: ["Grid & Storage", "Nuclear"],              color: "#38bdf8" },
} as const;
const FUNNEL_STAGES = ["Announced", "Mandated", "Financial Close", "Construction", "Commissioned"];
const FUNNEL_COLORS = ["#94a3b8", "#facc15", "#22d3ee", "#38bdf8", "#00e676"];

// ── Types ─────────────────────────────────────────────────────────────────────
interface Project {
  id: number;
  projectName: string;
  country: string;
  region: string;
  technology: string;
  dealSizeUsdMn?: number | null;
  investors?: string | null;
  developer?: string | null;
  dealStage?: string | null;
  status: string;
  announcedYear?: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(mn: number | null | undefined, decimals = 1): string {
  if (!mn) return "—";
  if (mn >= 1000) return `$${(mn / 1000).toFixed(decimals)}B`;
  return `$${mn.toFixed(0)}M`;
}
function fmtAxis(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}B`;
  if (v >= 1) return `$${v}M`;
  return "";
}
function normalizeStage(p: Project): string {
  const s = (p.dealStage || p.status || "").toLowerCase().trim();
  if (s.includes("commission") || s.includes("operational") || s === "active") return "Commissioned";
  if (s.includes("construct")) return "Construction";
  if (s.includes("financial close") || s.includes("financing closed") || s.includes("financial_close")) return "Financial Close";
  if (s.includes("mandated")) return "Mandated";
  if (s.includes("suspended")) return "Suspended";
  return "Announced";
}

// ── Small reusable components ─────────────────────────────────────────────────
function ChartCard({
  title,
  subtitle,
  icon: Icon,
  iconColor,
  children,
  defaultOpen = true,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<any>;
  iconColor?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`bg-[#1e293b] border border-white/5 rounded-2xl overflow-hidden ${className}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/3 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-4 h-4 shrink-0" style={{ color: iconColor ?? "#00e676" }} />
          <div>
            <h3 className="font-bold text-base text-white">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-slate-600 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />}
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}

function StdTooltip({ active, payload, label, fmt: fmtFn = fmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f172a] border border-white/10 p-3 rounded-xl shadow-xl text-xs">
      {label && <p className="font-semibold text-white mb-1.5">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 mb-0.5">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="text-white font-medium font-mono">
            {typeof p.value === "number" && p.name?.toLowerCase().includes("count")
              ? p.value
              : fmtFn(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const isAll = selected.length === 0;

  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);
  };

  function Checkmark() {
    return (
      <svg className="w-2.5 h-2.5 text-[#0b0f1a]" fill="none" viewBox="0 0 12 12">
        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
          !isAll
            ? "bg-[#00e676]/10 border-[#00e676]/30 text-[#00e676]"
            : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
        }`}
      >
        <Filter className="w-3.5 h-3.5" />
        {label}
        {!isAll && (
          <span className="bg-[#00e676] text-[#0b0f1a] text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
            {selected.length}
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 opacity-50" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-[#1e293b] border border-white/10 rounded-xl shadow-2xl py-2 min-w-44 max-h-64 overflow-y-auto">
          {/* All option */}
          <button
            onClick={() => { onChange([]); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-white/5 cursor-pointer text-sm text-slate-300 hover:text-white text-left border-b border-white/5 mb-1"
          >
            <div
              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                isAll ? "bg-[#00e676] border-[#00e676]" : "border-white/20"
              }`}
            >
              {isAll && <Checkmark />}
            </div>
            <span className="font-medium">All {label}</span>
          </button>
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => toggle(opt)}
              className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-white/5 cursor-pointer text-sm text-slate-300 hover:text-white text-left"
            >
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  selected.includes(opt)
                    ? "bg-[#00e676] border-[#00e676]"
                    : "border-white/20"
                }`}
              >
                {selected.includes(opt) && <Checkmark />}
              </div>
              <span className="truncate">{opt}</span>
            </button>
          ))}
          {!isAll && (
            <div className="border-t border-white/5 mt-1 pt-1">
              <button
                onClick={() => { onChange([]); setOpen(false); }}
                className="w-full px-4 py-1.5 text-xs text-red-400 hover:text-red-300 text-left"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Funnel Visualization ──────────────────────────────────────────────────────
function FunnelViz({ data }: { data: { stage: string; count: number; investment: number; color: string }[] }) {
  const maxCount = Math.max(1, ...data.map(d => d.count));
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const widthPct = 30 + 70 * (d.count / maxCount);
        const prev = i > 0 ? data[i - 1] : null;
        const convPct = prev && prev.count > 0 ? Math.round((d.count / prev.count) * 100) : null;
        return (
          <div key={d.stage}>
            {convPct !== null && (
              <div className="flex items-center justify-center gap-2 py-0.5">
                <div className="h-px flex-1 bg-white/5" />
                <span className="text-[10px] text-slate-600 font-medium">↓ {convPct}% conversion</span>
                <div className="h-px flex-1 bg-white/5" />
              </div>
            )}
            <div className="flex items-center gap-4">
              <div className="w-28 text-right text-xs text-slate-400 font-medium shrink-0">{d.stage}</div>
              <div className="flex-1 relative h-11 flex items-center justify-center" style={{ paddingLeft: `${(100 - widthPct) / 2}%`, paddingRight: `${(100 - widthPct) / 2}%` }}>
                <div
                  className="w-full h-full rounded-lg flex items-center justify-between px-3 gap-2"
                  style={{ backgroundColor: `${d.color}22`, border: `1px solid ${d.color}44` }}
                >
                  <span className="text-xs font-bold" style={{ color: d.color }}>{d.count} deals</span>
                  <span className="text-xs font-mono text-white/70">{fmt(d.investment)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [, navigate] = useLocation();

  const contentRef = useRef<HTMLDivElement>(null);

  // ── Filters ──
  const [yearRange, setYearRange] = useState<[number, number]>([2007, 2026]);
  const [selCountries, setSelCountries] = useState<string[]>([]);
  const [selTechs, setSelTechs]     = useState<string[]>([]);
  const hasFilters = selCountries.length > 0 || selTechs.length > 0 || yearRange[0] > 2007 || yearRange[1] < 2026;

  // ── Data fetches ──
  const { data: summary, isLoading: loadingSummary } = useGetSummaryStats();

  const { data: projectsData, isLoading: loadingProjects } = useQuery<{ projects: Project[] }>({
    queryKey: ["dashboard-all-projects"],
    queryFn: () => fetch(`${API}/projects?limit=500`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const allProjects = projectsData?.projects ?? [];
  const allCountries = useMemo(() => [...new Set(allProjects.map(p => p.country))].sort(), [allProjects]);
  const allTechs     = useMemo(() => [...new Set(allProjects.map(p => p.technology))].sort(), [allProjects]);
  const yearMin = useMemo(() => Math.min(...allProjects.map(p => p.announcedYear ?? 2026).filter(y => y > 2000)), [allProjects]);
  const yearMax = useMemo(() => Math.max(...allProjects.map(p => p.announcedYear ?? 2007).filter(y => y > 2000)), [allProjects]);

  // ── Filtered projects ──
  const filtered = useMemo(() => {
    return allProjects.filter(p => {
      if (selCountries.length > 0 && !selCountries.includes(p.country)) return false;
      if (selTechs.length > 0    && !selTechs.includes(p.technology))   return false;
      if (p.announcedYear && (p.announcedYear < yearRange[0] || p.announcedYear > yearRange[1])) return false;
      return true;
    });
  }, [allProjects, selCountries, selTechs, yearRange]);

  const isLoading = loadingSummary || loadingProjects;

  // ── Chart data derivations ──

  // 1. Energy Transition Donut
  const transitionData = useMemo(() => {
    const groups: Record<string, { investment: number; count: number }> = {
      Renewable: { investment: 0, count: 0 },
      "Fossil Fuel": { investment: 0, count: 0 },
      Infrastructure: { investment: 0, count: 0 },
    };
    for (const p of filtered) {
      for (const [groupName, g] of Object.entries(ENERGY_GROUPS)) {
        if ((g.sectors as readonly string[]).includes(p.technology)) {
          groups[groupName].investment += p.dealSizeUsdMn ?? 0;
          groups[groupName].count++;
        }
      }
    }
    const total = Object.values(groups).reduce((s, g) => s + g.investment, 0);
    return Object.entries(groups).map(([name, g]) => ({
      name,
      investment: g.investment,
      count: g.count,
      pct: total > 0 ? Math.round((g.investment / total) * 100) : 0,
      color: ENERGY_GROUPS[name as keyof typeof ENERGY_GROUPS].color,
    }));
  }, [filtered]);

  // 2. Capital by Year
  const yearData = useMemo(() => {
    const map: Record<number, { annual: number; count: number }> = {};
    for (const p of filtered) {
      const y = p.announcedYear;
      if (!y || y < 2000 || y > 2030) continue;
      if (!map[y]) map[y] = { annual: 0, count: 0 };
      map[y].annual += p.dealSizeUsdMn ?? 0;
      map[y].count++;
    }
    let cumulative = 0;
    return Object.entries(map)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, v]) => {
        cumulative += v.annual;
        return { year: Number(year), annual: v.annual, cumulative, count: v.count };
      });
  }, [filtered]);

  // 3. Deal Count by Technology
  const techCountData = useMemo(() => {
    const map: Record<string, { count: number; investment: number }> = {};
    for (const p of filtered) {
      if (!map[p.technology]) map[p.technology] = { count: 0, investment: 0 };
      map[p.technology].count++;
      map[p.technology].investment += p.dealSizeUsdMn ?? 0;
    }
    return Object.entries(map)
      .map(([technology, v]) => ({ technology, ...v, color: SECTOR_COLORS[technology] ?? "#94a3b8" }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  // 4. Top 10 Investors
  const investorData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of filtered) {
      const entities = [
        p.developer,
        ...(p.investors || "").split(",").map(s => s.trim()),
      ].filter(Boolean) as string[];
      for (const e of entities) {
        map[e] = (map[e] ?? 0) + (p.dealSizeUsdMn ?? 0);
      }
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, investment]) => ({ name, investment }));
  }, [filtered]);

  // 5. Deal Pipeline Funnel
  const funnelData = useMemo(() => {
    const stageMap: Record<string, { count: number; investment: number }> = {};
    for (const stage of [...FUNNEL_STAGES, "Suspended"]) {
      stageMap[stage] = { count: 0, investment: 0 };
    }
    for (const p of filtered) {
      const stage = normalizeStage(p);
      if (stageMap[stage]) {
        stageMap[stage].count++;
        stageMap[stage].investment += p.dealSizeUsdMn ?? 0;
      }
    }
    const suspended = stageMap["Suspended"];
    return {
      funnel: FUNNEL_STAGES.map((stage, i) => ({
        stage,
        count: stageMap[stage].count,
        investment: stageMap[stage].investment,
        color: FUNNEL_COLORS[i],
      })).filter(d => d.count > 0),
      suspended,
    };
  }, [filtered]);

  // 6. Heatmap
  const heatmapData = useMemo(() => {
    const sectors = Object.keys(SECTOR_COLORS);
    const countryTotals: Record<string, number> = {};
    const cellMap: Record<string, Record<string, { inv: number; count: number }>> = {};

    for (const p of filtered) {
      countryTotals[p.country] = (countryTotals[p.country] ?? 0) + (p.dealSizeUsdMn ?? 0);
      if (!cellMap[p.country]) cellMap[p.country] = {};
      if (!cellMap[p.country][p.technology]) cellMap[p.country][p.technology] = { inv: 0, count: 0 };
      cellMap[p.country][p.technology].inv += p.dealSizeUsdMn ?? 0;
      cellMap[p.country][p.technology].count++;
    }

    const topCountries = Object.entries(countryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([c]) => c);

    const globalMax = Math.max(1, ...Object.values(cellMap).flatMap(row => Object.values(row).map(c => c.inv)));

    return { sectors, countries: topCountries, cells: cellMap, globalMax };
  }, [filtered]);

  function heatmapCellColor(inv: number, max: number): string {
    if (!inv) return "rgba(255,255,255,0.02)";
    const t = Math.log1p(inv) / Math.log1p(max);
    const g = Math.round(77 + (230 - 77) * t);
    const b = Math.round(42 + (118 - 42) * t);
    return `rgba(0,${g},${b},${0.3 + 0.6 * t})`;
  }

  /* ── PDF export ── */
  const handleDownloadPdf = useCallback(() => {
    /* Build country rows from heatmapData */
    const countryTotals: Record<string, { investment: number; count: number }> = {};
    for (const p of filtered) {
      if (!countryTotals[p.country]) countryTotals[p.country] = { investment: 0, count: 0 };
      countryTotals[p.country].investment += p.dealSizeUsdMn ?? 0;
      countryTotals[p.country].count++;
    }
    const countryRows = Object.entries(countryTotals)
      .sort((a, b) => b[1].investment - a[1].investment)
      .slice(0, 10)
      .map(([country, v]) => ({ country, ...v }));

    generateDashboardPdf({
      totalInvestmentUsdMn: summary?.totalInvestmentUsdMn ?? 0,
      totalProjects:        summary?.totalProjects ?? filtered.length,
      totalCountries:       summary?.totalCountries ?? Object.keys(countryTotals).length,
      totalSectors:         summary?.totalSectors ?? summary?.totalTechnologies ?? techCountData.length,
      sectors:              techCountData,
      transition:           transitionData,
      countries:            countryRows,
      yearRange,
      filters: { countries: selCountries, techs: selTechs },
    });
  }, [filtered, summary, techCountData, transitionData, yearRange, selCountries, selTechs]);

  /* ── PNG export ── */
  const handleDownloadPng = useCallback(async () => {
    if (!contentRef.current) return;
    await exportToPng(
      contentRef.current,
      `afrienergy-dashboard-${new Date().toISOString().slice(0, 10)}.png`,
    );
  }, []);

  /* ── PPTX export ── */
  const handleDownloadPptx = useCallback(async () => {
    const countryTotals: Record<string, { investment: number; count: number }> = {};
    for (const p of filtered) {
      if (!countryTotals[p.country]) countryTotals[p.country] = { investment: 0, count: 0 };
      countryTotals[p.country].investment += p.dealSizeUsdMn ?? 0;
      countryTotals[p.country].count++;
    }
    const countryRows = Object.entries(countryTotals)
      .sort((a, b) => b[1].investment - a[1].investment)
      .slice(0, 10)
      .map(([country, v]) => ({ country, ...v }));

    await generateDashboardPptx({
      totalInvestmentUsdMn: summary?.totalInvestmentUsdMn ?? 0,
      totalProjects:        summary?.totalProjects ?? filtered.length,
      totalCountries:       summary?.totalCountries ?? Object.keys(countryTotals).length,
      totalSectors:         summary?.totalSectors ?? summary?.totalTechnologies ?? techCountData.length,
      sectors:              techCountData,
      transition:           transitionData,
      countries:            countryRows,
      yearRange,
      filters: { countries: selCountries, techs: selTechs },
    });
  }, [filtered, summary, techCountData, transitionData, yearRange, selCountries, selTechs]);

  const TransitionTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-[#0f172a] border border-white/10 p-3 rounded-xl shadow-xl text-xs">
        <p className="font-semibold text-white mb-1">{d.name}</p>
        <p style={{ color: d.color }} className="font-bold font-mono">{fmt(d.investment)}</p>
        <p className="text-slate-400">{d.count} projects · {d.pct}% of total</p>
      </div>
    );
  };

  return (
    <Layout>
      <SEOMeta
        title="Market Overview"
        description="Interactive dashboard — African energy investment by sector, country, and year. Live charts covering 123+ deals across 26 countries."
        url="/dashboard"
        jsonLd={datasetSchema()}
      />
      <PageTransition className="p-4 md:p-8 max-w-7xl mx-auto">
        <div ref={contentRef} className="space-y-6">

        {/* ── Header ── */}
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-1">Market Overview</h1>
            <p className="text-slate-400 text-sm md:text-base">
              Comprehensive deal flow analytics — Africa's energy transition.
              {hasFilters && (
                <span className="ml-2 text-[#00e676] font-medium">
                  {filtered.length} of {allProjects.length} projects shown
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <ShareButton
              text={summary
                ? `🌍 Africa Energy Investment: ${fmt(summary.totalInvestmentUsdMn)} across ${summary.totalProjects} projects in ${summary.totalCountries} countries.`
                : "🌍 Africa Energy Investment Tracker"}
              variant="icon-label"
              className="border border-white/10 rounded-xl px-3 py-2 bg-[#1e293b] hover:bg-white/10"
            />
            <ExportDropdown
              label="Export"
              options={[
                {
                  id: "pdf",
                  label: "PDF Report",
                  description: "Data-driven A4 overview with charts",
                  type: "pdf",
                  onExport: async () => handleDownloadPdf(),
                },
                {
                  id: "png",
                  label: "PNG Screenshot",
                  description: "Full dashboard as image",
                  type: "png",
                  onExport: handleDownloadPng,
                },
                {
                  id: "pptx",
                  label: "PowerPoint Deck",
                  description: "4-slide branded presentation",
                  type: "pptx",
                  onExport: handleDownloadPptx,
                },
              ]}
            />
          </div>
        </header>

        {/* ── Global Filters ── */}
        <div className="bg-[#1e293b] border border-white/5 rounded-2xl px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              <Filter className="w-3.5 h-3.5" />
              Filters
            </div>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <span className="text-xs text-slate-400">Year:</span>
              <input
                type="number"
                min={yearMin}
                max={yearRange[1]}
                value={yearRange[0]}
                onChange={e => setYearRange([Number(e.target.value), yearRange[1]])}
                className="w-14 bg-transparent text-xs text-white outline-none text-center font-mono"
              />
              <span className="text-slate-600">→</span>
              <input
                type="number"
                min={yearRange[0]}
                max={yearMax}
                value={yearRange[1]}
                onChange={e => setYearRange([yearRange[0], Number(e.target.value)])}
                className="w-14 bg-transparent text-xs text-white outline-none text-center font-mono"
              />
            </div>
            <MultiSelect
              label="Countries"
              options={allCountries}
              selected={selCountries}
              onChange={setSelCountries}
            />
            <MultiSelect
              label="Sectors"
              options={allTechs}
              selected={selTechs}
              onChange={setSelTechs}
            />
            {hasFilters && (
              <button
                onClick={() => { setSelCountries([]); setSelTechs([]); setYearRange([2007, 2026]); }}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20"
              >
                <X className="w-3.5 h-3.5" />
                Clear filters
              </button>
            )}
          </div>
          {hasFilters && (selCountries.length > 0 || selTechs.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/5">
              {selCountries.map(c => (
                <span key={c} className="flex items-center gap-1 text-[11px] bg-[#00e676]/10 text-[#00e676] border border-[#00e676]/20 px-2 py-0.5 rounded-full">
                  {c}
                  <button onClick={() => setSelCountries(selCountries.filter(x => x !== c))}>
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              {selTechs.map(t => (
                <span key={t} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border" style={{ backgroundColor: `${SECTOR_COLORS[t]}20`, color: SECTOR_COLORS[t], borderColor: `${SECTOR_COLORS[t]}40` }}>
                  {t}
                  <button onClick={() => setSelTechs(selTechs.filter(x => x !== t))}>
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Stats Strip ── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          <StatCard title="Total Investment"  value={summary ? fmt(summary.totalInvestmentUsdMn) : ""} icon={DollarSign} loading={isLoading} />
          <StatCard title="Total Projects"    value={summary ? String(summary.totalProjects)       : ""} icon={Briefcase}  loading={isLoading} />
          <StatCard title="Countries Covered" value={summary ? String(summary.totalCountries)       : ""} icon={Globe}      loading={isLoading} />
          <StatCard title="In Development"    value={summary ? String(summary.activeProjects    ?? 0) : ""} icon={Activity}   loading={isLoading} />
          <StatCard title="Operational"       value={summary ? String(summary.completedProjects ?? 0) : ""} icon={TrendingUp} loading={isLoading} />
          <StatCard title="Sectors"           value={summary ? String(summary.totalSectors ?? summary.totalTechnologies ?? "—") : ""} icon={Zap} loading={isLoading} />
        </div>

        {/* ── 1. Energy Transition Overview ── */}
        <ChartCard
          title="Energy Transition Overview"
          subtitle="Renewable vs Fossil Fuel vs Infrastructure investment split"
          icon={Leaf}
          iconColor="#00e676"
        >
          {isLoading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : (
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="w-full md:w-56 h-56 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={transitionData}
                      dataKey="investment"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={96}
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {transitionData.map(d => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<TransitionTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-3">
                {transitionData.map(d => (
                  <div key={d.name} className="flex items-center gap-4">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-white">{d.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-500">{d.count} projects</span>
                          <span className="font-mono text-sm font-bold" style={{ color: d.color }}>{fmt(d.investment)}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${d.pct}%`, backgroundColor: d.color, opacity: 0.8 }}
                        />
                      </div>
                      <p className="text-right text-[10px] text-slate-500 mt-0.5">{d.pct}% of total</p>
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-white/5">
                  <p className="text-[11px] text-slate-500">
                    Renewable = Solar, Wind, Hydro, Bioenergy ·
                    Fossil = Oil &amp; Gas, Coal ·
                    Infrastructure = Grid &amp; Storage, Nuclear
                  </p>
                </div>
              </div>
            </div>
          )}
        </ChartCard>

        {/* ── 2. Capital Committed by Year ── */}
        <ChartCard
          title="Capital Committed by Year"
          subtitle="Annual deal volume (bars) + cumulative total (line)"
          icon={TrendingUp}
          iconColor="#38bdf8"
        >
          {isLoading ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : yearData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-slate-600 text-sm">No year data available</div>
          ) : (
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={yearData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="annualGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#38bdf8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left"  tickFormatter={fmtAxis} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={fmtAxis} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                  <RechartsTooltip content={<StdTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="annual"
                    name="Annual Volume"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    fill="url(#annualGrad)"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="cumulative"
                    name="Cumulative"
                    stroke="#00e676"
                    strokeWidth={2.5}
                    dot={false}
                    strokeDasharray="6 3"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex items-center gap-6 mt-3 text-xs text-slate-500">
            <div className="flex items-center gap-2"><div className="w-8 h-0.5 bg-[#38bdf8]" /> Annual Volume</div>
            <div className="flex items-center gap-2"><div className="w-8 h-0.5 border-t-2 border-dashed border-[#00e676]" /> Cumulative Total</div>
          </div>
        </ChartCard>

        {/* ── 3 & 4: Side-by-side ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* 3. Deal Count by Technology */}
          <ChartCard
            title="Deals by Technology"
            subtitle="Count of deals per sector, sorted descending"
            icon={Zap}
            iconColor="#facc15"
          >
            {isLoading ? (
              <Skeleton className="h-48 w-full rounded-xl" />
            ) : (
              <div className="h-56 md:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={techCountData} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="technology" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={88} />
                    <RechartsTooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-[#0f172a] border border-white/10 p-3 rounded-xl text-xs shadow-xl">
                            <p className="font-semibold mb-1" style={{ color: d.color }}>{label}</p>
                            <p className="text-white">{d.count} deals</p>
                            <p className="text-slate-400 font-mono">{fmt(d.investment)}</p>
                          </div>
                        );
                      }}
                      cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    />
                    <Bar dataKey="count" name="Deals" radius={[0, 4, 4, 0]}>
                      {techCountData.map(d => (
                        <Cell key={d.technology} fill={d.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          {/* 4. Top 10 Investors */}
          <ChartCard
            title="Top 10 Investors by Volume"
            subtitle="Total deal size attributed per investor / developer"
            icon={Briefcase}
            iconColor="#fb923c"
          >
            {isLoading ? (
              <Skeleton className="h-48 w-full rounded-xl" />
            ) : investorData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-slate-600 text-sm">
                No investor data yet — developer field is being populated.
              </div>
            ) : (
              <div className="h-56 md:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={investorData} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                    <XAxis type="number" tickFormatter={fmtAxis} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={88}
                      tickFormatter={v => v.length > 12 ? v.slice(0, 12) + "…" : v}
                    />
                    <RechartsTooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-[#0f172a] border border-white/10 p-3 rounded-xl text-xs shadow-xl">
                            <p className="font-semibold text-white mb-1">{label}</p>
                            <p className="text-[#a855f7] font-mono font-bold">{fmt(payload[0].value as number)}</p>
                          </div>
                        );
                      }}
                      cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    />
                    <Bar dataKey="investment" name="Volume" fill="#fb923c" radius={[0, 4, 4, 0]} fillOpacity={0.85} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>

        {/* ── 5. Deal Pipeline Funnel ── */}
        <ChartCard
          title="Deal Pipeline Funnel"
          subtitle="Announced → Mandated → Financial Close → Construction → Commissioned"
          icon={Activity}
          iconColor="#38bdf8"
        >
          {isLoading ? (
            <Skeleton className="h-56 w-full rounded-xl" />
          ) : funnelData.funnel.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-600 text-sm">No stage data</div>
          ) : (
            <div>
              <FunnelViz data={funnelData.funnel} />
              {funnelData.suspended.count > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Suspended</span>
                  <span className="text-xs text-red-400 font-medium">{funnelData.suspended.count} deals</span>
                  <span className="text-xs text-slate-500 font-mono">{fmt(funnelData.suspended.investment)}</span>
                </div>
              )}
            </div>
          )}
        </ChartCard>

        {/* ── 6. Country × Sector Heatmap ── */}
        <ChartCard
          title="Country × Sector Heatmap"
          subtitle="Investment intensity — top 15 countries by total. Click a cell to filter deals."
          icon={Globe}
          iconColor="#38bdf8"
        >
          {isLoading ? (
            <Skeleton className="h-80 w-full rounded-xl" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-separate border-spacing-0.5" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th className="text-left py-1.5 pr-3 text-slate-500 font-medium text-[11px] sticky left-0 bg-[#1e293b] z-10">
                      Country
                    </th>
                    {heatmapData.sectors.map(s => (
                      <th key={s} className="text-center pb-1.5 text-[10px] text-slate-500 font-medium whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: SECTOR_COLORS[s] }} />
                          <span className="truncate max-w-[56px]" title={s}>{s.replace(" & ", "/").replace("Grid/Storage", "Grid")}</span>
                        </div>
                      </th>
                    ))}
                    <th className="text-right py-1.5 pl-2 text-slate-500 font-medium text-[11px]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {heatmapData.countries.map(country => {
                    const rowTotal = heatmapData.sectors.reduce(
                      (s, sector) => s + (heatmapData.cells[country]?.[sector]?.inv ?? 0),
                      0
                    );
                    return (
                      <tr key={country}>
                        <td className="py-1 pr-3 text-slate-300 font-medium whitespace-nowrap text-[11px] sticky left-0 bg-[#1e293b] z-10">
                          {country}
                        </td>
                        {heatmapData.sectors.map(sector => {
                          const cell = heatmapData.cells[country]?.[sector];
                          const inv = cell?.inv ?? 0;
                          return (
                            <td key={sector} className="p-0.5">
                              {inv > 0 ? (
                                <button
                                  onClick={() => navigate(`/deals?country=${encodeURIComponent(country)}&technology=${encodeURIComponent(sector)}`)}
                                  className="w-full h-10 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all hover:scale-105 hover:ring-1 hover:ring-white/20"
                                  style={{ backgroundColor: heatmapCellColor(inv, heatmapData.globalMax) }}
                                  title={`${country} · ${sector}: ${fmt(inv)} · ${cell?.count} deal${cell?.count !== 1 ? "s" : ""}`}
                                >
                                  <span className="text-[9px] font-mono font-bold text-white leading-none">{fmt(inv, 0)}</span>
                                  <span className="text-[8px] text-white/50 leading-none">{cell?.count}×</span>
                                </button>
                              ) : (
                                <div className="w-full h-10 rounded-lg" style={{ backgroundColor: "rgba(255,255,255,0.02)" }} />
                              )}
                            </td>
                          );
                        })}
                        <td className="py-1 pl-2 text-right font-mono text-[11px] text-slate-400 whitespace-nowrap">
                          {fmt(rowTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-600 mt-3">
                Showing top 15 countries by total investment · Click any colored cell to filter the deal tracker
              </p>
            </div>
          )}
        </ChartCard>

        </div>
      </PageTransition>
    </Layout>
  );
}

// ── StatCard (unchanged) ──────────────────────────────────────────────────────
function StatCard({ title, value, icon: Icon, loading }: {
  title: string; value: string; icon: React.ComponentType<any>; loading: boolean;
}) {
  return (
    <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-4 md:p-5 hover:-translate-y-0.5 transition-all duration-200 group relative overflow-hidden">
      <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-8 transition-opacity">
        <Icon className="w-16 h-16 text-[#00e676]" />
      </div>
      <div className="flex items-center gap-2 mb-3 relative z-10">
        <div className="w-8 h-8 rounded-lg bg-[#00e676]/10 flex items-center justify-center text-[#00e676]">
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="relative z-10">
        {loading
          ? <Skeleton className="h-8 w-20" />
          : <div className="text-2xl md:text-3xl font-bold tracking-tight text-white font-mono">{value}</div>}
      </div>
    </div>
  );
}
