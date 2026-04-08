import { useState, useEffect, useCallback, useRef } from "react";
import { Layout } from "@/components/layout";
import { getAdminToken } from "@/contexts/admin-auth";
import {
  Database, Play, RefreshCw, CheckCircle2, XCircle, Clock, Loader2,
  AlertCircle, Check, X, ChevronDown, ChevronUp, Zap, TrendingUp,
  FileSearch, Activity, BarChart2, Filter, Download, Globe,
  Newspaper, Mail, Users, Send, Eye, LayoutDashboard, ListTodo,
  ChevronRight, ExternalLink,
} from "lucide-react";
import { useAdminAuth } from "@/contexts/admin-auth";

const API = "/api";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAdminToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Content-Type": "application/json",
    ...extra,
  };
}

function ago(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface SourceGroup { name: string; description: string; feedCount: number; isRunning: boolean }
interface SourceStat {
  lastRun: { id: number; sourceName: string; startedAt: string; completedAt: string | null; recordsFound: number; recordsInserted: number; recordsUpdated: number; flaggedForReview: number; errors: string | null; triggeredBy: string } | null;
  totalInserted: number; totalUpdated: number; totalFound: number; totalFlagged: number; runCount: number;
}
interface Project { id: number; projectName: string; country: string; technology: string; dealSizeUsdMn: number | null; capacityMw: number | null; status: string; description: string | null; sourceUrl: string | null; newsUrl: string | null; reviewStatus: string; discoveredAt: string | null; confidenceScore: number | null; extractionSource: string | null; developer: string | null; financiers: string | null }
interface RunProgress { stage: string; message: string; processed?: number; discovered?: number; updated?: number; flagged?: number }
interface Newsletter { id: number; editionNumber: number; title: string; executiveSummary: string | null; spotlightSector: string | null; spotlightCountry: string | null; projectsAnalyzed: number | null; totalInvestmentCovered: string | null; generatedAt: string | null; sentAt: string | null; status: string; recipientCount: number | null }
interface Subscriber { id: number; email: string; role: string; newsletterOptIn: boolean; newsletterFrequency: string | null; createdAt: string; lastNewsletterSentAt: string | null }

type AdminSection = "overview" | "pipeline" | "queue" | "newsletter";
type ReviewAction = "approve" | "reject";

const TECH_COLORS: Record<string, string> = {
  Solar: "text-amber-400 bg-amber-400/10",
  Wind: "text-blue-400 bg-blue-400/10",
  Hydro: "text-cyan-400 bg-cyan-400/10",
  Geothermal: "text-red-400 bg-red-400/10",
  "Oil & Gas": "text-orange-400 bg-orange-400/10",
  "Grid Expansion": "text-purple-400 bg-purple-400/10",
  "Battery & Storage": "text-pink-400 bg-pink-400/10",
  Hydrogen: "text-sky-400 bg-sky-400/10",
  Nuclear: "text-violet-400 bg-violet-400/10",
  Bioenergy: "text-green-400 bg-green-400/10",
  "Clean Cooking": "text-amber-300 bg-amber-300/10",
  Coal: "text-stone-400 bg-stone-400/10",
};

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? "text-green-400" : score >= 0.6 ? "text-yellow-400" : "text-red-400";
  return <span className={`text-xs font-mono ${color}`}>{pct}%</span>;
}

