import { useMemo, useState, useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LineChart, Line, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import {
  X, ChevronDown, ArrowLeftRight, Trash2, Share2, Check,
  TrendingUp, DollarSign, Layers, Activity, ChevronUp, ChevronsUpDown,
} from "lucide-react";

const API = "/api";

// ── Per-slot accent colors ────────────────────────────────────────────────────
const SLOT_COLORS = ["#60a5fa", "#f472b6", "#fb923c"] as const;

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

const COUNTRY_FLAGS: Record<string, string> = {
  "South Africa": "🇿🇦", "Egypt": "🇪🇬", "Morocco": "🇲🇦", "Kenya": "🇰🇪",
  "Nigeria": "🇳🇬", "Ethiopia": "🇪🇹", "Ghana": "🇬🇭", "Tanzania": "🇹🇿",
  "Mozambique": "🇲🇿", "Zambia": "🇿🇲", "Zimbabwe": "🇿🇼", "Uganda": "🇺🇬",
  "Senegal": "🇸🇳", "Ivory Coast": "🇨🇮", "Côte d'Ivoire": "🇨🇮", "Mali": "🇲🇱",
  "Burkina Faso": "🇧🇫", "Niger": "🇳🇪", "Cameroon": "🇨🇲", "Rwanda": "🇷🇼",
  "Tunisia": "🇹🇳", "Algeria": "🇩🇿", "Libya": "🇱🇾", "Sudan": "🇸🇩",
  "Angola": "🇦🇴", "DRC": "🇨🇩", "Democratic Republic of Congo": "🇨🇩",
  "Namibia": "🇳🇦", "Botswana": "🇧🇼", "Malawi": "🇲🇼", "Lesotho": "🇱🇸",
  "Eswatini": "🇸🇿", "Djibouti": "🇩🇯", "Mauritius": "🇲🇺", "Madagascar": "🇲🇬",
  "Benin": "🇧🇯", "Togo": "🇹🇬", "Sierra Leone": "🇸🇱", "Liberia": "🇱🇷",
  "Guinea": "🇬🇳", "Gabon": "🇬🇦", "Congo": "🇨🇬", "Chad": "🇹🇩",
  "Mauritania": "🇲🇷",
};

function fmt(mn: number | null | undefined): string {
  if (!mn) return "N/A";
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  return `$${Math.round(mn)}M`;
}

function fmtAxis(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}B`;
  return `$${v}M`;
}

interface CountryStat {
  country: string;
  region: string;
  projectCount: number;
  totalInvestmentUsdMn: number;
}

interface Project {
  id: number;
  projectName: string;
  technology: string;
  dealSizeUsdMn?: number | null;
  announcedYear?: number | null;
  dealStage?: string | null;
  status: string;
  country: string;
}

// ── Country Selector ─────────────────────────────────────────────────────────

function CountrySelector({
  allCountries,
  selected,
  onChange,
}: {
  allCountries: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => allCountries.filter((c) =>
      c.toLowerCase().includes(search.toLowerCase()) && !selected.includes(c)
    ),
    [allCountries, search, selected]
  );

  const toggle = useCallback((country: string) => {
    if (selected.includes(country)) {
      onChange(selected.filter((c) => c !== country));
    } else if (selected.length >= 3) {
      // no-op: shown as disabled
    } else {
      onChange([...selected, country]);
      setSearch("");
    }
  }, [selected, onChange]);

  return (
    <div className="relative">
      {/* Pills + trigger */}
      <div
        className="flex flex-wrap items-center gap-2 bg-[#1e293b] border border-white/10 rounded-xl p-2.5 cursor-text min-h-[48px]"
        onClick={() => setOpen(true)}
      >
        {selected.map((c, i) => (
          <span
            key={c}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium"
            style={{ backgroundColor: `${SLOT_COLORS[i]}20`, color: SLOT_COLORS[i], border: `1px solid ${SLOT_COLORS[i]}40` }}
          >
            {COUNTRY_FLAGS[c] ?? "🌍"} {c}
            <button
              onClick={(e) => { e.stopPropagation(); onChange(selected.filter((s) => s !== c)); }}
              className="hover:opacity-70 transition-opacity ml-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {selected.length < 3 && (
          <input
            className="flex-1 bg-transparent text-sm text-slate-300 placeholder:text-slate-600 outline-none min-w-[120px]"
            placeholder={selected.length === 0 ? "Search and select countries…" : "Add another country…"}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
        )}
        <ChevronDown className="w-4 h-4 text-slate-600 ml-auto shrink-0" />
      </div>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-[#1e293b] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
            <div className="max-h-60 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-500">
                  {selected.length >= 3 ? "Maximum 3 countries selected" : "No countries match"}
                </div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c}
                    disabled={selected.length >= 3}
                    onClick={() => { toggle(c); setOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="text-lg">{COUNTRY_FLAGS[c] ?? "🌍"}</span>
                    <span className="text-slate-200">{c}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Comparison Card ──────────────────────────────────────────────────────────

interface CountryMetrics {
  country: string;
  region: string;
  totalInvestment: number;
  projectCount: number;
  topSector: string;
  avgDealSize: number | null;
}

function ComparisonCard({
  metrics,
  colorIdx,
  winners,
}: {
  metrics: CountryMetrics;
  colorIdx: number;
  winners: Record<string, number>;
}) {
  const color = SLOT_COLORS[colorIdx];
  const flag = COUNTRY_FLAGS[metrics.country] ?? "🌍";

  const rows: { label: string; key: string; value: string }[] = [
    { label: "Total Investment", key: "totalInvestment", value: fmt(metrics.totalInvestment) },
    { label: "Project Count",   key: "projectCount",   value: String(metrics.projectCount) },
    { label: "Top Sector",      key: "topSector",      value: metrics.topSector },
    { label: "Avg Deal Size",   key: "avgDealSize",    value: fmt(metrics.avgDealSize) },
  ];

  return (
    <div
      className="bg-[#1e293b] border border-white/5 rounded-2xl overflow-hidden flex-1"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-white/5" style={{ background: `${color}08` }}>
        <span className="text-3xl mb-1 block">{flag}</span>
        <h3 className="text-lg font-bold text-white leading-tight">{metrics.country}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{metrics.region}</p>
      </div>

      {/* Metrics */}
      <div className="divide-y divide-white/5">
        {rows.map(({ label, key, value }) => {
          const isWinner = winners[key] === colorIdx;
          return (
            <div key={key} className="px-5 py-3 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">{label}</span>
              <span
                className="text-sm font-semibold font-mono"
                style={isWinner ? { color } : { color: "#cbd5e1" }}
              >
                {isWinner && <span className="mr-1 text-[10px]">▲</span>}
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Chart tooltip ────────────────────────────────────────────────────────────

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f1724] border border-white/10 rounded-xl p-3 shadow-xl text-xs min-w-[140px]">
      {label && <p className="text-slate-400 font-semibold mb-2">{label}</p>}
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono text-slate-200">
            {typeof p.value === "number" && p.value > 10 ? fmt(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Sort helper ──────────────────────────────────────────────────────────────

type SortKey = "projectName" | "country" | "technology" | "dealSizeUsdMn" | "status";
type SortDir = "asc" | "desc";

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const [copied, setCopied] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("dealSizeUsdMn");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Parse ?countries= from URL
  const initialCountries = useMemo(() => {
    const params = new URLSearchParams(searchStr);
    const raw = params.get("countries");
    if (!raw) return [];
    return raw.split(",").map((c) => decodeURIComponent(c.trim())).filter(Boolean).slice(0, 3);
  }, []);

  const [selected, setSelected] = useState<string[]>(initialCountries);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: countryStats } = useQuery<CountryStat[]>({
    queryKey: ["stats-by-country"],
    queryFn: async () => (await fetch(`${API}/stats/by-country`)).json(),
    staleTime: 5 * 60 * 1000,
  });

  // Pre-populate with top 2 if none in URL
  useEffect(() => {
    if (selected.length === 0 && countryStats && countryStats.length >= 2) {
      const top2 = [...countryStats]
        .sort((a, b) => b.totalInvestmentUsdMn - a.totalInvestmentUsdMn)
        .slice(0, 2)
        .map((c) => c.country);
      setSelected(top2);
    }
  }, [countryStats]);

  const allCountries = useMemo(
    () => [...(countryStats ?? [])].sort((a, b) => a.country.localeCompare(b.country)).map((c) => c.country),
    [countryStats]
  );

  // Fetch projects for each selected country
  const q0 = useQuery<{ projects: Project[] }>({
    queryKey: ["compare-projects", selected[0]],
    queryFn: async () => (await fetch(`${API}/projects?country=${encodeURIComponent(selected[0])}&limit=500`)).json(),
    enabled: !!selected[0],
    staleTime: 5 * 60 * 1000,
  });
  const q1 = useQuery<{ projects: Project[] }>({
    queryKey: ["compare-projects", selected[1]],
    queryFn: async () => (await fetch(`${API}/projects?country=${encodeURIComponent(selected[1])}&limit=500`)).json(),
    enabled: !!selected[1],
    staleTime: 5 * 60 * 1000,
  });
  const q2 = useQuery<{ projects: Project[] }>({
    queryKey: ["compare-projects", selected[2]],
    queryFn: async () => (await fetch(`${API}/projects?country=${encodeURIComponent(selected[2])}&limit=500`)).json(),
    enabled: !!selected[2],
    staleTime: 5 * 60 * 1000,
  });

  const projectSets = useMemo(() => {
    const sets = [q0.data?.projects ?? [], q1.data?.projects ?? [], q2.data?.projects ?? []];
    return selected.map((_, i) => sets[i]);
  }, [selected, q0.data, q1.data, q2.data]);

  const isLoading = (q0.isLoading && !!selected[0]) || (q1.isLoading && !!selected[1]) || (q2.isLoading && !!selected[2]);

  // ── Derived metrics ────────────────────────────────────────────────────────

  const metrics: CountryMetrics[] = useMemo(() => {
    return selected.map((country, i) => {
      const stat = countryStats?.find((c) => c.country === country);
      const projects = projectSets[i];
      const totalInvestment = projects.reduce((s, p) => s + (p.dealSizeUsdMn ?? 0), 0);
      const withSize = projects.filter((p) => p.dealSizeUsdMn);
      const avgDealSize = withSize.length > 0
        ? withSize.reduce((s, p) => s + (p.dealSizeUsdMn ?? 0), 0) / withSize.length
        : null;

      const sectorMap: Record<string, number> = {};
      for (const p of projects) {
        sectorMap[p.technology] = (sectorMap[p.technology] ?? 0) + (p.dealSizeUsdMn ?? 0);
      }
      const topSector = Object.entries(sectorMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

      return {
        country,
        region: stat?.region ?? "Africa",
        totalInvestment,
        projectCount: projects.length,
        topSector,
        avgDealSize,
      };
    });
  }, [selected, projectSets, countryStats]);

  // Winner per metric (index of the best country for that metric)
  const winners = useMemo(() => {
    if (metrics.length < 2) return {} as Record<string, number>;
    return {
      totalInvestment: metrics.reduce((best, m, i) => m.totalInvestment > metrics[best].totalInvestment ? i : best, 0),
      projectCount:    metrics.reduce((best, m, i) => m.projectCount   > metrics[best].projectCount    ? i : best, 0),
      avgDealSize:     metrics.reduce((best, m, i) => (m.avgDealSize ?? 0) > (metrics[best].avgDealSize ?? 0) ? i : best, 0),
    };
  }, [metrics]);

  // ── Sector Mix chart ───────────────────────────────────────────────────────

  const sectorChartData = useMemo(() => {
    const sectors = new Set<string>();
    const perCountry = selected.map((_, i) => {
      const map: Record<string, number> = {};
      for (const p of projectSets[i]) {
        map[p.technology] = (map[p.technology] ?? 0) + (p.dealSizeUsdMn ?? 0);
        sectors.add(p.technology);
      }
      return map;
    });
    return [...sectors].map((sector) => {
      const row: any = { sector };
      selected.forEach((c, i) => { row[c] = perCountry[i][sector] ?? 0; });
      return row;
    }).sort((a, b) => {
      const sumA = selected.reduce((s, c) => s + (a[c] ?? 0), 0);
      const sumB = selected.reduce((s, c) => s + (b[c] ?? 0), 0);
      return sumB - sumA;
    });
  }, [selected, projectSets]);

  // ── Deal Size Distribution ─────────────────────────────────────────────────

  const BUCKETS = [
    { label: "<$50M",     min: 0,    max: 50 },
    { label: "$50–200M",  min: 50,   max: 200 },
    { label: "$200M–1B",  min: 200,  max: 1000 },
    { label: "$1B+",      min: 1000, max: Infinity },
  ];

  const dealSizeData = useMemo(() => {
    return BUCKETS.map(({ label, min, max }) => {
      const row: any = { bucket: label };
      selected.forEach((c, i) => {
        row[c] = projectSets[i].filter((p) => {
          const s = p.dealSizeUsdMn ?? 0;
          return s >= min && s < max;
        }).length;
      });
      return row;
    });
  }, [selected, projectSets]);

  // ── Investment Timeline ────────────────────────────────────────────────────

  const timelineData = useMemo(() => {
    const yearSet = new Set<number>();
    const perCountry = selected.map((_, i) => {
      const map: Record<number, number> = {};
      for (const p of projectSets[i]) {
        if (p.announcedYear) {
          map[p.announcedYear] = (map[p.announcedYear] ?? 0) + (p.dealSizeUsdMn ?? 0);
          yearSet.add(p.announcedYear);
        }
      }
      return map;
    });
    return [...yearSet].sort((a, b) => a - b).map((year) => {
      const row: any = { year };
      selected.forEach((c, i) => { row[c] = perCountry[i][year] ?? 0; });
      return row;
    });
  }, [selected, projectSets]);

  // ── Status Breakdown ───────────────────────────────────────────────────────

  const statusData = useMemo(() => {
    const statusSet = new Set<string>();
    const perCountry = selected.map((_, i) => {
      const map: Record<string, number> = {};
      for (const p of projectSets[i]) {
        if (p.status) {
          map[p.status] = (map[p.status] ?? 0) + 1;
          statusSet.add(p.status);
        }
      }
      return map;
    });
    return [...statusSet].map((status) => {
      const row: any = { status };
      selected.forEach((c, i) => { row[c] = perCountry[i][status] ?? 0; });
      return row;
    });
  }, [selected, projectSets]);

  // ── Combined projects table ────────────────────────────────────────────────

  const allProjects = useMemo(() => {
    return selected.flatMap((_, i) => projectSets[i]);
  }, [selected, projectSets]);

  const sortedProjects = useMemo(() => {
    return [...allProjects].sort((a, b) => {
      const av = a[sortKey as keyof Project] ?? "";
      const bv = b[sortKey as keyof Project] ?? "";
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [allProjects, sortKey, sortDir]);

  const countryColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    selected.forEach((c, i) => { m[c] = SLOT_COLORS[i]; });
    return m;
  }, [selected]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  }

  // ── Share ──────────────────────────────────────────────────────────────────

  function handleShare() {
    const params = new URLSearchParams({ countries: selected.join(",") });
    const url = `${window.location.origin}${window.location.pathname.replace(/compare.*/, "compare")}?${params}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasSelection = selected.length > 0;
  const hasComparison = selected.length >= 2;

  return (
    <Layout>
      <PageTransition className="p-4 md:p-8 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-1">Country Comparison</h1>
            <p className="text-muted-foreground text-base">
              Compare energy investment metrics across up to 3 African markets side-by-side.
            </p>
          </div>
          {hasComparison && (
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-sm text-slate-300 hover:border-[#00e676]/40 hover:text-[#00e676] transition-all shrink-0"
            >
              {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              {copied ? "Copied!" : "Share"}
            </button>
          )}
        </div>

        {/* Country selector */}
        <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <p className="text-sm font-semibold text-slate-300 flex-1">Select countries to compare</p>
            <div className="flex items-center gap-2">
              {selected.length === 2 && (
                <button
                  onClick={() => setSelected([selected[1], selected[0]])}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors border border-white/10"
                  title="Swap countries"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  Swap
                </button>
              )}
              {selected.length === 3 && (
                <button
                  onClick={() => setSelected([selected[1], selected[2], selected[0]])}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors border border-white/10"
                  title="Rotate order"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  Rotate
                </button>
              )}
              {hasSelection && (
                <button
                  onClick={() => setSelected([])}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors border border-white/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear All
                </button>
              )}
            </div>
          </div>
          <CountrySelector
            allCountries={allCountries}
            selected={selected}
            onChange={setSelected}
          />
          {selected.length >= 3 && (
            <p className="text-xs text-amber-400/70 mt-2 flex items-center gap-1">
              Maximum 3 countries selected. Remove one to add another.
            </p>
          )}
        </div>

        {/* Empty state */}
        {!hasSelection && (
          <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-16 text-center">
            <p className="text-slate-400 font-medium mb-1">Select at least 2 countries above to start comparing</p>
            <p className="text-slate-600 text-sm">Use the search box to find African markets</p>
          </div>
        )}

        {/* Single country hint */}
        {selected.length === 1 && (
          <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-10 text-center">
            <p className="text-slate-400 font-medium">Add one more country to see the comparison</p>
          </div>
        )}

        {/* ── Comparison Cards ────────────────────────────────────────────── */}
        {hasComparison && (
          <>
            {isLoading ? (
              <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: `repeat(${selected.length}, 1fr)` }}>
                {selected.map((_, i) => (
                  <div key={i} className="bg-[#1e293b] border border-white/5 rounded-2xl h-48 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: `repeat(${selected.length}, 1fr)` }}>
                {metrics.map((m, i) => (
                  <ComparisonCard key={m.country} metrics={m} colorIdx={i} winners={winners} />
                ))}
              </div>
            )}

            {/* ── Charts ──────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">

              {/* Sector Mix */}
              <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-5">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5" /> Sector Mix (Investment $M)
                </h2>
                {sectorChartData.length === 0 ? (
                  <div className="h-52 flex items-center justify-center text-slate-600 text-sm">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={sectorChartData} layout="vertical" margin={{ top: 0, right: 8, left: 64, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                      <XAxis type="number" tickFormatter={fmtAxis} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="sector" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                      <RechartsTooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                      <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                      {selected.map((c, i) => (
                        <Bar key={c} dataKey={c} name={c} fill={SLOT_COLORS[i]} radius={[0, 3, 3, 0]} maxBarSize={16} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Deal Size Distribution */}
              <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-5">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5" /> Deal Size Distribution (# projects)
                </h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dealSizeData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="bucket" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <RechartsTooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                    {selected.map((c, i) => (
                      <Bar key={c} dataKey={c} name={c} fill={SLOT_COLORS[i]} radius={[3, 3, 0, 0]} maxBarSize={28} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Investment Timeline */}
              <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-5">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5" /> Annual Investment Timeline
                </h2>
                {timelineData.length === 0 ? (
                  <div className="h-52 flex items-center justify-center text-slate-600 text-sm">No year data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={timelineData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="year" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={fmtAxis} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                      <RechartsTooltip content={<ChartTip />} />
                      <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                      {selected.map((c, i) => (
                        <Line
                          key={c}
                          type="monotone"
                          dataKey={c}
                          name={c}
                          stroke={SLOT_COLORS[i]}
                          strokeWidth={2}
                          dot={{ r: 3, fill: SLOT_COLORS[i] }}
                          activeDot={{ r: 5 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Status Breakdown */}
              <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-5">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" /> Deal Status Breakdown (# projects)
                </h2>
                {statusData.length === 0 ? (
                  <div className="h-52 flex items-center justify-center text-slate-600 text-sm">No status data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={statusData} layout="vertical" margin={{ top: 0, right: 8, left: 80, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="status" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} width={76} />
                      <RechartsTooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                      <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                      {selected.map((c, i) => (
                        <Bar key={c} dataKey={c} name={c} fill={SLOT_COLORS[i]} radius={[0, 3, 3, 0]} maxBarSize={16} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* ── Combined Projects Table ──────────────────────────────────── */}
            <div className="bg-[#1e293b] border border-white/5 rounded-2xl overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  All Projects ({allProjects.length})
                </h2>
                {/* Country legend */}
                <div className="flex items-center gap-3">
                  {selected.map((c, i) => (
                    <span key={c} className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SLOT_COLORS[i] }} />
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-white/5 bg-white/5">
                      {(
                        [
                          { key: "projectName", label: "Project" },
                          { key: "country",     label: "Country" },
                          { key: "technology",  label: "Sector" },
                          { key: "dealSizeUsdMn", label: "Deal Size" },
                          { key: "status",      label: "Status" },
                        ] as { key: SortKey; label: string }[]
                      ).map(({ key, label }) => (
                        <th
                          key={key}
                          className="py-3 px-4 text-left cursor-pointer hover:text-slate-300 transition-colors select-none"
                          onClick={() => toggleSort(key)}
                        >
                          <span className="flex items-center gap-1">
                            {label} <SortIcon k={key} />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {isLoading
                      ? Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i}>
                            {Array.from({ length: 5 }).map((_, j) => (
                              <td key={j} className="py-3 px-4">
                                <div className="h-4 bg-white/5 rounded animate-pulse" />
                              </td>
                            ))}
                          </tr>
                        ))
                      : sortedProjects.slice(0, 50).map((p) => {
                          const countryColor = countryColorMap[p.country];
                          return (
                            <tr
                              key={`${p.id}-${p.country}`}
                              onClick={() => navigate(`/deals/${p.id}`)}
                              className="cursor-pointer hover:bg-white/5 transition-colors group"
                            >
                              <td className="py-3 px-4">
                                <span className="font-medium text-slate-100 group-hover:text-white transition-colors line-clamp-1">
                                  {p.projectName}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                                  style={{
                                    backgroundColor: `${countryColor}18`,
                                    color: countryColor,
                                    border: `1px solid ${countryColor}30`,
                                  }}
                                >
                                  {COUNTRY_FLAGS[p.country] ?? "🌍"} {p.country}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1.5">
                                  <div
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: SECTOR_COLORS[p.technology] ?? "#94a3b8" }}
                                  />
                                  <span className="text-slate-400 text-xs">{p.technology}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-300 text-xs">{fmt(p.dealSizeUsdMn)}</td>
                              <td className="py-3 px-4">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300">{p.status}</span>
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
                {sortedProjects.length > 50 && (
                  <div className="px-5 py-3 border-t border-white/5 text-xs text-slate-600 text-center">
                    Showing top 50 of {sortedProjects.length} projects — use the Deal Tracker for the full list
                  </div>
                )}
              </div>

              {/* Mobile */}
              <div className="md:hidden divide-y divide-white/5">
                {sortedProjects.slice(0, 30).map((p) => {
                  const countryColor = countryColorMap[p.country];
                  return (
                    <div
                      key={`${p.id}-${p.country}`}
                      onClick={() => navigate(`/deals/${p.id}`)}
                      className="p-4 cursor-pointer hover:bg-white/5 transition-colors"
                      style={{ borderLeft: `3px solid ${countryColor}` }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="font-medium text-slate-100 text-sm leading-tight flex-1">{p.projectName}</p>
                        {p.dealSizeUsdMn && (
                          <span className="font-mono text-xs font-bold shrink-0" style={{ color: countryColor }}>
                            {fmt(p.dealSizeUsdMn)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                        <span style={{ color: countryColor }}>{COUNTRY_FLAGS[p.country] ?? "🌍"} {p.country}</span>
                        <span>·</span>
                        <span>{p.technology}</span>
                        <span>·</span>
                        <span>{p.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </PageTransition>
    </Layout>
  );
}
