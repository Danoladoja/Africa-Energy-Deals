import { useEffect, useState, useRef } from "react";
import { Link, useParams, useSearch, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth, reviewerFetch } from "@/contexts/auth";
import { useAdminAuth } from "@/contexts/admin-auth";
import { useReviewerAuth } from "@/contexts/reviewer-auth";
import {
  ClipboardList, ArrowLeft, ExternalLink, CheckCircle2,
  AlertCircle, Clock, RefreshCw, Globe, Loader2,
  XCircle, Trash2, User, ChevronRight, ListTodo, Pencil, ChevronDown, Save
} from "lucide-react";
import { toast } from "sonner";

interface ProjectDetail {
  id: number;
  projectName: string;
  country: string;
  technology: string;
  region: string;
  dealSizeUsdMn: number | null;
  capacityMw: number | null;
  status: string;
  dealStage: string | null;
  developer: string | null;
  investors: string | null;
  financiers: string | null;
  reviewStatus: string;
  approvedBy: string | null;
  confidenceScore: number | null;
  sourceUrl: string | null;
  description: string | null;
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
  const [, navigate] = useLocation();
  const { isReviewer, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: adminLoading } = useAdminAuth();
  const { isAuthenticated: isReviewerSession, isLoading: rvLoading } = useReviewerAuth();
  const canAccess = isReviewer || isAdmin || isReviewerSession;
  const isAuthLoading = authLoading || adminLoading || rvLoading;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const apiFetch = (url: string, init?: RequestInit) =>
    isReviewerSession
      ? fetch(url, { ...init, credentials: "include" })
      : reviewerFetch(url, init);

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [urlNote, setUrlNote] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [queueRemaining, setQueueRemaining] = useState<number | null>(null);

  // Edit details panel
  const [editOpen, setEditOpen] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [editFields, setEditFields] = useState({
    projectName: "",
    country: "",
    region: "",
    technology: "",
    dealSizeUsdMn: "",
    capacityMw: "",
    status: "",
    dealStage: "",
    developer: "",
    investors: "",
    financiers: "",
    description: "",
  });

