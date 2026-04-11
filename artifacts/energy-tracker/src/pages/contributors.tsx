import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  Loader2, Trophy, Medal, Users, Globe, ChevronLeft, ChevronRight,
  Award, Zap, ArrowRight
} from "lucide-react";

const API = "/api";

const AFRICAN_COUNTRIES = [
  { code: "DZ", name: "Algeria" }, { code: "AO", name: "Angola" }, { code: "BJ", name: "Benin" },
  { code: "BW", name: "Botswana" }, { code: "BF", name: "Burkina Faso" }, { code: "BI", name: "Burundi" },
  { code: "CM", name: "Cameroon" }, { code: "CV", name: "Cape Verde" }, { code: "CF", name: "Central African Republic" },
  { code: "TD", name: "Chad" }, { code: "CI", name: "Côte d'Ivoire" }, { code: "EG", name: "Egypt" },
  { code: "ET", name: "Ethiopia" }, { code: "GA", name: "Gabon" }, { code: "GH", name: "Ghana" },
  { code: "GN", name: "Guinea" }, { code: "KE", name: "Kenya" }, { code: "LY", name: "Libya" },
  { code: "MG", name: "Madagascar" }, { code: "MW", name: "Malawi" }, { code: "ML", name: "Mali" },
  { code: "MA", name: "Morocco" }, { code: "MZ", name: "Mozambique" }, { code: "NA", name: "Namibia" },
  { code: "NE", name: "Niger" }, { code: "NG", name: "Nigeria" }, { code: "RW", name: "Rwanda" },
  { code: "SN", name: "Senegal" }, { code: "ZA", name: "South Africa" }, { code: "SD", name: "Sudan" },
  { code: "TZ", name: "Tanzania" }, { code: "TG", name: "Togo" }, { code: "TN", name: "Tunisia" },
  { code: "UG", name: "Uganda" }, { code: "ZM", name: "Zambia" }, { code: "ZW", name: "Zimbabwe" },
];

const SUB_SECTORS = ["Solar", "Wind", "Hydro", "Gas", "Oil", "Geothermal", "Transmission", "Storage", "Nuclear", "Other"];

const TIER_COLORS: Record<string, string> = {
  bronze: "text-amber-700",
  silver: "text-slate-400",
  gold: "text-yellow-400",
  platinum: "text-cyan-300",
};

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

interface LeaderboardEntry {
  id: number;
  displayName: string;
  slug: string;
  country: string | null;
  currentTier: string | null;
  approvedCount: number;
  lastApproved: string | null;
}

export default function ContributorsLeaderboardPage() {
  const [, navigate] = useLocation();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"all" | "month" | "year">("all");
  const [country, setCountry] = useState("");
  const [subSector, setSubSector] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period, page: String(page) });
      if (country) params.set("country", country);
      if (subSector) params.set("subSector", subSector);
      const res = await fetch(`${API}/contributors?${params}`);
      const data = await res.json();
      setEntries(data.contributors ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } finally {
      setLoading(false);
    }
  }, [period, country, subSector, page]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [period, country, subSector]);

  const globalOffset = (page - 1) * 25;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Hero */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-xs font-medium text-primary mb-4">
            <Users className="w-3.5 h-3.5" />
            Community Contributors
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-3" style={{ fontFamily: "Syne, sans-serif" }}>
            African Energy Investment<br />Contributor Leaderboard
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mb-6">
            These contributors help track Africa's energy investment landscape by submitting verified deals.
            Every approved submission earns points toward Bronze, Silver, Gold, and Platinum badges.
          </p>
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="w-4 h-4 text-primary" />
              Two corroborating sources required per submission
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Award className="w-4 h-4 text-primary" />
              Bronze (1) → Silver (10) → Gold (50) → Platinum (200)
            </div>
          </div>
          <a
            href="/contribute"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            Submit a deal
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-xl p-4 mb-6">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex gap-1 bg-background rounded-lg p-1">
              {(["all", "month", "year"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {p === "all" ? "All time" : p === "month" ? "This month" : "This year"}
                </button>
              ))}
            </div>

            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
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

            {(country || subSector || period !== "all") && (
              <button
                onClick={() => { setCountry(""); setSubSector(""); setPeriod("all"); }}
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

        {/* Leaderboard Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : entries.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No contributors yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                {period !== "all" || country || subSector
                  ? "Try adjusting your filters"
                  : "Be the first to submit a verified deal"}
              </p>
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
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-4 py-2 border border-border rounded-lg text-sm text-foreground disabled:opacity-40"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
