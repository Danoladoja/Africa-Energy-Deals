import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { getAdminToken } from "@/contexts/admin-auth";
import {
  Users, Shield, ShieldOff, Loader2, CheckCircle2, XCircle, Clock, AlertCircle, RefreshCw
} from "lucide-react";

const API = "/api";

function authHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

interface Contributor {
  id: number;
  email: string;
  displayName: string;
  slug: string;
  country: string | null;
  currentTier: string | null;
  isPublic: boolean;
  isBanned: boolean;
  createdAt: string;
  lastSubmissionAt: string | null;
  totalSubmissions: number;
  approvedCount: number;
  approvalRate: number | null;
}

interface RecentSubmission {
  id: number;
  projectName: string;
  country: string;
  subSector: string;
  status: string;
  needsExtraScrutiny: boolean;
  createdAt: string;
  contributorName: string;
  contributorSlug: string;
  submitterNote: string | null;
  newsUrl: string;
  newsUrl2: string;
}

function StatusBadge({ status }: { status: string }) {
  const map = {
    approved: "text-green-400 bg-green-400/10",
    rejected: "text-red-400 bg-red-400/10",
    pending: "text-yellow-400 bg-yellow-400/10",
    duplicate: "text-slate-400 bg-slate-400/10",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${map[status as keyof typeof map] ?? "text-muted-foreground bg-muted"}`}>
      {status}
    </span>
  );
}

export default function AdminContributorsPage() {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [recentSubs, setRecentSubs] = useState<RecentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"contributors" | "submissions">("contributors");
  const [banLoading, setBanLoading] = useState<number | null>(null);
  const [reviewLoading, setReviewLoading] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [cRes, sRes] = await Promise.all([
        fetch(`${API}/admin/contributors`, { headers: authHeaders() }),
        fetch(`${API}/admin/contributors/recent-submissions`, { headers: authHeaders() }),
      ]);
      if (!cRes.ok || !sRes.ok) {
        const failed = !cRes.ok ? cRes : sRes;
        const body = await failed.text().catch(() => "");
        let detail = "";
        try { detail = JSON.parse(body).error ?? ""; } catch { detail = body.slice(0, 200); }
        setLoadError(`HTTP ${failed.status}${detail ? ` — ${detail}` : ""}`);
        return;
      }
      const [contribs, subs] = await Promise.all([cRes.json(), sRes.json()]);
      setContributors(Array.isArray(contribs) ? contribs : []);
      setRecentSubs(Array.isArray(subs) ? subs : []);
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function toggleBan(contributor: Contributor) {
    setBanLoading(contributor.id);
    try {
      const action = contributor.isBanned ? "unban" : "ban";
      await fetch(`${API}/admin/contributors/${contributor.id}/${action}`, {
        method: "POST",
        headers: authHeaders(),
      });
      setContributors((prev) => prev.map((c) => c.id === contributor.id ? { ...c, isBanned: !c.isBanned } : c));
    } finally {
      setBanLoading(null);
    }
  }

  async function reviewSubmission(id: number, action: "approve" | "reject", rejectionReason?: string) {
    setReviewLoading(id);
    try {
      await fetch(`${API}/admin/contributor-submissions/${id}/review`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ action, rejectionReason }),
      });
      setRecentSubs((prev) => prev.map((s) => s.id === id ? { ...s, status: action === "approve" ? "approved" : "rejected" } : s));
    } finally {
      setReviewLoading(null);
    }
  }

  const filtered = contributors.filter((c) =>
    !search || c.displayName.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Syne, sans-serif" }}>
              Contributor Management
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{contributors.length} contributors · {recentSubs.filter((s) => s.status === "pending").length} pending submissions</p>
          </div>
          <button onClick={loadData} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loadError && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-300 mb-1">Failed to load contributor data</p>
                <p className="text-xs text-red-400/80 font-mono break-all">{loadError}</p>
                <p className="text-xs text-muted-foreground mt-2">Deploy the latest API server to apply schema migrations, then retry.</p>
              </div>
              <button onClick={loadData} className="shrink-0 px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-medium transition-colors">
                Retry
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-1 mb-6 bg-muted/30 rounded-lg p-1 w-fit">
          {(["contributors", "submissions"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {tab === "contributors" ? `Contributors (${contributors.length})` : `Recent Submissions (${recentSubs.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : loadError ? null : activeTab === "contributors" ? (
          <>
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted-foreground w-64"
              />
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/30">
                    <tr>
                      {["Name", "Email", "Tier", "Submissions", "Approval rate", "Banned", "Joined", "Actions"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((c) => (
                      <tr key={c.id} className={c.isBanned ? "opacity-50" : ""}>
                        <td className="px-4 py-3">
                          <a href={`/contributors/${c.slug}`} className="font-medium text-foreground hover:text-primary transition-colors">
                            {c.displayName}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{c.email}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs capitalize text-muted-foreground">{c.currentTier ?? "—"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-foreground">{c.approvedCount}</span>
                          <span className="text-muted-foreground">/{c.totalSubmissions}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.approvalRate !== null ? `${c.approvalRate}%` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {c.isBanned ? <span className="text-red-400 text-xs">Yes</span> : <span className="text-green-400 text-xs">No</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleBan(c)}
                            disabled={banLoading === c.id}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${c.isBanned ? "border-green-400/30 text-green-400 hover:bg-green-400/10" : "border-red-400/30 text-red-400 hover:bg-red-400/10"}`}
                          >
                            {banLoading === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : c.isBanned ? <Shield className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
                            {c.isBanned ? "Unban" : "Ban"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length === 0 && (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">No contributors found.</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    {["Project", "Country", "Sector", "Contributor", "Status", "Scrutiny", "Submitted", "Actions"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentSubs.map((sub) => (
                    <tr key={sub.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground max-w-[200px] truncate">{sub.projectName}</p>
                        {sub.submitterNote && (
                          <p className="text-xs text-muted-foreground/80 italic mt-0.5 max-w-[200px] truncate">"{sub.submitterNote}"</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{sub.country}</td>
                      <td className="px-4 py-3 text-muted-foreground">{sub.subSector}</td>
                      <td className="px-4 py-3">
                        <a href={`/contributors/${sub.contributorSlug}`} className="text-primary hover:underline text-xs">{sub.contributorName}</a>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={sub.status} /></td>
                      <td className="px-4 py-3">
                        {sub.needsExtraScrutiny
                          ? <span className="flex items-center gap-1 text-xs text-yellow-400"><AlertCircle className="w-3.5 h-3.5" /> Yes</span>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(sub.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {sub.status === "pending" && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => reviewSubmission(sub.id, "approve")}
                              disabled={reviewLoading === sub.id}
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-colors"
                            >
                              {reviewLoading === sub.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                const reason = prompt("Rejection reason (optional):");
                                reviewSubmission(sub.id, "reject", reason ?? undefined);
                              }}
                              disabled={reviewLoading === sub.id}
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-red-400/30 text-red-400 hover:bg-red-400/10 transition-colors"
                            >
                              <XCircle className="w-3 h-3" />
                              Reject
                            </button>
                          </div>
                        )}
                        {sub.status !== "pending" && <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {recentSubs.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">No submissions yet.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
