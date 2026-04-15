import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth, reviewerFetch } from "@/contexts/auth";
import { useAdminAuth } from "@/contexts/admin-auth";
import { useReviewerAuth } from "@/contexts/reviewer-auth";
import { ChevronLeft, ChevronRight, ExternalLink, CircleDot, AlertCircle, CheckCircle2, ClipboardList, XCircle, Trash2 } from "lucide-react";
import { SECTOR_COLORS } from "@/utils/chart-colors";

interface QueueProject {
  id: number;
  projectName: string;
  country: string;
  technology: string;
  dealSizeUsdMn: number | null;
  status: string;
  reviewStatus: string;
  confidenceScore: number | null;
  sourceUrl: string | null;
  extractionSource: string | null;
  createdAt: string;
  reviewNotes: string[] | null;
}

interface QueueResponse {
  projects: QueueProject[];
  total: number;
  page: number;
  pages: number;
}

function statusBadge(status: string) {
  if (status === "pending") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-400/10 text-amber-400 border border-amber-400/20"><CircleDot className="w-3 h-3" />Pending</span>;
  if (status === "needs_source") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-400/10 text-red-400 border border-red-400/20"><AlertCircle className="w-3 h-3" />Needs Source</span>;
  if (status === "approved") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"><CheckCircle2 className="w-3 h-3" />Approved</span>;
  if (status === "rejected") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20"><XCircle className="w-3 h-3" />Rejected</span>;
  if (status === "binned") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20"><Trash2 className="w-3 h-3" />Binned</span>;
  return <span className="text-xs text-muted-foreground">{status}</span>;
}

function confidenceBar(score: number | null) {
  if (score === null) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.round(score * 100);
  const color = score >= 0.85 ? "bg-emerald-400" : score >= 0.65 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-muted/50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}

export default function ReviewQueue() {
  const { isReviewer, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: adminLoading } = useAdminAuth();
  const { isAuthenticated: isReviewerSession, isLoading: rvLoading } = useReviewerAuth();
  const canAccess = isReviewer || isAdmin || isReviewerSession;
  const isLoading = authLoading || adminLoading || rvLoading;
  const search = useSearch();
  const params = new URLSearchParams(search);
  const statusFilter = params.get("status") ?? "pending";
  const pageParam = parseInt(params.get("page") ?? "1");

  const apiFetch = (url: string) =>
    isReviewerSession ? fetch(url, { credentials: "include" }) : reviewerFetch(url);

  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !canAccess) { setLoading(false); return; }
    setLoading(true);
    apiFetch(`/api/review/queue?status=${statusFilter}&page=${pageParam}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setError("Failed to load queue"))
      .finally(() => setLoading(false));
  }, [isLoading, canAccess, statusFilter, pageParam, isReviewerSession]);

  if (isLoading || loading) {
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
          <p className="text-sm text-muted-foreground max-w-sm">Contact an admin to request reviewer permissions.</p>
        </div>
      </Layout>
    );
  }

  const statusLabels: Record<string, string> = {
    pending: "Pending Review",
    needs_source: "Needs Source URL",
    approved: "Approved",
    rejected: "Rejected",
    binned: "Bin",
  };

  const allStatuses = ["pending", "needs_source", "approved", "rejected", "binned"];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/review">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
              <ClipboardList className="w-4 h-4" />
              Review Portal
            </div>
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium text-foreground">{statusLabels[statusFilter] ?? statusFilter}</span>
        </div>

        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">{statusLabels[statusFilter] ?? statusFilter}</h1>
            {data && <p className="text-sm text-muted-foreground mt-0.5">{data.total.toLocaleString()} deals</p>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {allStatuses.map((s) => (
              <Link key={s} href={`/review/queue?status=${s}`}>
                <div className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  statusFilter === s
                    ? s === "rejected" ? "bg-rose-500 text-white"
                    : s === "binned" ? "bg-slate-500 text-white"
                    : "bg-primary text-primary-foreground"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}>
                  {statusLabels[s]}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
        )}

        {data && data.projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            <p className="text-foreground font-medium">All clear!</p>
            <p className="text-sm text-muted-foreground">No deals in this queue.</p>
          </div>
        )}

        {data && data.projects.length > 0 && (
          <>
            <div className="rounded-2xl border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sector</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deal Size</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Confidence</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.projects.map((p, i) => (
                    <tr key={p.id} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm text-foreground truncate max-w-[240px]" title={p.projectName}>{p.projectName}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{p.country}</div>
                        {p.reviewNotes && p.reviewNotes.length > 0 && (
                          <div className="mt-1.5 flex flex-col gap-0.5">
                            {p.reviewNotes.slice(0, 3).map((note, ni) => (
                              <span key={ni} className="inline-flex items-center gap-1 text-[10px] text-amber-400/90 leading-tight" title={note}>
                                <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate max-w-[200px]">{note}</span>
                              </span>
                            ))}
                            {p.reviewNotes.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">+{p.reviewNotes.length - 3} more…</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: (SECTOR_COLORS[p.technology] ?? "#6366f1") + "22",
                            color: SECTOR_COLORS[p.technology] ?? "#6366f1",
                            border: `1px solid ${(SECTOR_COLORS[p.technology] ?? "#6366f1")}44`,
                          }}
                        >
                          {p.technology}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {p.dealSizeUsdMn ? `$${p.dealSizeUsdMn >= 1000 ? (p.dealSizeUsdMn / 1000).toFixed(1) + "B" : p.dealSizeUsdMn + "M"}` : "—"}
                      </td>
                      <td className="px-4 py-3">{confidenceBar(p.confidenceScore)}</td>
                      <td className="px-4 py-3">{statusBadge(p.reviewStatus)}</td>
                      <td className="px-4 py-3">
                        {p.sourceUrl ? (
                          <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            Link <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-red-400">Missing</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/review/queue/${p.id}`}>
                          <div className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors cursor-pointer whitespace-nowrap">
                            Review →
                          </div>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.pages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">Page {data.page} of {data.pages}</p>
                <div className="flex gap-2">
                  <Link href={`/review/queue?status=${statusFilter}&page=${Math.max(1, pageParam - 1)}`}>
                    <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors ${pageParam <= 1 ? "opacity-30 pointer-events-none" : "hover:bg-muted/50"} text-muted-foreground`}>
                      <ChevronLeft className="w-4 h-4" /> Prev
                    </div>
                  </Link>
                  <Link href={`/review/queue?status=${statusFilter}&page=${Math.min(data.pages, pageParam + 1)}`}>
                    <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors ${pageParam >= data.pages ? "opacity-30 pointer-events-none" : "hover:bg-muted/50"} text-muted-foreground`}>
                      Next <ChevronRight className="w-4 h-4" />
                    </div>
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
