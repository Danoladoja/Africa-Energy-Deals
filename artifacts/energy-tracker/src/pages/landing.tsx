import { useState, useCallback, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useGetSummaryStats } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, Globe, Layers, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { EmailGateModal } from "@/components/email-gate-modal";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { GeoJsonObject } from "geojson";
import { NlqSearchBar } from "@/components/nlq-search-bar";
import { SEOMeta, organizationSchema, websiteSchema } from "@/components/seo-meta";

const API = "/api";
const AFRICA_GEOJSON_URL =
  "https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/africa.geojson";

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
  "South Africa": "🇿🇦", "Nigeria": "🇳🇬", "Kenya": "🇰🇪", "Egypt": "🇪🇬",
  "Morocco": "🇲🇦", "Ethiopia": "🇪🇹", "Ghana": "🇬🇭", "Tanzania": "🇹🇿",
  "Mozambique": "🇲🇿", "Zambia": "🇿🇲", "Uganda": "🇺🇬", "Senegal": "🇸🇳",
  "Ivory Coast": "🇨🇮", "Cameroon": "🇨🇲", "Angola": "🇦🇴", "Rwanda": "🇷🇼",
  "Namibia": "🇳🇦", "Botswana": "🇧🇼", "Tunisia": "🇹🇳", "Algeria": "🇩🇿",
  "Malawi": "🇲🇼", "Mali": "🇲🇱", "Niger": "🇳🇪", "Chad": "🇹🇩",
  "Sudan": "🇸🇩", "Burkina Faso": "🇧🇫", "DRC": "🇨🇩", "Côte d'Ivoire": "🇨🇮",
  "Zimbabwe": "🇿🇼", "Libya": "🇱🇾", "Somalia": "🇸🇴", "Benin": "🇧🇯",
  "Togo": "🇹🇬", "Guinea": "🇬🇳", "Madagascar": "🇲🇬", "Sierra Leone": "🇸🇱",
};

interface LatestProject {
  id: number;
  projectName: string;
  country: string;
  technology: string;
  dealSizeUsdMn?: number | null;
  status: string;
  announcedYear?: number | null;
  createdAt: string;
}

function fmtDeal(mn?: number | null): string | null {
  if (mn == null) return null;
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  return `$${mn.toFixed(0)}M`;
}

function isNew(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < 30 * 24 * 60 * 60 * 1000;
}

