import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Loader2, Download, Linkedin, Twitter, Link2, Check, ExternalLink } from "lucide-react";

const API = "/api";
const SITE_URL = window.location.origin;

const BADGE_INFO: Record<string, { label: string; color: string; desc: string }> = {
  bronze: { label: "Bronze Contributor", color: "text-amber-700", desc: "1 approved submission" },
  silver: { label: "Silver Contributor", color: "text-slate-400", desc: "10 approved submissions" },
  gold: { label: "Gold Contributor", color: "text-yellow-400", desc: "50 approved submissions" },
  platinum: { label: "Platinum Contributor", color: "text-cyan-300", desc: "200 approved submissions" },
  first_light: { label: "First Light", color: "text-yellow-300", desc: "First community deal ever approved" },
  multi_sector: { label: "Multi-Sector", color: "text-blue-400", desc: "Approved across 3+ sub-sectors" },
  cross_border: { label: "Cross-Border", color: "text-green-400", desc: "Approved across 5+ countries" },
  corroborator: { label: "Corroborator", color: "text-teal-400", desc: "10 approved submissions with both source URLs from trusted publications" },
  scoop: { label: "Scoop", color: "text-purple-400", desc: "First to report a deal" },
};

function badgeInfo(slug: string) {
  if (slug.startsWith("country_specialist_")) {
    const cc = slug.replace("country_specialist_", "").toUpperCase();
    return { label: `Country Specialist (${cc})`, color: "text-emerald-400", desc: `10+ approved submissions in ${cc}` };
  }
  return BADGE_INFO[slug] ?? { label: slug, color: "text-primary", desc: "" };
}

const TIER_BADGES = ["bronze", "silver", "gold", "platinum"];

