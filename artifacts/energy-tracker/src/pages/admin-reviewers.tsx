import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { useAdminAuth } from "@/contexts/admin-auth";
import {
  UserPlus,
  RefreshCw,
  Trash2,
  ShieldOff,
  ShieldCheck,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Reviewer {
  id: number;
  email: string;
  displayName: string | null;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  suspendedAt: string | null;
  suspendedBy: string | null;
  deletedAt: string | null;
}

interface AuditEntry {
  id: number;
  action: string;
  actor: string;
  ipAddress: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

function adminFetch(url: string, init?: RequestInit) {
  const token = (() => { try { return localStorage.getItem("afrienergy_admin_token"); } catch { return null; } })();
  return fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    added: "Added",
    suspended: "Suspended",
    reinstated: "Reinstated",
    deleted: "Deleted",
    login: "Signed in",
    magic_link_requested: "Requested sign-in link",
    admin_sent_link: "Admin sent sign-in link",
  };
  return labels[action] ?? action;
}

function ReviewerRow({ reviewer, onRefresh }: { reviewer: Reviewer; onRefresh: () => void }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const loadAudit = async () => {
    if (auditLog !== null) return;
    setAuditLoading(true);
    try {
      const r = await adminFetch(`/api/admin/reviewers/${reviewer.id}/audit`);
      const data = await r.json();
      setAuditLog(data.auditLog ?? []);
    } catch {
      setAuditLog([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const toggleExpand = () => {
    if (!expanded) loadAudit();
    setExpanded((v) => !v);
  };

  const handleSendLink = async () => {
    setBusy(true);
    try {
      const r = await adminFetch(`/api/admin/reviewers/${reviewer.id}/send-link`, { method: "POST" });
      const data = await r.json();
      if (data.success) {
        toast({ title: "Sign-in link sent", description: `Email sent to ${reviewer.email}` });
      } else {
        toast({ title: "Failed to send link", description: data.error, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSuspend = async () => {
    setBusy(true);
    try {
      const r = await adminFetch(`/api/admin/reviewers/${reviewer.id}/suspend`, { method: "PATCH" });
      const data = await r.json();
      if (data.success) {
        toast({ title: "Reviewer suspended" });
        onRefresh();
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReinstate = async () => {
    setBusy(true);
    try {
      const r = await adminFetch(`/api/admin/reviewers/${reviewer.id}/reinstate`, { method: "PATCH" });
      const data = await r.json();
      if (data.success) {
        toast({ title: "Reviewer reinstated" });
        onRefresh();
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await adminFetch(`/api/admin/reviewers/${reviewer.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail }),
      });
      const data = await r.json();
      if (data.success) {
        toast({ title: "Reviewer removed" });
        onRefresh();
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } finally {
      setBusy(false);
      setDeleteMode(false);
    }
  };

  return (
    <div className="bg-[#141924] rounded-xl border border-white/5 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-white text-sm">{reviewer.displayName ?? reviewer.email}</span>
            {reviewer.displayName && (
              <span className="text-slate-500 text-xs">{reviewer.email}</span>
            )}
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                reviewer.isActive
                  ? "bg-[#00e676]/10 text-[#00e676] border border-[#00e676]/20"
                  : "bg-amber-400/10 text-amber-400 border border-amber-400/20"
              }`}
            >
              {reviewer.isActive ? "Active" : "Suspended"}
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-0.5">
            Added {formatDate(reviewer.createdAt)}
            {reviewer.suspendedAt && ` · Suspended ${formatDate(reviewer.suspendedAt)}`}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleSendLink}
            disabled={busy || !reviewer.isActive}
            title="Send sign-in link"
            className="p-2 rounded-lg text-slate-400 hover:text-[#00e676] hover:bg-[#00e676]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <LinkIcon className="w-4 h-4" />
          </button>

          {reviewer.isActive ? (
            <button
              onClick={handleSuspend}
              disabled={busy}
              title="Suspend reviewer"
              className="p-2 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-40"
            >
              <ShieldOff className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleReinstate}
              disabled={busy}
              title="Reinstate reviewer"
              className="p-2 rounded-lg text-slate-400 hover:text-[#00e676] hover:bg-[#00e676]/10 transition-colors disabled:opacity-40"
            >
              <ShieldCheck className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => setDeleteMode((v) => !v)}
            disabled={busy}
            title="Remove reviewer"
            className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            onClick={toggleExpand}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {deleteMode && (
        <div className="px-5 pb-4 border-t border-white/5 pt-4">
          <div className="flex items-start gap-2 text-amber-400 text-xs mb-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>This will permanently remove the reviewer and revoke all their sessions. Type their email to confirm.</span>
          </div>
          <form onSubmit={handleDelete} className="flex gap-2">
            <input
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={reviewer.email}
              className="flex-1 px-3 py-2 bg-[#0b0f1a] border border-white/10 rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-red-400/50"
            />
            <button
              type="submit"
              disabled={confirmEmail.toLowerCase() !== reviewer.email || busy}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => { setDeleteMode(false); setConfirmEmail(""); }}
              className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {expanded && (
        <div className="border-t border-white/5 px-5 py-4">
          <p className="text-xs font-medium text-slate-400 mb-3 uppercase tracking-wider">Audit Log</p>
          {auditLoading && (
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <RefreshCw className="w-3 h-3 animate-spin" /> Loading…
            </div>
          )}
          {!auditLoading && auditLog !== null && auditLog.length === 0 && (
            <p className="text-slate-500 text-sm">No audit entries yet.</p>
          )}
          {!auditLoading && auditLog && auditLog.length > 0 && (
            <div className="space-y-2">
              {auditLog.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 text-sm">
                  <Clock className="w-3.5 h-3.5 text-slate-600 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-white">{actionLabel(entry.action)}</span>
                    <span className="text-slate-500 ml-2">by {entry.actor}</span>
                    {entry.ipAddress && (
                      <span className="text-slate-600 ml-2 text-xs">from {entry.ipAddress}</span>
                    )}
                  </div>
                  <span className="text-slate-600 text-xs shrink-0">{formatDate(entry.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminReviewersPage() {
  const { isAdmin, isLoading } = useAdminAuth();
  const { toast } = useToast();
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  const loadReviewers = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await adminFetch("/api/admin/reviewers");
      const data = await r.json();
      setReviewers(data.reviewers ?? []);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && isAdmin) loadReviewers();
  }, [isLoading, isAdmin, loadReviewers]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddBusy(true);
    try {
      const r = await adminFetch("/api/admin/reviewers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail, displayName: addName }),
      });
      const data = await r.json();
      if (data.success) {
        toast({ title: "Reviewer added", description: `Welcome email sent to ${addEmail}` });
        setAddEmail("");
        setAddName("");
        setShowAdd(false);
        loadReviewers();
      } else {
        toast({ title: "Failed to add reviewer", description: data.error, variant: "destructive" });
      }
    } finally {
      setAddBusy(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-[#00e676]/30 border-t-[#00e676] rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
          Admin access required.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white font-syne">Reviewer Management</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Add and manage reviewer access to the review portal.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadReviewers}
              disabled={loadingList}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loadingList ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 bg-[#00e676] hover:bg-[#00c45a] text-[#0b0f1a] rounded-xl font-semibold text-sm transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Add Reviewer
            </button>
          </div>
        </div>

        {showAdd && (
          <div className="bg-[#141924] rounded-2xl border border-[#00e676]/20 p-6 mb-6">
            <h2 className="text-base font-semibold text-white mb-4">Add New Reviewer</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Email address *</label>
                  <input
                    type="email"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="reviewer@example.com"
                    required
                    className="w-full px-3 py-2.5 bg-[#0b0f1a] border border-white/10 rounded-xl text-white text-sm placeholder-slate-600 focus:outline-none focus:border-[#00e676]/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Display name (optional)</label>
                  <input
                    type="text"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full px-3 py-2.5 bg-[#0b0f1a] border border-white/10 rounded-xl text-white text-sm placeholder-slate-600 focus:outline-none focus:border-[#00e676]/50"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={addBusy}
                  className="px-6 py-2.5 bg-[#00e676] hover:bg-[#00c45a] text-[#0b0f1a] rounded-xl font-semibold text-sm transition-colors disabled:opacity-60"
                >
                  {addBusy ? "Adding…" : "Add & Send Welcome Link"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setAddEmail(""); setAddName(""); }}
                  className="px-4 py-2.5 text-slate-400 hover:text-white text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
              <p className="text-slate-500 text-xs">A welcome sign-in link will be sent to the reviewer's email automatically.</p>
            </form>
          </div>
        )}

        {loadingList && reviewers.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-[#00e676]/30 border-t-[#00e676] rounded-full animate-spin" />
          </div>
        ) : reviewers.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <UserPlus className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No reviewers yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviewers.map((reviewer) => (
              <ReviewerRow key={reviewer.id} reviewer={reviewer} onRefresh={loadReviewers} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
