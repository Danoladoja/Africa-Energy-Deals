import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GeoJSON, MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import type { GeoJsonObject } from "geojson";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { MapPin, Zap, Maximize2 } from "lucide-react";

const API = "/api";
const AFRICA_GEOJSON_URL =
  "https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/africa.geojson";

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
const DEFAULT_COLOR = "#94a3b8";

const DB_TO_GEO: Record<string, string> = {
  "DRC":            "DR Congo",
  "Côte d'Ivoire":  "Ivory Coast",
};
const GEO_TO_DB: Record<string, string> = Object.fromEntries(
  Object.entries(DB_TO_GEO).map(([db, geo]) => [geo, db])
);

function fmt(mn: number | null | undefined): string {
  if (!mn) return "N/A";
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  return `$${mn.toFixed(0)}M`;
}

function getCountryColor(investment: number, maxInvestment: number): string {
  if (!investment) return "rgba(15, 23, 42, 0.6)";
  const t = Math.log1p(investment) / Math.log1p(maxInvestment);
  const g = Math.round(77 + (230 - 77) * t);
  const b = Math.round(42 + (118 - 42) * t);
  const alpha = 0.35 + 0.55 * t;
  return `rgba(0,${g},${b},${alpha})`;
}

type LayerMode = "both" | "choropleth" | "markers";

interface CountryStat {
  country: string;
  region: string;
  projectCount: number;
  totalInvestmentUsdMn: number;
}

interface Project {
  id: number;
  projectName: string;
  country: string;
  region: string;
  technology: string;
  dealSizeUsdMn?: number | null;
  capacityMw?: number | null;
  investors?: string | null;
  developer?: string | null;
  dealStage?: string | null;
  status: string;
  latitude?: number | null;
  longitude?: number | null;
  announcedYear?: number | null;
  sourceUrl?: string | null;
}

