import { useMemo } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { TrendingUp, Layers, ArrowRight, GitCompareArrows } from "lucide-react";

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

function formatInvestment(mn: number): string {
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  return `$${mn.toFixed(0)}M`;
}

import { useQuery } from "@tanstack/react-query";

interface CountryStat {
  country: string;
  region: string;
  projectCount: number;
  totalInvestmentUsdMn: number;
  latitude?: number;
  longitude?: number;
}

interface Project {
  id: number;
  technology: string;
  dealSizeUsdMn?: number;
}

interface ProjectsResponse {
  projects: Project[];
}

function SectorMiniBar({ sectorTotals }: { sectorTotals: Record<string, number> }) {
  const total = Object.values(sectorTotals).reduce((a, b) => a + b, 0);
  if (total === 0) return <div className="h-1.5 bg-white/5 rounded-full" />;
  const entries = Object.entries(sectorTotals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
      {entries.map(([sector, val]) => (
        <div
          key={sector}
          title={`${sector}: ${formatInvestment(val)}`}
          style={{
            width: `${(val / total) * 100}%`,
            backgroundColor: SECTOR_COLORS[sector] ?? "#94a3b8",
          }}
        />
      ))}
    </div>
  );
}

function CountryCard({ stat, sectorTotals, onClick, onCompare }: {
  stat: CountryStat;
  sectorTotals: Record<string, number>;
  onClick: () => void;
  onCompare: (e: React.MouseEvent) => void;
}) {
  const flag = COUNTRY_FLAGS[stat.country] ?? "🌍";
  const topSector = Object.entries(sectorTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const topColor = SECTOR_COLORS[topSector] ?? "#94a3b8";

  return (
    <button
      onClick={onClick}
      className="bg-[#1e293b] border border-white/5 rounded-2xl p-5 text-left hover:border-[#00e676]/30 hover:bg-[#1e293b]/80 transition-all group w-full"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <span className="text-2xl">{flag}</span>
          <h3 className="font-bold text-white text-base mt-1 leading-tight">{stat.country}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{stat.region}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-[#00e676] transition-colors shrink-0 mt-1" />
      </div>

      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-xs">Investment</span>
          <span className="font-bold text-white font-mono text-sm">{formatInvestment(stat.totalInvestmentUsdMn)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-xs">Projects</span>
          <span className="font-semibold text-slate-200 text-sm">{stat.projectCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-xs">Top Sector</span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${topColor}20`, color: topColor }}>
            {topSector}
          </span>
        </div>
      </div>

      <SectorMiniBar sectorTotals={sectorTotals} />

      {/* Compare button — shown on hover */}
      <div className="mt-3 pt-3 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onCompare}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-[#00e676] hover:bg-[#00e676]/10 transition-colors"
        >
          <GitCompareArrows className="w-3.5 h-3.5" />
          Compare
        </button>
      </div>
    </button>
  );
}

export default function CountriesIndex() {
  const [, navigate] = useLocation();

  const { data: countryStats, isLoading } = useQuery<CountryStat[]>({
    queryKey: ["stats-by-country"],
    queryFn: async () => {
      const r = await fetch(`${API}/stats/by-country`);
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch all projects once to compute per-country sector breakdown
  const { data: projectsData } = useQuery<ProjectsResponse>({
    queryKey: ["all-projects-for-countries"],
    queryFn: async () => {
      const r = await fetch(`${API}/projects?limit=500`);
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const sectorByCountry = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    if (!projectsData?.projects) return map;
    for (const p of projectsData.projects) {
      const c = (p as any).country as string;
      if (!map[c]) map[c] = {};
      const sector = p.technology;
      map[c][sector] = (map[c][sector] ?? 0) + (p.dealSizeUsdMn ?? 0);
    }
    return map;
  }, [projectsData]);

  const sorted = useMemo(() =>
    [...(countryStats ?? [])].sort((a, b) => b.totalInvestmentUsdMn - a.totalInvestmentUsdMn),
    [countryStats]
  );

  const totalInvestment = useMemo(() =>
    sorted.reduce((s, c) => s + c.totalInvestmentUsdMn, 0),
    [sorted]
  );

  return (
    <Layout>
      <PageTransition className="p-4 md:p-8 max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Country Profiles</h1>
          <p className="text-muted-foreground text-base md:text-lg">
            Explore energy investment activity across {sorted.length} African markets.
          </p>
        </header>

        {/* Summary Banner */}
        {!isLoading && sorted.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
            <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Tracked</p>
              <p className="text-2xl font-bold text-white">{sorted.length} <span className="text-base font-normal text-slate-400">countries</span></p>
            </div>
            <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Combined Investment</p>
              <p className="text-2xl font-bold text-white font-mono">{formatInvestment(totalInvestment)}</p>
            </div>
            <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-4 col-span-2 md:col-span-1">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Largest Market</p>
              <p className="text-2xl font-bold text-white">
                {COUNTRY_FLAGS[sorted[0]?.country] ?? "🌍"} {sorted[0]?.country}
              </p>
            </div>
          </div>
        )}

        {/* Country Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-[#1e293b] rounded-2xl p-5 animate-pulse h-44" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sorted.map((stat) => (
              <CountryCard
                key={stat.country}
                stat={stat}
                sectorTotals={sectorByCountry[stat.country] ?? {}}
                onClick={() => navigate(`/countries/${encodeURIComponent(stat.country)}`)}
                onCompare={(e) => {
                  e.stopPropagation();
                  navigate(`/compare?countries=${encodeURIComponent(stat.country)}`);
                }}
              />
            ))}
          </div>
        )}
      </PageTransition>
    </Layout>
  );
}
