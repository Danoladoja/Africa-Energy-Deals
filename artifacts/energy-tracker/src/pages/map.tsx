import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GeoJSON, MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import type { GeoJsonObject } from "geojson";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { SEOMeta } from "@/components/seo-meta";
import { captureToCanvas, triggerBlobDownload } from "@/utils/export-utils";
import {
  Maximize2, X as XIcon, Download, Share2,
  Check, ChevronDown,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { TECHNOLOGY_COLORS } from "@/config/technologyConfig";

const API = "/api";
const AFRICA_GEOJSON_URL =
  "https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/africa.geojson";

// Africa bounds for default fit
const AFRICA_BOUNDS: L.LatLngBoundsExpression = [[-38, -20], [38, 56]];

const SECTOR_COLORS: Record<string, string> = TECHNOLOGY_COLORS;
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

// ── Multi-colour choropleth scale — theme-aligned (site bg → blue → teal → brand green) ──
const COLOR_STOPS = [
  { t: 0.00, r: 15,  g: 23,  b: 42  }, // #0f172a — site background (very low)
  { t: 0.22, r: 23,  g: 58,  b: 110 }, // #173a6e — deep blue
  { t: 0.42, r: 6,   g: 110, b: 140 }, // #066e8c — steel teal
  { t: 0.62, r: 2,   g: 153, b: 120 }, // #029978 — teal-green
  { t: 0.80, r: 0,   g: 200, b: 100 }, // #00c864 — mid brand green
  { t: 1.00, r: 0,   g: 230, b: 118 }, // #00e676 — site primary green (highest)
];

function lerpColor(t: number): string {
  if (t <= 0) return `rgb(${COLOR_STOPS[0].r},${COLOR_STOPS[0].g},${COLOR_STOPS[0].b})`;
  if (t >= 1) { const s = COLOR_STOPS[COLOR_STOPS.length - 1]; return `rgb(${s.r},${s.g},${s.b})`; }
  let lo = COLOR_STOPS[0], hi = COLOR_STOPS[COLOR_STOPS.length - 1];
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    if (t >= COLOR_STOPS[i].t && t <= COLOR_STOPS[i + 1].t) { lo = COLOR_STOPS[i]; hi = COLOR_STOPS[i + 1]; break; }
  }
  const range = hi.t - lo.t;
  const u = range === 0 ? 0 : (t - lo.t) / range;
  return `rgb(${Math.round(lo.r + (hi.r - lo.r) * u)},${Math.round(lo.g + (hi.g - lo.g) * u)},${Math.round(lo.b + (hi.b - lo.b) * u)})`;
}

function getCountryColor(investment: number, maxInvestment: number): string {
  if (!investment) return "rgba(15, 23, 42, 0.55)";
  const t = Math.log1p(investment) / Math.log1p(maxInvestment);
  return lerpColor(t);
}

// Gradient CSS string for the legend bar
const GRADIENT_CSS = `linear-gradient(to right, ${COLOR_STOPS.map(s => `rgb(${s.r},${s.g},${s.b}) ${s.t * 100}%`).join(", ")})`;

// ── Investment scale bottom bar ───────────────────────────────────────────────
function InvestmentScaleLegend({ maxInvestment }: { maxInvestment: number }) {
  const cats = [
    { label: "Minimal",  t: 0 },
    { label: "Low",      t: 0.25 },
    { label: "Moderate", t: 0.5 },
    { label: "High",     t: 0.75 },
    { label: "Leading",  t: 1 },
  ];
  const getAmt = (t: number) => {
    const v = Math.expm1(t * Math.log1p(maxInvestment));
    return v < 1 ? "$0" : fmt(v);
  };
  return (
    <div
      className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[1000] bg-[rgba(11,15,26,0.88)] backdrop-blur border border-white/10 rounded-2xl px-5 py-3 shadow-2xl"
      style={{ minWidth: 280, maxWidth: 360 }}
    >
      <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 text-center mb-2">
        Finance Flow Intensity
      </p>
      <div className="h-3 w-full rounded-full mb-1" style={{ background: GRADIENT_CSS }} />
      <div className="flex justify-between mb-0.5">
        {cats.map(c => (
          <span key={c.label} className="text-[9px] text-white/50" style={{ fontVariantNumeric: "tabular-nums" }}>
            {getAmt(c.t)}
          </span>
        ))}
      </div>
      <div className="flex justify-between">
        {cats.map(c => (
          <span
            key={c.label}
            className="text-[9px] font-semibold"
            style={{ color: lerpColor(c.t) }}
          >
            {c.label}
          </span>
        ))}
      </div>
      <p className="text-[8px] text-white/25 text-center mt-1.5">Click any country → market profile</p>
    </div>
  );
}