function MapController({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

function EnhancedPopup({ project, navigate }: { project: Project; navigate: (p: string) => void }) {
  const color = SECTOR_COLORS[project.technology] ?? DEFAULT_COLOR;
  return (
    <div style={{ fontFamily: "inherit", minWidth: 280, maxWidth: 310 }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${color}18, transparent)`,
          borderBottom: `2px solid ${color}40`,
          padding: "10px 14px 8px",
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color, marginBottom: 3 }}>
          {project.technology}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>
          {project.projectName}
        </div>
      </div>

      <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>📍 {project.country}, {project.region}</span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
            background: "rgba(100,116,139,0.15)", color: "#94a3b8", border: "1px solid rgba(100,116,139,0.25)",
          }}>
            {project.dealStage ?? project.status}
          </span>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Deal Size</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>{fmt(project.dealSizeUsdMn)}</div>
          </div>
          {project.capacityMw != null && (
            <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 10px" }}>
              <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Capacity</div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>
                {project.capacityMw >= 1000 ? `${(project.capacityMw / 1000).toFixed(1)} GW` : `${project.capacityMw} MW`}
              </div>
            </div>
          )}
          {project.announcedYear != null && (
            <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 10px" }}>
              <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Year</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{project.announcedYear}</div>
            </div>
          )}
        </div>

        {project.developer && (
          <div style={{ fontSize: 11, color: "#cbd5e1" }}>
            <span style={{ color: "#64748b" }}>Developer: </span>{project.developer}
          </div>
        )}

        {project.investors && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Investors & Partners</div>
            <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.5 }}>{project.investors}</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          <button
            onClick={() => navigate(`/deals/${project.id}`)}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              gap: 5, fontSize: 12, fontWeight: 600, color: "#0b0f1a",
              background: "#00e676", border: "none", borderRadius: 8,
              padding: "8px 12px", cursor: "pointer",
            }}
          >
            View Details →
          </button>
          {project.sourceUrl && (
            <a
              href={project.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 600, color: "#94a3b8",
                background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.20)",
                borderRadius: 8, padding: "8px 12px", textDecoration: "none",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MapPage() {
  const [, navigate] = useLocation();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const mapRef = useRef<L.Map | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [layerMode, setLayerMode] = useState<LayerMode>("both");
  const [legendOpen, setLegendOpen] = useState(true);

  const { data: projectsData, isLoading } = useQuery<{ projects: Project[] }>({
    queryKey: ["all-projects-map"],
    queryFn: () => fetch(`${API}/projects?limit=500`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const { data: countryStats } = useQuery<CountryStat[]>({
    queryKey: ["country-stats-map"],
    queryFn: () => fetch(`${API}/stats/by-country`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const { data: geoJson } = useQuery<GeoJsonObject>({
    queryKey: ["africa-geojson"],
    queryFn: () => fetch(AFRICA_GEOJSON_URL).then(r => r.json()),
    staleTime: 60 * 60 * 1000,
  });

  const mapProjects = useMemo(
    () => (projectsData?.projects ?? []).filter(p => p.latitude != null && p.longitude != null),
    [projectsData]
  );

  const countryStatsMap = useMemo(() => {
    const m: Record<string, CountryStat> = {};
    for (const s of countryStats ?? []) {
      m[DB_TO_GEO[s.country] ?? s.country] = s;
    }
    return m;
  }, [countryStats]);

  const maxInvestment = useMemo(
    () => Math.max(1, ...Object.values(countryStatsMap).map(c => c.totalInvestmentUsdMn)),
    [countryStatsMap]
  );

  const geoStyle = useCallback((feature: any) => {
    const stat = countryStatsMap[feature.properties?.name];
    return {
      fillColor: stat?.totalInvestmentUsdMn
        ? getCountryColor(stat.totalInvestmentUsdMn, maxInvestment)
        : "rgba(15, 23, 42, 0.55)",
      fillOpacity: 1,
      color: "#0f172a",
      weight: 1,
    };
  }, [countryStatsMap, maxInvestment]);

  const onEachFeature = useCallback((feature: any, layer: any) => {
    const name = feature.properties?.name as string;
    const stat = countryStatsMap[name];

    layer.bindTooltip(
      `<div style="background:#1e293b;border:1px solid rgba(255,255,255,0.12);padding:8px 12px;border-radius:10px;min-width:140px;font-family:inherit;pointer-events:none;">
        <div style="font-size:13px;font-weight:700;color:#f1f5f9;margin-bottom:4px;">${name}</div>
        ${stat
          ? `<div style="font-size:12px;color:#00e676;font-weight:600;font-family:monospace;">${fmt(stat.totalInvestmentUsdMn)}</div>
             <div style="font-size:11px;color:#64748b;margin-top:2px;">${stat.projectCount} project${stat.projectCount !== 1 ? "s" : ""}</div>`
          : `<div style="font-size:11px;color:#475569;">No data tracked</div>`}
      </div>`,
      { sticky: true, className: "leaflet-choropleth-tooltip", offset: [12, 0] }
    );

    layer.on("mouseover", () => layer.setStyle({ weight: 2, color: "#00e676" }));
    layer.on("mouseout", () => layer.setStyle({ weight: 1, color: "#0f172a" }));
    layer.on("click", () => {
      const dbName = GEO_TO_DB[name] ?? name;
      navigateRef.current(`/countries/${encodeURIComponent(dbName)}`);
    });
  }, [countryStatsMap]);

  const geoKey = useMemo(
    () => `geo-${Object.keys(countryStatsMap).length}`,
    [countryStatsMap]
  );

  const showChoropleth = layerMode === "both" || layerMode === "choropleth";
  const showMarkers = layerMode === "both" || layerMode === "markers";

  function handleZoomFit() {
    if (!mapRef.current || !mapProjects.length) return;
    const bounds = L.latLngBounds(mapProjects.map(p => [p.latitude!, p.longitude!] as [number, number]));
    mapRef.current.fitBounds(bounds, { padding: [40, 40] });
  }

  return (
    <Layout>
      <PageTransition className="h-full flex flex-col md:flex-row relative">

        {/* ── Map Area ── */}
        <div className="flex-1 h-[55vh] md:h-full relative z-0">
          <MapContainer
            center={[2, 20]}
            zoom={4}
            style={{ height: "100%", width: "100%", zIndex: 0 }}
            zoomControl={false}
          >
            <MapController mapRef={mapRef} />

            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; OpenStreetMap &copy; CARTO'
            />

            {/* Choropleth */}
            {showChoropleth && geoJson && countryStats && (
              <GeoJSON
                key={geoKey}
                data={geoJson}
                style={geoStyle}
                onEachFeature={onEachFeature}
              />
            )}

            {/* Markers */}
            {showMarkers && mapProjects.map(p => (
              <CircleMarker
                key={p.id}
                center={[p.latitude!, p.longitude!]}
                radius={p.dealSizeUsdMn
                  ? Math.max(6, Math.min(22, Math.sqrt(p.dealSizeUsdMn) * 1.5))
                  : 8}
                pathOptions={{
                  color: activeProject?.id === p.id ? "#ffffff" : SECTOR_COLORS[p.technology] ?? DEFAULT_COLOR,
                  fillColor: SECTOR_COLORS[p.technology] ?? DEFAULT_COLOR,
                  fillOpacity: 0.85,
                  weight: activeProject?.id === p.id ? 3 : 1.5,
                }}
                eventHandlers={{ click: () => setActiveProject(p) }}
              >
                <Popup className="custom-popup" maxWidth={320} minWidth={285}>
                  <EnhancedPopup project={p} navigate={navigate} />
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>

          {/* Layer toggle — floats over map */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-1/2 z-[1000] pointer-events-auto">
            <div className="flex items-center gap-0.5 bg-[#1e293b]/95 backdrop-blur border border-white/10 rounded-xl p-1 shadow-xl">
              {(["both", "choropleth", "markers"] as LayerMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setLayerMode(mode)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors capitalize ${
                    layerMode === mode
                      ? "bg-[#00e676] text-[#0b0f1a]"
                      : "text-slate-400 hover:text-white hover:bg-white/8"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Zoom-to-fit button */}
          <button
            onClick={handleZoomFit}
            title="Zoom to fit all projects"
            className="absolute bottom-24 right-4 md:bottom-6 md:right-6 z-[1000] bg-[#1e293b]/95 backdrop-blur border border-white/10 rounded-xl p-2.5 shadow-xl hover:bg-white/10 transition-colors"
          >
            <Maximize2 className="w-4 h-4 text-slate-300" />
          </button>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 md:bottom-6 md:left-6 z-[1000]">
            <button
              onClick={() => setLegendOpen(v => !v)}
              className="md:hidden flex items-center gap-2 bg-[#1e293b]/95 backdrop-blur border border-white/10 px-3 py-2 rounded-xl text-xs font-semibold"
            >
              <span className="w-2 h-2 rounded-full bg-[#00e676]" />
              {legendOpen ? "Hide legend" : "Legend"}
            </button>

            <div className={`${legendOpen ? "flex" : "hidden"} md:flex flex-col bg-[#1e293b]/95 backdrop-blur border border-white/10 p-4 rounded-xl shadow-xl mt-2 md:mt-0 gap-4 max-h-[60vh] overflow-y-auto`}>
              {/* Investment color scale */}
              {showChoropleth && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Investment Scale</p>
                  <div
                    className="h-2.5 w-28 rounded-full mb-1.5"
                    style={{ background: "linear-gradient(to right, rgba(15,23,42,0.6), rgba(0,77,42,0.9), #00a855, #00e676)" }}
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>None</span>
                    <span>{fmt(maxInvestment)}</span>
                  </div>
                  <p className="text-[9px] text-slate-600 mt-1.5">Click country → profile page</p>
                </div>
              )}

              {/* Technology dots */}
              {showMarkers && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Technologies</p>
                  <div className="space-y-1.5">
                    {Object.entries(SECTOR_COLORS).map(([tech, color]) => (
                      <div key={tech} className="flex items-center gap-2 text-xs text-slate-300">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        {tech}
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-600 mt-2">Marker size ∝ deal size</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="w-full md:w-[320px] bg-[#1e293b] border-l border-white/5 flex flex-col h-[50vh] md:h-full z-10">
          <div className="p-5 border-b border-white/5 shrink-0">
            <h2 className="text-base font-bold mb-0.5">Project Explorer</h2>
            <p className="text-xs text-slate-500">
              {isLoading
                ? "Loading…"
                : `${mapProjects.length} mapped · ${(projectsData?.projects ?? []).length} total`}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="p-3.5 rounded-xl border border-white/5 bg-white/2 animate-pulse">
                    <div className="h-3.5 bg-white/5 w-3/4 mb-2 rounded" />
                    <div className="h-3 bg-white/5 w-1/2 rounded" />
                  </div>
                ))
              : (projectsData?.projects ?? []).map(p => (
                  <div
                    key={p.id}
                    onClick={() => setActiveProject(activeProject?.id === p.id ? null : p)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                      activeProject?.id === p.id
                        ? "bg-[#00e676]/8 border-[#00e676]/25"
                        : "bg-white/2 border-white/5 hover:border-white/15"
                    }`}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l"
                      style={{ backgroundColor: SECTOR_COLORS[p.technology] ?? DEFAULT_COLOR }}
                    />
                    <div className="pl-3">
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <h3 className="font-semibold text-xs leading-tight flex-1 text-slate-200 line-clamp-2">
                          {p.projectName}
                        </h3>
                        {p.dealSizeUsdMn && (
                          <span className="font-mono text-[11px] font-bold text-[#00e676] shrink-0">
                            {fmt(p.dealSizeUsdMn)}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 flex items-center gap-2 mt-1">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5" /> {p.country}
                        </span>
                        <span className="flex items-center gap-1">
                          <Zap
                            className="w-2.5 h-2.5"
                            style={{ color: SECTOR_COLORS[p.technology] ?? DEFAULT_COLOR }}
                          />
                          {p.technology}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
          </div>
        </div>

      </PageTransition>
    </Layout>
  );
}
