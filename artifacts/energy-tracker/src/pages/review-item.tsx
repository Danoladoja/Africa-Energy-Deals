import { useEffect, useState } from "react";
import { Link, useParams, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth, authedFetch } from "@/contexts/auth";
import {
  ClipboardList, ArrowLeft, ExternalLink, CheckCircle2,
  AlertCircle, Clock, RefreshCw, Globe, Loader2
} from "lucide-react";
import { toast } from "sonner";

interface ProjectDetail {
  id: number;
  projectName: string;
  country: string;
  technology: string;
  region: string;
  dealSizeUsdMn: number | null;
  status: string;
  reviewStatus: string;
  confidenceScore: number | null;
  sourceUrl: string | null;
  description: string | null;
  investors: string | null;
  extractionSource: string | null;
  createdAt: string;
}

interface UrlAuditEntry {
  id: number;
  dealId: number;
  oldUrl: string | null;
  newUrl: string | null;
  action: string;
  testedStatus: number | null;
  responseTime: number | null;
  note: string | null;
  reviewerEmail: string;
  createdAt: string;
}

interface DetailResponse {
  project: ProjectDetail;
  auditLog: UrlAuditEntry[];
}

interface TestResult {
  url: string;
  reachable: boolean;
  httpStatus: number | null;
  responseTime: number;
}

