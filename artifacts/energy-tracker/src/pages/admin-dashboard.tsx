import { useState, useEffect, useCallback, useRef, Component, type ReactNode, type ErrorInfo } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { getAdminToken } from "@/contexts/admin-auth";
import { registerAdminSectionSetter } from "@/contexts/admin-section";
import {
  Database, Play, RefreshCw, CheckCircle2, XCircle, Clock, Loader2,
  AlertCircle, Check, X, ChevronDown, ChevronUp, Zap, TrendingUp,
  FileSearch, Activity, BarChart2, Filter, Download, Globe,
  Newspaper, Mail, Users, Send, Eye, LayoutDashboard, ListTodo,
  ChevronRight, ExternalLink, ArrowLeft, Edit3, Bot, RotateCcw, Save, AlertTriangle, FlaskConical,
  History, Trash2,
} from "lucide-react";
import { useAdminAuth } from "@/contexts/admin-auth";

class SectionErrorBoundary extends Component<
  { label: string; children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { label: string; children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[AdminSection:${this.props.label}]`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="m-6 rounded-xl border border-red-500/30 bg-red-500/10 p-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-300 mb-1">{this.props.label} failed to render</p>
            <p className="text-xs text-red-400/80 font-mono break-all">{this.state.error?.message}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-3 px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
interface Newsletter { id: number; editionNumber: number; title: string; executiveSummary: string | null; spotlightSector: string | null; spotlightCountry: string | null; projectsAnalyzed: number | null; totalInvestmentCovered: string | null; generatedAt: string | null; sentAt: string | null; status: string; recipientCount: number | null; type?: string }
interface Subscriber { id: number; email: string; role: string; newsletterOptIn: boolean; newsletterFrequency: string | null; createdAt: string; lastNewsletterSentAt: string | null }

type AdminSection = "overview" | "pipeline" | "queue" | "newsletter" | "duplicates";
type QueueFilter = "pending" | "needs_source" | "rejected" | "all";
interface QueueStats { pending: number; needs_source: number; rejected: number }
interface AuditEntry { id: number; dealId: number; action: string; note: string | null; oldUrl: string | null; newUrl: string | null; testedStatus: number | null; responseTime: number | null; reviewerEmail: string; createdAt: string }
interface UrlTestResult { reachable: boolean; httpStatus: number | null; responseTime: number }

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

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
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
      <div className="flex items-center justify-end mb-8">
        <Link href="/admin/reviewers">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer">
            <Users className="w-3.5 h-3.5" />
            Manage Reviewers
            <ChevronRight className="w-3 h-3" />
          </div>
        </Link>
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

  async function cancelRun() {
    try {
      await fetch(`${API}/scraper/cancel`, { method: "POST", headers: authHeaders() });
    } catch { /* ignore */ }
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
          <div className="flex items-center gap-2">
            {runningSource === "__all__" && (
              <button onClick={cancelRun} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-medium">
                <span className="w-3.5 h-3.5 flex items-center justify-center">✕</span>
                Cancel
              </button>
            )}
            <button onClick={() => runSource("__all__")} disabled={!!runningSource || !!specialRunning} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed">
              {runningSource === "__all__" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {runningSource === "__all__" ? "Running All..." : "Run All Sources"}
            </button>
          </div>
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
              const isGroupComplete  = entry.stage === "group_complete" || entry.stage === "adapter_complete";
              const isGroupError     = entry.stage === "group_error"    || entry.stage === "adapter_error";
              const isComplete       = entry.stage === "complete";
              const isCancelled      = entry.stage === "cancelled";
              const isStart          = entry.stage === "start";
              const color = entry.stage === "error" || isGroupError
                ? "text-red-400"
                : isComplete || isGroupComplete
                  ? "text-green-400"
                  : isCancelled
                    ? "text-yellow-400"
                    : entry.stage === "analyzing"
                      ? "text-purple-400"
                      : entry.stage === "saving" || isStart
                        ? "text-blue-400"
                        : "text-muted-foreground";
              const label = entry.group ?? entry.adapter ?? entry.stage;
              return (
                <div key={i} className={`${color} leading-relaxed`}>
                  <span className="text-muted-foreground/50 mr-2">[{label}]</span>
                  {entry.message}
                  {isGroupComplete && entry.discovered !== undefined && ` — ${entry.discovered} new, ${entry.updated ?? 0} updated`}
                  {isGroupComplete && entry.flagged !== undefined && entry.flagged > 0 && `, ${entry.flagged} flagged`}
                  {isGroupComplete && entry.completedSteps !== undefined && ` (${entry.completedSteps}/${entry.totalSteps})`}
                  {!isGroupComplete && entry.discovered !== undefined && ` — ${entry.discovered} new`}
                  {!isGroupComplete && entry.updated   !== undefined && `, ${entry.updated} updated`}
                  {!isGroupComplete && entry.flagged   !== undefined && entry.flagged > 0 && `, ${entry.flagged} flagged`}
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

// ── Queue Item Row ──────────────────────────────────────────────────────────
function formatAuditAction(entry: AuditEntry): string {
  if (entry.action === "status_changed") {
    return `Status: ${entry.note ?? "changed"} · by ${entry.reviewerEmail}`;
  }
  if (entry.action === "edited") {
    const u = entry.newUrl ?? "?";
    return `URL edited → ${u.length > 60 ? u.slice(0, 60) + "…" : u} · by ${entry.reviewerEmail}`;
  }
  if (entry.action === "tested") {
    const ok = entry.testedStatus != null && entry.testedStatus < 400;
    return `URL tested: ${ok ? `✓ ${entry.testedStatus}` : `✗ ${entry.testedStatus ?? "error"}`}${entry.responseTime != null ? ` · ${entry.responseTime}ms` : ""} · by ${entry.reviewerEmail}`;
  }
  return `${entry.action}${entry.note ? ` — ${entry.note}` : ""} · by ${entry.reviewerEmail}`;
}

function QueueItemRow({
  project, isExpanded, onToggleExpand, urlEdit, urlTest, testing, saving,
  auditLog, loadingAudit, actionInProgress, onSetUrlEdit, onTestUrl,
  onSaveUrl, onMoveToPending, onStatusChange,
}: {
  project: Project; isExpanded: boolean; onToggleExpand: () => void;
  urlEdit: string; urlTest: UrlTestResult | null; testing: boolean; saving: boolean;
  auditLog: AuditEntry[] | undefined; loadingAudit: boolean; actionInProgress: boolean;
  onSetUrlEdit: (v: string) => void; onTestUrl: () => void; onSaveUrl: () => void;
  onMoveToPending: () => void; onStatusChange: (s: "approved" | "rejected") => void;
}) {
  const rs = project.reviewStatus;
  const canMoveToPending = rs === "rejected" || (rs === "needs_source" && urlTest?.reachable === true);

  const statusBadge = rs === "pending"
    ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-yellow-400/15 text-yellow-400 border border-yellow-400/25 font-medium">pending</span>
    : rs === "needs_source"
    ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-orange-400/15 text-orange-400 border border-orange-400/25 font-medium">needs source</span>
    : rs === "rejected"
    ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-400/15 text-red-400 border border-red-400/25 font-medium">rejected</span>
    : null;

  return (
    <div className="border-b border-border last:border-0">
      <div className="px-5 py-3.5 flex gap-3 items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap mb-1">
            <span className="font-medium text-foreground text-sm leading-tight">{project.projectName}</span>
            <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium shrink-0 ${TECH_COLORS[project.technology] ?? "text-muted-foreground bg-muted"}`}>{project.technology}</span>
            {statusBadge}
            <ConfidenceBadge score={project.confidenceScore} />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span>{project.country}</span>
            {project.dealSizeUsdMn != null && <span>${project.dealSizeUsdMn.toFixed(0)}M</span>}
            {project.capacityMw != null && <span>{project.capacityMw.toFixed(0)} MW</span>}
            {project.extractionSource && <span className="text-primary/60">via {project.extractionSource}</span>}
            <span>{ago(project.discoveredAt)}</span>
          </div>
        </div>
        <button onClick={onToggleExpand} className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-border/40 pt-4 bg-muted/10">
          {project.description && <p className="text-xs text-muted-foreground leading-relaxed">{project.description}</p>}
          {project.developer && <p className="text-xs text-muted-foreground">Developer: <span className="text-foreground/70">{project.developer}</span></p>}

          {/* URL editor */}
          <div className="space-y-2">
            <span className="text-[11px] text-muted-foreground/60 uppercase tracking-wider font-medium">Source URL</span>
            <div className="flex gap-2 items-start flex-wrap">
              <input
                type="url"
                value={urlEdit}
                onChange={e => onSetUrlEdit(e.target.value)}
                placeholder="https://…"
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors font-mono text-xs"
              />
              <button
                onClick={onTestUrl}
                disabled={!urlEdit.trim() || testing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/60 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs font-medium disabled:opacity-40 shrink-0"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
                Test
              </button>
              <button
                onClick={onSaveUrl}
                disabled={!urlEdit.trim() || saving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors text-xs font-medium disabled:opacity-40 shrink-0"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
            {urlTest && (
              <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border ${urlTest.reachable ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                {urlTest.reachable ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                {urlTest.reachable ? "Reachable" : "Not reachable"}
                {urlTest.httpStatus != null && <span className="opacity-70">· HTTP {urlTest.httpStatus}</span>}
                <span className="opacity-70">· {urlTest.responseTime}ms</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            {rs === "pending" && (
              <>
                <button
                  disabled={actionInProgress}
                  onClick={() => onStatusChange("approved")}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors text-xs font-medium disabled:opacity-40"
                >
                  {actionInProgress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Approve & Publish
                </button>
                <button
                  disabled={actionInProgress}
                  onClick={() => onStatusChange("rejected")}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-medium disabled:opacity-40"
                >
                  {actionInProgress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                  Reject
                </button>
              </>
            )}
            {(rs === "needs_source" || rs === "rejected") && (
              <button
                disabled={actionInProgress || !canMoveToPending}
                onClick={onMoveToPending}
                title={rs === "needs_source" && !urlTest?.reachable ? "Test a reachable URL first to unlock" : undefined}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20 transition-colors text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {actionInProgress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Move to pending
              </button>
            )}
          </div>

          {/* Audit trail */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 uppercase tracking-wider font-medium mb-2">
              <History className="w-3.5 h-3.5" /> History
            </div>
            {loadingAudit ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/40"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</div>
            ) : !auditLog || auditLog.length === 0 ? (
              <p className="text-xs text-muted-foreground/40">No history yet</p>
            ) : (
              <div className="space-y-1.5">
                {auditLog.slice(0, 10).map(entry => (
                  <div key={entry.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-muted-foreground/30 shrink-0 mt-0.5">·</span>
                    <span className="flex-1 leading-relaxed">{formatAuditAction(entry)}</span>
                    <span className="text-muted-foreground/40 shrink-0 font-mono">{ago(entry.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Review Queue Section ───────────────────────────────────────────────────────
function QueueSection({ onPendingCountChange }: { onPendingCountChange: (n: number) => void }) {
  function getInitialFilter(): QueueFilter {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("status");
    return (["pending", "needs_source", "rejected", "all"] as QueueFilter[]).includes(s as QueueFilter)
      ? (s as QueueFilter)
      : "pending";
  }

  const [filter, setFilterRaw] = useState<QueueFilter>(getInitialFilter);
  const [stats, setStats] = useState<QueueStats>({ pending: 0, needs_source: 0, rejected: 0 });
  const [items, setItems] = useState<Project[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [auditLogs, setAuditLogs] = useState<Record<number, AuditEntry[]>>({});
  const [loadingAudit, setLoadingAudit] = useState<Record<number, boolean>>({});
  const [urlEdits, setUrlEdits] = useState<Record<number, string>>({});
  const [urlTests, setUrlTests] = useState<Record<number, UrlTestResult | null>>({});
  const [testingUrl, setTestingUrl] = useState<Record<number, boolean>>({});
  const [savingUrl, setSavingUrl] = useState<Record<number, boolean>>({});
  const [actionsInProgress, setActionsInProgress] = useState<Record<number, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function setFilter(f: QueueFilter) {
    setFilterRaw(f);
    setPage(1);
    const url = new URL(window.location.href);
    url.searchParams.set("status", f);
    window.history.replaceState({}, "", url.toString());
  }

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(`${API}/review/stats`, { headers: authHeaders() });
      const data = await r.json() as { pending?: number; needs_source?: number; rejected?: number };
      const s: QueueStats = { pending: data.pending ?? 0, needs_source: data.needs_source ?? 0, rejected: data.rejected ?? 0 };
      setStats(s);
      onPendingCountChange(s.pending);
    } catch { /* ignore */ }
  }, [onPendingCountChange]);

  const fetchItems = useCallback(async (f: QueueFilter, p: number) => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/review/queue?status=${f}&page=${p}`, { headers: authHeaders() });
      const data = await r.json() as { projects?: Project[]; pages?: number };
      setItems(data.projects ?? []);
      setTotalPages(Math.max(1, data.pages ?? 1));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
    fetchItems("pending", 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchItems(filter, page);
  }, [filter, page, fetchItems]);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([fetchStats(), fetchItems(filter, page)]);
    setRefreshing(false);
  }

  async function fetchAudit(id: number) {
    if (auditLogs[id] !== undefined) return;
    setLoadingAudit(prev => ({ ...prev, [id]: true }));
    try {
      const r = await fetch(`${API}/review/${id}/url-history`, { headers: authHeaders() });
      const data = await r.json() as { auditLog?: AuditEntry[] };
      setAuditLogs(prev => ({ ...prev, [id]: data.auditLog ?? [] }));
    } catch { /* ignore */ }
    setLoadingAudit(prev => ({ ...prev, [id]: false }));
  }

  function invalidateAudit(id: number) {
    setAuditLogs(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  function toggleExpand(id: number) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    fetchAudit(id);
  }

  async function handleTestUrl(projectId: number) {
    const url = urlEdits[projectId] ?? (items.find(p => p.id === projectId)?.newsUrl ?? "");
    if (!url.trim()) return;
    setTestingUrl(prev => ({ ...prev, [projectId]: true }));
    try {
      const r = await fetch(`${API}/review/test-url`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ url: url.trim(), dealId: projectId }),
      });
      const result = await r.json() as { reachable?: boolean; httpStatus?: number | null; responseTime?: number };
      setUrlTests(prev => ({ ...prev, [projectId]: { reachable: !!result.reachable, httpStatus: result.httpStatus ?? null, responseTime: result.responseTime ?? 0 } }));
      invalidateAudit(projectId);
      setTimeout(() => fetchAudit(projectId), 300);
    } catch { /* ignore */ }
    setTestingUrl(prev => ({ ...prev, [projectId]: false }));
  }

  async function handleSaveUrl(projectId: number) {
    const url = urlEdits[projectId] ?? "";
    if (!url.trim()) return;
    setSavingUrl(prev => ({ ...prev, [projectId]: true }));
    try {
      await fetch(`${API}/review/${projectId}/url`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ newUrl: url.trim() }),
      });
      setItems(prev => prev.map(p => p.id === projectId ? { ...p, newsUrl: url.trim(), sourceUrl: url.trim() } : p));
      invalidateAudit(projectId);
      setTimeout(() => fetchAudit(projectId), 300);
      showToast("URL saved");
    } catch {
      showToast("Failed to save URL", false);
    }
    setSavingUrl(prev => ({ ...prev, [projectId]: false }));
  }

  async function handleStatusChange(projectId: number, status: "approved" | "rejected" | "pending") {
    setActionsInProgress(prev => ({ ...prev, [projectId]: true }));
    try {
      await fetch(`${API}/review/${projectId}/status`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      });
      setItems(prev => prev.filter(p => p.id !== projectId));
      await fetchStats();
      const label = status === "approved" ? "Approved & published" : status === "rejected" ? "Rejected" : "Moved to pending";
      showToast(label);
    } catch {
      showToast("Action failed", false);
    }
    setActionsInProgress(prev => { const n = { ...prev }; delete n[projectId]; return n; });
  }

  async function bulkApproveAll() {
    try {
      await fetch(`${API}/scraper/review-all`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ action: "approve" }),
      });
      setItems([]);
      await fetchStats();
      showToast("All pending items approved");
    } catch { showToast("Bulk action failed", false); }
  }

  const FILTER_LABELS: Record<QueueFilter, string> = { pending: "Pending", needs_source: "Needs source", rejected: "Rejected", all: "All" };
  const filterCount = (f: QueueFilter) =>
    f === "pending" ? stats.pending
    : f === "needs_source" ? stats.needs_source
    : f === "rejected" ? stats.rejected
    : stats.pending + stats.needs_source + stats.rejected;

  return (
    <div className="p-8 max-w-5xl">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border ${toast.ok ? "bg-green-500/15 border-green-500/30 text-green-400" : "bg-red-500/15 border-red-500/30 text-red-400"}`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Review Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">Approve, fix sources, or recover rejected deals</p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Filter tabs with live counts */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        {(["pending", "needs_source", "rejected", "all"] as QueueFilter[]).map(f => {
          const cnt = filterCount(f);
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors border ${active ? "bg-primary/10 text-primary border-primary/25" : "text-muted-foreground hover:text-foreground border-transparent hover:border-border hover:bg-muted/40"}`}
            >
              {FILTER_LABELS[f]}
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center ${active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                {cnt}
              </span>
            </button>
          );
        })}
      </div>

      {/* Contextual hints */}
      {filter === "needs_source" && stats.needs_source > 0 && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-orange-500/8 border border-orange-500/20 mb-4 text-xs text-orange-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>These deals passed AI confidence checks but had no valid source URL. Paste a URL, test it, save it, then "Move to pending" to queue them for approval.</span>
        </div>
      )}
      {filter === "rejected" && stats.rejected > 0 && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-muted/30 border border-border mb-4 text-xs text-muted-foreground">
          <RotateCcw className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Previously rejected deals. Expand any item and click "Move to pending" to reopen it for review.</span>
        </div>
      )}

      {/* Bulk approve (pending filter only) */}
      {filter === "pending" && items.length > 1 && (
        <div className="flex justify-end mb-3">
          <button
            onClick={bulkApproveAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors text-xs font-medium"
          >
            <Check className="w-3.5 h-3.5" /> Approve All Pending
          </button>
        </div>
      )}

      {/* Items list */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary/50" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-400/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              {filter === "pending" ? "No items pending review — queue is clear"
               : filter === "needs_source" ? "No items awaiting a source URL"
               : filter === "rejected" ? "No rejected items"
               : "Nothing in the queue"}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {items.map(project => (
                <QueueItemRow
                  key={project.id}
                  project={project}
                  isExpanded={expandedId === project.id}
                  onToggleExpand={() => toggleExpand(project.id)}
                  urlEdit={urlEdits[project.id] ?? (project.newsUrl ?? project.sourceUrl ?? "")}
                  urlTest={urlTests[project.id] ?? null}
                  testing={testingUrl[project.id] ?? false}
                  saving={savingUrl[project.id] ?? false}
                  auditLog={auditLogs[project.id]}
                  loadingAudit={loadingAudit[project.id] ?? false}
                  actionInProgress={actionsInProgress[project.id] ?? false}
                  onSetUrlEdit={v => setUrlEdits(prev => ({ ...prev, [project.id]: v }))}
                  onTestUrl={() => handleTestUrl(project.id)}
                  onSaveUrl={() => handleSaveUrl(project.id)}
                  onMoveToPending={() => handleStatusChange(project.id, "pending")}
                  onStatusChange={status => handleStatusChange(project.id, status)}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 px-5 py-3 border-t border-border">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30">← Prev</button>
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30">Next →</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Newsletter Section ─────────────────────────────────────────────────────────
type NlPubType = "insights" | "brief";
type NlView = "hub" | "workspace";
type WorkspaceTab = "preview" | "editor" | "ai-revise";

interface NewsletterFull extends Newsletter {
  content: string;
  contentHtml: string | null;
  previewHtml: string;
  sections: Array<{ heading: string; body: string; index: number }>;
}

interface RevisionEntry {
  instruction: string;
  timestamp: Date;
  previousContent: string;
  previousContentHtml: string;
  previousPreviewHtml: string;
}

function NlTypeBadge({ type }: { type?: string }) {
  if (type === "brief") {
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold shrink-0">AfriEnergy Brief</span>;
  }
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold shrink-0">Monthly Insights</span>;
}

function NlStatusBadge({ status }: { status: string }) {
  const cls = status === "sent" ? "bg-green-500/10 text-green-400 border-green-500/20"
    : status === "failed" ? "bg-red-500/10 text-red-400 border-red-500/20"
    : status === "draft" ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
    : "bg-muted text-muted-foreground border-border";
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border shrink-0 ${cls}`}>{status}</span>;
}

function NewsletterSection({ newsletters, subscriberStats, loadNewsletters, loadSubscribers }: {
  newsletters: Newsletter[];
  subscriberStats: { total: number; optedIn: number; optedOut: number; subscribers: Subscriber[] } | null;
  loadNewsletters: () => Promise<void>;
  loadSubscribers: () => Promise<void>;
}) {
  // Hub state
  const [generating, setGenerating] = useState<NlPubType | null>(null);
  const [genError, setGenError] = useState<{ message: string; pubType: NlPubType } | null>(null);
  const [hubTab, setHubTab] = useState<"editions" | "subscribers">("editions");

  // Editorial workspace state
  const [nlView, setNlView] = useState<NlView>("hub");
  const [activeDraft, setActiveDraft] = useState<NewsletterFull | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("preview");

  // Editor tab state
  const [editedTitle, setEditedTitle] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // AI Revise tab state
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [selectedSection, setSelectedSection] = useState<number | undefined>(undefined);
  const [isRevising, setIsRevising] = useState(false);
  const [revisionHistory, setRevisionHistory] = useState<RevisionEntry[]>([]);

  // Send state
  const [isSending, setIsSending] = useState(false);
  const [sendConfirm, setSendConfirm] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; success: boolean } | null>(null);

  // Test-send state
  const [showTestSend, setShowTestSend] = useState(false);
  const [testEmails, setTestEmails] = useState<string[]>([""]);
  const [isTestSending, setIsTestSending] = useState(false);
  const [testSendResult, setTestSendResult] = useState<{ sent: number; failed: string[] } | null>(null);

  async function openWorkspace(id: number) {
    const res = await fetch(`${API}/admin/newsletter/${id}/full`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to load newsletter");
    const data: NewsletterFull = await res.json();
    setActiveDraft(data);
    setEditedTitle(data.title);
    setEditedContent(data.content ?? "");
    setHasUnsavedChanges(false);
    setRevisionHistory([]);
    setRevisionInstruction("");
    setSelectedSection(undefined);
    setSendResult(null);
    setNlView("workspace");
    setWorkspaceTab("preview");
  }

  async function generateDraft(type: NlPubType) {
    setGenerating(type); setGenError(null);
    try {
      const endpoint = type === "insights" ? "/admin/newsletter/preview" : "/admin/newsletter/preview-brief";
      const startRes = await fetch(`${API}${endpoint}`, { method: "POST", headers: authHeaders() });
      if (!startRes.ok) throw new Error((await startRes.json().catch(() => ({}))).error ?? "Failed to start");
      const { jobId } = await startRes.json();
      for (let i = 0; i < 150; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const poll = await fetch(`${API}/admin/newsletter/job/${jobId}`, { headers: authHeaders() }).then(r => r.json());
        if (poll.status === "running") continue;
        if (poll.status === "error") throw new Error(poll.error ?? "Generation failed");
        await loadNewsletters();
        await openWorkspace(poll.id);
        return;
      }
      throw new Error("Timed out after 10 minutes");
    } catch (err: any) {
      setGenError({ message: err.message ?? "Failed to generate", pubType: type });
    } finally {
      setGenerating(null);
    }
  }

  async function saveContent() {
    if (!activeDraft) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${API}/admin/newsletter/${activeDraft.id}/content`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ content: editedContent, title: editedTitle }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveDraft(prev => prev ? { ...prev, content: editedContent, title: editedTitle, contentHtml: data.contentHtml, previewHtml: data.previewHtml } : prev);
        setHasUnsavedChanges(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function reviseContent(instruction: string, sectionIndex?: number) {
    if (!activeDraft || !instruction.trim()) return;
    const historyEntry: RevisionEntry = {
      instruction,
      timestamp: new Date(),
      previousContent: activeDraft.content ?? "",
      previousContentHtml: activeDraft.contentHtml ?? "",
      previousPreviewHtml: activeDraft.previewHtml,
    };
    setIsRevising(true);
    try {
      const res = await fetch(`${API}/admin/newsletter/${activeDraft.id}/revise`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ instruction, sectionIndex }),
      });
      const data = await res.json();
      if (data.success) {
        setRevisionHistory(prev => [historyEntry, ...prev]);
        setActiveDraft(prev => prev ? { ...prev, content: data.content, contentHtml: data.contentHtml, previewHtml: data.previewHtml, sections: data.sections } : prev);
        setEditedContent(data.content);
        setRevisionInstruction("");
      } else {
        alert("Revision failed: " + (data.error ?? "Unknown error"));
      }
    } catch (err: any) {
      alert("Revision failed: " + (err.message ?? "Unknown error"));
    } finally {
      setIsRevising(false);
    }
  }

  function undoRevision(index: number) {
    const entry = revisionHistory[index];
    if (!activeDraft || !entry) return;
    setActiveDraft(prev => prev ? { ...prev, content: entry.previousContent, contentHtml: entry.previousContentHtml, previewHtml: entry.previousPreviewHtml } : prev);
    setEditedContent(entry.previousContent);
    setRevisionHistory(prev => prev.slice(index + 1));
  }

  async function approveAndSend() {
    if (!activeDraft) return;
    setIsSending(true);
    try {
      const res = await fetch(`${API}/admin/newsletter/${activeDraft.id}/send`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      setSendResult({ sent: data.sent ?? 0, success: data.success });
      if (data.success) {
        await loadNewsletters();
        setTimeout(() => {
          setSendConfirm(false);
          setSendResult(null);
          setNlView("hub");
          setActiveDraft(null);
        }, 3000);
      }
    } finally {
      setIsSending(false);
    }
  }

  async function sendTest() {
    if (!activeDraft) return;
    const valid = testEmails.map(e => e.trim()).filter(Boolean);
    if (!valid.length) return;
    setIsTestSending(true);
    setTestSendResult(null);
    try {
      const res = await fetch(`${API}/admin/newsletter/${activeDraft.id}/test-send`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ emails: valid }),
      });
      const data = await res.json();
      setTestSendResult({ sent: data.sent ?? 0, failed: data.failed ?? [] });
    } catch {
      setTestSendResult({ sent: 0, failed: valid });
    } finally {
      setIsTestSending(false);
    }
  }

  const drafts = newsletters.filter(n => n.status === "draft" || n.status === "preview");
  const sentCount = newsletters.filter(n => n.status === "sent").length;
  const insightsCount = newsletters.filter(n => !n.type || n.type === "insights").length;
  const briefCount = newsletters.filter(n => n.type === "brief").length;

  const pubCards: { type: NlPubType; label: string; subtitle: string; detail: string; cadence: string; border: string; badgeCls: string }[] = [
    { type: "insights", label: "AfriEnergy Insights", subtitle: "Monthly Deep-Dive", detail: "2,500–3,500 words + charts", cadence: "1st Monday of each month", border: "border-primary/30", badgeCls: "bg-primary/10 text-primary" },
    { type: "brief", label: "AfriEnergy Brief", subtitle: "Biweekly Quick Update", detail: "600–900 words · 3–5 min read", cadence: "Every other Monday", border: "border-blue-500/30", badgeCls: "bg-blue-500/10 text-blue-400" },
  ];

  // ── WORKSPACE VIEW ──────────────────────────────────────────────────────────
  if (nlView === "workspace" && activeDraft) {
    return (
      <div className="flex flex-col h-full">
        {/* Send confirmation modal */}
        {sendConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
              {sendResult ? (
                sendResult.success ? (
                  <div className="text-center">
                    <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-4" />
                    <p className="text-lg font-bold text-foreground mb-1">Sent!</p>
                    <p className="text-sm text-muted-foreground">Newsletter sent to {sendResult.sent} subscribers.</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <XCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
                    <p className="text-lg font-bold text-foreground mb-1">Delivery failed</p>
                    <p className="text-sm text-muted-foreground">0 of {subscriberStats?.optedIn ?? "?"} emails delivered.</p>
                    <button onClick={() => { setSendConfirm(false); setSendResult(null); }} className="mt-4 px-4 py-2 rounded-lg border border-border text-sm">Close</button>
                  </div>
                )
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-5">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                    <p className="text-base font-bold text-foreground">Ready to send?</p>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1 font-medium truncate">{activeDraft.title}</p>
                  <p className="text-sm text-muted-foreground mb-6">→ {subscriberStats?.optedIn ?? "?"} opted-in subscribers</p>
                  <p className="text-xs text-muted-foreground/70 mb-6">This cannot be undone.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setSendConfirm(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
                    <button onClick={approveAndSend} disabled={isSending} className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                      {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {isSending ? "Sending…" : "Send Now"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Test-send modal */}
        {showTestSend && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
              {testSendResult ? (
                <div className="text-center">
                  {testSendResult.sent > 0 ? (
                    <>
                      <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-4" />
                      <p className="text-lg font-bold text-foreground mb-1">Test sent!</p>
                      <p className="text-sm text-muted-foreground mb-1">{testSendResult.sent} of {testEmails.filter(Boolean).length} delivered.</p>
                      {testSendResult.failed.length > 0 && (
                        <p className="text-xs text-red-400 mt-1">Failed: {testSendResult.failed.join(", ")}</p>
                      )}
                      <p className="text-xs text-muted-foreground/60 mt-2">Newsletter status was not changed.</p>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
                      <p className="text-lg font-bold text-foreground mb-1">Delivery failed</p>
                      <p className="text-sm text-muted-foreground mb-1">0 test emails delivered.</p>
                    </>
                  )}
                  <button
                    onClick={() => { setShowTestSend(false); setTestSendResult(null); setTestEmails([""]); }}
                    className="mt-5 w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm font-medium hover:bg-muted/80 transition-colors"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-5">
                    <FlaskConical className="w-5 h-5 text-amber-400 shrink-0" />
                    <p className="text-base font-bold text-foreground">Send Test Email</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-5">
                    Sends a <span className="text-amber-400 font-medium">[TEST]</span> copy to up to 3 addresses. Newsletter status will not change.
                  </p>
                  <div className="space-y-2 mb-4">
                    {testEmails.map((email, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="email"
                          value={email}
                          onChange={e => {
                            const updated = [...testEmails];
                            updated[i] = e.target.value;
                            setTestEmails(updated);
                          }}
                          placeholder={`Email address ${i + 1}`}
                          className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                        />
                        {testEmails.length > 1 && (
                          <button
                            onClick={() => setTestEmails(testEmails.filter((_, j) => j !== i))}
                            className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {testEmails.length < 3 && (
                      <button
                        onClick={() => setTestEmails([...testEmails, ""])}
                        className="text-xs text-primary hover:underline mt-1"
                      >
                        + Add another email
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setShowTestSend(false); setTestEmails([""]); setTestSendResult(null); }}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={sendTest}
                      disabled={isTestSending || !testEmails.some(e => e.trim())}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isTestSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                      {isTestSending ? "Sending…" : "Send Test"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-4 px-8 py-4 border-b border-border/50 bg-card/20 shrink-0">
          <button onClick={() => { setNlView("hub"); setActiveDraft(null); }} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="w-px h-5 bg-border/50" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground truncate">{activeDraft.title}</p>
              <NlTypeBadge type={activeDraft.type} />
              <NlStatusBadge status={activeDraft.status} />
            </div>
          </div>
          <button onClick={() => { loadNewsletters(); loadSubscribers(); }} className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center px-8 border-b border-border/40 bg-background shrink-0">
          {([
            { id: "preview", label: "Preview", icon: <Eye className="w-3.5 h-3.5" /> },
            { id: "editor", label: "Editor", icon: <Edit3 className="w-3.5 h-3.5" /> },
            { id: "ai-revise", label: "AI Revise", icon: <Bot className="w-3.5 h-3.5" /> },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setWorkspaceTab(t.id)}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-all ${workspaceTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto px-8 py-6 min-h-0">
          {/* PREVIEW TAB */}
          {workspaceTab === "preview" && (
            <div className="rounded-xl overflow-hidden border border-border/30 bg-muted/10" style={{ height: "70vh" }}>
              <iframe
                srcDoc={activeDraft.previewHtml}
                title="Newsletter Preview"
                className="w-full h-full"
                sandbox="allow-same-origin"
                style={{ border: "none" }}
              />
            </div>
          )}

          {/* EDITOR TAB */}
          {workspaceTab === "editor" && (
            <div className="space-y-4 max-w-4xl">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Title</label>
                <input
                  type="text"
                  value={editedTitle}
                  onChange={e => { setEditedTitle(e.target.value); setHasUnsavedChanges(true); }}
                  className="w-full px-4 py-2.5 rounded-xl bg-card border border-border text-foreground text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">Content (Markdown)</label>
                  {hasUnsavedChanges && (
                    <span className="flex items-center gap-1 text-[11px] text-amber-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> Unsaved changes
                    </span>
                  )}
                </div>
                <textarea
                  value={editedContent}
                  onChange={e => { setEditedContent(e.target.value); setHasUnsavedChanges(true); }}
                  className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none"
                  style={{ fontFamily: "monospace", fontSize: "13px", lineHeight: "1.65", height: "60vh" }}
                  spellCheck={false}
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={saveContent}
                  disabled={isSaving || !hasUnsavedChanges}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isSaving ? "Saving…" : saveSuccess ? "✓ Saved" : "Save Changes"}
                </button>
                <button
                  onClick={() => { if (confirm("Discard unsaved changes?")) { setEditedTitle(activeDraft.title); setEditedContent(activeDraft.content ?? ""); setHasUnsavedChanges(false); } }}
                  disabled={!hasUnsavedChanges}
                  className="px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Discard Changes
                </button>
              </div>
            </div>
          )}

          {/* AI REVISE TAB */}
          {workspaceTab === "ai-revise" && (
            <div className="space-y-6 max-w-3xl">
              {/* Section selector */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Section</label>
                <select
                  value={selectedSection ?? "all"}
                  onChange={e => setSelectedSection(e.target.value === "all" ? undefined : parseInt(e.target.value))}
                  className="px-3 py-2 rounded-xl bg-card border border-border text-foreground text-sm focus:outline-none focus:border-primary/50"
                >
                  <option value="all">All sections</option>
                  {(activeDraft.sections ?? []).map(s => (
                    <option key={s.index} value={s.index}>{s.heading}</option>
                  ))}
                </select>
              </div>

              {/* Instruction input */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Revision instruction</label>
                <textarea
                  value={revisionInstruction}
                  onChange={e => setRevisionInstruction(e.target.value)}
                  placeholder='e.g. "Make the executive summary more concise and add a stronger opening hook"'
                  className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none"
                  rows={4}
                />
              </div>

              <button
                onClick={() => reviseContent(revisionInstruction, selectedSection)}
                disabled={isRevising || !revisionInstruction.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRevising ? <><Loader2 className="w-4 h-4 animate-spin" /> AI is revising…</> : <><Bot className="w-4 h-4" /> Revise</>}
              </button>

              {/* Quick actions */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Quick actions</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Shorten", prompt: "Make this 30% shorter while keeping all key data points and dollar amounts" },
                    { label: "Strengthen data", prompt: "Add more specific numbers, project names, and dollar amounts from the data" },
                    { label: "More concise", prompt: "Tighten the prose. Remove filler words and redundant sentences. Be direct." },
                    { label: "Improve flow", prompt: "Improve transitions between paragraphs and the overall narrative flow" },
                    { label: "Simplify language", prompt: "Use simpler language. Avoid jargon. Make it readable for a non-specialist audience." },
                    { label: "Add analysis", prompt: "Add more analytical commentary. Don't just state facts — explain what they mean and why they matter." },
                    { label: "Fix formatting", prompt: "Fix any markdown formatting issues. Ensure consistent heading levels, bullet styles, and bold/italic usage." },
                  ].map(qa => (
                    <button
                      key={qa.label}
                      onClick={() => reviseContent(qa.prompt, selectedSection)}
                      disabled={isRevising}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {qa.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Revision history */}
              {revisionHistory.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Revision history</p>
                  <div className="space-y-2">
                    {revisionHistory.map((entry, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border/60">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground/80 truncate">"{entry.instruction}"</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{ago(entry.timestamp.toISOString())}</p>
                        </div>
                        <button
                          onClick={() => undoRevision(i)}
                          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                        >
                          <RotateCcw className="w-3 h-3" /> Undo
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom action bar */}
        <div className="shrink-0 border-t border-border/50 px-8 py-4 flex items-center justify-between bg-card/20">
          <button
            onClick={() => { if (confirm("This will discard all edits and generate a fresh draft. Continue?")) { setNlView("hub"); setActiveDraft(null); } }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Regenerate All
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setShowTestSend(true); setTestSendResult(null); setTestEmails([""]); }}
              disabled={isTestSending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-500/40 text-amber-400 bg-amber-500/10 text-sm font-semibold hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              <FlaskConical className="w-4 h-4" />
              Send Test
            </button>
            <button
              onClick={() => setSendConfirm(true)}
              disabled={activeDraft.status === "sent"}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-500 text-white text-sm font-semibold hover:bg-green-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-500/20"
            >
              <Send className="w-4 h-4" />
              {activeDraft.status === "sent" ? "Already Sent" : "Approve & Send"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── HUB VIEW ───────────────────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Newsletter & Insights</h1>
          <p className="text-sm text-muted-foreground mt-1">AI-powered publications — monthly reports & biweekly briefs</p>
        </div>
        <button onClick={() => { loadNewsletters(); loadSubscribers(); }} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Editions", value: newsletters.length, icon: <Newspaper className="w-4 h-4" />, color: "text-primary" },
          { label: "Sent", value: sentCount, icon: <Send className="w-4 h-4" />, color: "text-green-400" },
          { label: "Subscribers", value: subscriberStats?.optedIn ?? "—", icon: <Users className="w-4 h-4" />, color: "text-cyan-400" },
          { label: "Total Users", value: subscriberStats?.total ?? "—", icon: <Mail className="w-4 h-4" />, color: "text-blue-400" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4">
            <div className={`flex items-center gap-2 ${color} mb-2`}>{icon}<span className="text-xs font-medium uppercase tracking-wider">{label}</span></div>
            <div className="text-2xl font-bold text-foreground">{typeof value === "number" ? value.toLocaleString() : value}</div>
            {label === "Total Editions" && (insightsCount > 0 || briefCount > 0) && (
              <div className="text-[10px] text-muted-foreground mt-1">{insightsCount} monthly · {briefCount} briefs</div>
            )}
          </div>
        ))}
      </div>

      {/* Generation cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {pubCards.map(card => {
          const isRunning = generating === card.type;
          const isAnyRunning = !!generating;
          const cardError = genError?.pubType === card.type ? genError : null;
          return (
            <div key={card.type} className={`bg-card border ${card.border} rounded-xl overflow-hidden`}>
              <div className="px-5 py-4 border-b border-border/60">
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold mb-2.5 ${card.badgeCls}`}>
                  <Zap className="w-3 h-3" /> {card.subtitle}
                </div>
                <h2 className="font-bold text-foreground text-sm">{card.label}</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">{card.detail}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">{card.cadence}</p>
              </div>
              <div className="px-5 py-4 space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">Generate a draft to review and revise before sending to subscribers.</p>
                <button
                  onClick={() => generateDraft(card.type)}
                  disabled={isAnyRunning}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Edit3 className="w-3.5 h-3.5" />}
                  {isRunning ? "Generating draft…" : "Generate Draft"}
                </button>
                {isRunning && <p className="text-[11px] text-muted-foreground animate-pulse">AI is generating content — this takes 2–3 minutes…</p>}
                {cardError && (
                  <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                    <p className="text-xs font-semibold text-red-400 mb-0.5">✗ Generation failed</p>
                    <p className="text-[11px] text-red-400/80 break-words">{cardError.message.slice(0, 250)}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Drafts in Progress */}
      {drafts.length > 0 && (
        <div className="mb-8">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Drafts in Progress</p>
          <div className="space-y-2">
            {drafts.map(nl => (
              <div key={nl.id} className="flex items-center gap-4 px-5 py-3.5 bg-card border border-amber-500/20 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 text-xs font-bold text-amber-400">#{nl.editionNumber}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground truncate">{nl.title}</p>
                    <NlTypeBadge type={nl.type} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Generated {ago(nl.generatedAt)}</p>
                </div>
                <button
                  onClick={() => openWorkspace(nl.id).catch(err => alert(err.message))}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/5 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Continue Editing
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs: Editions / Subscribers */}
      <div className="flex items-center gap-0 mb-6 border-b border-border/40">
        {(["editions", "subscribers"] as const).map(tab => (
          <button key={tab} onClick={() => setHubTab(tab)} className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all capitalize ${hubTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tab === "editions" ? `Editions (${newsletters.length})` : `Subscribers (${subscriberStats?.optedIn ?? "…"})`}
          </button>
        ))}
      </div>

      {hubTab === "editions" && (
        <div className="space-y-3">
          {newsletters.length === 0 ? (
            <div className="text-center py-16 bg-card border border-border rounded-xl">
              <Newspaper className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No publications yet. Use the cards above to generate the first edition.</p>
            </div>
          ) : newsletters.map(nl => (
            <div key={nl.id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground">#{nl.editionNumber}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-sm font-medium text-foreground truncate">{nl.title}</p>
                    <NlTypeBadge type={nl.type} />
                    <NlStatusBadge status={nl.status} />
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
                {(nl.status === "draft" || nl.status === "preview") ? (
                  <button onClick={() => openWorkspace(nl.id).catch(err => alert(err.message))} className="shrink-0 flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-primary/30 text-primary font-medium hover:bg-primary/5 transition-all">
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                ) : (
                  <button onClick={() => openWorkspace(nl.id).catch(err => alert(err.message))} className="shrink-0 text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground font-medium hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all">
                    <Eye className="w-3 h-3 inline mr-1" /> View
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {hubTab === "subscribers" && (
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
                    <span className={sub.newsletterOptIn ? "text-green-400" : "text-muted-foreground"}>{sub.newsletterOptIn ? "✓ Subscribed" : "Unsubscribed"}</span>
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

// ── Duplicate Scanner Section ───────────────────────────────────────────────
interface DupPair {
  id_a: number; name_a: string; country_a: string; developer_a: string | null;
  capacity_a: number | null; deal_size_a: number | null; status_a: string;
  id_b: number; name_b: string; country_b: string; developer_b: string | null;
  capacity_b: number | null; deal_size_b: number | null; status_b: string;
  score: number;
}

type ConfirmAction =
  | { type: "merge"; keepId: number; removeId: number; keepName: string; removeName: string }
  | { type: "delete"; id: number; name: string; status: string }
  | { type: "deleteBoth"; idA: number; nameA: string; statusA: string; idB: number; nameB: string; statusB: string };

function statusBadge(status: string) {
  if (status === "approved") return <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">approved</span>;
  if (status === "rejected") return <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/25 font-semibold">rejected</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">{status}</span>;
}

function DuplicateScannerSection() {
  const [pairs, setPairs] = useState<DupPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [threshold, setThreshold] = useState(60);
  const [acting, setActing] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const scan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/admin/duplicates?threshold=${threshold / 100}`, { headers: authHeaders() });
      const data = await res.json();
      if (res.status === 401) throw new Error("Your session has expired. Please sign out and sign back in.");
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setPairs(data.pairs ?? []);
      setDismissed(new Set());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const merge = async (keepId: number, removeId: number) => {
    const key = `${keepId}-${removeId}`;
    setActing(key);
    setError(null);
    try {
      const res = await fetch(`${API}/admin/projects/merge`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ keepId, removeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Merge failed");
      // Dismiss any pair containing either project
      setPairs(prev => prev.filter(p => p.id_a !== keepId && p.id_a !== removeId && p.id_b !== keepId && p.id_b !== removeId));
      setConfirm(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActing(null);
    }
  };

  const deleteProject = async (id: number, reason?: string) => {
    setActing(`delete-${id}`);
    setError(null);
    try {
      const res = await fetch(`${API}/admin/projects/delete`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ id, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      // Remove all pairs that include this project
      setPairs(prev => prev.filter(p => p.id_a !== id && p.id_b !== id));
      setConfirm(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActing(null);
    }
  };

  const deleteBoth = async (idA: number, idB: number) => {
    setActing(`deleteBoth-${idA}-${idB}`);
    setError(null);
    try {
      const [resA, resB] = await Promise.all([
        fetch(`${API}/admin/projects/delete`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ id: idA, reason: "admin deleted both — neither fit for tracker" }),
        }),
        fetch(`${API}/admin/projects/delete`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ id: idB, reason: "admin deleted both — neither fit for tracker" }),
        }),
      ]);
      const [dataA, dataB] = await Promise.all([resA.json(), resB.json()]);
      if (!resA.ok) throw new Error(dataA.error ?? `Failed to delete #${idA}`);
      if (!resB.ok) throw new Error(dataB.error ?? `Failed to delete #${idB}`);
      setPairs(prev => prev.filter(p => p.id_a !== idA && p.id_b !== idA && p.id_a !== idB && p.id_b !== idB));
      setConfirm(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActing(null);
    }
  };

  const visiblePairs = pairs.filter(p => !dismissed.has(`${p.id_a}-${p.id_b}`) && !dismissed.has(`${p.id_b}-${p.id_a}`));

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Duplicate Scanner</h1>
        <p className="text-sm text-muted-foreground mt-1">Find and merge likely duplicate projects, or delete rejected/invalid entries entirely.</p>
      </div>

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">Similarity threshold</label>
          <input
            type="number" min={30} max={95} step={5}
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="w-20 px-2 py-1.5 rounded-lg bg-card border border-border text-sm text-foreground"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
        <button
          onClick={scan}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSearch className="w-4 h-4" />}
          {loading ? "Scanning…" : "Scan for Duplicates"}
        </button>
        {pairs.length > 0 && !loading && (
          <span className="text-sm text-muted-foreground">{visiblePairs.length} pair{visiblePairs.length !== 1 ? "s" : ""} found</span>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Confirmation modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            {confirm.type === "merge" ? (
              <>
                <h2 className="text-base font-semibold text-foreground mb-2">Confirm Merge</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Merge <span className="font-medium text-foreground">"{confirm.removeName}"</span> (#{confirm.removeId}) into <span className="font-medium text-foreground">"{confirm.keepName}"</span> (#{confirm.keepId}), then permanently delete the duplicate. Cannot be undone.
                </p>
                <p className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2 mb-4">
                  Missing fields on the kept record will be filled from the removed one.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => merge(confirm.keepId, confirm.removeId)}
                    disabled={!!acting}
                    className="flex-1 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Merge & Delete
                  </button>
                  <button onClick={() => setConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
                    Cancel
                  </button>
                </div>
              </>
            ) : confirm.type === "delete" ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <Trash2 className="w-4 h-4 text-red-400" />
                  <h2 className="text-base font-semibold text-foreground">Permanently Delete Project</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-1">
                  Delete <span className="font-medium text-foreground">"{confirm.name}"</span> (#{confirm.id})?
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  Status: <span className="font-medium">{confirm.status}</span> · This removes the project from the database entirely and cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => deleteProject(confirm.id, `admin deleted ${confirm.status} project`)}
                    disabled={!!acting}
                    className="flex-1 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Delete Permanently
                  </button>
                  <button onClick={() => setConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <Trash2 className="w-4 h-4 text-red-400" />
                  <h2 className="text-base font-semibold text-foreground">Delete Both Projects</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Neither project is fit for the tracker. Both will be permanently removed from the database — this cannot be undone.
                </p>
                <div className="space-y-2 mb-4">
                  {[
                    { id: confirm.idA, name: confirm.nameA, status: confirm.statusA },
                    { id: confirm.idB, name: confirm.nameB, status: confirm.statusB },
                  ].map(proj => (
                    <div key={proj.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/15">
                      <Trash2 className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span className="text-sm text-foreground font-medium truncate">{proj.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">#{proj.id}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${proj.status === "rejected" ? "bg-red-500/15 text-red-400" : "bg-muted/40 text-muted-foreground"}`}>{proj.status}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => deleteBoth(confirm.idA, confirm.idB)}
                    disabled={!!acting}
                    className="flex-1 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Delete Both Permanently
                  </button>
                  <button onClick={() => setConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {visiblePairs.length > 0 && (
        <div className="space-y-3">
          {visiblePairs.map(p => {
            const key = `${p.id_a}-${p.id_b}`;
            const hasRejected = p.status_a === "rejected" || p.status_b === "rejected";
            const hasNonApproved = p.status_a !== "approved" || p.status_b !== "approved";
            const projects = [
              { id: p.id_a, name: p.name_a, dev: p.developer_a, cap: p.capacity_a, size: p.deal_size_a, status: p.status_a },
              { id: p.id_b, name: p.name_b, dev: p.developer_b, cap: p.capacity_b, size: p.deal_size_b, status: p.status_b },
            ];
            return (
              <div key={key} className={`bg-card border rounded-xl overflow-hidden ${hasRejected ? "border-red-500/30" : "border-border"}`}>
                <div className={`px-4 py-2 border-b flex items-center justify-between ${hasRejected ? "bg-red-500/5 border-red-500/20" : "bg-muted/20 border-border"}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-amber-400">{p.score}% similar · {p.country_a}</span>
                    {hasRejected && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> contains rejected
                      </span>
                    )}
                    {!hasRejected && hasNonApproved && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">pending review</span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 divide-x divide-border">
                  {projects.map((proj, i) => (
                    <div key={i} className={`p-4 ${proj.status === "rejected" ? "bg-red-500/3" : ""}`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-medium text-foreground leading-snug">{proj.name}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setConfirm({ type: "delete", id: proj.id, name: proj.name, status: proj.status })}
                            disabled={!!acting}
                            title="Delete this project"
                            className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <a href={`/review/queue/${proj.id}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded text-muted-foreground hover:text-primary">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">ID #{proj.id}</p>
                      {proj.dev && <p className="text-xs text-muted-foreground truncate">{proj.dev}</p>}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {proj.cap != null && <span className="text-xs px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">{proj.cap} MW</span>}
                        {proj.size != null && <span className="text-xs px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">${proj.size}M</span>}
                        {statusBadge(proj.status)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 border-t border-border flex gap-2 flex-wrap">
                  <button
                    onClick={() => setConfirm({ type: "merge", keepId: p.id_a, removeId: p.id_b, keepName: p.name_a, removeName: p.name_b })}
                    disabled={!!acting}
                    className="flex-1 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50 min-w-[120px]"
                  >
                    Keep #{p.id_a}, remove #{p.id_b}
                  </button>
                  <button
                    onClick={() => setConfirm({ type: "merge", keepId: p.id_b, removeId: p.id_a, keepName: p.name_b, removeName: p.name_a })}
                    disabled={!!acting}
                    className="flex-1 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50 min-w-[120px]"
                  >
                    Keep #{p.id_b}, remove #{p.id_a}
                  </button>
                  <button
                    onClick={() => setConfirm({ type: "deleteBoth", idA: p.id_a, nameA: p.name_a, statusA: p.status_a, idB: p.id_b, nameB: p.name_b, statusB: p.status_b })}
                    disabled={!!acting}
                    className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/15 transition-colors disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                    title="Delete both — neither belongs in the tracker"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Both
                  </button>
                  <button
                    onClick={() => setDismissed(s => new Set([...s, key]))}
                    className="px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                    title="Dismiss this pair"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && pairs.length > 0 && visiblePairs.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">All pairs handled.</div>
      )}

      {!loading && pairs.length === 0 && (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl text-muted-foreground text-sm">
          Click "Scan for Duplicates" to search for similar project names within the same country.
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
function getInitialSection(): AdminSection {
  // Honour deep-link from data-health page via sessionStorage
  const stored = sessionStorage.getItem("adminOpenSection");
  if (stored) {
    sessionStorage.removeItem("adminOpenSection");
    if (stored === "pipeline" || stored === "queue" || stored === "newsletter" || stored === "overview" || stored === "duplicates") return stored;
  }
  const p = new URLSearchParams(window.location.search);
  const s = p.get("section");
  if (s === "pipeline" || s === "queue" || s === "newsletter" || s === "overview" || s === "duplicates") return s;
  return "overview";
}

export default function AdminDashboard() {
  const [section, setSectionRaw] = useState<AdminSection>(getInitialSection);
  const [sources, setSources] = useState<SourceGroup[]>([]);
  const [bySource, setBySource] = useState<Record<string, SourceStat>>({});
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
    return registerAdminSectionSetter(setSectionRaw);
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
      const res = await fetch(`${API}/review/stats`, { headers: authHeaders() });
      const data = await res.json() as { pending?: number };
      setPendingCount(data.pending ?? 0);
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
          <SectionErrorBoundary label="Overview">
            <OverviewSection sources={sources} bySource={bySource} pendingCount={pendingCount} newsletters={newsletters} subscriberStats={subscriberStats} setSection={setSection} />
          </SectionErrorBoundary>
        )}
        {section === "pipeline" && (
          <SectionErrorBoundary label="Data Pipeline">
            <PipelineSection sources={sources} bySource={bySource} loadData={loadData} loadQueue={loadQueue} />
          </SectionErrorBoundary>
        )}
        {section === "queue" && (
          <SectionErrorBoundary label="Review Queue">
            <QueueSection onPendingCountChange={setPendingCount} />
          </SectionErrorBoundary>
        )}
        {section === "newsletter" && (
          <SectionErrorBoundary label="Newsletter">
            <NewsletterSection newsletters={newsletters} subscriberStats={subscriberStats} loadNewsletters={loadNewsletters} loadSubscribers={loadSubscribers} />
          </SectionErrorBoundary>
        )}
        {section === "duplicates" && (
          <SectionErrorBoundary label="Duplicate Scanner">
            <DuplicateScannerSection />
          </SectionErrorBoundary>
        )}
      </div>
    </Layout>
  );
}