export default function ContributorBadgePage() {
  const params = useParams<{ slug: string; badgeSlug: string }>();
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  const slug = params.slug;
  const badgeSlug = params.badgeSlug;

  useEffect(() => {
    if (!slug || !badgeSlug) return;

    // Fetch contributor public profile to verify badge exists
    fetch(`${API}/contributors/${slug}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        const hasBadge = (d.badges ?? []).some((b: any) => b.badgeSlug === badgeSlug);
        if (!hasBadge) { setNotFound(true); return; }
        setData(d);
      })
      .finally(() => setLoading(false));
  }, [slug, badgeSlug]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (notFound || !data) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-3">
          <p className="text-2xl font-bold text-foreground" style={{ fontFamily: "Syne, sans-serif" }}>Badge not found</p>
          <p className="text-muted-foreground">This badge doesn't exist or the profile is private.</p>
          <a href="/contributors" className="text-primary hover:underline text-sm">← Back to leaderboard</a>
        </div>
      </Layout>
    );
  }

  const { contributor, stats } = data;
  const badge = (data.badges ?? []).find((b: any) => b.badgeSlug === badgeSlug);
  const info = badgeInfo(badgeSlug);
  const isTierBadge = TIER_BADGES.includes(badgeSlug);
  const badgePageUrl = `${SITE_URL}/contributors/${slug}/badges/${badgeSlug}`;
  const previewUrl = `${SITE_URL.replace("/energy-tracker", "")}/api/contributors/${slug}/badges/${badgeSlug}/preview`;
  const imageUrl = `${SITE_URL.replace("/energy-tracker", "")}/api/badges/${contributor.id}/${badgeSlug}.png?format=social`;

  const awardedAt = badge ? new Date(badge.awardedAt) : new Date();
  const issueYear = awardedAt.getFullYear();
  const issueMonth = awardedAt.getMonth() + 1;

  const linkedinCertUrl = isTierBadge
    ? `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(`AfriEnergy Tracker ${info.label}`)}&organizationName=${encodeURIComponent("AfriEnergy Tracker")}&issueYear=${issueYear}&issueMonth=${issueMonth}&certUrl=${encodeURIComponent(previewUrl)}&certId=${badge?.id ?? ""}`
    : null;

  const shareText = `I earned the ${info.label} badge on @AfriEnergyPulse! ${info.desc}. ${stats?.approvedCount ?? 0} approved energy investment deals contributed across Africa.`;

  const linkedinShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(previewUrl)}`;
  const twitterShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(previewUrl)}`;

  async function copyLink() {
    await navigator.clipboard.writeText(badgePageUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Layout>
      {/* OG meta for browsers (social bots use the /preview endpoint) */}
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <a href="/contributors" className="hover:text-foreground transition-colors">Leaderboard</a>
          <span>/</span>
          <a href={`/contributors/${slug}`} className="hover:text-foreground transition-colors">{contributor.displayName}</a>
          <span>/</span>
          <span className="text-foreground">{info.label}</span>
        </div>

        {/* Badge card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden mb-6">
          <div className="px-8 py-10 text-center">
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6 border-4 border-primary/20">
              <span className={`text-5xl font-bold ${info.color}`}>
                {badgeSlug === "bronze" ? "B" : badgeSlug === "silver" ? "S" : badgeSlug === "gold" ? "G" : badgeSlug === "platinum" ? "P" : "★"}
              </span>
            </div>
            <h1 className={`text-2xl font-bold mb-2 ${info.color}`} style={{ fontFamily: "Syne, sans-serif" }}>
              {info.label}
            </h1>
            <p className="text-muted-foreground mb-4">{info.desc}</p>
            <p className="text-sm text-muted-foreground">
              Earned by <a href={`/contributors/${slug}`} className="text-primary hover:underline font-medium">{contributor.displayName}</a>
              {badge && ` · ${new Date(badge.awardedAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`}
            </p>
          </div>

          {/* Badge image preview */}
          <div className="border-t border-border">
            <div className="p-4">
              <p className="text-xs font-medium text-muted-foreground mb-3">Shareable image preview</p>
              <img
                src={imageUrl}
                alt={`${info.label} badge for ${contributor.displayName}`}
                className="w-full rounded-lg border border-border"
                style={{ aspectRatio: "1200/630", objectFit: "cover" }}
              />
            </div>
          </div>
        </div>

        {/* Share panel */}
        <div className="bg-card border border-border rounded-xl p-5 mb-4">
          <p className="text-sm font-semibold text-foreground mb-4">Share this badge</p>

          <div className="flex flex-wrap gap-3 mb-4">
            <a
              href={linkedinShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-[#0A66C2] text-white rounded-lg text-sm font-medium hover:bg-[#0A66C2]/90 transition-colors"
            >
              <Linkedin className="w-4 h-4" /> Share on LinkedIn
            </a>
            <a
              href={twitterShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-[#1D9BF0] text-white rounded-lg text-sm font-medium hover:bg-[#1D9BF0]/90 transition-colors"
            >
              <Twitter className="w-4 h-4" /> Share on X
            </a>
            <button
              onClick={copyLink}
              className="flex items-center gap-2 px-4 py-2 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted/20 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Link2 className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>

          {/* Download */}
          <div className="relative">
            <button
              onClick={() => setDownloadOpen((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 border border-primary/30 text-primary rounded-lg text-sm font-medium hover:bg-primary/10 transition-colors"
            >
              <Download className="w-4 h-4" /> Download image
            </button>
            {downloadOpen && (
              <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 min-w-48 overflow-hidden">
                {[
                  { label: "Social card (1200×630 PNG)", href: `/api/badges/${contributor.id}/${badgeSlug}/download?format=png&size=social` },
                  { label: "Square (1080×1080 PNG)", href: `/api/badges/${contributor.id}/${badgeSlug}/download?format=png&size=square` },
                  { label: "Social card SVG", href: `/api/badges/${contributor.id}/${badgeSlug}/download?format=svg&size=social` },
                ].map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    download
                    className="block px-4 py-3 text-sm text-foreground hover:bg-muted/20 transition-colors border-b border-border last:border-0"
                    onClick={() => setDownloadOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* LinkedIn Add to Profile — tier badges only */}
        {isTierBadge && linkedinCertUrl && (
          <div className="bg-[#0A66C2]/5 border border-[#0A66C2]/20 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Add to your LinkedIn profile</p>
                <p className="text-xs text-muted-foreground">
                  Put the {info.label} certification on your professional profile. LinkedIn will list it under "Licenses & Certifications."
                </p>
              </div>
              <a
                href={linkedinCertUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 flex items-center gap-2 px-4 py-2 bg-[#0A66C2] text-white rounded-lg text-sm font-medium hover:bg-[#0A66C2]/90 transition-colors whitespace-nowrap"
              >
                <Linkedin className="w-4 h-4" /> Add to Profile
              </a>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
