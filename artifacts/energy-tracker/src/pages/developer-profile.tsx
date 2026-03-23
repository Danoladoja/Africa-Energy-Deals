import { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import {
  ArrowLeft, ChevronUp, ChevronDown,
  DollarSign, Layers, Globe, TrendingUp,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";

const API = "/api";

const SECTOR_COLORS: Record<string, string> = {
  "Solar":          "#f59e0b",
  "Wind":           "#06b6d4",
  "Hydro":          "#3b82f6",
  "Grid & Storage": "#14b8a6",
  "Oil & Gas":      "#f97316",
  "Coal":           "#78716c",
  "Nuclear":        "#a855f7",
  "Bioenergy":      "#22c55e",
};
const FALLBACK_COLOR = "#94a3b8";

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
  country: string;
  region: string;
  technology: string;
  dealSizeUsdMn?: number | null;
  investors?: string | null;
  developer?: string | null;
  dealStage?: string | null;
  announcedYear?: number | null;
  status: string;
  latitude?: number | null;
  longitude?: number | null;
}

type SortKey = "dealSizeUsdMn" | "country" | "status" | "announcedYear";

const ROWS_PER_PAGE = 10;

function entityMatchesProject(entityName: string, project: Project): boolean {
  if (project.developer?.toLowerCase() === entityName.toLowerCase()) return true;
  if (project.investors) {
    return project.investors.split(",").some(
      (inv) => inv.trim().toLowerCase() === entityName.toLowerCase()
    );
  }
  return false;
}

export default function DeveloperProfile() {
  const { entityName } = useParams<{ entityName: string }>();
  const [, navigate] = useLocation();
  const [sortKey, setSortKey] = useState<SortKey>("dealSizeUsdMn");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const name = decodeURIComponent(entityName ?? "");

  const { data: projectsData, isLoading } = useQuery<{ projects: Project[] }>({
    queryKey: ["all-projects-developers"],
    queryFn: async () => (await fetch(`${API}/projects?limit=500`)).json(),
    staleTime: 5 * 60 * 1000,
  });

  const projects = useMemo(
    () => (projectsData?.projects ?? []).filter((p) => entityMatchesProject(name, p)),
    [projectsData, name]
  );

  // ── Derived stats ────────────────────────────────────────────────────────
  const totalInvestment = useMemo(() => projects.reduce((s, p) => s + (p.dealSizeUsdMn ?? 0), 0), [projects]);
  const countries = useMemo(() => [...new Set(projects.map((p) => p.country))].sort(), [projects]);

  const sectorData = useMemo(() => {
    const map: Record<string, { count: number; investment: number }> = {};
    for (const p of projects) {
      if (!map[p.technology]) map[p.technology] = { count: 0, investment: 0 };
      map[p.technology].count++;
      map[p.technology].investment += p.dealSizeUsdMn ?? 0;
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [projects]);

  const countryData = useMemo(() => {
    const map: Record<string, { count: number; investment: number }> = {};
    for (const p of projects) {
      if (!map[p.country]) map[p.country] = { count: 0, investment: 0 };
      map[p.country].count++;
      map[p.country].investment += p.dealSizeUsdMn ?? 0;
    }
    return Object.entries(map)
      .map(([country, v]) => ({ country, ...v }))
      .sort((a, b) => b.investment - a.investment);
  }, [projects]);

  const primarySector = sectorData[0]?.name ?? "—";

  const mapProjects = useMemo(
    () => projects.filter((p) => p.latitude != null && p.longitude != null),
    [projects]
  );

  const mapCenter = useMemo((): [number, number] => {
    if (!mapProjects.length) return [0, 20];
    const avgLat = mapProjects.reduce((s, p) => s + p.latitude!, 0) / mapProjects.length;
    const avgLon = mapProjects.reduce((s, p) => s + p.longitude!, 0) / mapProjects.length;
    return [avgLat, avgLon];
  }, [mapProjects]);

  // ── Sorted projects table ────────────────────────────────────────────────
  const sortedProjects = useMemo(() => {
    const arr = [...projects];
    arr.sort((a, b) => {
      let diff = 0;
      if (sortKey === "dealSizeUsdMn") diff = (a.dealSizeUsdMn ?? 0) - (b.dealSizeUsdMn ?? 0);
      else if (sortKey === "country") diff = a.country.localeCompare(b.country);
      else if (sortKey === "status") diff = a.status.localeCompare(b.status);
      else if (sortKey === "announcedYear") diff = (a.announcedYear ?? 0) - (b.announcedYear ?? 0);
      return sortDir === "desc" ? -diff : diff;
    });
    return arr;
  }, [projects, sortKey, sortDir]);

  const totalPages = Math.ceil(sortedProjects.length / ROWS_PER_PAGE);
  const pageRows = sortedProjects.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  function SortIcon({ col }: { col: SortKey }) {
    if (col !== sortKey) return <ChevronUp className="w-3 h-3 opacity-20" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-[#00e676]" />
      : <ChevronDown className="w-3 h-3 text-[#00e676]" />;
  }

  const PieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[#1e293b] border border-white/10 p-3 rounded-xl text-xs shadow-xl">
        <p className="font-semibold text-white mb-0.5">{payload[0].name}</p>
        <p className="text-[#00e676]">{fmt(payload[0].value)}</p>
        <p className="text-slate-400">{payload[0].payload.count} project{payload[0].payload.count !== 1 ? "s" : ""}</p>
      </div>
    );
  };

  const BarTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[#1e293b] border border-white/10 p-3 rounded-xl text-xs shadow-xl">
        <p className="font-semibold text-white mb-0.5">{label}</p>
        <p className="text-[#00e676]">{fmt(payload[0].value)}</p>
        <p className="text-slate-400">{payload[0].payload.count} project{payload[0].payload.count !== 1 ? "s" : ""}</p>
      </div>
    );
  };

  if (!isLoading && projects.length === 0) {
    return (
      <Layout>
        <PageTransition className="p-4 md:p-8 max-w-4xl mx-auto">
          <button
            onClick={() => navigate("/developers")}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            All Investors & Developers
          </button>
          <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-12 text-center">
            <p className="text-4xl mb-4">🔍</p>
            <h2 className="text-xl font-bold text-white mb-2">{name}</h2>
            <p className="text-slate-400 text-sm">No deals found for this entity, or data is still being populated.</p>
          </div>
        </PageTransition>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageTransition className="p-4 md:p-8 max-w-6xl mx-auto">

        {/* Back */}
        <button
          onClick={() => navigate("/developers")}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          All Investors & Developers
        </button>

        {/* ── Header ── */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-1">{name}</h1>
          <p className="text-slate-400 text-sm">
            Active in {countries.length} {countries.length === 1 ? "country" : "countries"} across{" "}
            {[...new Set(projects.map((p) => p.region))].join(", ")}
          </p>
        </div>

        {/* ── Summary Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { icon: DollarSign, label: "Capital Deployed", value: isLoading ? "—" : fmt(totalInvestment) },
            { icon: Layers, label: "Deals", value: isLoading ? "—" : String(projects.length) },
            { icon: Globe, label: "Countries", value: isLoading ? "—" : String(countries.length) },
            { icon: TrendingUp, label: "Primary Focus", value: isLoading ? "—" : primarySector, color: SECTOR_COLORS[primarySector] },
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

        {/* ── Portfolio Map ── */}
        {!isLoading && mapProjects.length > 0 && (
          <div className="bg-[#1e293b] border border-white/5 rounded-2xl overflow-hidden mb-6">
            <div className="px-5 pt-4 pb-3">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Portfolio Map</h2>
              <p className="text-xs text-slate-600 mt-0.5">{mapProjects.length} projects with coordinates</p>
            </div>
            <div style={{ height: 260 }}>
              <MapContainer
                center={mapCenter}
                zoom={3}
                style={{ height: "100%", width: "100%", zIndex: 0 }}
                zoomControl={false}
                scrollWheelZoom={false}
                attributionControl={false}
              >
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                {mapProjects.map((p) => (
                  <CircleMarker
                    key={p.id}
                    center={[p.latitude!, p.longitude!]}
                    radius={8}
                    pathOptions={{
                      color: SECTOR_COLORS[p.technology] ?? FALLBACK_COLOR,
                      fillColor: SECTOR_COLORS[p.technology] ?? FALLBACK_COLOR,
                      fillOpacity: 0.8,
                      weight: 1.5,
                    }}
                  >
                    <Popup>
                      <div className="text-xs">
                        <p className="font-semibold">{p.projectName}</p>
                        <p className="text-gray-500">{p.country} · {p.technology}</p>
                        {p.dealSizeUsdMn && <p className="text-green-600 font-medium">{fmt(p.dealSizeUsdMn)}</p>}
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          </div>
        )}

        {/* ── Charts Row ── */}
        {!isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            {/* Projects by Country */}
            <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-5">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-4">By Country</h2>
              {countryData.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-slate-600 text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={countryData}
                    layout="vertical"
                    margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                    <XAxis type="number" tickFormatter={fmtAxis} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="country" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                    <RechartsTooltip content={<BarTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                    <Bar dataKey="investment" fill="#00e676" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Projects by Sector */}
            <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-5">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-4">By Technology</h2>
              {sectorData.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-slate-600 text-sm">No data</div>
              ) : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="55%" height={160}>
                    <PieChart>
                      <Pie
                        data={sectorData}
                        dataKey="investment"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={72}
                        strokeWidth={0}
                      >
                        {sectorData.map((entry) => (
                          <Cell key={entry.name} fill={SECTOR_COLORS[entry.name] ?? FALLBACK_COLOR} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {sectorData.slice(0, 6).map((s) => (
                      <div key={s.name} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: SECTOR_COLORS[s.name] ?? FALLBACK_COLOR }}
                          />
                          <span className="text-xs text-slate-400 truncate">{s.name}</span>
                        </div>
                        <span className="text-xs text-slate-500 shrink-0">{s.count}×</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Projects Table ── */}
        <div className="bg-[#1e293b] border border-white/5 rounded-2xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-white/5">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
              All Deals ({projects.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-white/5 bg-white/5">
                  <th className="text-left py-3 px-5 font-semibold">Project Name</th>
                  <th
                    className="text-left py-3 px-4 font-semibold cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => handleSort("country")}
                  >
                    <div className="flex items-center gap-1">Country <SortIcon col="country" /></div>
                  </th>
                  <th className="text-left py-3 px-4 font-semibold">Sector</th>
                  <th
                    className="text-right py-3 px-4 font-semibold cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => handleSort("dealSizeUsdMn")}
                  >
                    <div className="flex items-center justify-end gap-1">Deal Size <SortIcon col="dealSizeUsdMn" /></div>
                  </th>
                  <th
                    className="text-left py-3 px-4 font-semibold cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-1">Status <SortIcon col="status" /></div>
                  </th>
                  <th
                    className="text-right py-3 px-5 font-semibold cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => handleSort("announcedYear")}
                  >
                    <div className="flex items-center justify-end gap-1">Year <SortIcon col="announcedYear" /></div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="py-3 px-4">
                            <div className="h-4 bg-white/5 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : pageRows.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => navigate(`/deals/${p.id}`)}
                        className="cursor-pointer hover:bg-white/5 transition-colors group"
                      >
                        <td className="py-3 px-5">
                          <span className="font-medium text-slate-100 group-hover:text-white transition-colors line-clamp-1">
                            {p.projectName}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-xs">{p.country}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: SECTOR_COLORS[p.technology] ?? FALLBACK_COLOR }}
                            />
                            <span className="text-slate-400 text-xs">{p.technology}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300 text-xs">
                          {fmt(p.dealSizeUsdMn)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">
                            {p.dealStage ?? p.status}
                          </span>
                        </td>
                        <td className="py-3 px-5 text-right text-slate-500 text-xs">
                          {p.announcedYear ?? "—"}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
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

        {/* Footer nav */}
        <div className="pb-6">
          <button
            onClick={() => navigate("/developers")}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to All Investors & Developers
          </button>
        </div>

      </PageTransition>
    </Layout>
  );
}
