import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Layout } from "@/components/layout";
import { Loader2, Award, Globe, CalendarDays, ExternalLink } from "lucide-react";

const API = "/api";

const BADGE_INFO: Record<string, { label: string; color: string; desc: string }> = {
  bronze: { label: "Bronze", color: "text-amber-700", desc: "1 approved submission" },
  silver: { label: "Silver", color: "text-slate-400", desc: "10 approved submissions" },
  gold: { label: "Gold", color: "text-yellow-400", desc: "50 approved submissions" },
  platinum: { label: "Platinum", color: "text-cyan-300", desc: "200 approved submissions" },
  first_light: { label: "First Light", color: "text-yellow-300", desc: "First community deal approved system-wide" },
  scoop: { label: "Scoop", color: "text-purple-400", desc: "Broke a deal before our scrapers" },
  multi_sector: { label: "Multi-Sector", color: "text-blue-400", desc: "Approved across 3+ energy sub-sectors" },
  cross_border: { label: "Cross-Border", color: "text-green-400", desc: "Approved across 5+ countries" },
  corroborator: { label: "Corroborator", color: "text-teal-400", desc: "10 submissions with both URLs verified" },
};

function badgeInfo(slug: string) {
  if (slug.startsWith("country_specialist_")) {
    const cc = slug.replace("country_specialist_", "").toUpperCase();
    return { label: `Country Specialist (${cc})`, color: "text-emerald-400", desc: `10+ approved submissions in ${cc}` };
  }
  return BADGE_INFO[slug] ?? { label: slug, color: "text-muted-foreground", desc: "" };
}

const TIER_COLORS: Record<string, string> = {
  bronze: "text-amber-700 bg-amber-700/10 border-amber-700/30",
  silver: "text-slate-400 bg-slate-400/10 border-slate-400/30",
  gold: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  platinum: "text-cyan-300 bg-cyan-300/10 border-cyan-300/30",
};

export default function ContributorProfilePage() {
  const params = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!params.slug) return;
    fetch(`${API}/contributors/${params.slug}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, [params.slug]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (notFound) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh] text-center">
          <div>
            <p className="text-2xl font-bold text-foreground mb-2" style={{ fontFamily: "Syne, sans-serif" }}>Profile not found</p>
            <p className="text-muted-foreground">This contributor profile is private or does not exist.</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!data) return null;

  const { contributor, stats, submissions, badges } = data;
  const tierColor = TIER_COLORS[contributor.currentTier] ?? "text-muted-foreground bg-muted/30 border-border";

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary shrink-0" style={{ fontFamily: "Syne, sans-serif" }}>
              {contributor.displayName[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Syne, sans-serif" }}>
                  {contributor.displayName}
                </h1>
                {contributor.currentTier && (
                  <span className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold capitalize ${tierColor}`}>
                    {contributor.currentTier}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-2">
                {contributor.country && (
                  <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{contributor.country}</span>
                )}
                <span className="flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  Member since {new Date(contributor.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                </span>
              </div>
              {contributor.bio && <p className="text-sm text-foreground/80">{contributor.bio}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-border">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{stats.totalApproved}</p>
              <p className="text-xs text-muted-foreground">Approved deals</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{stats.distinctCountries}</p>
              <p className="text-xs text-muted-foreground">Countries covered</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{stats.distinctSectors}</p>
              <p className="text-xs text-muted-foreground">Sub-sectors</p>
            </div>
          </div>
        </div>

        {badges.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Badges</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {badges.map((b: any) => {
                const info = badgeInfo(b.badgeSlug);
                return (
                  <div key={b.id} className="group relative">
                    <span className={`px-3 py-1 rounded-full border border-border text-xs font-medium ${info.color} cursor-default`}>
                      {info.label}
                    </span>
                    {info.desc && (
                      <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-card border border-border rounded text-xs text-muted-foreground whitespace-nowrap z-10">
                        {info.desc}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground text-sm">Approved submissions</h2>
          </div>
          {submissions.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">No approved submissions yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {submissions.map((sub: any) => (
                <div key={sub.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{sub.projectName}</p>
                    <p className="text-xs text-muted-foreground">
                      {sub.country} · {sub.subSector}
                      {sub.reviewedAt ? ` · approved ${new Date(sub.reviewedAt).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  {sub.linkedProjectId && (
                    <a href={`/deals/${sub.linkedProjectId}`} className="shrink-0 flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="w-3.5 h-3.5" /> View
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