  const loadData = () => {
    setLoading(true);
    apiFetch(`/api/review/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!mountedRef.current) return;
        setData(d);
        setNewUrl(d.project.sourceUrl ?? "");
        const p = d.project as ProjectDetail;
        setEditFields({
          projectName: p.projectName ?? "",
          country: p.country ?? "",
          region: p.region ?? "",
          technology: p.technology ?? "",
          dealSizeUsdMn: p.dealSizeUsdMn != null ? String(p.dealSizeUsdMn) : "",
          capacityMw: p.capacityMw != null ? String(p.capacityMw) : "",
          status: p.status ?? "",
          dealStage: p.dealStage ?? "",
          developer: p.developer ?? "",
          investors: p.investors ?? "",
          financiers: p.financiers ?? "",
          description: p.description ?? "",
        });
      })
      .catch(() => toast.error("Failed to load deal"))
      .finally(() => { if (mountedRef.current) setLoading(false); });
  };

  const loadQueueCount = async () => {
    try {
      const r = await apiFetch(`/api/review/queue?status=${statusFilter}&page=1`);
      const d = await r.json();
      if (mountedRef.current) {
        // Remaining = total minus current project
        setQueueRemaining(Math.max(0, (d.total ?? 1) - 1));
      }
    } catch {}
  };

  useEffect(() => {
    setAdvancing(false);
    setSavingStatus(false);
    setEditOpen(false);
    if (isAuthLoading || !canAccess) { setLoading(false); return; }
    loadData();
    loadQueueCount();
  }, [isAuthLoading, canAccess, id]);

  const advanceToNext = async () => {
    setAdvancing(true);
    try {
      const r = await apiFetch(`/api/review/queue?status=${statusFilter}&page=1`);
      const d = await r.json();
      const next = (d.projects ?? []).find((p: { id: number }) => p.id !== parseInt(id));
      if (next) {
        navigate(`/review/queue/${next.id}?from=${statusFilter}`);
      } else {
        toast("Queue complete — great work!", { icon: "🎉" });
        navigate(`/review/queue?status=${statusFilter}`);
      }
    } catch {
      navigate(`/review/queue?status=${statusFilter}`);
    } finally {
      setAdvancing(false);
    }
  };

  async function handleTestUrl() {
    const urlToTest = newUrl || data?.project.sourceUrl;
    if (!urlToTest) { toast.error("No URL to test"); return; }
    setTestLoading(true);
    setTestResult(null);
    try {
      const r = await apiFetch("/api/review/test-url", {
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
      const r = await apiFetch(`/api/review/${id}/url`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newUrl: newUrl.trim(), note: urlNote || undefined }),
      });
      if (!r.ok) throw new Error("Failed");
      toast.success("Source URL updated");
      setUrlNote("");
      loadData();
      loadQueueCount();
    } catch {
      toast.error("Failed to update URL");
    } finally {
      setSavingUrl(false);
    }
  }

  async function handleSaveDetails() {
    setSavingDetails(true);
    try {
      const body: Record<string, unknown> = {
        projectName: editFields.projectName,
        country: editFields.country,
        region: editFields.region,
        technology: editFields.technology,
        status: editFields.status,
        dealStage: editFields.dealStage || null,
        developer: editFields.developer || null,
        investors: editFields.investors || null,
        financiers: editFields.financiers || null,
        description: editFields.description || null,
        dealSizeUsdMn: editFields.dealSizeUsdMn !== "" ? parseFloat(editFields.dealSizeUsdMn) : null,
        capacityMw: editFields.capacityMw !== "" ? parseFloat(editFields.capacityMw) : null,
      };
      const r = await apiFetch(`/api/review/${id}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed");
      toast.success("Project details saved");
      setEditOpen(false);
      loadData();
    } catch {
      toast.error("Failed to save details");
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleSetStatus(status: string) {
    setSavingStatus(true);
    try {
      const r = await apiFetch(`/api/review/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("Failed");
      const labels: Record<string, string> = {
        approved: "Approved ✓",
        needs_source: "Flagged — needs source URL",
        pending: "Reset to pending",
        rejected: "Rejected",
        binned: "Moved to bin",
      };
      toast.success(labels[status] ?? "Updated");
      if (status !== "pending") {
        await advanceToNext();
      } else {
        loadData();
        loadQueueCount();
      }
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

  if (!canAccess) {
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
      {/* Auto-advance overlay */}
      {advancing && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm font-medium text-foreground">Loading next deal…</p>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Breadcrumb + queue progress */}
        <div className="flex items-center justify-between gap-2 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Link href="/review"><div className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors"><ClipboardList className="w-4 h-4" />Review Portal</div></Link>
            <span className="text-muted-foreground">/</span>
            <Link href={`/review/queue?status=${statusFilter}`}><div className="text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors flex items-center gap-1"><ArrowLeft className="w-3 h-3" />Queue</div></Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-medium text-foreground truncate max-w-[180px]" title={project.projectName}>{project.projectName}</span>
          </div>
          {queueRemaining !== null && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/8 border border-primary/15 text-xs font-medium text-primary shrink-0">
              <ListTodo className="w-3 h-3" />
              {queueRemaining === 0 ? "Last in queue" : `${queueRemaining} remaining`}
            </div>
          )}
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
                <div className="shrink-0 ml-3 flex flex-col items-end gap-1.5">
                  {project.reviewStatus === "pending" && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-400/10 text-amber-400 border border-amber-400/20">Pending</span>}
                  {project.reviewStatus === "needs_source" && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-400/10 text-red-400 border border-red-400/20">Needs Source</span>}
                  {project.reviewStatus === "approved" && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">Approved</span>}
                  {project.reviewStatus === "rejected" && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">Rejected</span>}
                  {project.reviewStatus === "binned" && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">Binned</span>}
                  {project.reviewStatus === "approved" && project.approvedBy && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/8 text-emerald-500/70 border border-emerald-500/15">
                      <User className="w-2.5 h-2.5" />{project.approvedBy}
                    </span>
                  )}
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

            {/* Edit Project Details card */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <button
                onClick={() => setEditOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors text-left"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Pencil className="w-4 h-4 text-primary" />
                  Edit Project Details
                </span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${editOpen ? "rotate-180" : ""}`} />
              </button>

              {editOpen && (
                <div className="px-5 pb-5 border-t border-border/60">
                  <p className="text-xs text-muted-foreground mt-4 mb-4">
                    Correct any AI-extracted field before approving. Changes are logged to the audit trail.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    {/* Project Name — full width */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-muted-foreground mb-1">Project Name</label>
                      <input
                        type="text"
                        value={editFields.projectName}
                        onChange={e => setEditFields(f => ({ ...f, projectName: e.target.value }))}
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Country</label>
                      <input
                        type="text"
                        value={editFields.country}
                        onChange={e => setEditFields(f => ({ ...f, country: e.target.value }))}
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Region</label>
                      <input
                        type="text"
                        value={editFields.region}
                        onChange={e => setEditFields(f => ({ ...f, region: e.target.value }))}
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Sector / Technology</label>
                      <input
                        type="text"
                        value={editFields.technology}
                        onChange={e => setEditFields(f => ({ ...f, technology: e.target.value }))}
                        placeholder="e.g. Solar, Wind, Hydro"
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Project Status</label>
                      <select
                        value={editFields.status}
                        onChange={e => setEditFields(f => ({ ...f, status: e.target.value }))}
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="">— select —</option>
                        <option value="Announced">Announced</option>
                        <option value="Under Construction">Under Construction</option>
                        <option value="Operational">Operational</option>
                        <option value="Commissioned">Commissioned</option>
                        <option value="Suspended">Suspended</option>
                        <option value="Unknown">Unknown</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Deal Size (USD Mn)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={editFields.dealSizeUsdMn}
                        onChange={e => setEditFields(f => ({ ...f, dealSizeUsdMn: e.target.value }))}
                        placeholder="e.g. 150"
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Capacity (MW)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={editFields.capacityMw}
                        onChange={e => setEditFields(f => ({ ...f, capacityMw: e.target.value }))}
                        placeholder="e.g. 100"
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Deal Stage</label>
                      <select
                        value={editFields.dealStage}
                        onChange={e => setEditFields(f => ({ ...f, dealStage: e.target.value }))}
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="">— select —</option>
                        <option value="Announced">Announced</option>
                        <option value="Mandated">Mandated</option>
                        <option value="Financial Close">Financial Close</option>
                        <option value="Construction">Construction</option>
                        <option value="Commissioned">Commissioned</option>
                        <option value="Suspended">Suspended</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Developer</label>
                      <input
                        type="text"
                        value={editFields.developer}
                        onChange={e => setEditFields(f => ({ ...f, developer: e.target.value }))}
                        placeholder="e.g. Acme Energy Ltd"
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>

                    {/* Investors — full width */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-muted-foreground mb-1">Investors / Financiers</label>
                      <input
                        type="text"
                        value={editFields.investors}
                        onChange={e => setEditFields(f => ({ ...f, investors: e.target.value }))}
                        placeholder="e.g. AfDB, IFC, Standard Bank"
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>

                    {/* Description — full width */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-muted-foreground mb-1">Description</label>
                      <textarea
                        rows={3}
                        value={editFields.description}
                        onChange={e => setEditFields(f => ({ ...f, description: e.target.value }))}
                        placeholder="Brief description of the project…"
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveDetails}
                      disabled={savingDetails}
                      className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {savingDetails ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Changes
                    </button>
                    <button
                      onClick={() => setEditOpen(false)}
                      disabled={savingDetails}
                      className="px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
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

                <div className="border-t border-border/60 my-1" />

                <button
                  onClick={() => handleSetStatus("rejected")}
                  disabled={savingStatus || project.reviewStatus === "rejected"}
                  className="w-full py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-semibold hover:bg-rose-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Reject
                </button>
                <button
                  onClick={() => handleSetStatus("binned")}
                  disabled={savingStatus || project.reviewStatus === "binned"}
                  className="w-full py-2.5 rounded-xl bg-slate-500/10 border border-slate-500/20 text-slate-400 text-sm font-semibold hover:bg-slate-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  title="Temporarily removes from review portal. Admin reviews the bin."
                >
                  {savingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Bin
                </button>
              </div>

              {project.reviewStatus === "approved" && project.approvedBy && (
                <div className="mt-4 pt-3 border-t border-border/60">
                  <div className="flex items-center gap-1.5 text-xs text-emerald-500/70">
                    <User className="w-3 h-3" />
                    <span>Approved by <span className="font-medium">{project.approvedBy}</span></span>
                  </div>
                </div>
              )}

              <div className="border-t border-border/60 my-1" />

              <button
                onClick={advanceToNext}
                disabled={savingStatus || advancing}
                className="w-full py-2 rounded-xl border border-border/50 text-muted-foreground text-xs font-medium hover:bg-muted/30 hover:text-foreground transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {advancing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
                Skip to next
              </button>

              <p className="mt-2 text-[10px] text-muted-foreground/50 leading-relaxed">
                Approve / Flag / Reject / Bin automatically loads the next deal. <strong>Mark Pending</strong> stays here. <strong>Skip</strong> advances without deciding.
              </p>
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
