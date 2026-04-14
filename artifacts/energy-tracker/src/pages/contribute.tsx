import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/layout";
import { useLocation } from "wouter";
import {
  Loader2, CheckCircle2, AlertCircle, ExternalLink, Zap, Users, Award,
  Trophy, Globe, ChevronLeft, ChevronRight, ArrowRight, Medal,
} from "lucide-react";

const API = "/api";

const AFRICAN_COUNTRIES = [
  { code: "DZ", name: "Algeria" }, { code: "AO", name: "Angola" }, { code: "BJ", name: "Benin" },
  { code: "BW", name: "Botswana" }, { code: "BF", name: "Burkina Faso" }, { code: "BI", name: "Burundi" },
  { code: "CM", name: "Cameroon" }, { code: "CV", name: "Cape Verde" }, { code: "CF", name: "Central African Republic" },
  { code: "TD", name: "Chad" }, { code: "KM", name: "Comoros" }, { code: "CG", name: "Congo" },
  { code: "CD", name: "Congo (DRC)" }, { code: "CI", name: "Côte d'Ivoire" }, { code: "DJ", name: "Djibouti" },
  { code: "EG", name: "Egypt" }, { code: "GQ", name: "Equatorial Guinea" }, { code: "ER", name: "Eritrea" },
  { code: "SZ", name: "Eswatini" }, { code: "ET", name: "Ethiopia" }, { code: "GA", name: "Gabon" },
  { code: "GM", name: "Gambia" }, { code: "GH", name: "Ghana" }, { code: "GN", name: "Guinea" },
  { code: "GW", name: "Guinea-Bissau" }, { code: "KE", name: "Kenya" }, { code: "LS", name: "Lesotho" },
  { code: "LR", name: "Liberia" }, { code: "LY", name: "Libya" }, { code: "MG", name: "Madagascar" },
  { code: "MW", name: "Malawi" }, { code: "ML", name: "Mali" }, { code: "MR", name: "Mauritania" },
  { code: "MU", name: "Mauritius" }, { code: "MA", name: "Morocco" }, { code: "MZ", name: "Mozambique" },
  { code: "NA", name: "Namibia" }, { code: "NE", name: "Niger" }, { code: "NG", name: "Nigeria" },
  { code: "RW", name: "Rwanda" }, { code: "ST", name: "São Tomé and Príncipe" }, { code: "SN", name: "Senegal" },
  { code: "SL", name: "Sierra Leone" }, { code: "SO", name: "Somalia" }, { code: "ZA", name: "South Africa" },
  { code: "SS", name: "South Sudan" }, { code: "SD", name: "Sudan" }, { code: "TZ", name: "Tanzania" },
  { code: "TG", name: "Togo" }, { code: "TN", name: "Tunisia" }, { code: "UG", name: "Uganda" },
  { code: "ZM", name: "Zambia" }, { code: "ZW", name: "Zimbabwe" },
];

const SUB_SECTORS = ["Solar", "Wind", "Hydro", "Gas", "Oil", "Geothermal", "Transmission", "Storage", "Nuclear", "Other"];

const TIER_COLORS: Record<string, string> = {
  bronze:   "text-amber-700",
  silver:   "text-slate-400",
  gold:     "text-yellow-400",
  platinum: "text-cyan-300",
};

interface ContributorInfo {
  id: number;
  email: string;
  displayName: string;
  slug: string;
  currentTier: string | null;
}

interface LeaderboardEntry {
  id: number;
  displayName: string;
  slug: string;
  country: string | null;
  currentTier: string | null;
  approvedCount: number;
  lastApproved: string | null;
}