export default function ReviewItem() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const statusFilter = new URLSearchParams(search).get("from") ?? "pending";
  const { isReviewer, isLoading: authLoading } = useAuth();

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [urlNote, setUrlNote] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);

  const loadData = () => {
    setLoading(true);
    authedFetch(`/api/review/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setNewUrl(d.project.sourceUrl ?? "");
      })
      .catch(() => toast.error("Failed to load deal"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (authLoading || !isReviewer) { setLoading(false); return; }
    loadData();
  }, [authLoading, isReviewer, id]);

  async function handleTestUrl() {
    const urlToTest = newUrl || data?.project.sourceUrl;
    if (!urlToTest) { toast.error("No URL to test"); return; }
    setTestLoading(true);
    setTestResult(null);
    try {
      const r = await authedFetch("/api/review/test-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlToTest, dealId: parseInt(id) }),
      });
      const result = await r.json();
      setTestResult(result);
    } catch {
      toast.error("URL test failed");
    } finally {
      setTestLoading(false);
    }
  }

  async function handleSaveUrl() {
    if (!newUrl.trim()) { toast.error("URL cannot be empty"); return; }
    setSavingUrl(true);
    try {
      const r = await authedFetch(`/api/review/${id}/url`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newUrl: newUrl.trim(), note: urlNote || undefined }),
      });
      if (!r.ok) throw new Error("Failed");
      toast.success("Source URL updated");
      setUrlNote("");
      loadData();
    } catch {
      toast.error("Failed to update URL");
    } finally {
      setSavingUrl(false);
    }
  }

  async function handleSetStatus(status: string) {
    setSavingStatus(true);
    try {
      const r = await authedFetch(`/api/review/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("Failed");
      const label = status === "approved" ? "Approved" : status === "needs_source" ? "Marked as needs source" : "Set to pending";
      toast.success(label);
      loadData();
    } catch {
      toast.error("Failed to update status");
    } finally {
      setSavingStatus(false);
    }
  }

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!isReviewer) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
          <AlertCircle className="w-12 h-12 text-amber-400" />
          <h1 className="text-2xl font-bold text-foreground">Reviewer Access Required</h1>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <p className="text-foreground font-medium">Deal not found</p>
          <Link href="/review/queue"><div className="text-sm text-primary hover:underline cursor-pointer">Back to queue</div></Link>
        </div>
      </Layout>
    );
  }

  const { project, auditLog } = data;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6">
          <Link href="/review"><div className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors"><ClipboardList className="w-4 h-4" />Review Portal</div></Link>
          <span className="text-muted-foreground">/</span>
          <Link href={`/review/queue?status=${statusFilter}`}><div className="text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors flex items-center gap-1"><ArrowLeft className="w-3 h-3" />Queue</div></Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium text-foreground truncate max-w-[240px]" title={project.projectName}>{project.projectName}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main details */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Deal card */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-lg font-bold text-foreground leading-tight">{project.projectName}</h1>
                  <p className="text-sm text-muted-foreground mt-1">{project.country} · {project.region}</p>
                </div>
                <div className="shrink-0 ml-3">
                  {project.reviewStatus === "pending" && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-400/10 text-amber-400 border border-amber-400/20">Pending</span>}
                  {project.reviewStatus === "needs_source" && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-400/10 text-red-400 border border-red-400/20">Needs Source</span>}
                  {project.reviewStatus === "approved" && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">Approved</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-muted/30 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-1">Sector</p>
                  <p className="text-sm font-medium text-foreground">{project.technology}</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-1">Deal Size</p>
                  <p className="text-sm font-medium text-foreground">
                    {project.dealSizeUsdMn ? `$${project.dealSizeUsdMn >= 1000 ? (project.dealSizeUsdMn / 1000).toFixed(1) + "B" : project.dealSizeUsdMn + "M"}` : "Unknown"}
                  </p>
                </div>
                <div className="bg-muted/30 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-1">Project Status</p>
                  <p className="text-sm font-medium text-foreground capitalize">{project.status}</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-1">AI Confidence</p>
                  <p className="text-sm font-medium text-foreground">
                    {project.confidenceScore !== null ? `${Math.round(project.confidenceScore * 100)}%` : "Unknown"}
                  </p>
                </div>
              </div>

              {project.investors && (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground mb-1">Investors / Financiers</p>
                  <p className="text-sm text-foreground">{project.investors}</p>
                </div>
              )}

              {project.description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="text-sm text-foreground/80 leading-relaxed">{project.description}</p>
                </div>
              )}

              {project.extractionSource && (
                <p className="text-xs text-muted-foreground mt-3">Source group: {project.extractionSource}</p>
              )}
            </div>

            {/* Source URL card */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                Source URL
              </h2>

              {project.sourceUrl && (
                <div className="flex items-center gap-2 mb-3 p-3 rounded-xl bg-muted/30 border border-border">
                  <p className="text-xs text-muted-foreground truncate flex-1" title={project.sourceUrl}>{project.sourceUrl}</p>
                  <a href={project.sourceUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary hover:text-primary/80">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}

              {!project.sourceUrl && (
                <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-sm text-red-400">No source URL — please add one below.</p>
                </div>
              )}

              {testResult && (
                <div className={`mb-3 p-3 rounded-xl text-sm ${testResult.reachable ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
                  {testResult.reachable ? "✓ Reachable" : "✗ Unreachable"} · HTTP {testResult.httpStatus ?? "—"} · {testResult.responseTime}ms
                </div>
              )}

              <div className="flex gap-2 mb-3">
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  onClick={handleTestUrl}
                  disabled={testLoading}
                  className="px-3 py-2 rounded-xl bg-muted/30 border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {testLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Test
                </button>
              </div>

              <input
                type="text"
                value={urlNote}
                onChange={(e) => setUrlNote(e.target.value)}
                placeholder="Note (optional)"
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-3"
              />

              <button
                onClick={handleSaveUrl}
                disabled={savingUrl || !newUrl.trim()}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingUrl && <Loader2 className="w-4 h-4 animate-spin" />}
                Save URL
              </button>
            </div>
          </div>

          {/* Right column: actions + audit */}
          <div className="flex flex-col gap-4">
            {/* Review actions */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Review Decision</h2>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleSetStatus("approved")}
                  disabled={savingStatus || project.reviewStatus === "approved"}
                  className="w-full py-2.5 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-sm font-semibold hover:bg-emerald-400/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Approve
                </button>
                <button
                  onClick={() => handleSetStatus("needs_source")}
                  disabled={savingStatus || project.reviewStatus === "needs_source"}
                  className="w-full py-2.5 rounded-xl bg-red-400/10 border border-red-400/20 text-red-400 text-sm font-semibold hover:bg-red-400/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                  Needs Source
                </button>
                <button
                  onClick={() => handleSetStatus("pending")}
                  disabled={savingStatus || project.reviewStatus === "pending"}
                  className="w-full py-2.5 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 text-sm font-semibold hover:bg-amber-400/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                  Mark Pending
                </button>
              </div>
            </div>

            {/* URL audit log */}
            {auditLog.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3">URL History</h2>
                <div className="flex flex-col gap-2">
                  {auditLog.map((entry) => (
                    <div key={entry.id} className="text-xs text-muted-foreground border-l-2 border-border pl-3 py-1">
                      <div className="font-medium text-foreground/80 capitalize">{entry.action}</div>
                      {entry.testedStatus && <div>HTTP {entry.testedStatus} · {entry.responseTime}ms</div>}
                      {entry.newUrl && <div className="truncate text-primary/80" title={entry.newUrl}>{entry.newUrl}</div>}
                      {entry.note && <div className="italic">{entry.note}</div>}
                      <div className="mt-0.5 opacity-60">{new Date(entry.createdAt).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
