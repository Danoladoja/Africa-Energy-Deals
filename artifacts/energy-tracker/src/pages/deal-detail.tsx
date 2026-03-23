import { useParams, useLocation } from "wouter";
import { useGetProject } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { SEOMeta, dealArticleSchema } from "@/components/seo-meta";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import {
  ArrowLeft, MapPin, ExternalLink, Calendar, DollarSign,
  Zap, Activity, Building2, Users, Landmark, ShoppingCart,
  GitBranch, Gift, Map, GitCompareArrows,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WatchButton } from "@/components/watch-button";

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
const FALLBACK_SECTOR_COLOR = "#94a3b8";

const COUNTRY_FLAGS: Record<string, string> = {
  "South Africa": "🇿🇦", "Egypt": "🇪🇬", "Morocco": "🇲🇦", "Kenya": "🇰🇪",
  "Nigeria": "🇳🇬", "Ethiopia": "🇪🇹", "Ghana": "🇬🇭", "Tanzania": "🇹🇿",
  "Mozambique": "🇲🇿", "Zambia": "🇿🇲", "Zimbabwe": "🇿🇼", "Uganda": "🇺🇬",
  "Senegal": "🇸🇳", "Ivory Coast": "🇨🇮", "Côte d'Ivoire": "🇨🇮", "Mali": "🇲🇱",
  "Burkina Faso": "🇧🇫", "Niger": "🇳🇪", "Cameroon": "🇨🇲", "Rwanda": "🇷🇼",
  "Tunisia": "🇹🇳", "Algeria": "🇩🇿", "Libya": "🇱🇾", "Sudan": "🇸🇩",
  "Angola": "🇦🇴", "Democratic Republic of Congo": "🇨🇩", "DRC": "🇨🇩",
  "Namibia": "🇳🇦", "Botswana": "🇧🇼", "Malawi": "🇲🇼", "Lesotho": "🇱🇸",
  "Eswatini": "🇸🇿", "Djibouti": "🇩🇯", "Somalia": "🇸🇴", "Eritrea": "🇪🇷",
  "Mauritius": "🇲🇺", "Madagascar": "🇲🇬", "Benin": "🇧🇯", "Togo": "🇹🇬",
  "Sierra Leone": "🇸🇱", "Liberia": "🇱🇷", "Guinea": "🇬🇳", "Gabon": "🇬🇦",
  "Congo": "🇨🇬", "Chad": "🇹🇩", "Mauritania": "🇲🇷",
};

const DEAL_STAGES = ["Announced", "Mandated", "Financial Close", "Construction", "Commissioned"];

function formatDealSize(mn: number | null | undefined): string {
  if (!mn) return "Undisclosed";
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  return `$${mn.toFixed(0)}M`;
}

function getStatusColor(status: string) {
  const s = status.toLowerCase();
  if (s.includes("operational") || s.includes("commissioned") || s.includes("completed"))
    return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (s.includes("construction") || s.includes("active"))
    return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  if (s.includes("announced") || s.includes("proposed") || s.includes("development"))
    return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  if (s.includes("suspended") || s.includes("cancelled"))
    return "bg-red-500/15 text-red-400 border-red-500/30";
  return "bg-slate-500/15 text-slate-400 border-slate-500/30";
}