type Step = "check" | "signin" | "submitted_link" | "form" | "success";
type Tab  = "submit" | "leaderboard";

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl">🥇</span>;
  if (rank === 2) return <span className="text-xl">🥈</span>;
  if (rank === 3) return <span className="text-xl">🥉</span>;
  return <span className="text-sm text-muted-foreground font-mono">#{rank}</span>;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function ContributePage() {
  const [, navigate] = useLocation();

  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") === "leaderboard" ? "leaderboard" : "submit";
  });

  function switchTab(t: Tab) {
    setTab(t);
    const url = t === "leaderboard" ? "/contribute?tab=leaderboard" : "/contribute";
    window.history.replaceState(null, "", url);
  }

  // ── Submit tab state ──────────────────────────────────────────────
  const [step, setStep] = useState<Step>("check");
  const [contributor, setContributor] = useState<ContributorInfo | null>(null);

  useEffect(() => {
    fetch(`${API}/contributor-auth/me`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated && d.contributor) {
          setContributor(d.contributor);
          setStep("form");
        } else {
          setStep("signin");
        }
      })
      .catch(() => setStep("signin"));
  }, []);

  // ── Leaderboard tab state ─────────────────────────────────────────
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [lbLoading, setLbLoading] = useState(true);
  const [period, setPeriod] = useState<"all" | "month" | "year">("all");
  const [lbCountry, setLbCountry] = useState("");
  const [subSector, setSubSector] = useState("");
  const [page, setPage] = useState(1);

  const loadLeaderboard = useCallback(async () => {
    setLbLoading(true);
    try {
      const params = new URLSearchParams({ period, page: String(page) });
      if (lbCountry) params.set("country", lbCountry);
      if (subSector) params.set("subSector", subSector);
      const res = await fetch(`${API}/contributors?${params}`);
      const data = await res.json();
      setEntries(data.contributors ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } finally {
      setLbLoading(false);
    }
  }, [period, lbCountry, subSector, page]);

  useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);
  useEffect(() => { setPage(1); }, [period, lbCountry, subSector]);

  const globalOffset = (page - 1) * 25;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-10">

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-xs font-medium text-primary mb-4">
            <Users className="w-3.5 h-3.5" />
            Community Contributors
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-3" style={{ fontFamily: "Syne, sans-serif" }}>
            Africa Energy Community
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mb-5">
            Help track Africa's energy investment landscape by submitting verified deals.
            Every approved submission earns points toward community badges and a place on the leaderboard.
          </p>
          <div className="flex flex-wrap gap-5 mb-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="w-4 h-4 text-primary shrink-0" />
              Two corroborating sources required per submission
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Award className="w-4 h-4 text-primary shrink-0" />
              Bronze (1) → Silver (10) → Gold (50) → Platinum (200)
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Trophy className="w-4 h-4 text-primary shrink-0" />
              Every approved deal climbs the leaderboard
            </div>
          </div>
        </div>

        {/* ── Tab strip ────────────────────────────────────────────── */}
        <div className="flex gap-1 bg-muted/40 border border-border rounded-xl p-1 mb-8 w-fit">
          <button
            onClick={() => switchTab("submit")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              tab === "submit"
                ? "bg-card text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Medal className="w-4 h-4" />
            Submit a Deal
          </button>
          <button
            onClick={() => switchTab("leaderboard")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              tab === "leaderboard"
                ? "bg-card text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Trophy className="w-4 h-4" />
            Leaderboard
          </button>
        </div>

        {/* ── Submit a Deal tab ─────────────────────────────────────── */}
        {tab === "submit" && (
          <div className="max-w-2xl">
            {step === "check" && (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}
            {(step === "signin" || step === "submitted_link") && (
              <SignInStep onLinkSent={() => setStep("submitted_link")} linkSent={step === "submitted_link"} />
            )}
            {step === "form" && contributor && (
              <SubmissionForm
                contributor={contributor}
                onSuccess={() => setStep("success")}
                onSignOut={async () => {
                  await fetch(`${API}/contributor-auth/logout`, { method: "POST", credentials: "include" });
                  setStep("signin");
                  setContributor(null);
                }}
              />
            )}
            {step === "success" && (
              <SuccessScreen onAnother={() => setStep("form")} contributor={contributor} navigate={navigate} />
            )}
          </div>
        )}

        {/* ── Leaderboard tab ──────────────────────────────────────── */}
        {tab === "leaderboard" && (
          <>
            {/* Filters */}
            <div className="bg-card border border-border rounded-xl p-4 mb-6">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex gap-1 bg-background rounded-lg p-1">
                  {(["all", "month", "year"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {p === "all" ? "All time" : p === "month" ? "This month" : "This year"}
                    </button>
                  ))}
                </div>

                <select
                  value={lbCountry}
                  onChange={(e) => setLbCountry(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm"
                >
                  <option value="">All countries</option>
                  {AFRICAN_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>

                <select
                  value={subSector}
                  onChange={(e) => setSubSector(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm"
                >
                  <option value="">All sub-sectors</option>
                  {SUB_SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>

                {(lbCountry || subSector || period !== "all") && (
                  <button
                    onClick={() => { setLbCountry(""); setSubSector(""); setPeriod("all"); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear filters
                  </button>
                )}

                <span className="ml-auto text-xs text-muted-foreground">
                  {total} contributor{total !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
              {lbLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : entries.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">No contributors yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {period !== "all" || lbCountry || subSector
                      ? "Try adjusting your filters"
                      : "Be the first to submit a verified deal"}
                  </p>
                  <button
                    onClick={() => switchTab("submit")}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
                  >
                    Submit a deal <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-border bg-muted/20">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-16">Rank</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Contributor</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Approved</th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Tier</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Last contribution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {entries.map((entry, i) => {
                        const rank = globalOffset + i + 1;
                        const tierColor = TIER_COLORS[entry.currentTier ?? ""] ?? "text-muted-foreground";
                        return (
                          <tr
                            key={entry.id}
                            className="hover:bg-muted/20 cursor-pointer transition-colors"
                            onClick={() => navigate(`/contributors/${entry.slug}`)}
                          >
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-center">
                                <RankBadge rank={rank} />
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                                  {entry.displayName[0].toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-medium text-foreground text-sm">{entry.displayName}</p>
                                  {entry.country && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Globe className="w-3 h-3" />{entry.country}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className="font-bold text-foreground text-lg">{entry.approvedCount}</span>
                            </td>
                            <td className="px-4 py-4 text-center hidden sm:table-cell">
                              <span className={`text-xs font-semibold capitalize ${tierColor}`}>
                                {entry.currentTier ?? "—"}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right hidden md:table-cell">
                              <span className="text-xs text-muted-foreground">{timeAgo(entry.lastApproved)}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-4 py-2 border border-border rounded-lg text-sm text-foreground disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 px-4 py-2 border border-border rounded-lg text-sm text-foreground disabled:opacity-40"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SignInStep({ onLinkSent, linkSent }: { onLinkSent: () => void; linkSent: boolean }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email || !displayName) { setError("Email and display name are required"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/contributor-auth/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, displayName, country: country || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
      onLinkSent();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (linkSent) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2" style={{ fontFamily: "Syne, sans-serif" }}>
          Check your inbox
        </h2>
        <p className="text-muted-foreground text-sm">
          If your email is valid, we've sent a sign-in link. It expires in 15 minutes.
          Click it to return here and submit your deal.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-8">
      <h2 className="text-lg font-semibold text-foreground mb-1" style={{ fontFamily: "Syne, sans-serif" }}>
        Sign in to contribute
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        We'll email you a one-time sign-in link. No password needed.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Display name <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Amara Diallo"
            maxLength={40}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground mt-1">Shown publicly on your contributor profile (2–40 chars)</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Email <span className="text-red-400">*</span></label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Country (optional)</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm"
          >
            <option value="">— Select your country —</option>
            {AFRICAN_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
            <option value="OTHER">Other</option>
          </select>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Send sign-in link
        </button>
      </form>
    </div>
  );
}

function SubmissionForm({
  contributor,
  onSuccess,
  onSignOut,
}: {
  contributor: ContributorInfo;
  onSuccess: () => void;
  onSignOut: () => void;
}) {
  const [form, setForm] = useState({
    projectName: "",
    country: "",
    subSector: "",
    description: "",
    newsUrl: "",
    newsUrl2: "",
    investmentAmountUsdMn: "",
    submitterNote: "",
    website: "",
  });
  const [urlStatus, setUrlStatus] = useState<{ url1?: boolean; url2?: boolean }>({});
  const [urlChecking, setUrlChecking] = useState<{ url1?: boolean; url2?: boolean }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  interface SimilarProject { id: number; project_name: string; country: string; technology: string | null; deal_size_usd_mn: number | null; review_status: string; score: number }
  const [similarProjects, setSimilarProjects] = useState<SimilarProject[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const similarDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (similarDebounce.current) clearTimeout(similarDebounce.current);
    if (form.projectName.length < 4) { setSimilarProjects([]); return; }
    similarDebounce.current = setTimeout(async () => {
      setSimilarLoading(true);
      try {
        const params = new URLSearchParams({ name: form.projectName });
        if (form.country) params.set("country", form.country);
        const res = await fetch(`${API}/projects/similar?${params}`);
        const data = await res.json();
        setSimilarProjects((data.similar ?? []).filter((p: SimilarProject) => p.score >= 50));
      } catch {
        setSimilarProjects([]);
      } finally {
        setSimilarLoading(false);
      }
    }, 500);
    return () => { if (similarDebounce.current) clearTimeout(similarDebounce.current); };
  }, [form.projectName, form.country]);

  function setField(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function checkUrl(field: "url1" | "url2", url: string) {
    if (!url || !url.startsWith("http")) return;
    setUrlChecking((s) => ({ ...s, [field]: true }));
    try {
      const res = await fetch(`${API}/review/test-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      setUrlStatus((s) => ({ ...s, [field]: data.reachable }));
    } catch {
      setUrlStatus((s) => ({ ...s, [field]: false }));
    } finally {
      setUrlChecking((s) => ({ ...s, [field]: false }));
    }
  }

  function getDomain(url: string): string | null {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
  }

  const sameDomain = form.newsUrl && form.newsUrl2 && getDomain(form.newsUrl) === getDomain(form.newsUrl2);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (sameDomain) { setError("Both URLs are from the same domain. Please use two different publications."); return; }
    setLoading(true);
    try {
      const body = {
        projectName: form.projectName,
        country: form.country,
        subSector: form.subSector,
        description: form.description,
        newsUrl: form.newsUrl,
        newsUrl2: form.newsUrl2,
        investmentAmountUsdMn: form.investmentAmountUsdMn ? parseFloat(form.investmentAmountUsdMn) : undefined,
        submitterNote: form.submitterNote || undefined,
        website: form.website,
      };
      const res = await fetch(`${API}/contributions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "duplicate" ? (data.message ?? "This project already exists in our database.") : (data.error ?? "Submission failed. Please try again."));
        return;
      }
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Submitting as <span className="text-primary">{contributor.displayName}</span></p>
          <p className="text-xs text-muted-foreground">{contributor.email}</p>
        </div>
        <button onClick={onSignOut} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Sign out
        </button>
      </div>
      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        <div className="hidden">
          <input name="website" value={form.website} onChange={(e) => setField("website", e.target.value)} tabIndex={-1} autoComplete="off" />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Project name <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={form.projectName}
            onChange={(e) => setField("projectName", e.target.value)}
            placeholder="e.g. Lake Turkana Wind Power Phase 2"
            maxLength={120}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground mt-0.5">{form.projectName.length}/120 chars</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Country <span className="text-red-400">*</span></label>
            <select value={form.country} onChange={(e) => setField("country", e.target.value)} className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm">
              <option value="">— Select country —</option>
              {AFRICAN_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Energy sub-sector <span className="text-red-400">*</span></label>
            <select value={form.subSector} onChange={(e) => setField("subSector", e.target.value)} className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm">
              <option value="">— Select sub-sector —</option>
              {SUB_SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {(similarLoading || similarProjects.length > 0) && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm font-semibold text-amber-400">Similar existing projects</span>
              {similarLoading && <Loader2 className="w-3 h-3 animate-spin text-amber-400" />}
            </div>
            {!similarLoading && (
              <>
                <p className="text-xs text-muted-foreground mb-3">
                  These projects already exist in our database. Please check they are not the same project before submitting.
                </p>
                <div className="flex flex-col gap-2">
                  {similarProjects.map(p => (
                    <a key={p.id} href={`/deals/${p.id}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background border border-border hover:border-amber-500/30 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{p.project_name}</p>
                        <p className="text-xs text-muted-foreground">{p.country}{p.technology ? ` · ${p.technology}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold text-amber-400">{p.score}% match</span>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Short description <span className="text-red-400">*</span></label>
          <textarea
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="Briefly describe the project, investors, capacity, and significance (20–500 chars)"
            maxLength={500} rows={3}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <p className="text-xs text-muted-foreground mt-0.5">{form.description.length}/500 chars</p>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Primary news URL <span className="text-red-400">*</span></label>
          <div className="flex gap-2">
            <input type="url" value={form.newsUrl}
              onChange={(e) => { setField("newsUrl", e.target.value); setUrlStatus((s) => ({ ...s, url1: undefined })); }}
              onBlur={(e) => checkUrl("url1", e.target.value)}
              placeholder="https://..."
              className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {urlChecking.url1  && <Loader2     className="w-4 h-4 animate-spin text-muted-foreground self-center" />}
            {!urlChecking.url1 && urlStatus.url1 === true  && <CheckCircle2 className="w-4 h-4 text-green-400 self-center" />}
            {!urlChecking.url1 && urlStatus.url1 === false && <AlertCircle  className="w-4 h-4 text-red-400 self-center" />}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Corroborating news URL <span className="text-red-400">*</span>
            <span className="text-muted-foreground font-normal ml-1">— must be from a different publication</span>
          </label>
          <div className="flex gap-2">
            <input type="url" value={form.newsUrl2}
              onChange={(e) => { setField("newsUrl2", e.target.value); setUrlStatus((s) => ({ ...s, url2: undefined })); }}
              onBlur={(e) => checkUrl("url2", e.target.value)}
              placeholder="https://..."
              className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {urlChecking.url2  && <Loader2     className="w-4 h-4 animate-spin text-muted-foreground self-center" />}
            {!urlChecking.url2 && urlStatus.url2 === true  && <CheckCircle2 className="w-4 h-4 text-green-400 self-center" />}
            {!urlChecking.url2 && urlStatus.url2 === false && <AlertCircle  className="w-4 h-4 text-red-400 self-center" />}
          </div>
          {sameDomain && (
            <p className="text-xs text-red-400 mt-1">Both URLs are from the same domain. We require two different publications.</p>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Estimated investment (USD millions, optional)</label>
          <input type="number" min="0" step="0.1" value={form.investmentAmountUsdMn}
            onChange={(e) => setField("investmentAmountUsdMn", e.target.value)}
            placeholder="e.g. 125"
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Note to reviewer (optional)</label>
          <textarea
            value={form.submitterNote}
            onChange={(e) => setField("submitterNote", e.target.value)}
            placeholder="Anything the reviewer should know about this submission..."
            maxLength={300} rows={2}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <p className="text-xs text-muted-foreground mt-0.5">{form.submitterNote.length}/300 chars</p>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-400/10 border border-red-400/20 rounded-lg text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <button type="submit" disabled={loading || !!sameDomain}
          className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Submit for review
        </button>

        <p className="text-xs text-muted-foreground text-center">
          Your submission will be reviewed by our team before appearing in the tracker. You'll be able to track its status at{" "}
          <a href="/contributors/me" className="text-primary hover:underline">/contributors/me</a>.
        </p>
      </form>
    </div>
  );
}

function SuccessScreen({
  onAnother,
  contributor,
  navigate,
}: {
  onAnother: () => void;
  contributor: ContributorInfo | null;
  navigate: (path: string) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-10 text-center">
      <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto mb-4" />
      <h2 className="text-2xl font-bold text-foreground mb-2" style={{ fontFamily: "Syne, sans-serif" }}>
        Submission received!
      </h2>
      <p className="text-muted-foreground mb-6">
        Our team will review your submission shortly. Once approved, it will appear in the tracker and your first approval earns you a <span className="text-amber-400 font-medium">Bronze badge</span>.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button onClick={onAnother} className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm">
          Submit another deal
        </button>
        <button onClick={() => navigate("/contributors/me")}
          className="px-6 py-2.5 border border-border text-foreground rounded-lg font-medium text-sm flex items-center justify-center gap-1.5"
        >
          <ExternalLink className="w-4 h-4" />
          View my submissions
        </button>
      </div>
    </div>
  );
}