// ── Overview Section ───────────────────────────────────────────────────────────
function OverviewSection({ sources, bySource, pendingCount, newsletters, subscriberStats, setSection }: {
  sources: SourceGroup[];
  bySource: Record<string, SourceStat>;
  pendingCount: number;
  newsletters: Newsletter[];
  subscriberStats: { total: number; optedIn: number } | null;
  setSection: (s: AdminSection) => void;
}) {
  const totalInserted = Object.values(bySource).reduce((s, v) => s + v.totalInserted, 0);
  const totalUpdated  = Object.values(bySource).reduce((s, v) => s + v.totalUpdated, 0);
  const latestNl = newsletters[0];

  const cards = [
    { label: "Source Groups",    value: sources.length,        icon: <Database className="w-5 h-5" />,  color: "text-blue-400",   onClick: () => setSection("pipeline") },
    { label: "Pending Review",   value: pendingCount,          icon: <Clock className="w-5 h-5" />,     color: "text-yellow-400", onClick: () => setSection("queue") },
    { label: "Records Inserted", value: totalInserted,         icon: <TrendingUp className="w-5 h-5" />, color: "text-green-400", onClick: () => setSection("pipeline") },
    { label: "Records Updated",  value: totalUpdated,          icon: <Activity className="w-5 h-5" />,  color: "text-purple-400", onClick: () => setSection("pipeline") },
    { label: "Newsletters Sent", value: newsletters.filter(n => n.status === "sent").length, icon: <Send className="w-5 h-5" />, color: "text-primary", onClick: () => setSection("newsletter") },
    { label: "Subscribers",      value: subscriberStats?.optedIn ?? "—", icon: <Users className="w-5 h-5" />, color: "text-cyan-400", onClick: () => setSection("newsletter") },
  ];

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform health at a glance</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {cards.map(({ label, value, icon, color, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/40 transition-colors group"
          >
            <div className={`flex items-center gap-2 ${color} mb-2`}>
              {icon}
              <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
            </div>
            <div className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors">{typeof value === "number" ? value.toLocaleString() : value}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Latest newsletter */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm text-foreground">Latest Newsletter</span>
          </div>
          {latestNl ? (
            <div className="px-5 py-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">#{latestNl.editionNumber}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${latestNl.status === "sent" ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}>{latestNl.status}</span>
              </div>
              <p className="text-sm font-medium text-foreground leading-snug">{latestNl.title}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{fmtDate(latestNl.generatedAt)}</span>
                {latestNl.recipientCount !== null && <span>{latestNl.recipientCount} recipients</span>}
              </div>
              <button onClick={() => setSection("newsletter")} className="text-xs text-primary hover:underline flex items-center gap-1">
                Manage newsletters <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">No newsletters yet</div>
          )}
        </div>

        {/* Active sources */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm text-foreground">Source Health</span>
          </div>
          <div className="divide-y divide-border/50">
            {sources.slice(0, 5).map(s => {
              const stat = bySource[s.name];
              return (
                <div key={s.name} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{s.name}</p>
                    <p className="text-[10px] text-muted-foreground">{ago(stat?.lastRun?.completedAt)}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-right">
                    <span className="text-green-400">{stat?.totalInserted ?? 0}</span>
                    {stat?.lastRun?.errors && <AlertCircle className="w-3.5 h-3.5 text-yellow-400" />}
                  </div>
                </div>
              );
            })}
            {sources.length > 5 && (
              <button onClick={() => setSection("pipeline")} className="px-5 py-3 text-xs text-primary hover:underline w-full text-left">
                View all {sources.length} sources →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pipeline Section ───────────────────────────────────────────────────────────
function PipelineSection({ sources, bySource, loadData, loadQueue }: {
  sources: SourceGroup[];
  bySource: Record<string, SourceStat>;
  loadData: () => Promise<void>;
  loadQueue: () => Promise<void>;
}) {
  const [runningSource, setRunningSource] = useState<string | null>(null);
  const [runLog, setRunLog] = useState<RunProgress[]>([]);
  const [runLogSource, setRunLogSource] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [specialRunning, setSpecialRunning] = useState<string | null>(null);
  const [specialLog, setSpecialLog] = useState<{ msg: string; ok: boolean }[]>([]);
  const [specialResult, setSpecialResult] = useState<{ total: number; inserted: number; updated: number; skipped: number; errors: number } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const specialLogEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [runLog]);
  useEffect(() => { specialLogEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [specialLog]);

  async function runSpecial(endpoint: string, label: string) {
    if (specialRunning || runningSource) return;
    setSpecialRunning(label); setSpecialLog([{ msg: `Starting ${label}...`, ok: true }]); setSpecialResult(null);
    try {
      const res = await fetch(`${API}/scraper/${endpoint}`, { method: "POST", headers: authHeaders() });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const p = JSON.parse(line.slice(6));
              if (p.stage === "progress") setSpecialLog(prev => [...prev, { msg: p.message, ok: !p.message.startsWith("ERROR") }]);
              else if (p.stage === "complete" && p.result) {
                setSpecialResult(p.result);
                setSpecialLog(prev => [...prev, { msg: `✓ Done — ${p.result.inserted} inserted, ${p.result.updated} updated, ${p.result.skipped} skipped`, ok: true }]);
              } else if (p.stage === "error") setSpecialLog(prev => [...prev, { msg: `✗ ${p.message}`, ok: false }]);
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err) {
      setSpecialLog(prev => [...prev, { msg: `✗ ${String(err)}`, ok: false }]);
    } finally {
      setSpecialRunning(null); await loadData(); await loadQueue();
    }
  }

  async function runSource(sourceName: string) {
    if (runningSource) return;
    setRunningSource(sourceName); setRunLogSource(sourceName === "__all__" ? "All Sources" : sourceName);
    setRunLog([{ stage: "fetching", message: sourceName === "__all__" ? "Starting all source groups..." : `Starting "${sourceName}"...` }]);
    try {
      const url = sourceName === "__all__" ? `${API}/scraper/run` : `${API}/scraper/run/${encodeURIComponent(sourceName)}`;
      const res = await fetch(url, { method: "POST", headers: authHeaders() });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try { setRunLog(prev => [...prev, JSON.parse(line.slice(6))]); } catch { /* ignore */ }
          }
        }
      }
    } catch (err) {
      setRunLog(prev => [...prev, { stage: "error", message: String(err) }]);
    } finally {
      setRunningSource(null); await loadData(); await loadQueue();
    }
  }

  const totalInserted = Object.values(bySource).reduce((s, v) => s + v.totalInserted, 0);
  const totalUpdated  = Object.values(bySource).reduce((s, v) => s + v.totalUpdated, 0);

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Data Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">AI scraper management — source groups & imports</p>
        </div>
        <button onClick={() => loadData()} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Source Groups", value: sources.length,  icon: <Database className="w-4 h-4" />,  color: "text-blue-400" },
          { label: "Total Inserted", value: totalInserted,  icon: <TrendingUp className="w-4 h-4" />, color: "text-green-400" },
          { label: "Total Updated",  value: totalUpdated,   icon: <Activity className="w-4 h-4" />,  color: "text-purple-400" },
          { label: "Total Flagged",  value: Object.values(bySource).reduce((s, v) => s + v.totalFlagged, 0), icon: <AlertCircle className="w-4 h-4" />, color: "text-yellow-400" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4">
            <div className={`flex items-center gap-2 ${color} mb-2`}>{icon}<span className="text-xs font-medium uppercase tracking-wider">{label}</span></div>
            <div className="text-2xl font-bold text-foreground">{value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Curated sources */}
      <div className="bg-card border border-border rounded-xl mb-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
          <Download className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-foreground">Curated Data Sources</h2>
          <span className="text-xs text-muted-foreground ml-1">Structured imports — bypass AI extraction</span>
        </div>
        <div className="divide-y divide-border">
          {[
            { endpoint: "seed",        label: "Import Seed Data",  description: "66 verified projects across 17+ countries. Auto-approved, confidence 95%.", icon: <Download className="w-4 h-4" />, color: "text-green-400 border-green-500/20 bg-green-500/10 hover:bg-green-500/20" },
            { endpoint: "world-bank",  label: "World Bank API",    description: "Fetches live African energy projects from the World Bank Projects API. Goes into review queue.", icon: <Globe className="w-4 h-4" />, color: "text-blue-400 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20" },
          ].map(({ endpoint, label, description, icon, color }) => {
            const isRunning = specialRunning === label;
            return (
              <div key={endpoint} className="px-6 py-4 flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-foreground text-sm">{label}</span>
                    {isRunning && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <button onClick={() => runSpecial(endpoint, label)} disabled={!!specialRunning || !!runningSource} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${color}`}>
                  {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
                  {isRunning ? "Running..." : "Run"}
                </button>
              </div>
            );
          })}
        </div>
        {specialLog.length > 0 && (
          <div className="border-t border-border p-4 max-h-48 overflow-y-auto font-mono text-xs space-y-0.5">
            {specialLog.map((e, i) => <div key={i} className={e.ok ? "text-muted-foreground" : "text-red-400"}>{e.msg}</div>)}
            <div ref={specialLogEndRef} />
          </div>
        )}
        {specialResult && !specialRunning && (
          <div className="border-t border-border px-6 py-3 bg-green-500/5 flex items-center gap-6 text-xs">
            <span className="text-green-400 font-semibold">Import complete</span>
            <span className="text-muted-foreground">Total: <span className="text-foreground">{specialResult.total}</span></span>
            <span className="text-muted-foreground">Inserted: <span className="text-green-400 font-medium">{specialResult.inserted}</span></span>
            <span className="text-muted-foreground">Updated: <span className="text-blue-400 font-medium">{specialResult.updated}</span></span>
            <span className="text-muted-foreground">Skipped: <span className="text-foreground">{specialResult.skipped}</span></span>
            {specialResult.errors > 0 && <span className="text-muted-foreground">Errors: <span className="text-red-400 font-medium">{specialResult.errors}</span></span>}
          </div>
        )}
      </div>

      {/* Source groups */}
      <div className="bg-card border border-border rounded-xl mb-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">Source Groups</h2>
            <span className="text-xs text-muted-foreground ml-1">({sources.length} groups, scheduled daily)</span>
          </div>
          <button onClick={() => runSource("__all__")} disabled={!!runningSource || !!specialRunning} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed">
            {runningSource === "__all__" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {runningSource === "__all__" ? "Running All..." : "Run All Sources"}
          </button>
        </div>
        <div className="divide-y divide-border">
          {sources.map((source) => {
            const stats = bySource[source.name];
            const lastRun = stats?.lastRun;
            const isRunning = runningSource === source.name;
            const isExpanded = expandedSource === source.name;
            return (
              <div key={source.name}>
                <div className="px-6 py-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-foreground text-sm">{source.name}</span>
                        <span className="text-xs text-muted-foreground">({source.feedCount} feeds)</span>
                        {source.isRunning && <span className="flex items-center gap-1 text-xs text-primary"><Loader2 className="w-3 h-3 animate-spin" />Running</span>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{source.description}</p>
                    </div>
                    <div className="flex items-center gap-5 text-xs shrink-0">
                      <div className="text-center"><div className="text-muted-foreground mb-0.5">Last Run</div><div className="font-medium text-foreground">{ago(lastRun?.completedAt)}</div></div>
                      <div className="text-center"><div className="text-muted-foreground mb-0.5">In</div><div className="font-medium text-green-400">{stats?.totalInserted ?? 0}</div></div>
                      <div className="text-center"><div className="text-muted-foreground mb-0.5">Up</div><div className="font-medium text-blue-400">{stats?.totalUpdated ?? 0}</div></div>
                      <div className="text-center"><div className="text-muted-foreground mb-0.5">Runs</div><div className="font-medium text-foreground">{stats?.runCount ?? 0}</div></div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {lastRun?.errors && (
                        <button onClick={() => setExpandedSource(isExpanded ? null : source.name)} className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-400/10 transition-colors" title="View errors">
                          <AlertCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => runSource(source.name)} disabled={!!runningSource} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                        {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        {isRunning ? "Running" : "Run"}
                      </button>
                    </div>
                  </div>
                  {isExpanded && lastRun?.errors && (
                    <div className="mt-3 bg-yellow-400/5 border border-yellow-400/20 rounded-lg p-3">
                      <p className="text-xs font-medium text-yellow-400 mb-1">Last run errors:</p>
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{(() => { try { return JSON.parse(lastRun.errors).join("\n"); } catch { return lastRun.errors; } })()}</pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live run log */}
      {runLog.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">Live Run: {runLogSource}</h2>
            {runningSource && <Loader2 className="w-4 h-4 animate-spin text-primary ml-auto" />}
          </div>
          <div className="p-4 max-h-64 overflow-y-auto font-mono text-xs space-y-1">
            {runLog.map((entry, i) => {
              const color = entry.stage === "error" ? "text-red-400" : entry.stage === "done" || entry.stage === "complete" ? "text-green-400" : entry.stage === "analyzing" ? "text-purple-400" : entry.stage === "saving" ? "text-blue-400" : "text-muted-foreground";
              return (
                <div key={i} className={`${color} leading-relaxed`}>
                  <span className="text-muted-foreground/50 mr-2">[{entry.stage}]</span>
                  {entry.message}
                  {entry.discovered !== undefined && ` — ${entry.discovered} new`}
                  {entry.updated !== undefined && `, ${entry.updated} updated`}
                  {entry.flagged !== undefined && entry.flagged > 0 && `, ${entry.flagged} flagged`}
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Review Queue Section ───────────────────────────────────────────────────────
function QueueSection({ pendingItems, pendingCount, setPendingItems, setPendingCount, loadQueue }: {
  pendingItems: Project[];
  pendingCount: number;
  setPendingItems: React.Dispatch<React.SetStateAction<Project[]>>;
  setPendingCount: React.Dispatch<React.SetStateAction<number>>;
  loadQueue: () => Promise<void>;
}) {
  const [reviewActions, setReviewActions] = useState<Record<number, "approve" | "reject" | "loading">>({});
  const [sourceFilter, setSourceFilter] = useState("all");

  const filteredPending = sourceFilter === "all" ? pendingItems : pendingItems.filter(p => p.extractionSource === sourceFilter);
  const uniqueSources = [...new Set(pendingItems.map(p => p.extractionSource).filter(Boolean))];

  async function reviewItem(id: number, action: ReviewAction) {
    setReviewActions(prev => ({ ...prev, [id]: "loading" }));
    try {
      await fetch(`${API}/scraper/review/${id}`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ action }) });
      setReviewActions(prev => ({ ...prev, [id]: action }));
      setPendingItems(prev => prev.filter(p => p.id !== id));
      setPendingCount(c => Math.max(0, c - 1));
    } catch {
      setReviewActions(prev => { const next = { ...prev }; delete next[id]; return next; });
    }
  }

  async function reviewAll(action: ReviewAction) {
    try {
      await fetch(`${API}/scraper/review-all`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ action }) });
      setPendingItems([]); setPendingCount(0);
    } catch { /* ignore */ }
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Review Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">AI-discovered items pending human verification</p>
        </div>
        <button onClick={loadQueue} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSearch className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">Pending Items</h2>
              {pendingCount > 0 && <span className="text-xs font-bold bg-yellow-400/20 text-yellow-400 px-2 py-0.5 rounded-full">{pendingCount}</span>}
            </div>
            {pendingItems.length > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={() => reviewAll("approve")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors text-xs font-medium">
                  <Check className="w-3.5 h-3.5" /> Approve All
                </button>
                <button onClick={() => reviewAll("reject")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-medium">
                  <X className="w-3.5 h-3.5" /> Reject All
                </button>
              </div>
            )}
          </div>
          {uniqueSources.length > 1 && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <button onClick={() => setSourceFilter("all")} className={`text-xs px-2 py-1 rounded-md transition-colors ${sourceFilter === "all" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>All</button>
              {uniqueSources.map(src => (
                <button key={src} onClick={() => setSourceFilter(src!)} className={`text-xs px-2 py-1 rounded-md transition-colors ${sourceFilter === src ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{src}</button>
              ))}
            </div>
          )}
        </div>

        {filteredPending.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-400/40 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">{pendingCount === 0 ? "No items pending review — queue is clear" : "No items match the current filter"}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredPending.map((project) => {
              const action = reviewActions[project.id];
              return (
                <div key={project.id} className="px-6 py-4 flex gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap mb-1">
                      <span className="font-medium text-foreground text-sm leading-tight">{project.projectName}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${TECH_COLORS[project.technology] ?? "text-muted-foreground bg-muted"}`}>{project.technology}</span>
                      <ConfidenceBadge score={project.confidenceScore} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1 flex-wrap">
                      <span>{project.country}</span>
                      {project.dealSizeUsdMn && <span>${project.dealSizeUsdMn.toFixed(0)}M</span>}
                      {project.capacityMw && <span>{project.capacityMw.toFixed(0)} MW</span>}
                      {project.extractionSource && <span className="text-primary/60">via {project.extractionSource}</span>}
                      <span>{ago(project.discoveredAt)}</span>
                    </div>
                    {project.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-1">{project.description}</p>}
                    {project.developer && <p className="text-xs text-muted-foreground">Developer: <span className="text-foreground/70">{project.developer}</span></p>}
                    {(project.sourceUrl || project.newsUrl) && (
                      <a href={project.sourceUrl ?? project.newsUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-0.5 flex items-center gap-1 truncate">
                        <ExternalLink className="w-3 h-3 shrink-0" />{project.sourceUrl ?? project.newsUrl}
                      </a>
                    )}
                  </div>
                  <div className="flex items-start gap-2 shrink-0 pt-0.5">
                    {action === "loading" ? <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      : action === "approve" ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="w-4 h-4" />Approved</span>
                      : action === "reject"  ? <span className="flex items-center gap-1 text-xs text-red-400"><XCircle className="w-4 h-4" />Rejected</span>
                      : <>
                          <button onClick={() => reviewItem(project.id, "approve")} className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors" title="Approve"><Check className="w-4 h-4" /></button>
                          <button onClick={() => reviewItem(project.id, "reject")}  className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"   title="Reject"><X className="w-4 h-4" /></button>
                        </>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Newsletter Section ─────────────────────────────────────────────────────────
function NewsletterSection({ newsletters, subscriberStats, loadNewsletters, loadSubscribers }: {
  newsletters: Newsletter[];
  subscriberStats: { total: number; optedIn: number; optedOut: number; subscribers: Subscriber[] } | null;
  loadNewsletters: () => Promise<void>;
  loadSubscribers: () => Promise<void>;
}) {
  const [generating, setGenerating] = useState<"preview" | "send" | null>(null);
  const [genResult, setGenResult] = useState<{ title: string; status: string; recipientCount?: number } | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [expandedContent, setExpandedContent] = useState<Record<number, string>>({});
  const [activeTab, setActiveTab] = useState<"editions" | "subscribers">("editions");

  async function triggerGenerate(mode: "preview" | "send") {
    setGenerating(mode); setGenResult(null); setGenError(null);
    try {
      const endpoint = mode === "preview" ? "/admin/newsletter/preview" : "/admin/newsletter/generate";
      const res = await fetch(`${API}${endpoint}`, { method: "POST", headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Generation failed");
      }
      const data = await res.json();
      setGenResult({ title: data.title, status: data.status, recipientCount: data.recipientCount });
      await loadNewsletters();
    } catch (err: any) {
      setGenError(err.message ?? "Failed to generate newsletter");
    } finally {
      setGenerating(null);
    }
  }

  async function loadContent(id: number) {
    if (expandedContent[id]) { setExpanded(prev => prev === id ? null : id); return; }
    try {
      const res = await fetch(`${API}/newsletters/${id}`, { headers: authHeaders() });
      const data = await res.json();
      setExpandedContent(prev => ({ ...prev, [id]: data.content ?? "" }));
      setExpanded(id);
    } catch { /* ignore */ }
  }

  const sentCount = newsletters.filter(n => n.status === "sent").length;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Newsletter & Insights</h1>
          <p className="text-sm text-muted-foreground mt-1">AI-generated weekly briefings — generation, history, subscribers</p>
        </div>
        <button onClick={() => { loadNewsletters(); loadSubscribers(); }} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Editions", value: newsletters.length,                              icon: <Newspaper className="w-4 h-4" />, color: "text-primary" },
          { label: "Sent",           value: sentCount,                                       icon: <Send className="w-4 h-4" />,     color: "text-green-400" },
          { label: "Subscribers",    value: subscriberStats?.optedIn ?? "—",                 icon: <Users className="w-4 h-4" />,    color: "text-cyan-400" },
          { label: "Total Users",    value: subscriberStats?.total ?? "—",                   icon: <Mail className="w-4 h-4" />,     color: "text-blue-400" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4">
            <div className={`flex items-center gap-2 ${color} mb-2`}>{icon}<span className="text-xs font-medium uppercase tracking-wider">{label}</span></div>
            <div className="text-2xl font-bold text-foreground">{typeof value === "number" ? value.toLocaleString() : value}</div>
          </div>
        ))}
      </div>

      {/* Generation controls */}
      <div className="bg-card border border-border rounded-xl mb-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-foreground">Generate Newsletter</h2>
          <span className="text-xs text-muted-foreground ml-1">Powered by Claude — uses last 7 days of data</span>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
            <strong className="text-foreground">Preview</strong> generates an edition without sending to subscribers — useful for reviewing content.{" "}
            <strong className="text-foreground">Generate & Send</strong> creates and immediately dispatches to all opted-in subscribers.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => triggerGenerate("preview")}
              disabled={!!generating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating === "preview" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              {generating === "preview" ? "Generating preview…" : "Preview Edition"}
            </button>
            <button
              onClick={() => triggerGenerate("send")}
              disabled={!!generating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating === "send" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {generating === "send" ? "Sending…" : "Generate & Send"}
            </button>
          </div>
          {genResult && (
            <div className="mt-4 p-3 rounded-xl bg-green-500/5 border border-green-500/20">
              <p className="text-sm font-medium text-green-400 mb-1">
                {genResult.status === "sent" ? `✓ Sent to ${genResult.recipientCount ?? 0} subscribers` : "✓ Preview generated"}
              </p>
              <p className="text-xs text-muted-foreground">{genResult.title}</p>
            </div>
          )}
          {genError && (
            <div className="mt-4 p-3 rounded-xl bg-red-500/5 border border-red-500/20">
              <p className="text-sm text-red-400">✗ {genError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs: Editions / Subscribers */}
      <div className="flex items-center gap-0 mb-6 border-b border-border/40">
        {(["editions", "subscribers"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all capitalize ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tab === "editions" ? `Editions (${newsletters.length})` : `Subscribers (${subscriberStats?.optedIn ?? "…"})`}
          </button>
        ))}
      </div>

      {activeTab === "editions" && (
        <div className="space-y-3">
          {newsletters.length === 0 ? (
            <div className="text-center py-16 bg-card border border-border rounded-xl">
              <Newspaper className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No newsletters yet. Use the controls above to generate the first edition.</p>
            </div>
          ) : newsletters.map(nl => (
            <div key={nl.id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground">#{nl.editionNumber}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-sm font-medium text-foreground truncate">{nl.title}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${nl.status === "sent" ? "bg-green-500/10 text-green-400" : nl.status === "failed" ? "bg-red-500/10 text-red-400" : "bg-muted text-muted-foreground"}`}>{nl.status}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                    <span>Generated {fmtDate(nl.generatedAt)}</span>
                    {nl.sentAt && <span>Sent {fmtDate(nl.sentAt)}</span>}
                    {nl.recipientCount !== null && <span>{nl.recipientCount} recipients</span>}
                    {nl.projectsAnalyzed && <span>{nl.projectsAnalyzed} projects</span>}
                    {nl.spotlightSector && <span>⚡ {nl.spotlightSector}</span>}
                    {nl.spotlightCountry && <span>🌍 {nl.spotlightCountry}</span>}
                  </div>
                </div>
                <button onClick={() => loadContent(nl.id)} className="shrink-0 text-[11px] px-3 py-1.5 rounded-lg border border-border text-foreground font-medium hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all">
                  {expanded === nl.id ? "Collapse" : "Read"}
                </button>
              </div>
              {expanded === nl.id && expandedContent[nl.id] && (
                <div className="px-5 pb-5 border-t border-border/50 pt-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/80 text-sm leading-relaxed whitespace-pre-wrap">
                    {expandedContent[nl.id].slice(0, 3000)}{expandedContent[nl.id].length > 3000 && "…"}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === "subscribers" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {!subscriberStats ? (
            <div className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></div>
          ) : subscriberStats.subscribers.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">No users registered yet.</div>
          ) : (
            <>
              <div className="px-6 py-3 border-b border-border grid grid-cols-4 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span>Email</span><span>Role</span><span>Status</span><span>Joined</span>
              </div>
              <div className="divide-y divide-border/50 max-h-[520px] overflow-y-auto">
                {subscriberStats.subscribers.map(sub => (
                  <div key={sub.id} className="px-6 py-3 grid grid-cols-4 gap-4 text-xs items-center">
                    <span className="text-foreground font-mono truncate">{sub.email}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium w-fit ${sub.role === "admin-reviewer" ? "bg-purple-500/10 text-purple-400" : sub.role === "reviewer" ? "bg-blue-500/10 text-blue-400" : "bg-muted text-muted-foreground"}`}>{sub.role}</span>
                    <span className={sub.newsletterOptIn ? "text-green-400" : "text-muted-foreground"}>{sub.newsletterOptIn ? `✓ ${sub.newsletterFrequency ?? "weekly"}` : "Unsubscribed"}</span>
                    <span className="text-muted-foreground">{fmtDate(sub.createdAt)}</span>
                  </div>
                ))}
              </div>
              <div className="px-6 py-3 border-t border-border text-xs text-muted-foreground">
                Showing {subscriberStats.subscribers.length} of {subscriberStats.total} users — {subscriberStats.optedIn} opted in, {subscriberStats.optedOut} opted out
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
function getInitialSection(): AdminSection {
  const p = new URLSearchParams(window.location.search);
  const s = p.get("section");
  if (s === "pipeline" || s === "queue" || s === "newsletter" || s === "overview") return s;
  return "overview";
}

export default function AdminDashboard() {
  const [section, setSectionRaw] = useState<AdminSection>(getInitialSection);
  const [sources, setSources] = useState<SourceGroup[]>([]);
  const [bySource, setBySource] = useState<Record<string, SourceStat>>({});
  const [pendingItems, setPendingItems] = useState<Project[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [subscriberStats, setSubscriberStats] = useState<{ total: number; optedIn: number; optedOut: number; subscribers: Subscriber[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const setSection = useCallback((s: AdminSection) => {
    setSectionRaw(s);
    const url = new URL(window.location.href);
    url.searchParams.set("section", s);
    window.history.replaceState({}, "", url.toString());
    window.dispatchEvent(new CustomEvent("adminSectionChange", { detail: s }));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const s = (e as CustomEvent<string>).detail as AdminSection;
      setSectionRaw(s);
    };
    window.addEventListener("adminSectionChange", handler);
    return () => window.removeEventListener("adminSectionChange", handler);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [sourcesRes, runsRes, statusRes] = await Promise.all([
        fetch(`${API}/scraper/sources`, { headers: authHeaders() }),
        fetch(`${API}/scraper/runs?limit=100`, { headers: authHeaders() }),
        fetch(`${API}/scraper/status`, { headers: authHeaders() }),
      ]);
      const [sourcesData, runsData, statusData] = await Promise.all([sourcesRes.json(), runsRes.json(), statusRes.json()]);
      setSources(Array.isArray(sourcesData) ? sourcesData : []);
      setBySource(runsData.bySource ?? {});
      setPendingCount(statusData.pendingCount ?? 0);
    } catch { /* ignore */ }
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      const res = await fetch(`${API}/scraper/queue?limit=100`, { headers: authHeaders() });
      const data = await res.json();
      setPendingItems(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, []);

  const loadNewsletters = useCallback(async () => {
    try {
      const res = await fetch(`${API}/newsletters?limit=20`, { headers: authHeaders() });
      const data = await res.json();
      setNewsletters(data.newsletters ?? []);
    } catch { /* ignore */ }
  }, []);

  const loadSubscribers = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/subscribers`, { headers: authHeaders() });
      if (res.ok) setSubscriberStats(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    Promise.all([loadData(), loadQueue(), loadNewsletters(), loadSubscribers()]).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="h-full overflow-y-auto bg-background">
        {section === "overview" && (
          <OverviewSection sources={sources} bySource={bySource} pendingCount={pendingCount} newsletters={newsletters} subscriberStats={subscriberStats} setSection={setSection} />
        )}
        {section === "pipeline" && (
          <PipelineSection sources={sources} bySource={bySource} loadData={loadData} loadQueue={loadQueue} />
        )}
        {section === "queue" && (
          <QueueSection pendingItems={pendingItems} pendingCount={pendingCount} setPendingItems={setPendingItems} setPendingCount={setPendingCount} loadQueue={loadQueue} />
        )}
        {section === "newsletter" && (
          <NewsletterSection newsletters={newsletters} subscriberStats={subscriberStats} loadNewsletters={loadNewsletters} loadSubscribers={loadSubscribers} />
        )}
      </div>
    </Layout>
  );
}
