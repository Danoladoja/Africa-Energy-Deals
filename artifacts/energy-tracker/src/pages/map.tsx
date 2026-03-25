import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GeoJSON, MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import type { GeoJsonObject } from "geojson";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { SEOMeta } from "@/components/seo-meta";
import { captureToCanvas } from "@/utils/export-utils";
import {
  MapPin, Zap, Maximize2, ChevronUp, X as XIcon, Download, Share2,
  Check, ChevronDown,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";

const API = "/api";
const AFRICA_GEOJSON_URL =
  "https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/africa.geojson";

// Africa bounds for default fit
const AFRICA_BOUNDS: L.LatLngBoundsExpression = [[-38, -20], [38, 56]];

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
const DEFAULT_COLOR = "#94a3b8";

const FINANCING_COLORS: Record<string, string> = {
  "Project Finance":   "#3b82f6",
  "Blended Finance":   "#06b6d4",
  "Concessional Loan": "#f59e0b",
  "Grant/Donor":       "#10b981",
  "Corporate":         "#8b5cf6",
  "Sovereign":         "#ef4444",
  "IPP/Concession":    "#ec4899",
  "Green Bond":        "#22c55e",
};

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

// ── Blue-slate choropleth color scale ────────────────────────────────────────
function getCountryColor(investment: number, maxInvestment: number): string {
  if (!investment) return "rgba(15, 23, 42, 0.5)";
  const t = Math.log1p(investment) / Math.log1p(maxInvestment);
  // Dark navy → mid-blue → bright blue
  const r = Math.round(30  + (96  - 30)  * t);
  const g = Math.round(41  + (165 - 41)  * t);
  const b = Math.round(82  + (250 - 82)  * t);
  const alpha = 0.30 + 0.60 * t;
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Dynamic map title ─────────────────────────────────────────────────────────
function getMapTitle(sectorFilter: string, financingFilter: string): string {
  const hasSector = sectorFilter !== "all";
  const hasFinancing = financingFilter !== "all";
  if (hasSector && hasFinancing)
    return `African ${sectorFilter} Energy — ${financingFilter} Financing`;
  if (hasSector) return `African ${sectorFilter} Energy Investments`;
  if (hasFinancing) return `African Energy Investment — ${financingFilter} Financing`;
  return "African Energy Investment Landscape";
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
  financingType?: string | null;
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

// ── Country name labels layer ────────────────────────────────────────────────

function CountryNamesLayer({ geoJson, zoom }: { geoJson: GeoJsonObject | undefined; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    if (!geoJson || !map) return;

    const labels: L.Marker[] = [];
    const data = geoJson as any;

    data.features?.forEach((feature: any) => {
      const name: string = feature.properties?.name;
      if (!name) return;

      try {
        const layer = L.geoJSON(feature);
        const bounds = layer.getBounds();
        if (!bounds.isValid()) return;
        const center = bounds.getCenter();

        // Shorten very long names to fit in smaller countries
        const display = name
          .replace("Democratic Republic of the", "DR")
          .replace("Central African Republic", "CAR")
          .replace("Equatorial Guinea", "Eq. Guinea")
          .replace("Western Sahara", "W. Sahara")
          .replace("São Tomé and Príncipe", "São Tomé")
          .replace("Republic of the Congo", "Congo")
          .replace("United Republic of Tanzania", "Tanzania");

        const fontSize = zoom <= 4 ? 8 : zoom <= 5 ? 9 : 10;

        const label = L.marker(center, {
          icon: L.divIcon({
            html: `<span style="
              font-size:${fontSize}px;
              color:rgba(255,255,255,0.82);
              text-shadow:0 1px 3px rgba(0,0,0,0.9),0 0 6px rgba(0,0,0,0.6);
              font-weight:700;
              white-space:nowrap;
              pointer-events:none;
              letter-spacing:0.04em;
              font-family:inherit;
            ">${display}</span>`,
            className: "",
            iconSize: [0, 0],
            iconAnchor: [0, 6],
          }),
          interactive: false,
          keyboard: false,
          zIndexOffset: -100,
        });
        label.addTo(map);
        labels.push(label);
      } catch {
        // skip invalid features
      }
    });

    return () => {
      labels.forEach((l) => {
        try { l.remove(); } catch {}
      });
    };
  }, [geoJson, map, zoom]);

  return null;
}

function MapController({
  mapRef,
  onZoomChange,
}: {
  mapRef: React.MutableRefObject<L.Map | null>;
  onZoomChange: (z: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    onZoomChange(map.getZoom());
    map.on("zoomend", () => onZoomChange(map.getZoom()));
    return () => { map.off("zoomend"); };
  }, [map, mapRef, onZoomChange]);
  return null;
}

// ── Project popup ─────────────────────────────────────────────────────────────

function EnhancedPopup({ project, navigate }: { project: Project; navigate: (p: string) => void }) {
  const color = SECTOR_COLORS[project.technology] ?? DEFAULT_COLOR;
  return (
    <div style={{ fontFamily: "inherit", minWidth: 270, maxWidth: 310 }}>
      <div style={{
        background: `linear-gradient(135deg, ${color}18, transparent)`,
        borderBottom: `2px solid ${color}40`,
        padding: "10px 14px 8px",
        marginBottom: 10,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color, marginBottom: 3 }}>
          {project.technology}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>
          {project.projectName}
        </div>
      </div>

      <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>📍 {project.country}</span>
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

        {project.financingType && (
          <div style={{ fontSize: 11, color: "#cbd5e1" }}>
            <span style={{ color: "#64748b" }}>Financing: </span>{project.financingType}
          </div>
        )}
        {project.developer && (
          <div style={{ fontSize: 11, color: "#cbd5e1" }}>
            <span style={{ color: "#64748b" }}>Developer: </span>{project.developer}
          </div>
        )}
        {project.investors && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Investors</div>
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

// ── Project list sidebar ──────────────────────────────────────────────────────

function ProjectList({
  projects,
  isLoading,
  activeProject,
  onSelect,
}: {
  projects: Project[];
  isLoading: boolean;
  activeProject: Project | null;
  onSelect: (p: Project) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
      {isLoading
        ? Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="p-3.5 rounded-xl border border-white/5 bg-white/2 animate-pulse">
              <div className="h-3.5 bg-white/5 w-3/4 mb-2 rounded" />
              <div className="h-3 bg-white/5 w-1/2 rounded" />
            </div>
          ))
        : projects.map((p) => (
            <div
              key={p.id}
              onClick={() => onSelect(p)}
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
                    <Zap className="w-2.5 h-2.5" style={{ color: SECTOR_COLORS[p.technology] ?? DEFAULT_COLOR }} />
                    {p.technology}
                  </span>
                </p>
              </div>
            </div>
          ))}
    </div>
  );
}

// ── Filter dropdown ───────────────────────────────────────────────────────────

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-[#1e293b]/95 backdrop-blur border border-white/10 text-slate-300 text-xs font-semibold rounded-xl pl-3 pr-7 py-2 outline-none cursor-pointer hover:border-white/20 transition-colors"
        style={{ minWidth: 110 }}
      >
        <option value="all">{label}: All</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MapPage() {
  const [, navigate] = useLocation();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const mapRef = useRef<L.Map | null>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const searchStr = useSearch();
  const initParams = useMemo(() => {
    const p = new URLSearchParams(searchStr);
    return { sector: p.get("sector") ?? "all", financing: p.get("financing") ?? "all" };
  }, []);

  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [layerMode, setLayerMode] = useState<LayerMode>("both");
  const [legendOpen, setLegendOpen] = useState(true);
  const [showProjects, setShowProjects] = useState(false);
  const [sectorFilter, setSectorFilter] = useState(initParams.sector);
  const [financingFilter, setFinancingFilter] = useState(initParams.financing);
  const [zoom, setZoom] = useState(3);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportMenuOpen) return;
    function handler(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportMenuOpen]);

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

  // Filtered projects
  const allProjects = projectsData?.projects ?? [];
  const filteredProjects = useMemo(() => {
    return allProjects.filter((p) => {
      if (sectorFilter !== "all" && p.technology !== sectorFilter) return false;
      if (financingFilter !== "all" && p.financingType !== financingFilter) return false;
      return true;
    });
  }, [allProjects, sectorFilter, financingFilter]);

  const mapProjects = useMemo(
    () => filteredProjects.filter(p => p.latitude != null && p.longitude != null),
    [filteredProjects]
  );

  // Unique sectors and financing types from data
  const sectors = useMemo(() => [...new Set(allProjects.map(p => p.technology))].filter(Boolean).sort(), [allProjects]);
  const financingTypes = useMemo(
    () => [...new Set(allProjects.map(p => p.financingType).filter(Boolean))] as string[],
    [allProjects]
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
        : "rgba(15, 23, 42, 0.50)",
      fillOpacity: 1,
      color: "rgba(30,41,82,0.8)",
      weight: 0.8,
    };
  }, [countryStatsMap, maxInvestment]);

  const onEachFeature = useCallback((feature: any, layer: any) => {
    const name = feature.properties?.name as string;
    const stat = countryStatsMap[name];

    layer.bindTooltip(
      `<div style="background:#1e293b;border:1px solid rgba(255,255,255,0.12);padding:8px 12px;border-radius:10px;min-width:140px;font-family:inherit;pointer-events:none;">
        <div style="font-size:13px;font-weight:700;color:#f1f5f9;margin-bottom:4px;">${name}</div>
        ${stat
          ? `<div style="font-size:12px;color:#60a5fa;font-weight:600;font-family:monospace;">${fmt(stat.totalInvestmentUsdMn)}</div>
             <div style="font-size:11px;color:#64748b;margin-top:2px;">${stat.projectCount} project${stat.projectCount !== 1 ? "s" : ""}</div>`
          : `<div style="font-size:11px;color:#475569;">No data tracked</div>`}
      </div>`,
      { sticky: true, className: "leaflet-choropleth-tooltip", offset: [14, 0] }
    );

    layer.on("mouseover", () => layer.setStyle({ weight: 1.5, color: "#60a5fa" }));
    layer.on("mouseout", () => layer.setStyle({ weight: 0.8, color: "rgba(30,41,82,0.8)" }));
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
    if (!mapRef.current) return;
    mapRef.current.fitBounds(AFRICA_BOUNDS, { padding: [20, 20], animate: true });
  }

  const mapTitle = getMapTitle(sectorFilter, financingFilter);

  async function handleDownload() {
    if (!mapWrapRef.current) return;
    setExporting(true);
    try {
      const canvas = await captureToCanvas(mapWrapRef.current, 2);

      // Draw title overlay on canvas
      const ctx = canvas.getContext("2d")!;
      const paddingX = 28;
      const boxHeight = 80;

      // Title backdrop
      ctx.fillStyle = "rgba(11,15,26,0.88)";
      ctx.beginPath();
      const radius = 12;
      ctx.moveTo(paddingX + radius, 16);
      ctx.lineTo(paddingX + 520 - radius, 16);
      ctx.arcTo(paddingX + 520, 16, paddingX + 520, 16 + radius, radius);
      ctx.lineTo(paddingX + 520, 16 + boxHeight - radius);
      ctx.arcTo(paddingX + 520, 16 + boxHeight, paddingX + 520 - radius, 16 + boxHeight, radius);
      ctx.lineTo(paddingX + radius, 16 + boxHeight);
      ctx.arcTo(paddingX, 16 + boxHeight, paddingX, 16 + boxHeight - radius, radius);
      ctx.lineTo(paddingX, 16 + radius);
      ctx.arcTo(paddingX, 16, paddingX + radius, 16, radius);
      ctx.closePath();
      ctx.fill();

      ctx.font = "bold 22px 'Inter', sans-serif";
      ctx.fillStyle = "#f1f5f9";
      ctx.fillText(mapTitle, paddingX + 18, 54);

      ctx.font = "13px 'Inter', sans-serif";
      ctx.fillStyle = "#64748b";
      ctx.fillText(`Source: AfriEnergy Tracker  ·  ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`, paddingX + 18, 78);

      const link = document.createElement("a");
      const slug = mapTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      link.download = `afrienergy-map-${slug}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Map downloaded");
    } catch (e) {
      toast.error("Download failed — try again");
    } finally {
      setExporting(false);
    }
  }

  function handleShare() {
    const params = new URLSearchParams();
    if (sectorFilter !== "all") params.set("sector", sectorFilter);
    if (financingFilter !== "all") params.set("financing", financingFilter);
    const qs = params.toString();
    const url = `${window.location.origin}${window.location.pathname.replace(/\?.*/, "")}${qs ? "?" + qs : ""}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success("Map link copied to clipboard");
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <Layout>
      <SEOMeta
        title="Investment Map"
        description="Explore African energy investment deals on an interactive map. Filter by technology sector and see geographic spread across African markets."
        url="/map"
      />
      <PageTransition className="h-full flex flex-col md:flex-row relative">

        {/* ── Left column: toolbar + map ── */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">

          {/* ── Toolbar ── */}
          <div className="shrink-0 bg-[#0b0f1a] border-b border-white/6 px-4 py-2 flex items-center gap-2.5 flex-wrap md:flex-nowrap">

            {/* Title (left) */}
            <div className="flex-1 min-w-0 mr-1">
              <p className="text-[13px] font-bold text-white leading-tight truncate">{mapTitle}</p>
              <p className="text-[10px] text-slate-500 leading-none mt-0.5">
                {isLoading ? "Loading…" : `${filteredProjects.length} deals · ${Object.keys(countryStatsMap).length} markets`}
              </p>
            </div>

            {/* Layer toggle */}
            <div className="flex items-center gap-0.5 bg-white/5 border border-white/8 rounded-lg p-0.5 shrink-0">
              {(["both", "choropleth", "markers"] as LayerMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setLayerMode(mode)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors capitalize ${
                    layerMode === mode
                      ? "bg-[#00e676] text-[#0b0f1a]"
                      : "text-slate-400 hover:text-white hover:bg-white/8"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 shrink-0">
              <FilterDropdown label="Sector" value={sectorFilter} options={sectors} onChange={setSectorFilter} />
              <FilterDropdown label="Financing" value={financingFilter} options={financingTypes} onChange={setFinancingFilter} />
              {(sectorFilter !== "all" || financingFilter !== "all") && (
                <button
                  onClick={() => { setSectorFilter("all"); setFinancingFilter("all"); }}
                  className="text-[11px] text-slate-500 hover:text-red-400 transition-colors px-1"
                  title="Clear filters"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Export dropdown */}
            <div className="relative shrink-0" ref={exportMenuRef}>
              <button
                onClick={() => setExportMenuOpen(v => !v)}
                className="flex items-center gap-1.5 bg-white/5 border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors"
              >
                {exporting
                  ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  : <Download className="w-3.5 h-3.5" />}
                Export
                <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
                {exportMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full mt-1.5 w-48 bg-[#1e293b] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                  >
                    <button
                      onClick={() => { handleDownload(); setExportMenuOpen(false); }}
                      disabled={exporting}
                      className="flex items-center gap-2.5 w-full px-4 py-3 text-[12px] text-slate-200 hover:bg-white/6 transition-colors text-left disabled:opacity-60"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        <span className="font-semibold block">Download PNG</span>
                        <span className="text-[10px] text-slate-500">With title + source</span>
                      </span>
                    </button>
                    <div className="h-px bg-white/5 mx-3" />
                    <button
                      onClick={() => { handleShare(); setExportMenuOpen(false); }}
                      className="flex items-center gap-2.5 w-full px-4 py-3 text-[12px] text-slate-200 hover:bg-white/6 transition-colors text-left"
                    >
                      {copied
                        ? <Check className="w-3.5 h-3.5 text-[#00e676] shrink-0" />
                        : <Share2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                      <span>
                        <span className="font-semibold block">{copied ? "Copied!" : "Copy Share Link"}</span>
                        <span className="text-[10px] text-slate-500">Includes active filters</span>
                      </span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── Map ── */}
          <div className="flex-1 relative overflow-hidden" ref={mapWrapRef}>
            <MapContainer
              bounds={AFRICA_BOUNDS}
              boundsOptions={{ padding: [10, 10] }}
              style={{ height: "100%", width: "100%", zIndex: 0 }}
              zoomControl={false}
              maxZoom={10}
              minZoom={2}
            >
              <MapController mapRef={mapRef} onZoomChange={setZoom} />
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; OpenStreetMap &copy; CARTO'
              />
              {showChoropleth && geoJson && countryStats && (
                <GeoJSON key={geoKey} data={geoJson} style={geoStyle} onEachFeature={onEachFeature} />
              )}
              {showChoropleth && geoJson && (
                <CountryNamesLayer geoJson={geoJson} zoom={zoom} />
              )}
              {showMarkers && mapProjects.map(p => (
                <CircleMarker
                  key={p.id}
                  center={[p.latitude!, p.longitude!]}
                  radius={p.dealSizeUsdMn
                    ? Math.max(2, Math.min(5, Math.sqrt(p.dealSizeUsdMn) * 0.22))
                    : 3}
                  pathOptions={{
                    color: activeProject?.id === p.id ? "#ffffff" : SECTOR_COLORS[p.technology] ?? DEFAULT_COLOR,
                    fillColor: SECTOR_COLORS[p.technology] ?? DEFAULT_COLOR,
                    fillOpacity: 0.9,
                    weight: activeProject?.id === p.id ? 2 : 0.8,
                  }}
                  eventHandlers={{ click: () => setActiveProject(p) }}
                >
                  <Popup className="custom-popup" maxWidth={310} minWidth={270}>
                    <EnhancedPopup project={p} navigate={navigate} />
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>

            {/* Zoom-to-fit */}
            <button
              onClick={handleZoomFit}
              title="Fit Africa"
              className="absolute bottom-16 right-4 md:bottom-6 md:right-4 z-[1000] bg-[#1e293b]/95 backdrop-blur border border-white/10 rounded-xl p-2.5 shadow-xl hover:bg-white/10 transition-colors"
            >
              <Maximize2 className="w-4 h-4 text-slate-300" />
            </button>

            {/* Mobile: toggle project list */}
            <button
              onClick={() => setShowProjects(true)}
              className="md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-[#1e293b]/95 backdrop-blur border border-white/10 rounded-full px-5 py-2.5 shadow-xl text-xs font-semibold text-slate-200"
            >
              <ChevronUp className="w-4 h-4 text-[#00e676]" />
              {isLoading ? "Loading…" : `${filteredProjects.length} Projects`}
            </button>

            {/* Legend */}
            <div className="absolute bottom-4 left-4 md:bottom-6 md:left-4 z-[1000]">
              <button
                onClick={() => setLegendOpen(v => !v)}
                className="md:hidden flex items-center gap-2 bg-[#1e293b]/95 backdrop-blur border border-white/10 px-3 py-2 rounded-xl text-xs font-semibold"
              >
                <span className="w-2 h-2 rounded-full bg-[#60a5fa]" />
                {legendOpen ? "Hide legend" : "Legend"}
              </button>

              <div className={`${legendOpen ? "flex" : "hidden"} md:flex flex-col bg-[#1e293b]/95 backdrop-blur border border-white/10 p-4 rounded-xl shadow-xl mt-2 md:mt-0 gap-4 max-h-[50vh] overflow-y-auto`}>
                {showChoropleth && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Investment Scale</p>
                    <div
                      className="h-2 w-28 rounded-full mb-1.5"
                      style={{ background: "linear-gradient(to right, rgba(15,23,42,0.5), rgba(30,41,82,0.8), #3b82f6, #93c5fd)" }}
                    />
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>None</span>
                      <span>{fmt(maxInvestment)}</span>
                    </div>
                    <p className="text-[9px] text-slate-600 mt-1.5">Click country → profile</p>
                  </div>
                )}
                {showMarkers && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Technologies</p>
                    <div className="space-y-1.5">
                      {Object.entries(SECTOR_COLORS).map(([tech, color]) => (
                        <div key={tech} className="flex items-center gap-2 text-[11px] text-slate-300">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          {tech}
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-slate-600 mt-2">Dot size ∝ deal size</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Desktop Sidebar ── */}
        <div className="hidden md:flex w-[290px] bg-[#1e293b] border-l border-white/5 flex-col h-full z-10">
          <div className="p-4 border-b border-white/5 shrink-0">
            <h2 className="text-sm font-bold mb-0.5">Project Explorer</h2>
            <p className="text-xs text-slate-500">
              {isLoading
                ? "Loading…"
                : `${mapProjects.length} mapped · ${filteredProjects.length} filtered`}
            </p>
          </div>
          <ProjectList
            projects={filteredProjects}
            isLoading={isLoading}
            activeProject={activeProject}
            onSelect={(p) => setActiveProject(activeProject?.id === p.id ? null : p)}
          />
        </div>

        {/* ── Mobile Bottom Sheet ── */}
        <AnimatePresence>
          {showProjects && (
            <>
              <motion.div
                key="bs-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="md:hidden fixed inset-0 z-[1100] bg-black/50"
                onClick={() => setShowProjects(false)}
              />
              <motion.div
                key="bs-panel"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 320, damping: 35 }}
                className="md:hidden fixed bottom-0 left-0 right-0 z-[1200] bg-[#1e293b] rounded-t-2xl border-t border-white/10 flex flex-col"
                style={{ maxHeight: "70vh" }}
              >
                <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
                  <div>
                    <h2 className="text-sm font-bold">Project Explorer</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isLoading ? "Loading…" : `${mapProjects.length} mapped · ${filteredProjects.length} filtered`}
                    </p>
                  </div>
                  <button onClick={() => setShowProjects(false)} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/8">
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <ProjectList
                    projects={filteredProjects}
                    isLoading={isLoading}
                    activeProject={activeProject}
                    onSelect={(p) => { setActiveProject(activeProject?.id === p.id ? null : p); setShowProjects(false); }}
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

      </PageTransition>
    </Layout>
  );
}
