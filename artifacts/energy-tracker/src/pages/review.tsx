import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth, authedFetch } from "@/contexts/auth";
import { ClipboardList, CircleDot, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";

interface Stats {
  pending: number;
  needs_source: number;
  approved: number;
}

export default function ReviewDashboard() {
  const { isReviewer, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isReviewer) { setLoading(false); return; }

    authedFetch("/api/review/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => setError("Failed to load stats"))
      .finally(() => setLoading(false));
  }, [authLoading, isReviewer]);

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
          <p className="text-muted-foreground max-w-sm">
            Your account does not have access to the Review Portal. Contact an admin to request reviewer permissions.
          </p>
          <Link href="/dashboard">
            <div className="mt-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors cursor-pointer">
              Back to Dashboard
            </div>
          </Link>
        </div>
      </Layout>
    );
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
  ];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 rounded-xl bg-primary/10">
            <ClipboardList className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Review Portal</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage AI-scraped deals awaiting human review</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
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
