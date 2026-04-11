import { useState, useEffect, useCallback, useRef } from "react";
import { Layout } from "@/components/layout";
import { getAdminToken } from "@/contexts/admin-auth";
import {
  Database, Play, RefreshCw, CheckCircle2, XCircle, Clock, Loader2,
  AlertCircle, Check, X, ChevronDown, ChevronUp, Zap, TrendingUp,
  FileSearch, Activity, BarChart2, Filter, Download, Globe, Rss,
  PlusCircle, Trash2, ToggleLeft, ToggleRight,
} from "lucide-react";

interface ScraperSource {
  id: string;
  adapterType: string;
  key: string;
  label: string;
  feedUrl: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}

const API = "/api";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAdminToken();
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json", ...extra };
}

function ago(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

interface SourceGroup {
  name: string;
  description: string;
  feedCount: number;
  isRunning: boolean;
}

interface SourceStat {
  lastRun: {
    id: number;
    sourceName: string;
    adapterKey: string | null;
    startedAt: string;
    completedAt: string | null;
    recordsFound: number;
    recordsInserted: number;
    recordsUpdated: number;
    flaggedForReview: number;
    errors: string | null;
    triggeredBy: string;
  } | null;
  totalInserted: number;
  totalUpdated: number;
  totalFound: number;
  totalFlagged: number;
  runCount: number;
}

interface Project {
  id: number;
  projectName: string;
  country: string;
  technology: string;
  dealSizeUsdMn: number | null;
  capacityMw: number | null;
  status: string;
  description: string | null;
  sourceUrl: string | null;
  newsUrl: string | null;
  newsUrl2: string | null;
  reviewStatus: string;
  discoveredAt: string | null;
  confidenceScore: number | null;
  extractionSource: string | null;
  developer: string | null;
  financiers: string | null;
}

interface RunProgress {
  stage: string;
  message: string;
  processed?: number;
  discovered?: number;
  updated?: number;
  flagged?: number;
}

type ReviewAction = "approve" | "reject";

const TECH_COLORS: Record<string, string> = {
  Solar:               "text-amber-400 bg-amber-400/10",
  Wind:                "text-blue-400 bg-blue-400/10",
  Hydro:               "text-cyan-400 bg-cyan-400/10",
  Geothermal:          "text-red-400 bg-red-400/10",
  "Oil & Gas":         "text-orange-400 bg-orange-400/10",
  "Grid Expansion":    "text-purple-400 bg-purple-400/10",
  "Battery & Storage": "text-pink-400 bg-pink-400/10",
  Hydrogen:            "text-sky-400 bg-sky-400/10",
  Nuclear:             "text-violet-400 bg-violet-400/10",
  Bioenergy:           "text-green-400 bg-green-400/10",
  "Clean Cooking":     "text-amber-300 bg-amber-300/10",
  Coal:                "text-stone-400 bg-stone-400/10",
};

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? "text-green-400" : score >= 0.6 ? "text-yellow-400" : "text-red-400";
  return (
    <span className={`text-xs font-mono ${color}`}>{pct}%</span>
  );
}

