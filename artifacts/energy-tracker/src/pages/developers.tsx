import { useMemo, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Building2, TrendingUp, Globe, ChevronUp, ChevronDown, ArrowRight, Users,
  LayoutGrid, List,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { MatrixView, extractMatrixEntities, type MatrixEntityRow, type Project } from "./developers-matrix";
import { ShareButton } from "@/components/share-button";
import { ExportDropdown } from "@/components/export-dropdown";
import { exportToPng, exportImageToPdf } from "@/utils/export-utils";
import { TECHNOLOGY_COLORS, TECHNOLOGY_SECTORS } from "@/config/technologyConfig";

const API = "/api";

const SECTOR_COLORS: Record<string, string> = TECHNOLOGY_COLORS;

function fmt(mn: number): string {
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  if (mn > 0) return `$${mn.toFixed(0)}M`;
  return "—";
}

interface EntityRow {
  name: string;
  totalInvestment: number;
  projectCount: number;
  countries: string[];
  topSector: string;
  sectors: Record<string, number>;
}

type SortKey = "name" | "totalInvestment" | "projectCount" | "countries";

function extractEntities(projects: Project[]): EntityRow[] {
  const map: Record<string, {
    investment: number; count: number; countries: Set<string>; sectors: Record<string, number>
  }> = {};

  const addEntity = (name: string, project: Project) => {
    const key = name.trim();
    if (!key || key.length < 2) return;
    if (!map[key]) map[key] = { investment: 0, count: 0, countries: new Set(), sectors: {} };
    map[key].count++;
    map[key].investment += project.dealSizeUsdMn ?? 0;
    map[key].countries.add(project.country);
    map[key].sectors[project.technology] = (map[key].sectors[project.technology] ?? 0) + 1;
  };

  for (const p of projects) {
    if (p.developer) addEntity(p.developer, p);
    if (p.investors) p.investors.split(",").forEach(inv => addEntity(inv.trim(), p));
  }

  return Object.entries(map)
    .filter(([, v]) => v.count >= 2)
    .map(([name, v]) => {
      const topSector = Object.entries(v.sectors).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      return {
        name,
        totalInvestment: v.investment,
        projectCount: v.count,
        countries: [...v.countries].sort(),
        topSector,
        sectors: v.sectors,
      };
    });
}

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronUp className="w-3 h-3 opacity-20" />;
  return dir === "asc"
    ? <ChevronUp className="w-3 h-3 text-[#00e676]" />
    : <ChevronDown className="w-3 h-3 text-[#00e676]" />;
}

