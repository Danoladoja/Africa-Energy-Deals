import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth, reviewerFetch } from "@/contexts/auth";
import { useAdminAuth } from "@/contexts/admin-auth";
import { useReviewerAuth } from "@/contexts/reviewer-auth";
import {
  ClipboardList,
  CircleDot,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Mail,
  LogOut,
  XCircle,
  Trash2,
} from "lucide-react";

interface Stats {
  pending: number;
  needs_source: number;
  approved: number;
  rejected: number;
  binned: number;
}

function MagicLinkLoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/reviewer-auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-[#0b0f1a] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center gap-2 text-[#00e676] font-bold text-lg mb-1">
            <span className="w-2 h-2 rounded-full bg-[#00e676]" />
            AfriEnergy
          </div>
          <p className="text-slate-400 text-sm mb-8">Review Portal</p>
          <div className="bg-[#141924] rounded-2xl border border-white/5 p-8">
            <Mail className="w-12 h-12 text-[#00e676] mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Check your inbox</h2>
            <p className="text-slate-400 text-sm">
              If <span className="text-white font-medium">{email}</span> is registered, you'll receive a
              sign-in link shortly. It expires in 15 minutes.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(""); }}
              className="mt-6 text-slate-400 hover:text-white text-sm transition-colors"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f1a] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-[#00e676] font-bold text-lg mb-1">
            <span className="w-2 h-2 rounded-full bg-[#00e676]" />
            AfriEnergy
          </div>
          <p className="text-slate-400 text-sm">Review Portal</p>
        </div>
        <div className="bg-[#141924] rounded-2xl border border-white/5 p-8">
          <h1 className="text-xl font-semibold text-white mb-2">Sign in to Review Portal</h1>
          <p className="text-slate-400 text-sm mb-6">
            Enter your reviewer email to receive a secure sign-in link.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-3 bg-[#0b0f1a] border border-white/10 rounded-xl text-white placeholder-slate-600 text-sm focus:outline-none focus:border-[#00e676]/50"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#00e676] hover:bg-[#00c45a] text-[#0b0f1a] rounded-xl font-semibold text-sm transition-colors disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send sign-in link"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function ReviewDashboard() {
  const { isReviewer, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: adminLoading } = useAdminAuth();
  const { reviewer, isAuthenticated: isReviewerSession, isLoading: rvLoading, logout: reviewerLogout } = useReviewerAuth();

  const legacyCanAccess = isReviewer || isAdmin;
  const canAccess = legacyCanAccess || isReviewerSession;
  const isLoading = authLoading || adminLoading || rvLoading;

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!canAccess) { setLoading(false); return; }

    const fetcher = isReviewerSession
      ? (url: string) => fetch(url, { credentials: "include" })
      : reviewerFetch;

    fetcher("/api/review/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => setError("Failed to load stats"))
      .finally(() => setLoading(false));
  }, [isLoading, canAccess, isReviewerSession]);

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
    return <MagicLinkLoginForm />;
  }

  const statCards = [
    {
      label: "Pending Review",
      value: stats?.pending ?? 0,
      icon: CircleDot,
      color: "text-amber-400",
      bg: "bg-amber-400/10 border-amber-400/20",
      status: "pending",
    },
    {
      label: "Needs Source URL",
      value: stats?.needs_source ?? 0,
      icon: AlertCircle,
      color: "text-red-400",
      bg: "bg-red-400/10 border-red-400/20",
      status: "needs_source",
    },
    {
      label: "Approved",
      value: stats?.approved ?? 0,
      icon: CheckCircle2,
      color: "text-emerald-400",
      bg: "bg-emerald-400/10 border-emerald-400/20",
      status: "approved",
    },
    {
      label: "Rejected",
      value: stats?.rejected ?? 0,
      icon: XCircle,
      color: "text-rose-400",
      bg: "bg-rose-500/10 border-rose-500/20",
      status: "rejected",
    },
    {
      label: "Bin",
      value: stats?.binned ?? 0,
      icon: Trash2,
      color: "text-slate-400",
      bg: "bg-slate-500/10 border-slate-500/20",
      status: "binned",
    },
  ];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <ClipboardList className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Review Portal</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {reviewer
                  ? `Signed in as ${reviewer.displayName ?? reviewer.email}`
                  : "Manage AI-scraped deals awaiting human review"}
              </p>
            </div>
          </div>
          {isReviewerSession && (
            <button
              onClick={reviewerLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 text-sm transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          {statCards.map((card) => (
            <Link key={card.status} href={`/review/queue?status=${card.status}`}>
              <div className={`p-5 rounded-2xl border ${card.bg} hover:ring-1 hover:ring-primary/30 transition-all cursor-pointer group`}>
                <div className="flex items-center justify-between mb-3">
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>
                <div className={`text-3xl font-bold ${card.color} mb-1`}>{card.value.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">{card.label}</div>
              </div>
            </Link>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="flex flex-col gap-3">
            <Link href="/review/queue?status=pending">
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-amber-400/5 border border-amber-400/20 hover:bg-amber-400/10 transition-colors cursor-pointer group">
                <div className="flex items-center gap-3">
                  <CircleDot className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium text-foreground">Review pending deals</span>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
            <Link href="/review/queue?status=needs_source">
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-red-400/5 border border-red-400/20 hover:bg-red-400/10 transition-colors cursor-pointer group">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-sm font-medium text-foreground">Fix missing source URLs</span>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