export default function AdminScraperPage() {
  const [sources, setSources] = useState<SourceGroup[]>([]);
  const [bySource, setBySource] = useState<Record<string, SourceStat>>({});
  const [pendingItems, setPendingItems] = useState<Project[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [runningSource, setRunningSource] = useState<string | null>(null);
  const [runLog, setRunLog] = useState<RunProgress[]>([]);
  const [runLogSource, setRunLogSource] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [reviewActions, setReviewActions] = useState<Record<number, "approve" | "reject" | "loading">>({});
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [specialRunning, setSpecialRunning] = useState<string | null>(null);
  const [specialLog, setSpecialLog] = useState<{ msg: string; ok: boolean }[]>([]);
  const [specialResult, setSpecialResult] = useState<{ total: number; inserted: number; updated: number; skipped: number; errors: number } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const specialLogEndRef = useRef<HTMLDivElement>(null);

  const [scraperSources, setScraperSources] = useState<ScraperSource[]>([]);
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [newFeedLabel, setNewFeedLabel] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [newFeedType, setNewFeedType] = useState("google_alerts");
  const [addingFeed, setAddingFeed] = useState(false);
  const [feedRunning, setFeedRunning] = useState<string | null>(null);
  const [feedRunLog, setFeedRunLog] = useState<string[]>([]);

  async function loadData() {
    try {
      const [sourcesRes, runsRes, statusRes, feedsRes] = await Promise.all([
        fetch(`${API}/scraper/sources`, { headers: authHeaders() }),
        fetch(`${API}/scraper/runs?limit=100`, { headers: authHeaders() }),
        fetch(`${API}/scraper/status`, { headers: authHeaders() }),
        fetch(`${API}/scraper/source-feeds`, { headers: authHeaders() }),
      ]);
      const [sourcesData, runsData, statusData, feedsData] = await Promise.all([
        sourcesRes.json(),
        runsRes.json(),
        statusRes.json(),
        feedsRes.json(),
      ]);
      setSources(Array.isArray(sourcesData) ? sourcesData : []);
      setBySource(runsData.bySource ?? {});
      setPendingCount(statusData.pendingCount ?? 0);
      setScraperSources(Array.isArray(feedsData) ? feedsData : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function addFeed() {
    if (!newFeedLabel || !newFeedUrl) return;
    setAddingFeed(true);
    try {
      const res = await fetch(`${API}/scraper/source-feeds`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ adapterType: newFeedType, label: newFeedLabel, feedUrl: newFeedUrl }),
      });
      if (res.ok) {
        const row = await res.json();
        setScraperSources((prev) => [...prev, row]);
        setNewFeedLabel("");
        setNewFeedUrl("");
        setShowAddFeed(false);
      }
    } catch { /* ignore */ } finally {
      setAddingFeed(false);
    }
  }

  async function deleteFeed(id: string) {
    if (!confirm("Delete this source feed?")) return;
    try {
      await fetch(`${API}/scraper/source-feeds/${id}`, { method: "DELETE", headers: authHeaders() });
      setScraperSources((prev) => prev.filter((s) => s.id !== id));
    } catch { /* ignore */ }
  }

  async function toggleFeed(id: string, current: boolean) {
    try {
      const res = await fetch(`${API}/scraper/source-feeds/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ isActive: !current }),
      });
      if (res.ok) {
        const updated = await res.json();
        setScraperSources((prev) => prev.map((s) => s.id === id ? updated : s));
      }
    } catch { /* ignore */ }
  }

  async function runFeed(id: string, label: string) {
    if (feedRunning) return;
    setFeedRunning(id);
    setFeedRunLog([`Running ${label}...`]);
    try {
      const res = await fetch(`${API}/scraper/source-feeds/${id}/run`, {
        method: "POST",
        headers: authHeaders(),
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.stage === "complete" && parsed.report) {
                setFeedRunLog((prev) => [...prev, `✓ Done — inserted:${parsed.report.rowsInserted} updated:${parsed.report.rowsUpdated} flagged:${parsed.report.rowsFlagged}`]);
              } else if (parsed.message) {
                setFeedRunLog((prev) => [...prev, parsed.message]);
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err) {
      setFeedRunLog((prev) => [...prev, `✗ ${String(err)}`]);
    } finally {
      setFeedRunning(null);
    }
  }

  async function loadQueue() {
    try {
      const res = await fetch(`${API}/scraper/queue?limit=50`, { headers: authHeaders() });
      const data = await res.json();
      setPendingItems(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadData();
    loadQueue();
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [runLog]);

  useEffect(() => {
    if (specialLogEndRef.current) {
      specialLogEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [specialLog]);

  async function runSpecial(endpoint: string, label: string) {
    if (specialRunning || runningSource) return;
    setSpecialRunning(label);
    setSpecialLog([{ msg: `Starting ${label}...`, ok: true }]);
    setSpecialResult(null);

    try {
      const res = await fetch(`${API}/scraper/${endpoint}`, {
        method: "POST",
        headers: authHeaders(),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.stage === "progress") {
                const msg = parsed.message as string;
                const ok = !msg.startsWith("ERROR");
                setSpecialLog((prev) => [...prev, { msg, ok }]);
              } else if (parsed.stage === "complete" && parsed.result) {
                setSpecialResult(parsed.result);
                setSpecialLog((prev) => [...prev, {
                  msg: `✓ Done — ${parsed.result.inserted} inserted, ${parsed.result.updated} updated, ${parsed.result.skipped} skipped, ${parsed.result.errors} errors`,
                  ok: true,
                }]);
              } else if (parsed.stage === "error") {
                setSpecialLog((prev) => [...prev, { msg: `✗ ${parsed.message}`, ok: false }]);
              }
            } catch {
              // ignore
            }
          }
        }
      }
    } catch (err) {
      setSpecialLog((prev) => [...prev, { msg: `✗ ${String(err)}`, ok: false }]);
    } finally {
      setSpecialRunning(null);
      await loadData();
      await loadQueue();
    }
  }

  async function runSource(sourceName: string) {
    if (runningSource) return;
    setRunningSource(sourceName);
    setRunLogSource(sourceName === "__all__" ? "All Sources" : sourceName);
    setRunLog([{ stage: "fetching", message: sourceName === "__all__" ? "Starting all source groups..." : `Starting "${sourceName}"...` }]);

    try {
      const url = sourceName === "__all__"
        ? `${API}/scraper/run`
        : `${API}/scraper/run/${encodeURIComponent(sourceName)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              setRunLog((prev) => [...prev, parsed]);
            } catch {
              // ignore
            }
          }
        }
      }
    } catch (err) {
      setRunLog((prev) => [...prev, { stage: "error", message: String(err) }]);
    } finally {
      setRunningSource(null);
      await loadData();
      await loadQueue();
    }
  }

  async function reviewItem(id: number, action: ReviewAction, project?: Project) {
    if (action === "approve" && project && !project.newsUrl2) {
      const proceed = window.confirm(
        `"${project.projectName}" only has ${[project.sourceUrl, project.newsUrl].filter(Boolean).length}/3 sources (no secondary news source). It is recommended to add a second news source before approving for stronger data integrity.\n\nApprove anyway?`
      );
      if (!proceed) return;
    }
    setReviewActions((prev) => ({ ...prev, [id]: "loading" }));
    try {
      await fetch(`${API}/scraper/review/${id}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ action }),
      });
      setReviewActions((prev) => ({ ...prev, [id]: action }));
      setPendingItems((prev) => prev.filter((p) => p.id !== id));
      setPendingCount((c) => Math.max(0, c - 1));
    } catch {
      setReviewActions((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  async function reviewAll(action: ReviewAction) {
    try {
      await fetch(`${API}/scraper/review-all`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ action }),
      });
      setPendingItems([]);
      setPendingCount(0);
    } catch {
      // ignore
    }
  }

  const filteredPending = sourceFilter === "all"
    ? pendingItems
    : pendingItems.filter((p) => p.extractionSource === sourceFilter);

  const uniqueSources = [...new Set(pendingItems.map((p) => p.extractionSource).filter(Boolean))];

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
        <div className="max-w-6xl mx-auto px-6 py-8">

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Data Pipeline</h1>
                <p className="text-sm text-muted-foreground">AI scraper management & review queue</p>
              </div>
            </div>
            <button
              onClick={() => { loadData(); loadQueue(); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-card transition-colors text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Source Groups", value: sources.length, icon: <Database className="w-4 h-4" />, color: "text-blue-400" },
              { label: "Pending Review", value: pendingCount, icon: <Clock className="w-4 h-4" />, color: "text-yellow-400" },
              { label: "Total Inserted", value: Object.values(bySource).reduce((s, v) => s + v.totalInserted, 0), icon: <TrendingUp className="w-4 h-4" />, color: "text-green-400" },
              { label: "Total Updated", value: Object.values(bySource).reduce((s, v) => s + v.totalUpdated, 0), icon: <Activity className="w-4 h-4" />, color: "text-purple-400" },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="bg-card border border-border rounded-xl p-4">
                <div className={`flex items-center gap-2 ${color} mb-2`}>
                  {icon}
                  <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
                </div>
                <div className="text-2xl font-bold text-foreground">{value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          {/* Curated Data Sources */}
          <div className="bg-card border border-border rounded-xl mb-8 overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center gap-2">
              <Download className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">Curated Data Sources</h2>
              <span className="text-xs text-muted-foreground ml-1">Structured imports that run immediately and bypass AI extraction</span>
            </div>

            <div className="divide-y divide-border">
              {[
                {
                  endpoint: "seed",
                  label: "Import Seed Data",
                  description: "66 verified projects — Angola, Algeria, Namibia, Tunisia, Libya, Gabon, Equatorial Guinea, Ghana, Mauritania, Botswana, Burkina Faso + 12 more countries. Auto-approved, confidence 95%.",
                  icon: <Download className="w-4 h-4" />,
                  color: "text-green-400 border-green-500/20 bg-green-500/10 hover:bg-green-500/20",
                },
                {
                  endpoint: "world-bank",
                  label: "World Bank API",
                  description: "Fetches live African energy projects from the World Bank Projects API (search.worldbank.org). Results go into the review queue.",
                  icon: <Globe className="w-4 h-4" />,
                  color: "text-blue-400 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20",
                },
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
                    <button
                      onClick={() => runSpecial(endpoint, label)}
                      disabled={!!specialRunning || !!runningSource}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${color}`}
                    >
                      {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
                      {isRunning ? "Running..." : "Run"}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Special run log */}
            {specialLog.length > 0 && (
              <div className="border-t border-border p-4 max-h-48 overflow-y-auto font-mono text-xs space-y-0.5">
                {specialLog.map((entry, i) => (
                  <div key={i} className={entry.ok ? "text-muted-foreground" : "text-red-400"}>
                    {entry.msg}
                  </div>
                ))}
                <div ref={specialLogEndRef} />
              </div>
            )}

            {/* Summary result */}
            {specialResult && !specialRunning && (
              <div className="border-t border-border px-6 py-3 bg-green-500/5 flex items-center gap-6 text-xs">
                <span className="text-green-400 font-semibold">Import complete</span>
                <span className="text-muted-foreground">Total: <span className="text-foreground">{specialResult.total}</span></span>
                <span className="text-muted-foreground">Inserted: <span className="text-green-400 font-medium">{specialResult.inserted}</span></span>
                <span className="text-muted-foreground">Updated: <span className="text-blue-400 font-medium">{specialResult.updated}</span></span>
                <span className="text-muted-foreground">Skipped: <span className="text-foreground">{specialResult.skipped}</span></span>
                {specialResult.errors > 0 && (
                  <span className="text-muted-foreground">Errors: <span className="text-red-400 font-medium">{specialResult.errors}</span></span>
                )}
              </div>
            )}
          </div>

          {/* Source Feeds Card */}
          <div className="bg-card border border-border rounded-xl mb-8 overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Rss className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-foreground">Source feeds</h2>
                <span className="text-xs text-muted-foreground ml-1">Configurable feeds — Google Alerts, custom RSS</span>
              </div>
              <button
                onClick={() => setShowAddFeed(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors text-xs font-medium"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Add feed
              </button>
            </div>

            {showAddFeed && (
              <div className="px-6 py-4 border-b border-border bg-muted/30">
                <p className="text-xs font-medium text-foreground mb-3">Add new source feed</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Type</label>
                    <select
                      value={newFeedType}
                      onChange={(e) => setNewFeedType(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs"
                    >
                      <option value="google_alerts">Google Alerts</option>
                      <option value="rss">Generic RSS</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Label</label>
                    <input
                      type="text"
                      value={newFeedLabel}
                      onChange={(e) => setNewFeedLabel(e.target.value)}
                      placeholder="e.g. Africa solar deals"
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs placeholder:text-muted-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Feed URL</label>
                    <input
                      type="text"
                      value={newFeedUrl}
                      onChange={(e) => setNewFeedUrl(e.target.value)}
                      placeholder="https://news.google.com/rss/search?q=..."
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addFeed}
                    disabled={addingFeed || !newFeedLabel || !newFeedUrl}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40"
                  >
                    {addingFeed ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save
                  </button>
                  <button
                    onClick={() => { setShowAddFeed(false); setNewFeedLabel(""); setNewFeedUrl(""); }}
                    className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-xs hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {scraperSources.length === 0 ? (
              <div className="px-6 py-8 text-center text-xs text-muted-foreground">No source feeds configured yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {scraperSources.map((src) => (
                  <div key={src.id} className="px-6 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-foreground">{src.label}</span>
                        <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">{src.adapterType}</span>
                        {!src.isActive && <span className="text-xs text-red-400/70">inactive</span>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate max-w-lg">{src.feedUrl}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleFeed(src.id, src.isActive)}
                        className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
                        title={src.isActive ? "Disable" : "Enable"}
                      >
                        {src.isActive ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => runFeed(src.id, src.label)}
                        disabled={feedRunning === src.id || !!feedRunning}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                        title="Run now"
                      >
                        {feedRunning === src.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        Run now
                      </button>
                      <button
                        onClick={() => deleteFeed(src.id)}
                        className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {feedRunLog.length > 0 && (
              <div className="border-t border-border p-4 max-h-32 overflow-y-auto font-mono text-xs space-y-0.5">
                {feedRunLog.map((line, i) => (
                  <div key={i} className={line.startsWith("✗") ? "text-red-400" : "text-muted-foreground"}>{line}</div>
                ))}
              </div>
            )}
          </div>

          {/* Source Groups Table */}
          <div className="bg-card border border-border rounded-xl mb-8 overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-foreground">Source Groups</h2>
                <span className="text-xs text-muted-foreground ml-1">({sources.length} groups, scheduled daily with 30-min stagger)</span>
              </div>
              <button
                onClick={() => runSource("__all__")}
                disabled={!!runningSource || !!specialRunning}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                title="Run all source groups at once"
              >
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
                            {source.isRunning && (
                              <span className="flex items-center gap-1 text-xs text-primary">
                                <Loader2 className="w-3 h-3 animate-spin" />Running
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{source.description}</p>
                        </div>

                        <div className="flex items-center gap-6 text-xs shrink-0">
                          <div className="text-center">
                            <div className="text-muted-foreground mb-0.5">Last Run</div>
                            <div className="font-medium text-foreground">{ago(lastRun?.completedAt)}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-muted-foreground mb-0.5">Inserted</div>
                            <div className="font-medium text-green-400">{stats?.totalInserted ?? 0}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-muted-foreground mb-0.5">Updated</div>
                            <div className="font-medium text-blue-400">{stats?.totalUpdated ?? 0}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-muted-foreground mb-0.5">Flagged</div>
                            <div className="font-medium text-yellow-400">{stats?.totalFlagged ?? 0}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-muted-foreground mb-0.5">Runs</div>
                            <div className="font-medium text-foreground">{stats?.runCount ?? 0}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {lastRun?.errors && (
                            <button
                              onClick={() => setExpandedSource(isExpanded ? null : source.name)}
                              className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                              title="View errors"
                            >
                              <AlertCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => runSource(source.name)}
                            disabled={!!runningSource}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                            {isRunning ? "Running" : "Run"}
                          </button>
                        </div>
                      </div>

                      {isExpanded && lastRun?.errors && (
                        <div className="mt-3 bg-yellow-400/5 border border-yellow-400/20 rounded-lg p-3">
                          <p className="text-xs font-medium text-yellow-400 mb-1">Last run errors:</p>
                          <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                            {(() => {
                              try { return JSON.parse(lastRun.errors).join("\n"); } catch { return lastRun.errors; }
                            })()}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Run Log */}
          {runLog.length > 0 && (
            <div className="bg-card border border-border rounded-xl mb-8 overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-foreground">Live Run: {runLogSource}</h2>
                {runningSource && <Loader2 className="w-4 h-4 animate-spin text-primary ml-auto" />}
              </div>
              <div className="p-4 max-h-64 overflow-y-auto font-mono text-xs space-y-1">
                {runLog.map((entry, i) => {
                  const color =
                    entry.stage === "error" ? "text-red-400" :
                    entry.stage === "done" || entry.stage === "complete" ? "text-green-400" :
                    entry.stage === "analyzing" ? "text-purple-400" :
                    entry.stage === "saving" ? "text-blue-400" :
                    "text-muted-foreground";
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

          {/* Review Queue */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSearch className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold text-foreground">Review Queue</h2>
                  {pendingCount > 0 && (
                    <span className="text-xs font-bold bg-yellow-400/20 text-yellow-400 px-2 py-0.5 rounded-full">
                      {pendingCount} pending
                    </span>
                  )}
                </div>
                {pendingItems.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => reviewAll("approve")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors text-xs font-medium"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Approve All
                    </button>
                    <button
                      onClick={() => reviewAll("reject")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-medium"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject All
                    </button>
                  </div>
                )}
              </div>

              {uniqueSources.length > 1 && (
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  <button
                    onClick={() => setSourceFilter("all")}
                    className={`text-xs px-2 py-1 rounded-md transition-colors ${sourceFilter === "all" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    All
                  </button>
                  {uniqueSources.map((src) => (
                    <button
                      key={src}
                      onClick={() => setSourceFilter(src!)}
                      className={`text-xs px-2 py-1 rounded-md transition-colors ${sourceFilter === src ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {src}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {filteredPending.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-400/40 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">
                  {pendingCount === 0 ? "No items pending review" : "No items match the current filter"}
                </p>
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
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${TECH_COLORS[project.technology] ?? "text-muted-foreground bg-muted"}`}>
                            {project.technology}
                          </span>
                          <ConfidenceBadge score={project.confidenceScore} />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1">
                          <span>{project.country}</span>
                          {project.dealSizeUsdMn && <span>${project.dealSizeUsdMn.toFixed(0)}M</span>}
                          {project.capacityMw && <span>{project.capacityMw.toFixed(0)} MW</span>}
                          {project.extractionSource && <span className="text-primary/60">via {project.extractionSource}</span>}
                          <span>{ago(project.discoveredAt)}</span>
                        </div>
                        {project.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{project.description}</p>
                        )}
                        {project.developer && (
                          <p className="text-xs text-muted-foreground mt-0.5">Developer: <span className="text-foreground/70">{project.developer}</span></p>
                        )}
                        {project.financiers && (
                          <p className="text-xs text-muted-foreground mt-0.5">Financiers: <span className="text-foreground/70">{project.financiers}</span></p>
                        )}
                        {/* Source completeness badge */}
                        {(() => {
                          const count = [project.sourceUrl, project.newsUrl, project.newsUrl2].filter(Boolean).length;
                          const cls = count === 3 ? "text-green-400 bg-green-400/10 border-green-500/20" : count >= 2 ? "text-amber-400 bg-amber-400/10 border-amber-500/20" : "text-red-400 bg-red-400/10 border-red-500/20";
                          return (
                            <span className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded border font-medium mt-0.5 ${cls}`}>
                              {count}/3 sources
                            </span>
                          );
                        })()}
                        {project.sourceUrl && (
                          <a href={project.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-0.5 block truncate">
                            Source: {project.sourceUrl}
                          </a>
                        )}
                        {project.newsUrl && (
                          <a href={project.newsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline mt-0.5 block truncate">
                            News 1: {project.newsUrl}
                          </a>
                        )}
                        {project.newsUrl2 && (
                          <a href={project.newsUrl2} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-300 hover:underline mt-0.5 block truncate">
                            News 2: {project.newsUrl2}
                          </a>
                        )}
                      </div>

                      <div className="flex items-start gap-2 shrink-0 pt-0.5">
                        {action === "loading" ? (
                          <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        ) : action === "approve" ? (
                          <span className="flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle2 className="w-4 h-4" />Approved
                          </span>
                        ) : action === "reject" ? (
                          <span className="flex items-center gap-1 text-xs text-red-400">
                            <XCircle className="w-4 h-4" />Rejected
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => reviewItem(project.id, "approve", project)}
                              className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors"
                              title="Approve"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => reviewItem(project.id, "reject")}
                              className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
                              title="Reject"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </Layout>
  );
}