// ── Dynamic map title ─────────────────────────────────────────────────────────
function getMapTitle(sectorFilter: string, regionFilter: string): string {
  const hasSector = sectorFilter !== "all";
  const hasRegion = regionFilter !== "all";
  if (hasSector && hasRegion)
    return `${regionFilter} ${sectorFilter} Energy Investments`;
  if (hasSector) return `African ${sectorFilter} Energy Investments`;
  if (hasRegion) return `${regionFilter} Energy Investment Landscape`;
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
        className="appearance-none bg-card/95 backdrop-blur border border-border text-foreground/80 text-xs font-semibold rounded-xl pl-3 pr-7 py-2 outline-none cursor-pointer hover:border-primary/40 transition-colors"
        style={{ minWidth: 110 }}
      >
        <option value="all">{label}: All</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/70 pointer-events-none" />
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
    return { sector: p.get("sector") ?? "all", region: p.get("region") ?? "all" };
  }, []);

  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [layerMode, setLayerMode] = useState<LayerMode>("both");
  const [legendOpen, setLegendOpen] = useState(true);
  const [sectorFilter, setSectorFilter] = useState(initParams.sector);
  const [regionFilter, setRegionFilter] = useState(initParams.region);
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
      if (regionFilter !== "all" && p.region !== regionFilter) return false;
      return true;
    });
  }, [allProjects, sectorFilter, regionFilter]);

  const mapProjects = useMemo(
    () => filteredProjects.filter(p => p.latitude != null && p.longitude != null),
    [filteredProjects]
  );

  // Unique sectors and regions from data
  const sectors = useMemo(() => [...new Set(allProjects.map(p => p.technology))].filter(Boolean).sort(), [allProjects]);
  const regions = useMemo(
    () => [...new Set(allProjects.map(p => p.region).filter(Boolean))].sort() as string[],
    [allProjects]
  );

  // Set of GEO-mapped country names that appear in filtered results
  // null = no active filter (show all)
  const filteredCountryNames = useMemo<Set<string> | null>(() => {
    if (sectorFilter === "all" && regionFilter === "all") return null;
    return new Set(filteredProjects.map(p => DB_TO_GEO[p.country] ?? p.country));
  }, [filteredProjects, sectorFilter, regionFilter]);

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
    const geoName: string = feature.properties?.name;
    const stat = countryStatsMap[geoName];
    // Dim countries that have no matching projects when a filter is active
    if (filteredCountryNames && !filteredCountryNames.has(geoName)) {
      return {
        fillColor: "rgba(15, 23, 42, 0.25)",
        fillOpacity: 1,
        color: "rgba(30,41,82,0.3)",
        weight: 0.5,
      };
    }
    return {
      fillColor: stat?.totalInvestmentUsdMn
        ? getCountryColor(stat.totalInvestmentUsdMn, maxInvestment)
        : "rgba(15, 23, 42, 0.50)",
      fillOpacity: 1,
      color: "rgba(30,41,82,0.8)",
      weight: 0.8,
    };
  }, [countryStatsMap, maxInvestment, filteredCountryNames]);

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
    () => `geo-${Object.keys(countryStatsMap).length}-${sectorFilter}-${regionFilter}`,
    [countryStatsMap, sectorFilter, regionFilter]
  );

  const showChoropleth = layerMode === "both" || layerMode === "choropleth";
  const showMarkers = layerMode === "both" || layerMode === "markers";

  function handleZoomFit() {
    if (!mapRef.current) return;
    mapRef.current.fitBounds(AFRICA_BOUNDS, { padding: [20, 20], animate: true });
  }

  const mapTitle = getMapTitle(sectorFilter, regionFilter);

  async function handleDownload() {
    if (!mapWrapRef.current) return;
    setExporting(true);
    try {
      // Wait for every tile <img> in the map to finish loading
      const imgs = Array.from(mapWrapRef.current.querySelectorAll<HTMLImageElement>("img"));
      await Promise.all(imgs.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>(resolve => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(resolve, 3000);
        });
      }));

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

      const slug = mapTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const filename = `afrienergy-map-${slug}.png`;

      // Use reliable blob download (works in all browsers / async contexts)
      canvas.toBlob((blob) => {
        if (blob) triggerBlobDownload(blob, filename);
      }, "image/png");

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
    if (regionFilter !== "all") params.set("region", regionFilter);
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
        <div className="flex-1 flex flex-col h-full">

          {/* ── Toolbar ── */}
          <div className="shrink-0 bg-background border-b border-border/60 px-4 py-2 flex items-center gap-2.5 flex-wrap md:flex-nowrap">

            {/* Title (left) */}
            <div className="flex-1 min-w-0 mr-1">
              <p className="text-[13px] font-bold text-foreground leading-tight truncate">{mapTitle}</p>
              <p className="text-[10px] text-muted-foreground/70 leading-none mt-0.5">
                {isLoading ? "Loading…" : `${filteredProjects.length} deals · ${Object.keys(countryStatsMap).length} markets`}
              </p>
            </div>

            {/* Layer toggle */}
            <div className="flex items-center gap-0.5 bg-muted/30 border border-border/80 rounded-lg p-0.5 shrink-0">
              {(["both", "choropleth", "markers"] as LayerMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setLayerMode(mode)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors capitalize ${
                    layerMode === mode
                      ? "bg-[#00e676] text-[#0b0f1a]"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 shrink-0">
              <FilterDropdown label="Sector" value={sectorFilter} options={sectors} onChange={setSectorFilter} />
              <FilterDropdown label="Region" value={regionFilter} options={regions} onChange={setRegionFilter} />
              {(sectorFilter !== "all" || regionFilter !== "all") && (
                <button
                  onClick={() => { setSectorFilter("all"); setRegionFilter("all"); }}
                  className="text-[11px] text-muted-foreground/70 hover:text-red-400 transition-colors px-1"
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
                className="flex items-center gap-1.5 bg-background border border-border hover:border-primary/40 hover:text-primary hover:bg-primary/5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors"
              >
                {exporting
                  ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  : <Download className="w-3.5 h-3.5" />}
                Export
                <ChevronDown className={`w-3 h-3 text-muted-foreground/70 transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
                {exportMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full mt-1.5 w-48 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
                  >
                    <button
                      onClick={() => { handleDownload(); setExportMenuOpen(false); }}
                      disabled={exporting}
                      className="flex items-center gap-2.5 w-full px-4 py-3 text-[12px] text-foreground hover:bg-muted/50 transition-colors text-left disabled:opacity-60"
                    >
                      <Download className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span>
                        <span className="font-semibold block">Download PNG</span>
                        <span className="text-[10px] text-muted-foreground/70">With title + source</span>
                      </span>
                    </button>
                    <div className="h-px bg-muted/30 mx-3" />
                    <button
                      onClick={() => { handleShare(); setExportMenuOpen(false); }}
                      className="flex items-center gap-2.5 w-full px-4 py-3 text-[12px] text-foreground hover:bg-muted/50 transition-colors text-left"
                    >
                      {copied
                        ? <Check className="w-3.5 h-3.5 text-[#00e676] shrink-0" />
                        : <Share2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                      <span>
                        <span className="font-semibold block">{copied ? "Copied!" : "Copy Share Link"}</span>
                        <span className="text-[10px] text-muted-foreground/70">Includes active filters</span>
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
                crossOrigin="anonymous"
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
              className="absolute bottom-16 right-4 md:bottom-6 md:right-4 z-[1000] bg-card/95 backdrop-blur border border-border rounded-xl p-2.5 shadow-xl hover:bg-muted transition-colors"
            >
              <Maximize2 className="w-4 h-4 text-foreground/80" />
            </button>


            {/* Sector legend — bottom left */}
            {showMarkers && (
              <div className="absolute bottom-4 left-4 md:bottom-6 md:left-4 z-[1000]">
                <button
                  onClick={() => setLegendOpen(v => !v)}
                  className="md:hidden flex items-center gap-2 bg-card/95 backdrop-blur border border-border px-3 py-2 rounded-xl text-xs font-semibold"
                >
                  <span className="w-2 h-2 rounded-full bg-[#00e676]" />
                  {legendOpen ? "Hide sectors" : "Sectors"}
                </button>
                <div className={`${legendOpen ? "flex" : "hidden"} md:flex flex-col bg-[rgba(11,15,26,0.88)] backdrop-blur border border-white/10 p-4 rounded-xl shadow-2xl mt-2 md:mt-0 gap-1.5 max-h-[40vh] overflow-y-auto`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Technologies</p>
                  {Object.entries(SECTOR_COLORS).map(([tech, color]) => (
                    <div key={tech} className="flex items-center gap-2 text-[11px] text-white/70">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      {tech}
                    </div>
                  ))}
                  <p className="text-[9px] text-white/25 mt-1">Dot size ∝ deal size</p>
                </div>
              </div>
            )}

            {/* Finance flow intensity bar — bottom center */}
            {showChoropleth && (
              <InvestmentScaleLegend maxInvestment={maxInvestment} />
            )}
          </div>
        </div>


      </PageTransition>
    </Layout>
  );
}