function DealStageStepper({ stage }: { stage: string | null | undefined }) {
  const isSuspended = stage === "Suspended";
  const currentIdx = DEAL_STAGES.indexOf(stage ?? "");

  return (
    <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-4 md:p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Deal Pipeline</p>
      {isSuspended ? (
        <div className="flex items-center gap-2">
          <span className="px-4 py-2 rounded-full text-sm font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
            ⚠ Suspended
          </span>
        </div>
      ) : !stage ? (
        <p className="text-slate-500 text-sm italic">Stage not recorded</p>
      ) : (
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {DEAL_STAGES.map((s, i) => {
            const isActive = i === currentIdx;
            const isDone = i < currentIdx;
            const isFuture = i > currentIdx;
            return (
              <div key={s} className="flex items-center gap-1 shrink-0">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                      isActive
                        ? "bg-[#00e676] border-[#00e676] text-[#0b0f1a]"
                        : isDone
                        ? "bg-[#00e676]/20 border-[#00e676]/50 text-[#00e676]"
                        : "bg-white/5 border-white/10 text-slate-600"
                    }`}
                  >
                    {isDone ? "✓" : i + 1}
                  </div>
                  <span
                    className={`text-[10px] font-medium whitespace-nowrap ${
                      isActive ? "text-[#00e676]" : isDone ? "text-[#00e676]/70" : "text-slate-600"
                    }`}
                  >
                    {s}
                  </span>
                </div>
                {i < DEAL_STAGES.length - 1 && (
                  <div
                    className={`h-0.5 w-6 md:w-10 rounded mb-3 shrink-0 ${
                      i < currentIdx ? "bg-[#00e676]/50" : "bg-white/10"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color?: string }) {
  return (
    <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="w-4 h-4" style={color ? { color } : undefined} />
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-bold text-white font-mono">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-white/5 last:border-0">
      <span className="text-sm text-slate-400 shrink-0">{label}</span>
      <span className="text-sm font-medium text-slate-100 text-right">{value}</span>
    </div>
  );
}

function DebtEquityBar({ split }: { split: string }) {
  const match = split.match(/^(\d+)\/(\d+)$/);
  if (!match) return <span className="text-sm font-medium text-slate-100">{split}</span>;
  const debt = parseInt(match[1]);
  const equity = parseInt(match[2]);
  const total = debt + equity;
  const debtPct = (debt / total) * 100;
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex rounded-full overflow-hidden h-2.5 bg-white/10">
        <div className="bg-blue-500 h-full" style={{ width: `${debtPct}%` }} />
        <div className="bg-emerald-500 h-full flex-1" />
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        <span><span className="text-blue-400 font-medium">{debt}%</span> Debt</span>
        <span><span className="text-emerald-400 font-medium">{equity}%</span> Equity</span>
      </div>
    </div>
  );
}

export default function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data: project, isLoading, isError } = useGetProject(Number(id));

  const sectorColor = project ? (SECTOR_COLORS[project.technology] ?? FALLBACK_SECTOR_COLOR) : FALLBACK_SECTOR_COLOR;
  const flag = project ? (COUNTRY_FLAGS[project.country] ?? "🌍") : "";

  const hasCoords = project?.latitude != null && project?.longitude != null;
  const hasFinancing = project && (
    project.developer || project.financiers || project.dfiInvolvement ||
    project.offtaker || project.debtEquitySplit || project.grantComponent ||
    project.announcementDate || project.financialCloseDate || project.commissioningDate
  );

  const dealSizeStr = project?.dealSizeUsdMn
    ? (project.dealSizeUsdMn >= 1000
        ? `$${(project.dealSizeUsdMn / 1000).toFixed(1)}B`
        : `$${project.dealSizeUsdMn.toFixed(0)}M`)
    : null;

  return (
    <Layout>
      {project && (
        <SEOMeta
          title={project.projectName}
          description={`${project.technology} project in ${project.country}${dealSizeStr ? `, ${dealSizeStr} investment` : ""}. Status: ${project.status}.`}
          url={`/deals/${project.id}`}
          type="article"
          jsonLd={dealArticleSchema(project)}
        />
      )}
      <PageTransition className="p-4 md:p-8 max-w-5xl mx-auto">

        {/* Back navigation */}
        <button
          onClick={() => navigate("/deals")}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Deal Tracker
        </button>

        {isLoading && (
          <div className="space-y-4 animate-pulse">
            <div className="h-10 bg-[#1e293b] rounded-2xl w-2/3" />
            <div className="h-6 bg-[#1e293b] rounded-xl w-1/3" />
            <div className="h-32 bg-[#1e293b] rounded-2xl" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-[#1e293b] rounded-2xl" />)}
            </div>
          </div>
        )}

        {isError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center">
            <p className="text-red-400 font-medium mb-2">Project not found</p>
            <p className="text-slate-500 text-sm">This deal may have been removed or the ID is invalid.</p>
          </div>
        )}

        {project && (
          <div className="space-y-5">

            {/* Header */}
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 leading-tight">
                {project.projectName}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={getStatusColor(project.status)}>
                  {project.status}
                </Badge>
                <span className="flex items-center gap-1.5 text-sm text-slate-400">
                  <MapPin className="w-3.5 h-3.5" />
                  {flag} {project.country}
                </span>
                <span className="text-slate-600 text-sm">·</span>
                <span className="text-sm text-slate-400">{project.region}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <WatchButton watchType="country" watchValue={project.country} label={`Watch ${project.country}`} size="sm" />
                {project.technology && (
                  <WatchButton watchType="technology" watchValue={project.technology} label={`Watch ${project.technology}`} size="sm" />
                )}
                {project.developer && (
                  <WatchButton watchType="developer" watchValue={project.developer} label={`Watch ${project.developer}`} size="sm" />
                )}
                <button
                  onClick={() => navigate(`/deals?compareId=${project.id}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 border border-white/10 hover:border-[#00e676]/40 hover:text-[#00e676] hover:bg-[#00e676]/5 transition-all"
                >
                  <GitCompareArrows className="w-3.5 h-3.5" />
                  Compare with…
                </button>
              </div>
            </div>

            {/* Deal Stage Stepper */}
            <DealStageStepper stage={project.dealStage} />

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                icon={DollarSign}
                label="Deal Size"
                value={formatDealSize(project.dealSizeUsdMn)}
              />
              <MetricCard
                icon={Activity}
                label="Capacity"
                value={project.capacityMw ? `${project.capacityMw} MW` : "N/A"}
              />
              <MetricCard
                icon={Zap}
                label="Sector"
                value={project.technology}
                color={sectorColor}
              />
              <MetricCard
                icon={Calendar}
                label="Year Announced"
                value={project.announcedYear ? String(project.announcedYear) : "Unknown"}
              />
            </div>

            {/* Financing Section */}
            {hasFinancing && (
              <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-5 md:p-6">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-4">
                  Financing & Counterparties
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  <div>
                    {project.developer && <InfoRow label="Developer" value={project.developer} />}
                    {project.financiers && <InfoRow label="Financiers" value={project.financiers} />}
                    {project.offtaker && <InfoRow label="Offtaker" value={project.offtaker} />}
                    {project.dfiInvolvement && (
                      <div className="flex items-start justify-between gap-4 py-3 border-b border-white/5">
                        <span className="text-sm text-slate-400 shrink-0 flex items-center gap-1.5">
                          <Landmark className="w-3.5 h-3.5" />DFI Involvement
                        </span>
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {project.dfiInvolvement.split(",").map((dfi) => (
                            <span key={dfi.trim()} className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-xs font-medium">
                              {dfi.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {project.grantComponent && (
                      <InfoRow label="Grant Component" value={formatDealSize(project.grantComponent)} />
                    )}
                  </div>
                  <div>
                    {project.announcementDate && (
                      <InfoRow label="Announcement Date" value={new Date(project.announcementDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} />
                    )}
                    {project.financialCloseDate && (
                      <InfoRow label="Financial Close" value={new Date(project.financialCloseDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} />
                    )}
                    {project.commissioningDate && (
                      <InfoRow label="Commissioning Date" value={new Date(project.commissioningDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} />
                    )}
                    {project.debtEquitySplit && (
                      <div className="py-3 border-b border-white/5 last:border-0">
                        <p className="text-sm text-slate-400 mb-2">Debt / Equity Split</p>
                        <DebtEquityBar split={project.debtEquitySplit} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Description */}
            {project.description && (
              <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-5 md:p-6">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-3">About this Project</h2>
                <p className="text-slate-300 leading-relaxed text-sm md:text-base">{project.description}</p>
              </div>
            )}

            {/* Map */}
            {hasCoords && (
              <div className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden">
                <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Location</h2>
                  <button
                    onClick={() => navigate("/map")}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#00e676] transition-colors"
                  >
                    <Map className="w-3.5 h-3.5" />
                    View on Map
                  </button>
                </div>
                <div style={{ height: 220 }}>
                  <MapContainer
                    center={[project.latitude!, project.longitude!]}
                    zoom={5}
                    style={{ height: "100%", width: "100%", zIndex: 0 }}
                    zoomControl={false}
                    scrollWheelZoom={false}
                    dragging={false}
                    attributionControl={false}
                  >
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                    <CircleMarker
                      center={[project.latitude!, project.longitude!]}
                      radius={10}
                      pathOptions={{ color: sectorColor, fillColor: sectorColor, fillOpacity: 0.85, weight: 2 }}
                    >
                      <Popup>
                        <div className="text-xs font-medium">{project.projectName}</div>
                        <div className="text-xs text-gray-400">{project.country}</div>
                      </Popup>
                    </CircleMarker>
                  </MapContainer>
                </div>
              </div>
            )}

            {/* Sources */}
            {(project.newsUrl || project.sourceUrl) && (
              <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-5">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-3">Sources</h2>
                <div className="flex flex-wrap gap-3">
                  {project.newsUrl && (
                    <a
                      href={project.newsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl text-sm text-slate-300 hover:text-white transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      News Article
                    </a>
                  )}
                  {project.sourceUrl && (
                    <a
                      href={project.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-[#00e676]/10 hover:bg-[#00e676]/15 border border-[#00e676]/25 hover:border-[#00e676]/40 rounded-xl text-sm text-[#00e676] transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Primary Source
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 pb-6">
              <button
                onClick={() => navigate("/deals")}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Deal Tracker
              </button>
              {hasCoords && (
                <button
                  onClick={() => navigate("/map")}
                  className="flex items-center gap-2 text-sm text-[#00e676] hover:text-[#00e676]/80 transition-colors"
                >
                  <Map className="w-4 h-4" />
                  View on Map
                </button>
              )}
            </div>

          </div>
        )}

      </PageTransition>
    </Layout>
  );
}