type ViewMode = "table" | "matrix";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function DevelopersIndex() {
  const [, navigate] = useLocation();
  const [sortKey, setSortKey] = useState<SortKey>("totalInvestment");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: projectsData, isLoading } = useQuery<{ projects: Project[] }>({
    queryKey: ["all-projects-developers"],
    queryFn: async () => (await fetch(`${API}/projects?limit=500`)).json(),
    staleTime: 5 * 60 * 1000,
  });

  const entities = useMemo(() => {
    if (!projectsData?.projects) return [];
    return extractEntities(projectsData.projects);
  }, [projectsData]);

  const matrixEntities = useMemo<MatrixEntityRow[]>(() => {
    if (!projectsData?.projects) return [];
    return extractMatrixEntities(projectsData.projects);
  }, [projectsData]);

  const sorted = useMemo(() => {
    const arr = [...entities];
    arr.sort((a, b) => {
      let diff = 0;
      if (sortKey === "name") diff = a.name.localeCompare(b.name);
      else if (sortKey === "totalInvestment") diff = a.totalInvestment - b.totalInvestment;
      else if (sortKey === "projectCount") diff = a.projectCount - b.projectCount;
      else if (sortKey === "countries") diff = a.countries.length - b.countries.length;
      return sortDir === "desc" ? -diff : diff;
    });
    return arr;
  }, [entities, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const totalInvestment = useMemo(() => entities.reduce((s, e) => s + e.totalInvestment, 0), [entities]);

  function downloadEntitiesCSV() {
    const headers = ["Name", "Total Investment (USD M)", "Project Count", "Countries", "Top Sector"];
    const rows = sorted.map(e => [
      e.name,
      e.totalInvestment.toFixed(0),
      e.projectCount,
      e.countries.join("; "),
      e.topSector,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `afrienergy-investors-developers-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const Th = ({ label, col }: { label: string; col: SortKey }) => (
    <th
      className="text-left py-3 px-4 font-semibold cursor-pointer select-none hover:text-white transition-colors"
      onClick={() => handleSort(col)}
    >
      <div className="flex items-center gap-1.5">
        {label}
        <SortIcon active={sortKey === col} dir={sortDir} />
      </div>
    </th>
  );

  return (
    <Layout>
      <PageTransition className="p-4 md:p-8 max-w-6xl mx-auto">
        <header className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">Investors & Developers</h1>
              <p className="text-muted-foreground text-base md:text-lg">
                All financing entities and developers active in 2+ African energy deals.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 self-start">
              {/* Share + Export */}
              <div className="flex items-center gap-2">
                <ShareButton
                  text="Explore investors and developers active in African energy deals on AfriEnergy Tracker."
                />
                <ExportDropdown
                  size="sm"
                  options={[
                    {
                      id: "csv",
                      label: "Download CSV",
                      description: "Investors & developer data",
                      type: "png",
                      onExport: async () => downloadEntitiesCSV(),
                    },
                    {
                      id: "png",
                      label: "Download PNG",
                      description: "Snapshot of this page",
                      type: "png",
                      onExport: async () => {
                        if (!contentRef.current) return;
                        await exportToPng(contentRef.current, `afrienergy-investors-${todayStr()}.png`);
                      },
                    },
                    {
                      id: "pdf",
                      label: "Download PDF",
                      description: "PDF report of this page",
                      type: "pdf",
                      onExport: async () => {
                        if (!contentRef.current) return;
                        await exportImageToPdf(contentRef.current, "Investors & Developers", `afrienergy-investors-${todayStr()}.pdf`);
                      },
                    },
                  ]}
                />
              </div>

              {/* View mode toggle */}
              <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
                <button
                  onClick={() => setViewMode("table")}
                  className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-all
                    ${viewMode === "table"
                      ? "bg-[#00e676] text-black"
                      : "text-slate-400 hover:text-white"}`}
                >
                  <List className="w-4 h-4" /> Table View
                </button>
                <button
                  onClick={() => setViewMode("matrix")}
                  className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-all
                    ${viewMode === "matrix"
                      ? "bg-[#00e676] text-black"
                      : "text-slate-400 hover:text-white"}`}
                >
                  <LayoutGrid className="w-4 h-4" /> Matrix View
                </button>
              </div>
            </div>
          </div>
        </header>

        <div ref={contentRef}>
        {/* Status notice */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <Building2 className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-amber-300 font-medium">Developer profiles are being populated.</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              The <code className="text-amber-300">developer</code> field is being enriched via the AI Discovery Agent.
              Entity data below is currently sourced from the <code className="text-amber-300">investors</code> field.
            </p>
          </div>
        </div>

        {/* Summary Strip */}
        {!isLoading && entities.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <Users className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold uppercase tracking-wider">Entities tracked</span>
              </div>
              <p className="text-2xl font-bold text-white">{entities.length}</p>
            </div>
            <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <TrendingUp className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold uppercase tracking-wider">Capital tracked</span>
              </div>
              <p className="text-2xl font-bold text-white font-mono">{fmt(totalInvestment)}</p>
            </div>
            <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-4 col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <Globe className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold uppercase tracking-wider">Most active</span>
              </div>
              <p className="text-xl font-bold text-white">{sorted[0]?.name ?? "—"}</p>
            </div>
          </div>
        )}

        {/* ── Matrix View ── */}
        {viewMode === "matrix" && (
          <div>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-[#1e293b] border border-white/5 rounded-2xl p-6 animate-pulse">
                    <div className="h-4 bg-white/5 rounded w-1/3 mb-3" />
                    <div className="h-48 bg-white/5 rounded-xl" />
                  </div>
                ))}
              </div>
            ) : matrixEntities.length === 0 ? (
              <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-8 text-center">
                <Building2 className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 font-medium mb-1">No entity data yet</p>
                <p className="text-slate-600 text-sm">Check back soon as the AI Discovery Agent enriches project data.</p>
              </div>
            ) : (
              <MatrixView entities={matrixEntities} />
            )}
          </div>
        )}

        {/* ── Table View ── */}
        {viewMode === "table" && (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-[#1e293b] border border-white/5 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-white/5 bg-white/5">
                      <Th label="Entity Name" col="name" />
                      <Th label="Total Investment" col="totalInvestment" />
                      <Th label="Deals" col="projectCount" />
                      <Th label="Countries" col="countries" />
                      <th className="text-left py-3 px-4 font-semibold">Top Sector</th>
                      <th className="py-3 px-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {isLoading
                      ? Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i}>
                            {Array.from({ length: 6 }).map((_, j) => (
                              <td key={j} className="py-4 px-4">
                                <div className="h-4 bg-white/5 rounded animate-pulse" style={{ width: j === 0 ? "60%" : "40%" }} />
                              </td>
                            ))}
                          </tr>
                        ))
                      : entities.length === 0
                      ? (
                        <tr>
                          <td colSpan={6} className="py-16 text-center">
                            <Building2 className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                            <p className="text-slate-400 font-medium mb-1">No entity data yet</p>
                            <p className="text-slate-600 text-sm">Check back soon as the AI Discovery Agent enriches project data.</p>
                          </td>
                        </tr>
                      )
                      : sorted.map((entity) => (
                          <tr
                            key={entity.name}
                            className="hover:bg-white/5 transition-colors cursor-pointer group"
                            onClick={() => navigate(`/developers/${encodeURIComponent(entity.name)}`)}
                          >
                            <td className="py-4 px-4">
                              <span className="font-semibold text-slate-100 group-hover:text-white transition-colors">
                                {entity.name}
                              </span>
                            </td>
                            <td className="py-4 px-4 font-mono text-sm text-slate-300">
                              {fmt(entity.totalInvestment)}
                            </td>
                            <td className="py-4 px-4 text-slate-400 text-sm">{entity.projectCount}</td>
                            <td className="py-4 px-4">
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {entity.countries.slice(0, 3).map((c) => (
                                  <span key={c} className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">
                                    {c}
                                  </span>
                                ))}
                                {entity.countries.length > 3 && (
                                  <span className="text-xs text-slate-600 bg-white/5 px-2 py-0.5 rounded-full">
                                    +{entity.countries.length - 3}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <span
                                className="text-xs px-2.5 py-1 rounded-full font-medium"
                                style={{
                                  backgroundColor: `${SECTOR_COLORS[entity.topSector] ?? "#94a3b8"}20`,
                                  color: SECTOR_COLORS[entity.topSector] ?? "#94a3b8",
                                }}
                              >
                                {entity.topSector}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-right">
                              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-[#00e676] group-hover:translate-x-0.5 transition-all" />
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
              {entities.length > 0 && (
                <div className="px-4 py-3 border-t border-white/5 bg-white/5">
                  <p className="text-xs text-slate-500">
                    {entities.length} entities · min. 2 deal appearances · click any row to view full profile
                  </p>
                </div>
              )}
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden flex flex-col gap-3">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-[#1e293b] border border-white/5 rounded-2xl p-4 animate-pulse">
                      <div className="h-4 bg-white/5 rounded w-2/3 mb-3" />
                      <div className="h-3 bg-white/5 rounded w-1/3" />
                    </div>
                  ))
                : entities.length === 0
                ? (
                  <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-8 text-center">
                    <Building2 className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400 font-medium mb-1">No entity data yet</p>
                    <p className="text-slate-600 text-sm">Check back soon as the AI Discovery Agent enriches project data.</p>
                  </div>
                )
                : sorted.map((entity) => (
                  <div
                    key={entity.name}
                    onClick={() => navigate(`/developers/${encodeURIComponent(entity.name)}`)}
                    className="bg-[#1e293b] border border-white/5 rounded-2xl p-4 cursor-pointer hover:border-[#00e676]/30 hover:bg-white/[0.03] transition-all active:scale-[0.99] group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="font-semibold text-slate-100 text-sm leading-tight flex-1 group-hover:text-white transition-colors">{entity.name}</h3>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#00e676] group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Investment</p>
                        <p className="text-sm font-bold font-mono text-[#00e676]">{fmt(entity.totalInvestment)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Deals</p>
                        <p className="text-sm font-bold text-white">{entity.projectCount}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Countries</p>
                        <p className="text-sm font-bold text-white">{entity.countries.length}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {entity.countries.slice(0, 2).map((c) => (
                          <span key={c} className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">{c}</span>
                        ))}
                        {entity.countries.length > 2 && (
                          <span className="text-xs text-slate-600 bg-white/5 px-2 py-0.5 rounded-full">+{entity.countries.length - 2}</span>
                        )}
                      </div>
                      <span
                        className="text-xs px-2.5 py-1 rounded-full font-medium shrink-0"
                        style={{
                          backgroundColor: `${SECTOR_COLORS[entity.topSector] ?? "#94a3b8"}20`,
                          color: SECTOR_COLORS[entity.topSector] ?? "#94a3b8",
                        }}
                      >
                        {entity.topSector}
                      </span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-end">
                      <span className="text-xs text-slate-500 group-hover:text-[#00e676] transition-colors flex items-center gap-1">
                        View full profile <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))}
              {entities.length > 0 && (
                <p className="text-xs text-slate-600 text-center py-2">
                  {entities.length} entities · min. 2 deal appearances
                </p>
              )}
            </div>
          </>
        )}
        </div>{/* /contentRef */}
      </PageTransition>
    </Layout>
  );
}
