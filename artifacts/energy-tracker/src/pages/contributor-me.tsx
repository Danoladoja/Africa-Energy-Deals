import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  Loader2, CheckCircle2, XCircle, Clock, Award, Globe, Edit2, ExternalLink, LogOut
} from "lucide-react";

const API = "/api";

interface Submission {
  id: number;
  projectName: string;
  country: string;
  subSector: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  linkedProjectId: number | null;
  needsExtraScrutiny: boolean;
}

interface Badge {
  id: number;
  badgeSlug: string;
  awardedAt: string;
}

interface Contributor {
  id: number;
  email: string;
  displayName: string;
  slug: string;
  country: string | null;
  bio: string | null;
  isPublic: boolean;
  currentTier: string | null;
  createdAt: string;
}

const BADGE_INFO: Record<string, { label: string; color: string; desc: string }> = {
  bronze: { label: "Bronze", color: "text-amber-700", desc: "1 approved submission" },
  silver: { label: "Silver", color: "text-slate-400", desc: "10 approved submissions" },
  gold: { label: "Gold", color: "text-yellow-400", desc: "50 approved submissions" },
  platinum: { label: "Platinum", color: "text-cyan-300", desc: "200 approved submissions" },
  first_light: { label: "First Light", color: "text-yellow-300", desc: "First ever community submission approved" },
  scoop: { label: "Scoop", color: "text-purple-400", desc: "Broke a deal before the scrapers found it" },
  multi_sector: { label: "Multi-Sector", color: "text-blue-400", desc: "Approved deals across 3+ sub-sectors" },
  cross_border: { label: "Cross-Border", color: "text-green-400", desc: "Approved deals across 5+ countries" },
  corroborator: { label: "Corroborator", color: "text-teal-400", desc: "10 submissions with both URLs verified" },
};

function badgeInfo(slug: string) {
  if (slug.startsWith("country_specialist_")) {
    const cc = slug.replace("country_specialist_", "").toUpperCase();
    return { label: `Country Specialist (${cc})`, color: "text-emerald-400", desc: `10+ approved submissions in ${cc}` };
  }
  return BADGE_INFO[slug] ?? { label: slug, color: "text-muted-foreground", desc: "" };
}

function StatusBadge({ status }: { status: string }) {
  const map = {
    approved: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "text-green-400 bg-green-400/10", label: "Approved" },
    rejected: { icon: <XCircle className="w-3.5 h-3.5" />, color: "text-red-400 bg-red-400/10", label: "Rejected" },
    pending: { icon: <Clock className="w-3.5 h-3.5" />, color: "text-yellow-400 bg-yellow-400/10", label: "Under review" },
    duplicate: { icon: <XCircle className="w-3.5 h-3.5" />, color: "text-slate-400 bg-slate-400/10", label: "Duplicate" },
  };
  const s = map[status as keyof typeof map] ?? { icon: null, color: "text-muted-foreground bg-muted", label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      {s.icon}{s.label}
    </span>
  );
}

