import { useState } from "react";
import { useListProjects } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { Zap, ExternalLink, MapPin, DollarSign, Calendar, Users, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const techColors: Record<string, string> = {
  "Solar PV": "hsl(160, 84%, 39%)",
  "Wind": "hsl(189, 94%, 43%)",
  "Hydro": "hsl(217, 91%, 60%)",
  "Geothermal": "hsl(280, 65%, 60%)",
  "Biomass": "hsl(35, 91%, 55%)",
  "Concentrating Solar Power": "hsl(45, 95%, 55%)",
  "Natural Gas": "hsl(215, 20%, 65%)",
  "Oil & Gas": "hsl(10, 80%, 55%)",
};

const defaultColor = "hsl(215, 20%, 65%)";

function getStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case "operational": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/25";
    case "under construction": return "bg-blue-500/15 text-blue-400 border-blue-500/25";
    case "development": return "bg-amber-500/15 text-amber-400 border-amber-500/25";
    case "active": return "bg-teal-500/15 text-teal-400 border-teal-500/25";
    default: return "bg-gray-500/15 text-gray-400 border-gray-500/25";
  }
}

export default function MapPage() {
  const [activeProject, setActiveProject] = useState<any>(null);

  const { data, isLoading } = useListProjects({ limit: 500 });
  const mapProjects = data?.projects.filter(p => p.latitude != null && p.longitude != null) || [];

  return (
    <Layout>
      <PageTransition className="h-full flex flex-col md:flex-row relative">

        {/* Map Area */}
        <div className="flex-1 h-[50vh] md:h-full relative z-0">
          <MapContainer
            center={[0, 20]}
            zoom={4}
            style={{ height: "100%", width: "100%", zIndex: 0 }}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />

            {mapProjects.map((project) => (
              <CircleMarker
                key={project.id}
                center={[project.latitude!, project.longitude!]}
                radius={project.dealSizeUsdMn ? Math.max(6, Math.min(20, Math.sqrt(project.dealSizeUsdMn) * 1.5)) : 8}
                pathOptions={{
                  color: activeProject?.id === project.id ? "#fff" : techColors[project.technology] || defaultColor,
                  fillColor: techColors[project.technology] || defaultColor,
                  fillOpacity: 0.75,
                  weight: activeProject?.id === project.id ? 4 : 1,
                }}
                eventHandlers={{ click: () => setActiveProject(project) }}
              >
                <Popup
                  className="custom-popup"
                  maxWidth={320}
                  minWidth={280}
                >
                  <div style={{ fontFamily: "inherit", minWidth: 280 }}>
                    {/* Header stripe */}
                    <div
                      style={{
                        background: `linear-gradient(135deg, ${techColors[project.technology] || defaultColor}22, transparent)`,
                        borderBottom: `2px solid ${techColors[project.technology] || defaultColor}55`,
                        padding: "12px 14px 10px",
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: techColors[project.technology] || defaultColor,
                            marginBottom: 4,
                          }}>
                            {project.technology}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, color: "inherit" }}>
                            {project.projectName}
                          </div>
                        </div>
                        {project.sourceUrl && (
                          <a
                            href={project.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              color: techColors[project.technology] || defaultColor,
                              background: `${techColors[project.technology] || defaultColor}18`,
                              border: `1px solid ${techColors[project.technology] || defaultColor}40`,
                              borderRadius: 20,
                              padding: "4px 9px",
                              whiteSpace: "nowrap",
                              textDecoration: "none",
                              flexShrink: 0,
                            }}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                            Source
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Body */}
                    <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {/* Location + Status row */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          {project.country}, {project.region}
                        </span>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 20,
                          border: "1px solid",
                          ...(project.status === "Operational"
                            ? { background: "rgba(16,185,129,0.12)", color: "#34d399", borderColor: "rgba(16,185,129,0.25)" }
                            : project.status === "Under Construction"
                            ? { background: "rgba(59,130,246,0.12)", color: "#60a5fa", borderColor: "rgba(59,130,246,0.25)" }
                            : project.status === "Development"
                            ? { background: "rgba(245,158,11,0.12)", color: "#fbbf24", borderColor: "rgba(245,158,11,0.25)" }
                            : { background: "rgba(100,116,139,0.12)", color: "#94a3b8", borderColor: "rgba(100,116,139,0.25)" }
                          ),
                        }}>
                          {project.status}
                        </span>
                      </div>

                      {/* Deal Size + Capacity */}
                      <div style={{ display: "flex", gap: 6 }}>
                        <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "7px 10px" }}>
                          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>Deal Size</div>
                          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>
                            {project.dealSizeUsdMn
                              ? project.dealSizeUsdMn >= 1000
                                ? `$${(project.dealSizeUsdMn / 1000).toFixed(1)}B`
                                : `$${project.dealSizeUsdMn}M`
                              : "N/A"}
                          </div>
                        </div>
                        {project.capacityMw && (
                          <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "7px 10px" }}>
                            <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>Capacity</div>
                            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>
                              {project.capacityMw >= 1000
                                ? `${(project.capacityMw / 1000).toFixed(1)} GW`
                                : `${project.capacityMw} MW`}
                            </div>
                          </div>
                        )}
                        {project.announcedYear && (
                          <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "7px 10px" }}>
                            <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>Year</div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>
                              {project.closedYear ?? project.announcedYear}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Investors */}
                      {project.investors && (
                        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "7px 10px" }}>
                          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3 }}>Investors & Partners</div>
                          <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.5 }}>{project.investors}</div>
                        </div>
                      )}

                      {/* Description */}
                      {project.description && (
                        <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.55, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
                          {project.description}
                        </div>
                      )}

                      {/* Source footer */}
                      {project.sourceUrl && (
                        <a
                          href={project.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            color: techColors[project.technology] || defaultColor,
                            background: `${techColors[project.technology] || defaultColor}12`,
                            border: `1px solid ${techColors[project.technology] || defaultColor}30`,
                            borderRadius: 8,
                            padding: "8px 12px",
                            textDecoration: "none",
                            marginTop: 2,
                            transition: "background 0.15s",
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                          </svg>
                          View Verified Source
                        </a>
                      )}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>

          {/* Legend */}
          <div className="absolute bottom-6 left-6 z-[1000] bg-card/90 backdrop-blur-md border border-border p-4 rounded-xl shadow-xl">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Technologies</h4>
            <div className="space-y-2">
              {Object.entries(techColors).map(([tech, color]) => (
                <div key={tech} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span>{tech}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Project List */}
        <div className="w-full md:w-96 bg-card border-l border-card-border flex flex-col h-[50vh] md:h-full z-10 shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.5)]">
          <div className="p-6 border-b border-border">
            <h2 className="text-2xl font-bold font-display mb-2">Project Explorer</h2>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Loading projects..." : `${mapProjects.length} mapped projects across Africa.`}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 rounded-xl border border-border bg-background animate-pulse">
                  <div className="h-4 bg-muted w-3/4 mb-3 rounded" />
                  <div className="h-3 bg-muted w-1/2 mb-2 rounded" />
                  <div className="h-8 bg-muted w-24 rounded-full" />
                </div>
              ))
            ) : (
              mapProjects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => setActiveProject(project)}
                  className={`
                    p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden
                    ${activeProject?.id === project.id
                      ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                      : "bg-background border-border hover:border-primary/50"
                    }
                  `}
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{ backgroundColor: techColors[project.technology] || defaultColor }}
                  />
                  <div className="pl-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-bold text-sm leading-tight flex-1">{project.projectName}</h3>
                      {project.sourceUrl && (
                        <a
                          href={project.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View verified source"
                          className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mb-2 flex flex-wrap gap-x-3 gap-y-1">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {project.country}
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" /> {project.technology}
                      </span>
                      {project.capacityMw && (
                        <span className="flex items-center gap-1">
                          <Activity className="w-3 h-3" /> {project.capacityMw} MW
                        </span>
                      )}
                    </p>

                    <div className="flex justify-between items-center">
                      <Badge variant="outline" className={`text-xs ${getStatusColor(project.status)}`}>
                        {project.status}
                      </Badge>
                      <span className="font-mono text-sm font-semibold">
                        {project.dealSizeUsdMn
                          ? project.dealSizeUsdMn >= 1000
                            ? `$${(project.dealSizeUsdMn / 1000).toFixed(1)}B`
                            : `$${project.dealSizeUsdMn}M`
                          : ""}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </PageTransition>
    </Layout>
  );
}
