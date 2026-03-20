import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { getAdminToken } from "@/contexts/admin-auth";
import {
  Sparkles,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  Zap,
  Globe,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Check,
  X,
  Newspaper,
  Building2,
  Landmark,
  Wallet,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAdminToken();
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

type ReviewStatus = "pending" | "approved" | "rejected";

interface Project {
  id: number;
  projectName: string;
  country: string;
  region: string;
  technology: string;
  dealSizeUsdMn: number | null;
  investors: string | null;
  status: string;
  description: string | null;
  capacityMw: number | null;
  announcedYear: number | null;
  sourceUrl: string | null;
  newsUrl: string | null;
  reviewStatus: ReviewStatus;
  discoveredAt: string | null;
}

interface ScraperStatus {
  lastRunAt: string | null;
  isRunning: boolean;
  pendingCount: number;
  lastResult: {
    processed: number;
    discovered: number;
    feedsReached: number;
    feedsFailed: number;
    errors: string[];
    runAt: string;
  } | null;
}

interface LogLine {
  stage: string;
  message: string;
  processed?: number;
  discovered?: number;
}

const TECH_COLORS: Record<string, string> = {
  Solar: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  Wind: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  Hydro: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Geothermal: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Natural Gas": "bg-slate-500/15 text-slate-400 border-slate-500/30",
  Oil: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  EV: "bg-green-500/15 text-green-400 border-green-500/30",
  "Battery Storage": "bg-teal-500/15 text-teal-400 border-teal-500/30",
  Transmission: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  "Other Renewables": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

function formatRelativeTime(iso: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ProjectCard({
  project,
  onReview,
  reviewing,
}: {
  project: Project;
  onReview: (id: number, action: "approve" | "reject") => void;
  reviewing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const techClass = TECH_COLORS[project.technology] ?? "bg-muted/20 text-muted-foreground border-muted";

  return (
    <div
      className={`border rounded-2xl p-5 transition-all duration-200 ${
        project.reviewStatus === "approved"
          ? "border-primary/30 bg-primary/5"
          : project.reviewStatus === "rejected"
          ? "border-destructive/20 bg-destructive/5 opacity-60"
          : "border-border bg-card hover:border-primary/20"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${techClass}`}>
              {project.technology}
            </span>
            {project.reviewStatus === "approved" && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary flex items-center gap-1">
                <Check className="w-3 h-3" /> Approved
              </span>
            )}
            {project.reviewStatus === "rejected" && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-1">
                <X className="w-3 h-3" /> Rejected
              </span>
            )}
          </div>
          <h3 className="font-display font-semibold text-base text-foreground leading-snug">
            {project.projectName}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {project.country} · {project.region}
            {project.capacityMw && ` · ${project.capacityMw} MW`}
            {project.dealSizeUsdMn && ` · $${project.dealSizeUsdMn >= 1000 ? `${(project.dealSizeUsdMn / 1000).toFixed(1)}B` : `${project.dealSizeUsdMn}M`}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {project.discoveredAt && (
            <span className="text-xs text-muted-foreground/60 hidden sm:block">
              {formatRelativeTime(project.discoveredAt)}
            </span>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 text-sm border-t border-border/50 pt-4">
          {project.description && (
            <p className="text-muted-foreground leading-relaxed">{project.description}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {project.investors && (
              <div>
                <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">Investors</span>
                <p className="text-foreground/80 mt-0.5">{project.investors}</p>
              </div>
            )}
            {project.status && (
              <div>
                <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">Status</span>
                <p className="text-foreground/80 mt-0.5 capitalize">{project.status}</p>
              </div>
            )}
          </div>
          {(project.sourceUrl || project.newsUrl) && (
            <div className="flex gap-2 pt-1">
              {project.newsUrl && (
                <a
                  href={project.newsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded-lg bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  Read Article →
                </a>
              )}
              {project.sourceUrl && project.sourceUrl !== project.newsUrl && (
                <a
                  href={project.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded-lg bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  Source →
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {project.reviewStatus === "pending" && (
        <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
          <button
            disabled={reviewing}
            onClick={() => onReview(project.id, "approve")}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors text-sm font-medium disabled:opacity-40"
          >
            <CheckCircle2 className="w-4 h-4" />
            Approve & Publish
          </button>
          <button
            disabled={reviewing}
            onClick={() => onReview(project.id, "reject")}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-muted/20 text-muted-foreground border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 transition-colors text-sm font-medium disabled:opacity-40"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

export default function DiscoveryPage() {
  const [status, setStatus] = useState<ScraperStatus | null>(null);
  const [queue, setQueue] = useState<Project[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [reviewing, setReviewing] = useState<Record<number, boolean>>({});
  const [tab, setTab] = useState<"pending" | "all">("pending");

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/scraper/status`, { headers: authHeaders() });
      const data = await r.json() as ScraperStatus;
      setStatus(data);
    } catch {}
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/scraper/${tab === "pending" ? "queue" : "reviewed"}`, { headers: authHeaders() });
      const data = await r.json() as Project[];
      setQueue(data);
    } catch {}
  }, [tab]);

  useEffect(() => {
    fetchStatus();
    fetchQueue();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchQueue]);

  useEffect(() => {
    fetchQueue();
  }, [tab, fetchQueue]);

  const handleRunScraper = async () => {
    setIsRunning(true);
    setLogs([]);

    try {
      const response = await fetch(`${BASE}/api/scraper/run`, { method: "POST", headers: authHeaders() });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) return;

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim().replace(/^data:\s*/, "");
          if (!line) continue;
          try {
            const parsed = JSON.parse(line) as LogLine;
            setLogs((prev) => [...prev, parsed]);
          } catch {}
        }
      }
    } catch (err) {
      setLogs((prev) => [...prev, { stage: "error", message: `Connection error: ${String(err)}` }]);
    } finally {
      setIsRunning(false);
      await fetchStatus();
      await fetchQueue();
    }
  };

  const handleReview = async (id: number, action: "approve" | "reject") => {
    setReviewing((prev) => ({ ...prev, [id]: true }));
    try {
      await fetch(`${BASE}/api/scraper/review/${id}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action }),
      });
      setQueue((prev) =>
        prev.map((p) => (p.id === id ? { ...p, reviewStatus: action === "approve" ? "approved" : "rejected" } : p)),
      );
      await fetchStatus();
    } catch {}
    setReviewing((prev) => ({ ...prev, [id]: false }));
  };

  const handleReviewAll = async (action: "approve" | "reject") => {
    try {
      await fetch(`${BASE}/api/scraper/review-all`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action }),
      });
      await fetchQueue();
      await fetchStatus();
    } catch {}
  };

  const pendingItems = queue.filter((p) => p.reviewStatus === "pending");
  const pendingCount = status?.pendingCount ?? pendingItems.length;

  return (
    <Layout>
      <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <h1 className="font-display font-bold text-2xl text-foreground">AI Discovery</h1>
            </div>
            <p className="text-muted-foreground text-sm max-w-xl">
              Claude Sonnet scans 45+ sources daily — national dailies, development banks (World Bank, AfDB, IFC), energy agencies (IEA, IRENA, SE4All), financial institutions (BII, Proparco, DFC, GCF), and sector publications — extracting new Africa energy investment deals automatically.
            </p>
          </div>

          <button
            onClick={handleRunScraper}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Now
              </>
            )}
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
              <Clock className="w-3.5 h-3.5" />
              Last Run
            </div>
            <p className="font-display font-semibold text-foreground">
              {formatRelativeTime(status?.lastRunAt ?? null)}
            </p>
            {status?.lastResult && (
              <p className="text-xs text-muted-foreground/60 mt-1">
                {status.lastResult.discovered} deals · {status.lastResult.feedsReached} sources reached
              </p>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
              <AlertCircle className="w-3.5 h-3.5" />
              Pending Review
            </div>
            <p className="font-display font-semibold text-foreground">{pendingCount}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">deals awaiting approval</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
              <RefreshCw className="w-3.5 h-3.5" />
              Schedule
            </div>
            <p className="font-display font-semibold text-foreground">Daily 06:00 UTC</p>
            <p className="text-xs text-muted-foreground/60 mt-1">+ manual trigger anytime</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
              <Globe className="w-3.5 h-3.5" />
              Source Network
            </div>
            <p className="font-display font-semibold text-foreground">45+ Sources</p>
            <p className="text-xs text-muted-foreground/60 mt-1">7 categories monitored</p>
          </div>
        </div>

        {/* Source category breakdown */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-display font-semibold text-sm text-foreground mb-4">Source Network Coverage</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Energy Media", count: 6, icon: Zap, desc: "ESI Africa, PV Mag, Recharge, Energy Monitor…" },
              { label: "Dev. Banks & Agencies", count: 10, icon: Building2, desc: "World Bank, AfDB, IFC, IEA, IRENA, SE4All, Power Africa…" },
              { label: "Financial Institutions", count: 4, icon: Wallet, desc: "BII, Proparco, DFC, Green Climate Fund…" },
              { label: "National Dailies", count: 17, icon: Newspaper, desc: "Nigeria, Kenya, South Africa, Ghana, Ethiopia, Tanzania, Egypt, Morocco…" },
              { label: "Pan-African News", count: 6, icon: Globe, desc: "AllAfrica, Africa Report, African Business, The East African…" },
              { label: "Reuters", count: 1, icon: Landmark, desc: "Reuters Business wire for major deal coverage" },
              { label: "MDA Feeds", count: 2, icon: Building2, desc: "MIGA, EBRD regional Africa coverage" },
            ].map((cat) => (
              <div key={cat.label} className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/20 border border-border/50">
                <cat.icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground">{cat.label}</span>
                    <span className="text-xs text-primary font-bold">{cat.count}</span>
                  </div>
                  <p className="text-xs text-muted-foreground/60 mt-0.5 leading-snug">{cat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live log output */}
        {(isRunning || logs.length > 0) && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Agent Log</span>
              {isRunning && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary ml-auto" />}
            </div>
            <div className="p-4 space-y-2 font-mono text-xs max-h-60 overflow-y-auto">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 ${
                    log.stage === "error"
                      ? "text-destructive"
                      : log.stage === "done" || log.stage === "complete"
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  <span className="opacity-40 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  <span>{log.message}</span>
                </div>
              ))}
              {isRunning && (
                <div className="flex items-center gap-2 text-muted-foreground/60">
                  <span className="opacity-40">--</span>
                  <span className="animate-pulse">Processing...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Review queue */}
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex gap-2">
              <button
                onClick={() => setTab("pending")}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  tab === "pending"
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Pending Review
                {pendingCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
                    {pendingCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTab("all")}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  tab === "all"
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All Discovered
              </button>
            </div>

            {tab === "pending" && pendingCount > 1 && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleReviewAll("approve")}
                  className="px-3 py-1.5 text-xs rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors font-medium"
                >
                  Approve All
                </button>
                <button
                  onClick={() => handleReviewAll("reject")}
                  className="px-3 py-1.5 text-xs rounded-lg bg-muted/20 text-muted-foreground border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 transition-colors font-medium"
                >
                  Reject All
                </button>
              </div>
            )}
          </div>

          {queue.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">
                {tab === "pending" ? "No deals pending review" : "No AI-discovered deals yet"}
              </p>
              <p className="text-sm mt-1 opacity-70">
                {tab === "pending"
                  ? "Run the scraper to discover new energy investment deals"
                  : "Click 'Run Now' to have the AI agent scan for new deals"}
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {queue.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onReview={handleReview}
                  reviewing={reviewing[project.id] ?? false}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