export default function ContributorMePage() {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);
  const [contributor, setContributor] = useState<Contributor | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ displayName: "", bio: "", isPublic: true });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  useEffect(() => {
    fetch(`${API}/contributions/me`, { credentials: "include" })
      .then((r) => {
        if (r.status === 401) { navigate("/contribute"); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setContributor(d.contributor);
        setSubmissions(d.submissions ?? []);
        setBadges(d.badges ?? []);
        setEditForm({ displayName: d.contributor.displayName, bio: d.contributor.bio ?? "", isPublic: d.contributor.isPublic });
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveProfile() {
    setSaving(true);
    try {
      await fetch(`${API}/contributions/me/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editForm),
      });
      setContributor((c) => c ? { ...c, ...editForm } : c);
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await fetch(`${API}/contributor-auth/logout`, { method: "POST", credentials: "include" });
    navigate("/contribute");
  }

  if (loading) {
    return <Layout><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div></Layout>;
  }

  if (!contributor) return null;

  const filteredSubs = filter === "all" ? submissions : submissions.filter((s) => s.status === filter);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Syne, sans-serif" }}>
              My Contributions
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{contributor.email}</p>
          </div>
          <div className="flex gap-2">
            <a href="/contribute" className="px-3 py-1.5 text-xs border border-primary text-primary rounded-lg hover:bg-primary/10 transition-colors">
              Submit deal
            </a>
            <button onClick={signOut} className="px-3 py-1.5 text-xs border border-border text-muted-foreground rounded-lg hover:text-foreground transition-colors flex items-center gap-1">
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Total submitted</p>
            <p className="text-2xl font-bold text-foreground">{submissions.length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Approved</p>
            <p className="text-2xl font-bold text-green-400">{submissions.filter((s) => s.status === "approved").length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Tier</p>
            <p className="text-2xl font-bold text-foreground capitalize">{contributor.currentTier ?? "—"}</p>
          </div>
        </div>

        {badges.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Badges earned</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => {
                const info = badgeInfo(b.badgeSlug);
                return (
                  <div key={b.id} className="group relative">
                    <span className={`px-3 py-1 rounded-full border border-border text-xs font-medium ${info.color} cursor-default`}>
                      {info.label}
                    </span>
                    <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-card border border-border rounded text-xs text-muted-foreground whitespace-nowrap z-10">
                      {info.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-sm">Profile settings</h2>
            {!editMode
              ? <button onClick={() => setEditMode(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"><Edit2 className="w-3.5 h-3.5" /> Edit</button>
              : <div className="flex gap-2">
                  <button onClick={() => setEditMode(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                  <button onClick={saveProfile} disabled={saving} className="text-xs text-primary font-medium">{saving ? "Saving…" : "Save"}</button>
                </div>
            }
          </div>
          <div className="p-5 space-y-3">
            {editMode ? (
              <>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Display name</label>
                  <input type="text" value={editForm.displayName} onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))} maxLength={40} className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Bio</label>
                  <textarea value={editForm.bio} onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))} maxLength={280} rows={2} className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm resize-none" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editForm.isPublic} onChange={(e) => setEditForm((f) => ({ ...f, isPublic: e.target.checked }))} className="rounded" />
                  <span className="text-sm text-foreground">Public profile (visible at /contributors/{contributor.slug})</span>
                </label>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Display name</p><p className="text-foreground">{contributor.displayName}</p></div>
                <div><p className="text-xs text-muted-foreground">Profile</p><p className="text-foreground">{contributor.isPublic ? "Public" : "Private"}</p></div>
                {contributor.bio && <div className="col-span-2"><p className="text-xs text-muted-foreground">Bio</p><p className="text-foreground">{contributor.bio}</p></div>}
                <div><p className="text-xs text-muted-foreground">Member since</p><p className="text-foreground">{new Date(contributor.createdAt).toLocaleDateString()}</p></div>
                {contributor.isPublic && (
                  <div><p className="text-xs text-muted-foreground">Public link</p>
                    <a href={`/contributors/${contributor.slug}`} className="text-primary hover:underline flex items-center gap-1 text-sm">
                      /contributors/{contributor.slug} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-3">
            <h2 className="font-semibold text-foreground text-sm">My submissions</h2>
            <div className="flex gap-1 ml-auto">
              {(["all", "pending", "approved", "rejected"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-xs capitalize ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          {filteredSubs.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              {filter === "all" ? (
                <>No submissions yet. <a href="/contribute" className="text-primary hover:underline">Submit your first deal →</a></>
              ) : `No ${filter} submissions.`}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredSubs.map((sub) => (
                <div key={sub.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <p className="text-sm font-medium text-foreground">{sub.projectName}</p>
                      <p className="text-xs text-muted-foreground">{sub.country} · {sub.subSector} · {new Date(sub.createdAt).toLocaleDateString()}</p>
                    </div>
                    <StatusBadge status={sub.status} />
                  </div>
                  {sub.needsExtraScrutiny && sub.status === "pending" && (
                    <p className="text-xs text-yellow-400/80 mt-1">⚠ Flagged for additional source verification</p>
                  )}
                  {sub.status === "rejected" && sub.rejectionReason && (
                    <p className="text-xs text-muted-foreground mt-1 italic">Reviewer note: {sub.rejectionReason}</p>
                  )}
                  {sub.status === "approved" && sub.linkedProjectId && (
                    <a href={`/deals/${sub.linkedProjectId}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                      <ExternalLink className="w-3 h-3" /> View in tracker
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
