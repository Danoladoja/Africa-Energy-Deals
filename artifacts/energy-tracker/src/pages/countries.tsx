import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { WatchButton } from "@/components/watch-button";
import { SEOMeta, organizationSchema } from "@/components/seo-meta";
import { ExportDropdown } from "@/components/export-dropdown";
import { exportToPng, exportImageToPdf, exportImageToPptx } from "@/utils/export-utils";
import { ShareButton } from "@/components/share-button";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend,
} from "recharts";
import {
  Search, GitCompareArrows, TrendingUp, DollarSign, Layers, Activity,
  Building2, Shield, ChevronLeft, ChevronRight, X, ChevronDown,
  ArrowLeftRight, Trash2, Share2, Check, ChevronsUpDown, ChevronUp,
} from "lucide-react";
import { TECHNOLOGY_COLORS, TECHNOLOGY_SECTORS } from "@/config/technologyConfig";

const API = "/api";

// ─── Shared constants ────────────────────────────────────────────────────────

const SECTOR_COLORS: Record<string, string> = TECHNOLOGY_COLORS;
const FALLBACK_COLOR = "#94a3b8";

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

const SLOT_COLORS = ["#60a5fa", "#f472b6", "#fb923c"] as const;

function fmt(mn: number | null | undefined): string {
  if (!mn) return "N/A";
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  return `$${Math.round(mn)}M`;
}
function fmtAxis(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}B`;
  return `$${v}M`;
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface CountryStat {
  country: string;
  region: string;
  projectCount: number;
  totalInvestmentUsdMn: number;
}

interface ProfileProject {
  id: number;
  projectName: string;
  technology: string;
  dealSizeUsdMn?: number | null;
  capacityMw?: number | null;
  announcedYear?: number | null;
  dealStage?: string | null;
  developer?: string | null;
  status: string;
  region: string;
  country: string;
}

interface CompareProject {
  id: number;
  projectName: string;
  technology: string;
  dealSizeUsdMn?: number | null;
  announcedYear?: number | null;
  dealStage?: string | null;
  status: string;
  country: string;
}

// ─── Country Profile Panel ───────────────────────────────────────────────────

const PROJECTS_PER_PAGE = 10;

function CountryProfilePanel({
  countryName,
  countryStat,
  onCompare,
}: {
  countryName: string;
  countryStat: CountryStat | undefined;
  onCompare: (country: string) => void;
}) {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const flag = COUNTRY_FLAGS[countryName] ?? "🌍";

  useEffect(() => { setPage(1); }, [countryName]);

  const { data: projectsData, isLoading } = useQuery<{ projects: ProfileProject[]; total: number }>({
    queryKey: ["projects-country", countryName],
    queryFn: async () => (await fetch(`${API}/projects?country=${encodeURIComponent(countryName)}&limit=500`)).json(),
    staleTime: 5 * 60 * 1000,
    enabled: !!countryName,
  });

  const projects = projectsData?.projects ?? [];

  const totalInvestment = useMemo(
    () => projects.reduce((s, p) => s + (p.dealSizeUsdMn ?? 0), 0),
    [projects]
  );
  const avgDealSize = useMemo(() => {
    const withSize = projects.filter((p) => p.dealSizeUsdMn);
    if (!withSize.length) return null;
    return withSize.reduce((s, p) => s + (p.dealSizeUsdMn ?? 0), 0) / withSize.length;
  }, [projects]);

  const sectorTotals = useMemo(() => {
    const map: Record<string, { investment: number; count: number }> = {};
    for (const p of projects) {
      if (!map[p.technology]) map[p.technology] = { investment: 0, count: 0 };
      map[p.technology].investment += p.dealSizeUsdMn ?? 0;
      map[p.technology].count += 1;
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.investment - a.investment);
  }, [projects]);

  const topSector = sectorTotals[0]?.name ?? "—";

  const byYear = useMemo(() => {
    const map: Record<number, number> = {};
    for (const p of projects) {
      if (p.announcedYear) {
        map[p.announcedYear] = (map[p.announcedYear] ?? 0) + (p.dealSizeUsdMn ?? 0);
      }
    }
    return Object.entries(map)
      .map(([year, investment]) => ({ year: Number(year), investment }))
      .sort((a, b) => a.year - b.year);
  }, [projects]);

  const developerTable = useMemo(() => {
    const map: Record<string, { investment: number; count: number }> = {};
    for (const p of projects) {
      if (p.developer) {
        if (!map[p.developer]) map[p.developer] = { investment: 0, count: 0 };
        map[p.developer].investment += p.dealSizeUsdMn ?? 0;
        map[p.developer].count += 1;
      }
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.investment - a.investment);
  }, [projects]);

  const totalPages = Math.ceil(projects.length / PROJECTS_PER_PAGE);
  const paginatedProjects = projects.slice(
    (page - 1) * PROJECTS_PER_PAGE,
    page * PROJECTS_PER_PAGE
  );

  const PieTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-popover border border-border p-3 rounded-xl shadow-xl text-xs">
          <p className="font-semibold text-foreground mb-1">{payload[0].name}</p>
          <p className="text-[#00e676]">{fmt(payload[0].value)}</p>
          <p className="text-muted-foreground">{payload[0].payload.count} projects</p>
        </div>
      );
    }
    return null;
  };

  const BarTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-popover border border-border p-3 rounded-xl shadow-xl text-xs">
          <p className="font-semibold text-foreground mb-1">{label}</p>
          <p className="text-[#00e676]">{fmt(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      {/* Country header */}
      <div className="mb-6">
        <div className="flex items-start gap-3 mb-2">
          <span className="text-5xl">{flag}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">{countryName}</h2>
              <WatchButton watchType="country" watchValue={countryName} label={`Watch ${countryName}`} size="sm" />
              <button
                onClick={() => onCompare(countryName)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:text-[#00e676] hover:border-[#00e676]/30 hover:bg-[#00e676]/10 transition-all"
              >
                <GitCompareArrows className="w-3.5 h-3.5" />
                Compare with…
              </button>
              <button
                onClick={() => navigate(`/countries/${encodeURIComponent(countryName)}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
              >
                Full page →
              </button>
            </div>
            {countryStat && (
              <p className="text-muted-foreground text-sm mt-0.5">{countryStat.region}</p>
            )}
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { icon: DollarSign, label: "Total Investment", value: isLoading ? "—" : fmt(totalInvestment) },
          { icon: Layers, label: "Projects", value: isLoading ? "—" : String(projects.length) },
          { icon: TrendingUp, label: "Top Sector", value: isLoading ? "—" : topSector, color: SECTOR_COLORS[topSector] },
          { icon: Activity, label: "Avg Deal Size", value: isLoading ? "—" : fmt(avgDealSize) },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-card border border-border/50 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground/70 mb-2">
              <Icon className="w-3.5 h-3.5" style={color ? { color } : undefined} />
              <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
            </div>
            <p className="text-lg font-bold text-foreground font-mono">{value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/70 mb-4">Deal Flow by Year</h3>
          {isLoading ? (
            <div className="h-48 animate-pulse bg-muted/30 rounded-xl" />
          ) : byYear.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground/50 text-sm">No year data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byYear} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="year" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtAxis} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                <RechartsTooltip content={<BarTooltip />} cursor={{ fill: "var(--chart-grid)" }} />
                <Bar dataKey="investment" fill="#00e676" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/70 mb-4">Sector Breakdown</h3>
          {isLoading ? (
            <div className="h-48 animate-pulse bg-muted/30 rounded-xl" />
          ) : sectorTotals.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground/50 text-sm">No sector data</div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={160}>
                <PieChart>
                  <Pie data={sectorTotals} dataKey="investment" nameKey="name"
                    cx="50%" cy="50%" innerRadius={45} outerRadius={75} strokeWidth={0}>
                    {sectorTotals.map((entry) => (
                      <Cell key={entry.name} fill={SECTOR_COLORS[entry.name] ?? FALLBACK_COLOR} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2 overflow-hidden">
                {sectorTotals.slice(0, 6).map((s) => (
                  <div key={s.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: SECTOR_COLORS[s.name] ?? FALLBACK_COLOR }} />
                      <span className="text-xs text-muted-foreground truncate">{s.name}</span>
                    </div>
                    <span className="text-xs font-mono font-medium text-foreground shrink-0">{fmt(s.investment)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top Developers */}
      <div className="bg-card border border-border/50 rounded-2xl p-5 mb-6">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/70 mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          Top Developers
        </h3>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted/30 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : developerTable.length === 0 ? (
          <div className="bg-muted/30 rounded-xl p-4 text-center">
            <p className="text-muted-foreground text-sm font-medium">Data coming soon</p>
            <p className="text-muted-foreground/50 text-xs mt-1">
              Developer attribution is being added to existing projects via the AI Discovery Agent.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground/70 uppercase tracking-wider border-b border-border/50">
                  <th className="text-left py-2 pr-4 font-semibold">Developer</th>
                  <th className="text-right py-2 pr-4 font-semibold">Investment</th>
                  <th className="text-right py-2 font-semibold">Projects</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {developerTable.slice(0, 8).map((d) => (
                  <tr key={d.name} className="hover:bg-muted/50 transition-colors">
                    <td className="py-3 pr-4 font-medium text-slate-100">{d.name}</td>
                    <td className="py-3 pr-4 text-right font-mono text-foreground/80">{fmt(d.investment)}</td>
                    <td className="py-3 text-right text-muted-foreground">{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Risk & Regulatory */}
      <div className="bg-card border border-border/50 rounded-2xl p-5 mb-6">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Risk & Regulatory Environment
        </h3>
        <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
          <p className="text-muted-foreground text-sm leading-relaxed">
            Regulatory environment data coming soon. This section will include:{" "}
            <span className="text-foreground/80">grid connection policies</span>,{" "}
            <span className="text-foreground/80">renewable energy targets</span>,{" "}
            <span className="text-foreground/80">IPP framework status</span>, and{" "}
            <span className="text-foreground/80">sovereign risk indicators</span> for {countryName}.
          </p>
        </div>
      </div>

      {/* All Projects */}
      <div className="bg-card border border-border/50 rounded-2xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-border/50">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/70">
            All Projects ({projects.length})
          </h3>
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground/70 uppercase tracking-wider border-b border-border/50 bg-muted/30">
                <th className="text-left py-3 px-5 font-semibold">Project Name</th>
                <th className="text-left py-3 px-4 font-semibold">Sector</th>
                <th className="text-right py-3 px-4 font-semibold">Deal Size</th>
                <th className="text-left py-3 px-4 font-semibold">Stage</th>
                <th className="text-right py-3 px-5 font-semibold">Year</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="py-3 px-4">
                          <div className="h-4 bg-muted/30 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : paginatedProjects.map((project) => (
                    <tr
                      key={project.id}
                      onClick={() => navigate(`/deals/${project.id}`)}
                      className="cursor-pointer hover:bg-muted/50 transition-colors group"
                    >
                      <td className="py-3 px-5">
                        <span className="font-medium text-slate-100 group-hover:text-foreground transition-colors line-clamp-1">
                          {project.projectName}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: SECTOR_COLORS[project.technology] ?? FALLBACK_COLOR }} />
                          <span className="text-muted-foreground text-xs">{project.technology}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-foreground/80 text-xs">{fmt(project.dealSizeUsdMn)}</td>
                      <td className="py-3 px-4">
                        {project.dealStage
                          ? <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-foreground/80">{project.dealStage}</span>
                          : <span className="text-muted-foreground/50 text-xs">—</span>}
                      </td>
                      <td className="py-3 px-5 text-right text-muted-foreground/70 text-xs">{project.announcedYear ?? "—"}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden divide-y divide-white/5">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 animate-pulse">
                  <div className="h-4 bg-muted/30 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted/30 rounded w-1/2" />
                </div>
              ))
            : paginatedProjects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => navigate(`/deals/${project.id}`)}
                  className="p-4 cursor-pointer hover:bg-muted/50 transition-colors active:bg-muted/30"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-medium text-slate-100 text-sm leading-tight flex-1">{project.projectName}</h4>
                    {project.dealSizeUsdMn ? (
                      <span className="font-mono text-xs font-bold text-[#00e676] shrink-0">{fmt(project.dealSizeUsdMn)}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground/70 flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SECTOR_COLORS[project.technology] ?? FALLBACK_COLOR }} />
                      {project.technology}
                    </span>
                    {project.dealStage && (
                      <span className="px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground">{project.dealStage}</span>
                    )}
                    {project.announcedYear && <span>{project.announcedYear}</span>}
                  </div>
                </div>
              ))}
        </div>
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-border/50 flex items-center justify-between">
            <span className="text-xs text-muted-foreground/70">
              Page {page} of {totalPages} · {projects.length} projects
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Compare tab ─────────────────────────────────────────────────────────────

type SortKey = "projectName" | "country" | "technology" | "dealSizeUsdMn" | "status";
type SortDir = "asc" | "desc";

interface CountryMetrics {
  country: string;
  region: string;
  totalInvestment: number;
  projectCount: number;
  topSector: string;
  avgDealSize: number | null;
}

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
      // no-op
    } else {
      onChange([...selected, country]);
      setSearch("");
    }
  }, [selected, onChange]);

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-xl p-2.5 cursor-text min-h-[48px]"
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
            className="flex-1 bg-transparent text-sm text-foreground/80 placeholder:text-muted-foreground/50 outline-none min-w-[120px]"
            placeholder={selected.length === 0 ? "Search and select countries…" : "Add another country…"}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
        )}
        <ChevronDown className="w-4 h-4 text-muted-foreground/50 ml-auto shrink-0" />
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
            <div className="max-h-60 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground/70">
                  {selected.length >= 3 ? "Maximum 3 countries selected" : "No countries match"}
                </div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c}
                    disabled={selected.length >= 3}
                    onClick={() => { toggle(c); setOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="text-lg">{COUNTRY_FLAGS[c] ?? "🌍"}</span>
                    <span className="text-foreground">{c}</span>
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
    <div className="bg-card border border-border/50 rounded-2xl overflow-hidden flex-1"
      style={{ borderLeft: `3px solid ${color}` }}>
      <div className="px-5 pt-5 pb-4 border-b border-border/50" style={{ background: `${color}08` }}>
        <span className="text-3xl mb-1 block">{flag}</span>
        <h3 className="text-lg font-bold text-foreground leading-tight">{metrics.country}</h3>
        <p className="text-xs text-muted-foreground/70 mt-0.5">{metrics.region}</p>
      </div>
      <div className="divide-y divide-white/5">
        {rows.map(({ label, key, value }) => {
          const isWinner = winners[key] === colorIdx;
          return (
            <div key={key} className="px-5 py-3 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground/70">{label}</span>
              <span className="text-sm font-semibold font-mono" style={isWinner ? { color } : { color: "#cbd5e1" }}>
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

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-xl p-3 shadow-xl text-xs min-w-[140px]">
      {label && <p className="text-muted-foreground font-semibold mb-2">{label}</p>}
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono text-foreground">
            {typeof p.value === "number" && p.value > 10 ? fmt(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function CompareTab({
  allCountries,
  initialSelected,
}: {
  allCountries: string[];
  initialSelected: string[];
}) {
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [sortKey, setSortKey] = useState<SortKey>("dealSizeUsdMn");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<string[]>(initialSelected);

  useEffect(() => {
    if (initialSelected.length > 0) setSelected(initialSelected);
  }, [initialSelected.join(",")]);

  const q0 = useQuery<{ projects: CompareProject[] }>({
    queryKey: ["compare-projects", selected[0]],
    queryFn: async () => (await fetch(`${API}/projects?country=${encodeURIComponent(selected[0])}&limit=500`)).json(),
    enabled: !!selected[0],
    staleTime: 5 * 60 * 1000,
  });
  const q1 = useQuery<{ projects: CompareProject[] }>({
    queryKey: ["compare-projects", selected[1]],
    queryFn: async () => (await fetch(`${API}/projects?country=${encodeURIComponent(selected[1])}&limit=500`)).json(),
    enabled: !!selected[1],
    staleTime: 5 * 60 * 1000,
  });
  const q2 = useQuery<{ projects: CompareProject[] }>({
    queryKey: ["compare-projects", selected[2]],
    queryFn: async () => (await fetch(`${API}/projects?country=${encodeURIComponent(selected[2])}&limit=500`)).json(),
    enabled: !!selected[2],
    staleTime: 5 * 60 * 1000,
  });

  const { data: countryStats } = useQuery<CountryStat[]>({
    queryKey: ["stats-by-country"],
    queryFn: async () => (await fetch(`${API}/stats/by-country`)).json(),
    staleTime: 5 * 60 * 1000,
  });

  const projectSets = useMemo(() => {
    const sets = [q0.data?.projects ?? [], q1.data?.projects ?? [], q2.data?.projects ?? []];
    return selected.map((_, i) => sets[i]);
  }, [selected, q0.data, q1.data, q2.data]);

  const isLoading = (q0.isLoading && !!selected[0]) || (q1.isLoading && !!selected[1]) || (q2.isLoading && !!selected[2]);

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
      return { country, region: stat?.region ?? "Africa", totalInvestment, projectCount: projects.length, topSector, avgDealSize };
    });
  }, [selected, projectSets, countryStats]);

  const winners = useMemo(() => {
    if (metrics.length < 2) return {} as Record<string, number>;
    return {
      totalInvestment: metrics.reduce((best, m, i) => m.totalInvestment > metrics[best].totalInvestment ? i : best, 0),
      projectCount:    metrics.reduce((best, m, i) => m.projectCount   > metrics[best].projectCount    ? i : best, 0),
      avgDealSize:     metrics.reduce((best, m, i) => (m.avgDealSize ?? 0) > (metrics[best].avgDealSize ?? 0) ? i : best, 0),
    };
  }, [metrics]);

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

  const allProjects = useMemo(() => selected.flatMap((_, i) => projectSets[i]), [selected, projectSets]);

  const sortedProjects = useMemo(() => {
    return [...allProjects].sort((a, b) => {
      const av = a[sortKey as keyof CompareProject] ?? "";
      const bv = b[sortKey as keyof CompareProject] ?? "";
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
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  }

  function handleShare() {
    const params = new URLSearchParams({ countries: selected.join(",") });
    const url = `${window.location.origin}${window.location.pathname}?tab=compare&${params}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const hasSelection = selected.length > 0;
  const hasComparison = selected.length >= 2;

  return (
    <div ref={contentRef}>
      {/* Selector card */}
      <div className="bg-card border border-border/50 rounded-2xl p-4 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <p className="text-sm font-semibold text-foreground/80 flex-1">Select up to 3 countries to compare</p>
          <div className="flex items-center gap-2">
            {selected.length === 2 && (
              <button
                onClick={() => setSelected([selected[1], selected[0]])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border border-border"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Swap
              </button>
            )}
            {selected.length === 3 && (
              <button
                onClick={() => setSelected([selected[1], selected[2], selected[0]])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border border-border"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Rotate
              </button>
            )}
            {hasSelection && (
              <button
                onClick={() => setSelected([])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground/70 hover:text-red-400 hover:bg-red-400/10 transition-colors border border-border"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
            {hasComparison && (
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs text-foreground/80 hover:border-[#00e676]/40 hover:text-[#00e676] transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Share"}
              </button>
            )}
          </div>
        </div>
        <CountrySelector allCountries={allCountries} selected={selected} onChange={setSelected} />
        {selected.length >= 3 && (
          <p className="text-xs text-amber-400/70 mt-2">
            Maximum 3 countries selected. Remove one to add another.
          </p>
        )}
      </div>

      {!hasSelection && (
        <div className="bg-card border border-border/50 rounded-2xl p-16 text-center">
          <GitCompareArrows className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium mb-1">Select at least 2 countries above to start comparing</p>
          <p className="text-muted-foreground/50 text-sm">Use the search box to find African markets</p>
        </div>
      )}
      {selected.length === 1 && (
        <div className="bg-card border border-border/50 rounded-2xl p-10 text-center">
          <p className="text-muted-foreground font-medium">Add one more country to see the comparison</p>
        </div>
      )}

      {hasComparison && (
        <>
          {/* Export button when comparing */}
          {hasComparison && (
            <div className="flex justify-end mb-4">
              <ExportDropdown
                label="Export"
                options={[
                  {
                    id: "png",
                    label: "PNG Screenshot",
                    description: "Full comparison as image",
                    type: "png",
                    onExport: async () => {
                      if (!contentRef.current) return;
                      const names = selected.join("-vs-").toLowerCase().replace(/\s+/g, "-");
                      await exportToPng(contentRef.current, `afrienergy-compare-${names}.png`);
                    },
                  },
                  {
                    id: "pdf",
                    label: "PDF Report",
                    description: "A4 landscape with comparison charts",
                    type: "pdf",
                    onExport: async () => {
                      if (!contentRef.current) return;
                      const names = selected.join(" vs ");
                      const filename = `afrienergy-compare-${selected.join("-vs-").toLowerCase().replace(/\s+/g, "-")}.pdf`;
                      await exportImageToPdf(contentRef.current, `Country Comparison: ${names}`, filename);
                    },
                  },
                  {
                    id: "pptx",
                    label: "PowerPoint Slide",
                    description: "Branded slide with comparison",
                    type: "pptx",
                    onExport: async () => {
                      if (!contentRef.current) return;
                      const names = selected.join(" vs ");
                      const filename = `afrienergy-compare-${selected.join("-vs-").toLowerCase().replace(/\s+/g, "-")}.pptx`;
                      await exportImageToPptx(contentRef.current, `Country Comparison: ${names}`, filename);
                    },
                  },
                ]}
              />
            </div>
          )}

          {/* Comparison cards */}
          {isLoading ? (
            <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: `repeat(${selected.length}, 1fr)` }}>
              {selected.map((_, i) => (
                <div key={i} className="bg-card border border-border/50 rounded-2xl h-48 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: `repeat(${selected.length}, 1fr)` }}>
              {metrics.map((m, i) => (
                <ComparisonCard key={m.country} metrics={m} colorIdx={i} winners={winners} />
              ))}
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            <div className="bg-card border border-border/50 rounded-2xl p-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-4 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5" /> Sector Mix (Investment $M)
              </h3>
              {sectorChartData.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-muted-foreground/50 text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={sectorChartData} layout="vertical" margin={{ top: 0, right: 8, left: 64, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                    <XAxis type="number" tickFormatter={fmtAxis} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="sector" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                    <RechartsTooltip content={<ChartTip />} cursor={{ fill: "var(--chart-grid)" }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                    {selected.map((c, i) => (
                      <Bar key={c} dataKey={c} name={c} fill={SLOT_COLORS[i]} radius={[0, 3, 3, 0]} maxBarSize={16} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-4 flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5" /> Deal Size Distribution (# projects)
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dealSizeData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="bucket" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <RechartsTooltip content={<ChartTip />} cursor={{ fill: "var(--chart-grid)" }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                  {selected.map((c, i) => (
                    <Bar key={c} dataKey={c} name={c} fill={SLOT_COLORS[i]} radius={[3, 3, 0, 0]} maxBarSize={28} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-4 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" /> Annual Investment Timeline
              </h3>
              {timelineData.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-muted-foreground/50 text-sm">No year data available</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={timelineData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="year" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtAxis} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                    <RechartsTooltip content={<ChartTip />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                    {selected.map((c, i) => (
                      <Line key={c} type="monotone" dataKey={c} name={c} stroke={SLOT_COLORS[i]}
                        strokeWidth={2} dot={{ r: 3, fill: SLOT_COLORS[i] }} activeDot={{ r: 5 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-4 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" /> Deal Status Breakdown (# projects)
              </h3>
              {statusData.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-muted-foreground/50 text-sm">No status data</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={statusData} layout="vertical" margin={{ top: 0, right: 8, left: 80, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="status" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} width={76} />
                    <RechartsTooltip content={<ChartTip />} cursor={{ fill: "var(--chart-grid)" }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                    {selected.map((c, i) => (
                      <Bar key={c} dataKey={c} name={c} fill={SLOT_COLORS[i]} radius={[0, 3, 3, 0]} maxBarSize={16} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Combined projects table */}
          <div className="bg-card border border-border/50 rounded-2xl overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                All Projects ({allProjects.length})
              </h3>
              <div className="flex items-center gap-3">
                {selected.map((c, i) => (
                  <span key={c} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SLOT_COLORS[i] }} />
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground/70 uppercase tracking-wider border-b border-border/50 bg-muted/30">
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
                        className="py-3 px-4 text-left cursor-pointer hover:text-foreground/80 transition-colors select-none"
                        onClick={() => toggleSort(key)}
                      >
                        <span className="flex items-center gap-1">{label} <SortIcon k={key} /></span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {isLoading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 5 }).map((_, j) => (
                            <td key={j} className="py-3 px-4"><div className="h-4 bg-muted/30 rounded animate-pulse" /></td>
                          ))}
                        </tr>
                      ))
                    : sortedProjects.slice(0, 50).map((p) => {
                        const countryColor = countryColorMap[p.country];
                        return (
                          <tr
                            key={`${p.id}-${p.country}`}
                            onClick={() => navigate(`/deals/${p.id}`)}
                            className="cursor-pointer hover:bg-muted/50 transition-colors group"
                          >
                            <td className="py-3 px-4">
                              <span className="font-medium text-slate-100 group-hover:text-foreground transition-colors line-clamp-1">
                                {p.projectName}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                                style={{ backgroundColor: `${countryColor}18`, color: countryColor, border: `1px solid ${countryColor}30` }}
                              >
                                {COUNTRY_FLAGS[p.country] ?? "🌍"} {p.country}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: SECTOR_COLORS[p.technology] ?? FALLBACK_COLOR }} />
                                <span className="text-muted-foreground text-xs">{p.technology}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-foreground/80 text-xs">{fmt(p.dealSizeUsdMn)}</td>
                            <td className="py-3 px-4">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-foreground/80">{p.status}</span>
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
              {sortedProjects.length > 50 && (
                <div className="px-5 py-3 border-t border-border/50 text-xs text-muted-foreground/50 text-center">
                  Showing top 50 of {sortedProjects.length} projects — use the Deal Tracker for the full list
                </div>
              )}
            </div>
            <div className="md:hidden divide-y divide-white/5">
              {sortedProjects.slice(0, 30).map((p) => {
                const countryColor = countryColorMap[p.country];
                return (
                  <div
                    key={`${p.id}-${p.country}`}
                    onClick={() => navigate(`/deals/${p.id}`)}
                    className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
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
                    <div className="flex items-center gap-2 text-xs text-muted-foreground/70 flex-wrap">
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
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CountriesPage() {
  const searchStr = useSearch();
  const [, navigate] = useLocation();

  // Parse initial tab and country from URL params
  const initParams = useMemo(() => {
    const p = new URLSearchParams(searchStr);
    const tab = p.get("tab") === "compare" ? "compare" : "profiles";
    const country = p.get("country") ?? null;
    const countries = p.get("countries")
      ? p.get("countries")!.split(",").map((c) => decodeURIComponent(c.trim())).filter(Boolean).slice(0, 3)
      : [];
    return { tab, country, countries };
  }, []);

  const [activeTab, setActiveTab] = useState<"profiles" | "compare">(initParams.tab as any);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(initParams.country);
  const [compareInitial, setCompareInitial] = useState<string[]>(initParams.countries);
  const [search, setSearch] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: countryStats, isLoading } = useQuery<CountryStat[]>({
    queryKey: ["stats-by-country"],
    queryFn: async () => (await fetch(`${API}/stats/by-country`)).json(),
    staleTime: 5 * 60 * 1000,
  });

  const sorted = useMemo(
    () => [...(countryStats ?? [])].sort((a, b) => b.totalInvestmentUsdMn - a.totalInvestmentUsdMn),
    [countryStats]
  );

  const allCountries = useMemo(
    () => [...sorted].sort((a, b) => a.country.localeCompare(b.country)).map((c) => c.country),
    [sorted]
  );

  const totalInvestment = useMemo(
    () => sorted.reduce((s, c) => s + c.totalInvestmentUsdMn, 0),
    [sorted]
  );

  // Auto-select top country on first load
  useEffect(() => {
    if (!selectedCountry && sorted.length > 0) {
      setSelectedCountry(sorted[0].country);
    }
  }, [sorted]);

  const filteredCountries = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter((c) => c.country.toLowerCase().includes(q));
  }, [sorted, search]);

  function handleCompareFromProfile(country: string) {
    setCompareInitial([country]);
    setActiveTab("compare");
  }

  const selectedStat = useMemo(
    () => sorted.find((c) => c.country === selectedCountry),
    [sorted, selectedCountry]
  );

  function fmt2(mn: number): string {
    if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
    return `$${mn.toFixed(0)}M`;
  }

  function downloadCountriesCSV() {
    const headers = ["Country", "Region", "Projects", "Total Investment (USD M)"];
    const rows = sorted.map(c => [
      c.country,
      c.region,
      c.projectCount,
      c.totalInvestmentUsdMn.toFixed(0),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `afrienergy-countries-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Layout>
      <SEOMeta
        title="Country Profiles"
        description="Explore energy investment activity across African markets. Detailed profiles, sector breakdowns, and side-by-side country comparisons."
        keywords="Africa energy investment by country, African energy markets, country energy profiles, African power sector"
        url="/countries"
        jsonLd={[
          organizationSchema(),
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "African Energy Investment Country Profiles",
            description: "Browse energy investment profiles for 40+ African countries including deal counts, investment totals, and sector breakdowns.",
            url: "https://afrienergytracker.io/countries",
            publisher: { "@type": "Organization", name: "AfriEnergy Tracker", url: "https://afrienergytracker.io" },
            about: { "@type": "Thing", name: "African energy investment" },
          },
        ]}
      />
      <PageTransition className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">

        {/* Header */}
        <header className="mb-6 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Countries & Markets</h1>
            <p className="text-muted-foreground text-base md:text-lg">
              Explore energy investment profiles and compare African markets side-by-side.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-1">
            <ShareButton
              text="Explore African energy investment country profiles and market comparisons on AfriEnergy Tracker."
            />
            <ExportDropdown
              size="sm"
              options={[
                {
                  id: "csv",
                  label: "Download CSV",
                  description: "Countries investment summary",
                  type: "png",
                  onExport: async () => downloadCountriesCSV(),
                },
                {
                  id: "png",
                  label: "Download PNG",
                  description: "Snapshot of this page",
                  type: "png",
                  onExport: async () => {
                    if (!contentRef.current) return;
                    await exportToPng(contentRef.current, `afrienergy-countries-${new Date().toISOString().split("T")[0]}.png`);
                  },
                },
                {
                  id: "pdf",
                  label: "Download PDF",
                  description: "PDF report of this page",
                  type: "pdf",
                  onExport: async () => {
                    if (!contentRef.current) return;
                    await exportImageToPdf(contentRef.current, "Countries & Markets", `afrienergy-countries-${new Date().toISOString().split("T")[0]}.pdf`);
                  },
                },
              ]}
            />
          </div>
        </header>

        <div ref={contentRef} className="flex flex-col flex-1 min-h-0">
        {/* Summary banner */}
        {!isLoading && sorted.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6 shrink-0">
            <div className="bg-card border border-border/50 rounded-2xl p-4">
              <p className="text-xs text-muted-foreground/70 uppercase tracking-wider mb-1">Markets Tracked</p>
              <p className="text-2xl font-bold text-foreground">{sorted.length} <span className="text-base font-normal text-muted-foreground">countries</span></p>
            </div>
            <div className="bg-card border border-border/50 rounded-2xl p-4">
              <p className="text-xs text-muted-foreground/70 uppercase tracking-wider mb-1">Combined Investment</p>
              <p className="text-2xl font-bold text-foreground font-mono">{fmt2(totalInvestment)}</p>
            </div>
            <div className="bg-card border border-border/50 rounded-2xl p-4">
              <p className="text-xs text-muted-foreground/70 uppercase tracking-wider mb-1">Largest Market</p>
              <p className="text-2xl font-bold text-foreground">
                {COUNTRY_FLAGS[sorted[0]?.country] ?? "🌍"} {sorted[0]?.country}
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 bg-card border border-border/50 rounded-2xl p-1 w-fit shrink-0">
          {(["profiles", "compare"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab
                  ? "bg-[#00e676] text-black shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "profiles" ? "Country Profiles" : "Compare Markets"}
            </button>
          ))}
        </div>

        {/* ── Profiles tab ── */}
        {activeTab === "profiles" && (
          <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-5">

            {/* Sidebar: country list */}
            <div className="md:w-64 shrink-0 flex flex-col min-h-0">
              {/* Mobile: dropdown */}
              <div className="md:hidden mb-4">
                <select
                  className="w-full bg-card border border-border text-foreground rounded-xl px-4 py-3 text-sm outline-none"
                  value={selectedCountry ?? ""}
                  onChange={(e) => setSelectedCountry(e.target.value || null)}
                >
                  <option value="">Select a country…</option>
                  {sorted.map((c) => (
                    <option key={c.country} value={c.country}>
                      {COUNTRY_FLAGS[c.country] ?? "🌍"} {c.country} — {fmt2(c.totalInvestmentUsdMn)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Desktop: searchable list */}
              <div className="hidden md:flex flex-col min-h-0 bg-card border border-border/50 rounded-2xl overflow-hidden">
                <div className="p-3 border-b border-border/50 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70" />
                    <input
                      className="w-full bg-muted/30 border border-border rounded-xl pl-8 pr-3 py-2 text-sm text-foreground/80 placeholder:text-muted-foreground/50 outline-none focus:border-[#00e676]/30 focus:bg-[#00e676]/5 transition-all"
                      placeholder="Filter countries…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {isLoading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="px-4 py-3 border-b border-border/50 animate-pulse">
                          <div className="h-4 bg-muted/30 rounded w-3/4 mb-1.5" />
                          <div className="h-3 bg-muted/30 rounded w-1/2" />
                        </div>
                      ))
                    : filteredCountries.map((stat, rank) => {
                        const flag = COUNTRY_FLAGS[stat.country] ?? "🌍";
                        const isSelected = selectedCountry === stat.country;
                        return (
                          <button
                            key={stat.country}
                            onClick={() => setSelectedCountry(stat.country)}
                            className={`w-full text-left px-4 py-3 border-b border-border/50 transition-all flex items-center gap-3 group ${
                              isSelected
                                ? "bg-[#00e676]/10 border-l-2 border-l-[#00e676]"
                                : "hover:bg-muted/50"
                            }`}
                          >
                            <span className="text-lg shrink-0">{flag}</span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold truncate ${isSelected ? "text-[#00e676]" : "text-foreground"}`}>
                                {stat.country}
                              </p>
                              <p className="text-xs text-muted-foreground/70 font-mono">{fmt2(stat.totalInvestmentUsdMn)}</p>
                            </div>
                            <span className="text-xs text-slate-700 shrink-0">#{rank + 1}</span>
                          </button>
                        );
                      })}
                  {filteredCountries.length === 0 && !isLoading && (
                    <div className="px-4 py-8 text-center text-muted-foreground/50 text-sm">No countries match</div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: profile panel */}
            <div className="flex-1 min-h-0 flex flex-col overflow-y-auto md:overflow-visible">
              {selectedCountry ? (
                <CountryProfilePanel
                  key={selectedCountry}
                  countryName={selectedCountry}
                  countryStat={selectedStat}
                  onCompare={handleCompareFromProfile}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-muted-foreground text-base font-medium mb-1">Select a country from the list</p>
                    <p className="text-muted-foreground/50 text-sm">Click any market to view its investment profile</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Compare tab ── */}
        {activeTab === "compare" && (
          <div className="flex-1 overflow-y-auto min-h-0">
            <CompareTab allCountries={allCountries} initialSelected={compareInitial} />
          </div>
        )}
        </div>{/* /contentRef */}

      </PageTransition>
    </Layout>
  );
}
