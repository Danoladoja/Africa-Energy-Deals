import { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { WatchButton } from "@/components/watch-button";
import { SEOMeta } from "@/components/seo-meta";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Shield,
  TrendingUp, Building2, DollarSign, Layers, Activity,
} from "lucide-react";

const API = "/api";

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
  "Benin": "🇧🇯", "Togo": "🇹🇬", "Gabon": "🇬🇦", "Chad": "🇹🇩",
  "Mauritania": "🇲🇷",
};

function fmt(mn: number | null | undefined): string {
  if (!mn) return "N/A";
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  return `$${mn.toFixed(0)}M`;
}

function fmtAxis(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}B`;
  return `$${v}M`;
}

interface Project {
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

interface CountryStat {
  country: string;
  region: string;
  projectCount: number;
  totalInvestmentUsdMn: number;
}

const PROJECTS_PER_PAGE = 10;

export default function CountryProfile() {
  const { countryName } = useParams<{ countryName: string }>();
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);

  const name = decodeURIComponent(countryName ?? "");
  const flag = COUNTRY_FLAGS[name] ?? "🌍";

  const { data: allCountryStats } = useQuery<CountryStat[]>({
    queryKey: ["stats-by-country"],
    queryFn: async () => (await fetch(`${API}/stats/by-country`)).json(),
    staleTime: 5 * 60 * 1000,
  });

  const countryStat = useMemo(
    () => allCountryStats?.find((c) => c.country === name),
    [allCountryStats, name]
  );

  const { data: projectsData, isLoading } = useQuery<{ projects: Project[]; total: number }>({
    queryKey: ["projects-country", name],
    queryFn: async () => (await fetch(`${API}/projects?country=${encodeURIComponent(name)}&limit=500`)).json(),
    staleTime: 5 * 60 * 1000,
    enabled: !!name,
  });

  const projects = projectsData?.projects ?? [];

  // ── Derived metrics ──────────────────────────────────────────────────────
  const totalInvestment = useMemo(
    () => projects.reduce((s, p) => s + (p.dealSizeUsdMn ?? 0), 0),
    [projects]
  );

  const avgDealSize = useMemo(() => {
    const withSize = projects.filter((p) => p.dealSizeUsdMn);
    if (!withSize.length) return null;
    return withSize.reduce((s, p) => s + (p.dealSizeUsdMn ?? 0), 0) / withSize.length;
  }, [projects]);

  // Sector breakdown
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

  // Deal flow by year
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

  // Developer table
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

  // Paginated projects table
  const totalPages = Math.ceil(projects.length / PROJECTS_PER_PAGE);
  const paginatedProjects = projects.slice(
    (page - 1) * PROJECTS_PER_PAGE,
    page * PROJECTS_PER_PAGE
  );

  const PieTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-[#1e293b] border border-white/10 p-3 rounded-xl shadow-xl text-xs">
          <p className="font-semibold text-white mb-1">{payload[0].name}</p>
          <p className="text-[#00e676]">{fmt(payload[0].value)}</p>
          <p className="text-slate-400">{payload[0].payload.count} projects</p>
        </div>
      );
    }
    return null;
  };

  const BarTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-[#1e293b] border border-white/10 p-3 rounded-xl shadow-xl text-xs">
          <p className="font-semibold text-white mb-1">{label}</p>
          <p className="text-[#00e676]">{fmt(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  const totalStr = totalInvestment >= 1000
    ? `$${(totalInvestment / 1000).toFixed(1)}B`
    : `$${totalInvestment.toFixed(0)}M`;

  return (
    <Layout>
      <SEOMeta
        title={`${name} Energy Investment`}
        description={
          projects.length
            ? `Energy deals in ${name}: ${totalStr} across ${projects.length} projects. Leading sector: ${topSector}.`
            : `Energy investment portfolio for ${name} — explore projects, sectors, and deal flow.`
        }
        url={`/countries/${encodeURIComponent(name)}`}
      />
      <PageTransition className="p-4 md:p-8 max-w-6xl mx-auto">

        {/* Back */}
        <button
          onClick={() => navigate("/countries")}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          All Countries
        </button>

        {/* ── Header ── */}
        <div className="mb-8">
          <div className="flex items-start gap-3 mb-2">
            <span className="text-5xl">{flag}</span>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">{name}</h1>
                <WatchButton watchType="country" watchValue={name} label={`Watch ${name}`} size="sm" />
              </div>
              {countryStat && (
                <p className="text-slate-400 text-sm mt-0.5">{countryStat.region}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Summary Stats Row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { icon: DollarSign, label: "Total Investment", value: isLoading ? "—" : fmt(totalInvestment) },
            { icon: Layers, label: "Projects", value: isLoading ? "—" : String(projects.length) },
            { icon: TrendingUp, label: "Top Sector", value: isLoading ? "—" : topSector, color: SECTOR_COLORS[topSector] },
            { icon: Activity, label: "Avg Deal Size", value: isLoading ? "—" : fmt(avgDealSize) },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-[#1e293b] border border-white/5 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <Icon className="w-3.5 h-3.5" style={color ? { color } : undefined} />
                <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
              </div>
              <p className="text-lg font-bold text-white font-mono">{value}</p>
            </div>
          ))}
        </div>

        {/* ── Charts Row ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">

          {/* Deal Flow by Year */}
          <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-5">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-4">Deal Flow by Year</h2>
            {isLoading ? (
              <div className="h-48 animate-pulse bg-white/5 rounded-xl" />
            ) : byYear.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-600 text-sm">No year data available</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byYear} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="year" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtAxis} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                  <RechartsTooltip content={<BarTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Bar dataKey="investment" fill="#00e676" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Sector Breakdown */}
          <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-5">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-4">Sector Breakdown</h2>
            {isLoading ? (
              <div className="h-48 animate-pulse bg-white/5 rounded-xl" />
            ) : sectorTotals.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-600 text-sm">No sector data</div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={160}>
                  <PieChart>
                    <Pie
                      data={sectorTotals}
                      dataKey="investment"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      strokeWidth={0}
                    >
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
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: SECTOR_COLORS[s.name] ?? FALLBACK_COLOR }}
                        />
                        <span className="text-xs text-slate-400 truncate">{s.name}</span>
                      </div>
                      <span className="text-xs font-mono font-medium text-slate-200 shrink-0">{fmt(s.investment)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Top Developers ── */}
        <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Top Developers
          </h2>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : developerTable.length === 0 ? (
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <p className="text-slate-400 text-sm font-medium">Data coming soon</p>
              <p className="text-slate-600 text-xs mt-1">Developer attribution is being added to existing projects via the AI Discovery Agent.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-white/5">
                    <th className="text-left py-2 pr-4 font-semibold">Developer</th>
                    <th className="text-right py-2 pr-4 font-semibold">Investment</th>
                    <th className="text-right py-2 font-semibold">Projects</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {developerTable.slice(0, 8).map((d) => (
                    <tr key={d.name} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 pr-4 font-medium text-slate-100">{d.name}</td>
                      <td className="py-3 pr-4 text-right font-mono text-slate-300">{fmt(d.investment)}</td>
                      <td className="py-3 text-right text-slate-400">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Risk & Regulatory Summary ── */}
        <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Risk & Regulatory Environment
          </h2>
          <div className="bg-white/5 rounded-xl p-4 border border-white/5">
            <p className="text-slate-400 text-sm leading-relaxed">
              Regulatory environment data coming soon. This section will include:{" "}
              <span className="text-slate-300">grid connection policies</span>,{" "}
              <span className="text-slate-300">renewable energy targets</span>,{" "}
              <span className="text-slate-300">IPP framework status</span>, and{" "}
              <span className="text-slate-300">sovereign risk indicators</span> for {name}.
            </p>
          </div>
        </div>

        {/* ── All Projects Table ── */}
        <div className="bg-[#1e293b] border border-white/5 rounded-2xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-white/5">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
              All Projects ({projects.length})
            </h2>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-white/5 bg-white/5">
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
                            <div className="h-4 bg-white/5 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : paginatedProjects.map((project) => (
                      <tr
                        key={project.id}
                        onClick={() => navigate(`/deals/${project.id}`)}
                        className="cursor-pointer hover:bg-white/5 transition-colors group"
                      >
                        <td className="py-3 px-5">
                          <span className="font-medium text-slate-100 group-hover:text-white transition-colors line-clamp-1">
                            {project.projectName}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SECTOR_COLORS[project.technology] ?? FALLBACK_COLOR }} />
                            <span className="text-slate-400 text-xs">{project.technology}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300 text-xs">{fmt(project.dealSizeUsdMn)}</td>
                        <td className="py-3 px-4">
                          {project.dealStage ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300">{project.dealStage}</span>
                          ) : <span className="text-slate-600 text-xs">—</span>}
                        </td>
                        <td className="py-3 px-5 text-right text-slate-500 text-xs">{project.announcedYear ?? "—"}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-white/5">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-4 animate-pulse">
                    <div className="h-4 bg-white/5 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-white/5 rounded w-1/2" />
                  </div>
                ))
              : paginatedProjects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => navigate(`/deals/${project.id}`)}
                    className="p-4 cursor-pointer hover:bg-white/5 transition-colors active:bg-white/5"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-medium text-slate-100 text-sm leading-tight flex-1">{project.projectName}</h3>
                      {project.dealSizeUsdMn ? (
                        <span className="font-mono text-xs font-bold text-[#00e676] shrink-0">{fmt(project.dealSizeUsdMn)}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SECTOR_COLORS[project.technology] ?? FALLBACK_COLOR }} />
                        {project.technology}
                      </span>
                      {project.dealStage && (
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-400">{project.dealStage}</span>
                      )}
                      {project.announcedYear && <span>{project.announcedYear}</span>}
                    </div>
                  </div>
                ))}
          </div>
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages} · {projects.length} projects
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pb-6">
          <button
            onClick={() => navigate("/countries")}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to All Countries
          </button>
        </div>

      </PageTransition>
    </Layout>
  );
}