function LatestDealCard({ project }: { project: LatestProject }) {
  const color = SECTOR_COLORS[project.technology] ?? "#94a3b8";
  const flag  = COUNTRY_FLAGS[project.country] ?? "🌍";
  const size  = fmtDeal(project.dealSizeUsdMn);
  const fresh = isNew(project.createdAt);

  return (
    <Link href={`/deals/${project.id}`}>
      <div
        className="group relative flex flex-col gap-3 bg-[#1e293b] border border-[#334155] rounded-2xl p-5 h-full min-w-[220px] cursor-pointer transition-all duration-200"
        style={{ boxShadow: "none" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
          (e.currentTarget as HTMLDivElement).style.borderColor = `${color}55`;
          (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 1px ${color}33, 0 8px 24px rgba(0,0,0,0.3)`;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
          (e.currentTarget as HTMLDivElement).style.borderColor = "#334155";
          (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
        }}
      >
        {fresh && (
          <span className="absolute top-3 right-3 text-[10px] font-bold tracking-widest text-[#00e676] bg-[#00e676]/10 border border-[#00e676]/25 px-2 py-0.5 rounded-full">
            NEW
          </span>
        )}

        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold self-start"
          style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}30` }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
          {project.technology}
        </div>

        <p className="text-sm font-semibold text-white leading-snug line-clamp-2 flex-1">
          {project.projectName}
        </p>

        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span>{flag}</span>
          <span className="truncate">{project.country}</span>
          {project.announcedYear && (
            <>
              <span className="text-slate-600">·</span>
              <span>{project.announcedYear}</span>
            </>
          )}
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-white/5">
          {size ? (
            <span className="text-base font-bold text-white font-mono">{size}</span>
          ) : (
            <span className="text-xs text-slate-500 italic">Size undisclosed</span>
          )}
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/5">
            {project.status}
          </span>
        </div>
      </div>
    </Link>
  );
}

function LatestDealsSection() {
  const { data, isLoading } = useQuery<{ projects: LatestProject[] }>({
    queryKey: ["latest-projects"],
    queryFn: () => fetch(`${API}/projects/latest?limit=5`).then(r => r.json()),
    staleTime: 0,
  });

  const projects = data?.projects ?? [];

  if (!isLoading && projects.length === 0) return null;

  return (
    <section className="py-20 px-4 border-t border-white/8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Latest Deals</h2>
            <p className="text-white/50 text-sm">Recently added to the tracker</p>
          </div>
          <Link href="/deals?sort=newest">
            <span className="flex items-center gap-1.5 text-sm text-[#00e676] hover:text-[#00c864] font-medium transition-colors shrink-0">
              View all deals <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 min-w-[220px] h-48 rounded-2xl bg-[#1e293b] border border-[#334155] animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="relative">
            <div
              className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {projects.map((p) => (
                <div key={p.id} className="flex-1 min-w-[220px] max-w-[280px] snap-start">
                  <LatestDealCard project={p} />
                </div>
              ))}
            </div>
            {/* Fade-out right edge on mobile */}
            <div
              className="md:hidden absolute inset-y-0 right-0 w-12 pointer-events-none"
              style={{ background: "linear-gradient(to left, #0b0f1a, transparent)" }}
            />
          </div>
        )}
      </div>
    </section>
  );
}

const DB_TO_GEO: Record<string, string> = {
  "DRC":           "DR Congo",
  "Côte d'Ivoire": "Ivory Coast",
};

interface CountryStat {
  country: string;
  totalInvestmentUsdMn: number;
}

function getCountryColor(investment: number, maxInvestment: number): string {
  if (!investment) return "rgba(15, 23, 42, 0.55)";
  const t = Math.log1p(investment) / Math.log1p(maxInvestment);
  const g = Math.round(77 + (230 - 77) * t);
  const b = Math.round(42 + (118 - 42) * t);
  const alpha = 0.35 + 0.55 * t;
  return `rgba(0,${g},${b},${alpha})`;
}

function formatBillions(mn: number) {
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  return `$${mn.toFixed(0)}M`;
}

function LandingChoropleth({ onExplore }: { onExplore: () => void }) {
  const { data: countryStats } = useQuery<CountryStat[]>({
    queryKey: ["country-stats-landing"],
    queryFn: () => fetch(`${API}/stats/by-country`).then(r => r.json()),
    staleTime: 10 * 60 * 1000,
  });

  const { data: geoJson } = useQuery<GeoJsonObject>({
    queryKey: ["africa-geojson"],
    queryFn: () => fetch(AFRICA_GEOJSON_URL).then(r => r.json()),
    staleTime: 60 * 60 * 1000,
  });

  const { countryStatsMap, maxInvestment } = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of countryStats ?? []) {
      m[DB_TO_GEO[s.country] ?? s.country] = s.totalInvestmentUsdMn;
    }
    const max = Math.max(1, ...Object.values(m));
    return { countryStatsMap: m, maxInvestment: max };
  }, [countryStats]);

  const geoStyle = useCallback((feature: any) => {
    const inv = countryStatsMap[feature.properties?.name] ?? 0;
    return {
      fillColor: getCountryColor(inv, maxInvestment),
      fillOpacity: 1,
      color: "#0f172a",
      weight: 0.8,
    };
  }, [countryStatsMap, maxInvestment]);

  const onEachFeature = useCallback((feature: any, layer: any) => {
    const name = feature.properties?.name as string;
    const inv = countryStatsMap[name];
    if (inv) {
      layer.bindTooltip(
        `<div style="background:#1e293b;border:1px solid rgba(255,255,255,0.12);padding:6px 10px;border-radius:8px;font-family:inherit;font-size:12px;color:#f1f5f9;">
          <strong>${name}</strong><br/>
          <span style="color:#00e676;font-weight:600;font-family:monospace;">${formatBillions(inv)}</span>
        </div>`,
        { sticky: true, className: "leaflet-choropleth-tooltip", offset: [10, 0] }
      );
    }
  }, [countryStatsMap]);

  const geoKey = useMemo(
    () => `landing-geo-${Object.keys(countryStatsMap).length}`,
    [countryStatsMap]
  );

  if (!geoJson) {
    return (
      <div
        className="w-full rounded-2xl overflow-hidden border border-white/8"
        style={{ height: 320, background: "#0d1526", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <div className="text-white/20 text-sm">Loading map…</div>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-white/8 shadow-2xl" style={{ height: 320 }}>
      <MapContainer
        center={[2, 20]}
        zoom={3}
        style={{ height: "100%", width: "100%", zIndex: 0 }}
        zoomControl={false}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        {geoJson && countryStats && (
          <GeoJSON
            key={geoKey}
            data={geoJson}
            style={geoStyle}
            onEachFeature={onEachFeature}
          />
        )}
      </MapContainer>

      {/* Gradient overlay bottom */}
      <div
        className="absolute inset-x-0 bottom-0 h-20 pointer-events-none z-10"
        style={{ background: "linear-gradient(to top, rgba(11,15,26,0.9), transparent)" }}
      />

      {/* CTA overlay */}
      <div className="absolute inset-x-0 bottom-5 flex items-center justify-center z-20">
        <button
          onClick={onExplore}
          className="bg-[#00e676]/90 hover:bg-[#00e676] text-[#0b0f1a] font-semibold text-sm px-6 py-2.5 rounded-full transition-all shadow-lg shadow-[#00e676]/20 backdrop-blur"
        >
          Explore the interactive map →
        </button>
      </div>

      {/* Top-left label */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none">
        <div className="bg-[#0b0f1a]/80 backdrop-blur border border-white/10 rounded-xl px-3 py-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Investment by Country</p>
        </div>
      </div>

      {/* Color legend */}
      <div className="absolute top-4 right-4 z-20 pointer-events-none">
        <div className="bg-[#0b0f1a]/80 backdrop-blur border border-white/10 rounded-xl px-3 py-2 flex items-center gap-2">
          <div
            className="h-2 w-16 rounded-full"
            style={{ background: "linear-gradient(to right, rgba(15,23,42,0.6), rgba(0,77,42,0.9), #00a855, #00e676)" }}
          />
          <span className="text-[10px] text-slate-400">Low → High</span>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const [, navigate] = useLocation();
  const { data: stats } = useGetSummaryStats();
  const { isAuthenticated } = useAuth();

  const [modalOpen, setModalOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string>("/dashboard");

  function gatedNavigate(path: string) {
    if (isAuthenticated) {
      navigate(path);
    } else {
      setPendingPath(path);
      setModalOpen(true);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-white flex flex-col">
      <SEOMeta
        title="Africa Energy Investment Database"
        description="Track 360+ energy investment deals across 52 African countries. Solar, wind, hydro, gas & storage projects with live data from Africa Energy Pulse."
        url="/"
        jsonLd={[organizationSchema(), websiteSchema()]}
      />
      <EmailGateModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        pendingRedirect={pendingPath}
      />

      {/* Navbar */}
      <header className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-3 cursor-pointer hover:opacity-85 transition-opacity">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
            <img
              src={`${import.meta.env.BASE_URL}images/logo-icon.png`}
              alt="AfriEnergy Logo"
              className="w-6 h-6 object-contain filter brightness-0"
            />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">AfriEnergy</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-white/70">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#data" className="hover:text-white transition-colors">Data</a>
          <a href="#about" className="hover:text-white transition-colors">About</a>
        </nav>

        <button
          onClick={() => gatedNavigate("/dashboard")}
          className="bg-[#00e676] hover:bg-[#00c864] text-[#0b0f1a] font-semibold text-sm px-5 py-2.5 rounded-full transition-colors shadow-lg shadow-[#00e676]/20"
        >
          Launch Tracker
        </button>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 pt-16 pb-16 max-w-4xl mx-auto w-full">
        <h1 className="text-[2.6rem] sm:text-6xl md:text-7xl lg:text-8xl font-extrabold leading-[1.05] tracking-tight mb-6 md:mb-8">
          <span className="text-white">Africa's Energy</span>
          <br />
          <span className="text-[#00e676]">Investment</span>
          <br />
          <span className="text-[#00e676]">Tracker.</span>
        </h1>

        <p className="text-white/60 text-base md:text-xl max-w-xl leading-relaxed mb-10 md:mb-12">
          Search, explore and visualise disclosed energy transactions across
          the continent. Track project financing, monitor deal pipelines, and
          generate data-driven insights.
        </p>

        {/* AI Search Bar */}
        <div className="w-full max-w-xl mb-10 md:mb-12">
          <NlqSearchBar
            navigateTo={gatedNavigate}
            placeholder='Ask anything… e.g., "Solar deals in West Africa above $100M"'
            size="lg"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:flex md:items-start md:justify-center w-full max-w-2xl gap-y-6 md:gap-0">
          {[
            { value: stats ? formatBillions(stats.totalInvestmentUsdMn) : "—", label: "Total Investment" },
            { value: stats ? stats.totalProjects.toString() : "—", label: "Total Projects" },
            { value: stats ? stats.totalCountries.toString() : "—", label: "Countries" },
            { value: stats ? String(stats.totalSectors ?? stats.totalTechnologies ?? "—") : "—", label: "Sectors" },
          ].map((stat, i, arr) => (
            <div
              key={stat.label}
              className={`flex flex-col items-center gap-1 px-4 md:flex-1 ${i < arr.length - 1 ? "md:border-r md:border-white/10" : ""} ${i % 2 === 0 ? "border-r border-white/10 md:border-r-0" : ""}`}
            >
              <span className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#00e676] tracking-tight">
                {stat.value}
              </span>
              <span className="text-white/50 text-xs uppercase tracking-widest mt-1 text-center">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </main>

      {/* ── Mini Choropleth Map ── */}
      <section className="px-4 pb-20 max-w-5xl mx-auto w-full">
        <div className="text-center mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Where capital is flowing</h2>
          <p className="text-white/40 text-sm">Total energy investment by country — darker green = higher capital deployment</p>
        </div>
        <LandingChoropleth onExplore={() => gatedNavigate("/map")} />
      </section>

      {/* Features Section */}
      <section id="features" className="bg-white/3 border-t border-white/8 py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-3">Everything you need to track Africa's energy deals</h2>
          <p className="text-white/50 text-center mb-12 max-w-lg mx-auto">A comprehensive platform built for analysts, investors, and policymakers.</p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: <Layers className="w-6 h-6 text-[#00e676]" />,
                title: "Deal Database",
                desc: `Search and filter ${stats ? stats.totalProjects : "70+"} disclosed energy transactions across ${stats ? stats.totalCountries : "20+"} African countries by sector, status, deal size, and investors.`,
              },
              {
                icon: <Globe className="w-6 h-6 text-[#00e676]" />,
                title: "Interactive Map",
                desc: "Visualise investment intensity across Africa on an interactive map — hover countries for stats and click through to country profiles.",
              },
              {
                icon: <BarChart2 className="w-6 h-6 text-[#00e676]" />,
                title: "Visualization Studio",
                desc: "Generate custom bar, line, and pie charts by country, region, sector, or year — and download them as ready-to-use infographics.",
              },
            ].map((f) => (
              <div key={f.title} className="bg-white/4 border border-white/8 rounded-2xl p-6 hover:border-[#00e676]/30 transition-colors">
                <div className="w-11 h-11 rounded-xl bg-[#00e676]/10 flex items-center justify-center mb-4">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-10">
            <button
              onClick={() => gatedNavigate("/dashboard")}
              className="bg-[#00e676] hover:bg-[#00c864] text-[#0b0f1a] font-semibold px-8 py-3.5 rounded-full transition-colors shadow-lg shadow-[#00e676]/20"
            >
              Launch Tracker →
            </button>
          </div>
        </div>
      </section>

      {/* Latest Deals Section */}
      <LatestDealsSection />

      {/* Data Section */}
      <section id="data" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-3">What's in the database</h2>
          <p className="text-white/50 text-center mb-12 max-w-lg mx-auto">Publicly disclosed energy investment transactions sourced from project announcements, government records, and development finance reports.</p>
          <div className="grid md:grid-cols-2 gap-6 mb-10">
            <div className="bg-white/4 border border-white/8 rounded-2xl p-6 flex flex-col gap-4">
              <h3 className="font-semibold text-lg text-[#00e676]">Coverage</h3>
              <ul className="space-y-3 text-sm text-white/70">
                {[
                  "52 African countries across all major regions",
                  "8 sector types: Solar, Wind, Hydro, Grid & Storage, Oil & Gas, Coal, Nuclear & Bioenergy",
                  "Projects ranging from early development to fully operational",
                  "Deal sizes from $10M to multi-billion dollar programmes",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-[#00e676] mt-0.5">✓</span>{item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white/4 border border-white/8 rounded-2xl p-6 flex flex-col gap-4">
              <h3 className="font-semibold text-lg text-[#00e676]">Data Fields</h3>
              <ul className="space-y-3 text-sm text-white/70">
                {[
                  "Project name, country, region & GPS coordinates",
                  "Sector type and installed capacity (MW)",
                  "Deal size in USD millions and announcement year",
                  "Investor names, financing type & project status",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-[#00e676] mt-0.5">✓</span>{item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex justify-center">
            <button
              onClick={() => gatedNavigate("/deals")}
              className="border border-[#00e676]/40 hover:border-[#00e676] text-[#00e676] font-semibold px-8 py-3.5 rounded-full transition-colors"
            >
              Browse the Deal Database →
            </button>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="bg-white/3 border-t border-white/8 py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">About AfriEnergy Tracker</h2>
          <p className="text-white/60 text-lg leading-relaxed mb-8">
            AfriEnergy Tracker is an open intelligence platform that aggregates and visualises publicly disclosed
            energy investment data across the African continent. Built for analysts, investors, development
            finance institutions, and policymakers who need fast, reliable access to deal-level data.
          </p>
          <p className="text-white/50 text-base leading-relaxed mb-10">
            The platform tracks the full project lifecycle — from announcement through development,
            construction, and into operation — giving users a clear picture of where capital is flowing
            and which sectors are scaling fastest across the continent.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => gatedNavigate("/dashboard")}
              className="bg-[#00e676] hover:bg-[#00c864] text-[#0b0f1a] font-semibold px-8 py-3.5 rounded-full transition-colors shadow-lg shadow-[#00e676]/20"
            >
              Explore the Tracker
            </button>
            <button
              onClick={() => gatedNavigate("/studio")}
              className="border border-white/20 hover:border-white/40 text-white/80 hover:text-white font-semibold px-8 py-3.5 rounded-full transition-colors"
            >
              Generate a Chart
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/8 py-8 px-8 text-center text-white/30 text-sm">
        <Link href="/" className="inline-flex items-center justify-center gap-2 mb-2 cursor-pointer hover:opacity-80 transition-opacity">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-primary/20">
            <img
              src={`${import.meta.env.BASE_URL}images/logo-icon.png`}
              alt="AfriEnergy Logo"
              className="w-4 h-4 object-contain filter brightness-0"
            />
          </div>
          <span className="font-display font-semibold text-white/60">AfriEnergy Tracker</span>
        </Link>
        <div className="mt-1">Africa's Energy Investment Tracker · Data sourced from publicly disclosed transactions</div>
        <div className="mt-2 text-white/20">A product of <a href="https://africaenergypulse.com" target="_blank" rel="noopener noreferrer" className="text-white/40 font-medium hover:text-white/70 transition-colors">Africa Energy Pulse</a></div>
      </footer>
    </div>
  );
}
