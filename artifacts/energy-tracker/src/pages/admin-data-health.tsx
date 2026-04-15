import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdminToken } from "@/contexts/admin-auth";
import { 
  AlertTriangle, CheckCircle2, RefreshCw, Wrench, 
  Database, GitBranch, Search, TrendingUp, XCircle,
  ChevronDown, ChevronRight, Copy, ArrowLeft
} from "lucide-react";
import { toast } from "sonner";
import { getTechBadgeClass, getTechColor } from "@/config/technologyConfig";

const API = import.meta.env.VITE_API_URL ?? "/api";

interface HealthSummary {
  nonCanonicalCount: number;
  mismatchCount: number;
  missingDataCount: number;
  duplicateUrlCount: number;
  lastAuditAt: string;
  totalApproved: number;
}

interface MismatchRow {
  id: number;
  project_name: string;
  country: string;
  technology: string;
  deal_size_usd_mn: number | null;
  capacity_mw: number | null;
  review_status: string;
  suggested_technology: string;
}

interface NonCanonicalRow {
  id: number;
  project_name: string;
  country: string;
  technology: string;
  deal_size_usd_mn: number | null;
  review_status: string;
}

interface MissingDataRow {
  id: number;
  project_name: string;
  country: string;
  technology: string;
  review_status: string;
  announced_year: number | null;
}

interface DuplicateUrlRow {
  source_url: string;
  count: number;
  ids: number[];
  names: string[];
  technologies: string[];
  deal_sizes: (number | null)[];
}

interface TechDistRow {
  technology: string;
  review_status: string;
  count: number;
  total_investment_usd_mn: number | null;
}

interface DataHealthResponse {
  summary: HealthSummary;
  nonCanonicalTechnologies: NonCanonicalRow[];
  keywordMismatches: MismatchRow[];
  missingDealAndCapacity: MissingDataRow[];
  duplicateSourceUrls: DuplicateUrlRow[];
  techDistribution: TechDistRow[];
  validTechnologies: string[];
}

function SummaryCard({ label, value, icon: Icon, variant }: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  variant: "ok" | "warn" | "error" | "info";
}) {
  const colors = {
    ok:    "border-emerald-500/30 bg-emerald-900/10 text-emerald-400",
    warn:  "border-amber-500/30 bg-amber-900/10 text-amber-400",
    error: "border-red-500/30 bg-red-900/10 text-red-400",
    info:  "border-blue-500/30 bg-blue-900/10 text-blue-400",
  };
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${colors[variant]}`}>
      <Icon size={20} className="shrink-0" />
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs opacity-70">{label}</div>
      </div>
    </div>
  );
}

function FixButton({ projectId, suggestedTech, onFixed }: { 
  projectId: number; 
  suggestedTech: string; 
  onFixed: () => void; 
}) {
  const [loading, setLoading] = useState(false);

  async function applyFix() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/data-health/fix`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({ id: projectId, technology: suggestedTech }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(`Project #${projectId} updated to ${suggestedTech}`);
      onFixed();
    } catch (e: any) {
      toast.error(`Fix failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={applyFix}
      disabled={loading}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-emerald-900/40 border border-emerald-600/40 text-emerald-300 hover:bg-emerald-800/50 disabled:opacity-50 transition-colors"
    >
      <Wrench size={11} />
      {loading ? "Fixing…" : `Fix → ${suggestedTech}`}
    </button>
  );
}

function CollapsibleSection({ title, count, children, defaultOpen = false, icon: Icon, variant }: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon: React.ElementType;
  variant: "ok" | "warn" | "error";
}) {
  const [open, setOpen] = useState(defaultOpen);
  const colors = {
    ok: "text-emerald-400 border-emerald-800",
    warn: "text-amber-400 border-amber-800",
    error: "text-red-400 border-red-800",
  };
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/4 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon size={16} className={colors[variant]} />
          <span className="font-semibold text-white">{title}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${colors[variant]} ${count === 0 ? "border-emerald-800" : "border-amber-800"}`}>
            {count}
          </span>
        </div>
        {open ? <ChevronDown size={16} className="text-white/40" /> : <ChevronRight size={16} className="text-white/40" />}
      </button>
      {open && <div className="border-t border-white/8 px-5 py-4">{children}</div>}
    </div>
  );
}

function TechBadge({ tech }: { tech: string }) {
  const cls = getTechBadgeClass(tech);
  if (cls !== "bg-gray-100 text-gray-800") {
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{tech}</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 border border-gray-600">{tech}</span>;
}

export default function AdminDataHealth() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<DataHealthResponse, Error>({
    queryKey: ["admin-data-health"],
    queryFn: async () => {
      const res = await fetch(`${API}/admin/data-health`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.status === 401) throw new Error("SESSION_EXPIRED");
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Audit failed (${res.status})${body ? ": " + body : ""}`);
      }
      return res.json();
    },
    staleTime: 60 * 1000,
    retry: false,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-data-health"] });
    refetch();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-60 text-white/40">
        <RefreshCw size={18} className="animate-spin mr-2" />
        Running data audit…
      </div>
    );
  }
  if (isError || !data) {
    const isSessionExpired = (error as Error)?.message === "SESSION_EXPIRED";
    return (
      <div className="flex flex-col items-center gap-4 min-h-60 justify-center">
        <XCircle size={28} className="text-red-400" />
        {isSessionExpired ? (
          <>
            <p className="text-white font-medium">Your admin session has expired.</p>
            <p className="text-white/50 text-sm text-center max-w-sm">
              Please sign out and sign back in using your admin password to continue.
            </p>
            <button
              onClick={() => { window.location.href = "/admin"; }}
              className="px-4 py-2 rounded-lg bg-emerald-900/40 border border-emerald-600/40 text-emerald-300 text-sm hover:bg-emerald-800/50 transition-colors"
            >
              Go to Admin Sign In
            </button>
          </>
        ) : (
          <>
            <p className="text-red-400 font-medium">Audit failed. Check API server logs.</p>
            {error && <p className="text-white/40 text-xs font-mono max-w-md text-center">{(error as Error).message}</p>}
            <button onClick={refresh} className="px-3 py-1 rounded bg-red-900/30 border border-red-700/30 text-sm text-red-300 hover:bg-red-900/50">
              Retry
            </button>
          </>
        )}
      </div>
    );
  }

  const { summary, nonCanonicalTechnologies, keywordMismatches, missingDealAndCapacity, duplicateSourceUrls, techDistribution, validTechnologies } = data;
  const totalIssues = summary.nonCanonicalCount + summary.mismatchCount + summary.duplicateUrlCount;

  // Group tech distribution by technology for the table
  const techGroups = techDistribution.reduce<Record<string, { approved: number; pending: number; needs_source: number; investment: number }>>((acc, r) => {
    if (!acc[r.technology]) acc[r.technology] = { approved: 0, pending: 0, needs_source: 0, investment: 0 };
    const s = r.review_status as "approved" | "pending" | "needs_source";
    if (s === "approved" || s === "pending" || s === "needs_source") acc[r.technology][s] = Number(r.count);
    if (s === "approved") acc[r.technology].investment += Number(r.total_investment_usd_mn ?? 0);
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/6 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Back to Admin Dashboard"
          >
            <ArrowLeft size={15} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Data Health</h1>
            <p className="text-sm text-white/40 mt-0.5">
              Last audit: {new Date(summary.lastAuditAt).toLocaleString()}
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={isFetching}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/6 border border-white/10 text-sm text-white hover:bg-white/10 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          Re-audit
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard label="Approved Projects" value={summary.totalApproved} icon={Database} variant="info" />
        <SummaryCard label="Non-Canonical Tech" value={summary.nonCanonicalCount} icon={AlertTriangle} variant={summary.nonCanonicalCount > 0 ? "error" : "ok"} />
        <SummaryCard label="Name Mismatches" value={summary.mismatchCount} icon={GitBranch} variant={summary.mismatchCount > 0 ? "warn" : "ok"} />
        <SummaryCard label="Missing Data" value={summary.missingDataCount} icon={Search} variant={summary.missingDataCount > 20 ? "warn" : "ok"} />
        <SummaryCard label="Duplicate URLs" value={summary.duplicateUrlCount} icon={Copy} variant={summary.duplicateUrlCount > 0 ? "warn" : "ok"} />
      </div>

      {totalIssues === 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-900/20 border border-emerald-500/30 text-emerald-400">
          <CheckCircle2 size={20} />
          <span className="font-medium">All data passes quality checks. No issues found.</span>
        </div>
      )}

      {/* Non-canonical technologies — highest priority */}
      <CollapsibleSection
        title="Non-Canonical Technology Values"
        count={nonCanonicalTechnologies.length}
        icon={AlertTriangle}
        variant={nonCanonicalTechnologies.length > 0 ? "error" : "ok"}
        defaultOpen={nonCanonicalTechnologies.length > 0}
      >
        {nonCanonicalTechnologies.length === 0 ? (
          <p className="text-emerald-400 text-sm">All technology values are canonical.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-white/50 mb-3">
              These projects have technology values that don't match the canonical list: {validTechnologies.join(", ")}. 
              They are invisible in all charts and filters.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white/40 border-b border-white/8">
                    <th className="text-left py-2 pr-3 font-medium">ID</th>
                    <th className="text-left py-2 pr-3 font-medium">Project</th>
                    <th className="text-left py-2 pr-3 font-medium">Country</th>
                    <th className="text-left py-2 pr-3 font-medium">Technology (invalid)</th>
                    <th className="text-left py-2 pr-3 font-medium">Status</th>
                    <th className="text-left py-2 font-medium">Deal Size</th>
                  </tr>
                </thead>
                <tbody>
                  {nonCanonicalTechnologies.map((r) => (
                    <tr key={r.id} className="border-b border-white/4 hover:bg-white/4">
                      <td className="py-2 pr-3 font-mono text-white/50">#{r.id}</td>
                      <td className="py-2 pr-3 text-white max-w-xs truncate">{r.project_name}</td>
                      <td className="py-2 pr-3 text-white/70">{r.country}</td>
                      <td className="py-2 pr-3 text-red-400 font-medium">{r.technology}</td>
                      <td className="py-2 pr-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${r.review_status === "approved" ? "bg-emerald-900/40 text-emerald-400" : "bg-amber-900/40 text-amber-400"}`}>
                          {r.review_status}
                        </span>
                      </td>
                      <td className="py-2 text-white/60">{r.deal_size_usd_mn ? `$${r.deal_size_usd_mn.toLocaleString()}M` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* Keyword mismatches */}
      <CollapsibleSection
        title="Technology Keyword Mismatches"
        count={keywordMismatches.length}
        icon={GitBranch}
        variant={keywordMismatches.length > 0 ? "warn" : "ok"}
        defaultOpen={keywordMismatches.length > 0}
      >
        {keywordMismatches.length === 0 ? (
          <p className="text-emerald-400 text-sm">No keyword mismatches detected.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-white/50 mb-3">
              Projects where the name strongly indicates a different technology than currently assigned. Use "Fix" to apply the suggested correction.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white/40 border-b border-white/8">
                    <th className="text-left py-2 pr-3 font-medium">ID</th>
                    <th className="text-left py-2 pr-3 font-medium">Project</th>
                    <th className="text-left py-2 pr-3 font-medium">Country</th>
                    <th className="text-left py-2 pr-3 font-medium">Current Tech</th>
                    <th className="text-left py-2 pr-3 font-medium">Suggested</th>
                    <th className="text-left py-2 pr-3 font-medium">Status</th>
                    <th className="text-left py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {keywordMismatches.map((r) => (
                    <tr key={r.id} className="border-b border-white/4 hover:bg-white/4">
                      <td className="py-2 pr-3 font-mono text-white/50">#{r.id}</td>
                      <td className="py-2 pr-3 text-white max-w-xs truncate" title={r.project_name}>{r.project_name}</td>
                      <td className="py-2 pr-3 text-white/70">{r.country}</td>
                      <td className="py-2 pr-3"><TechBadge tech={r.technology} /></td>
                      <td className="py-2 pr-3"><TechBadge tech={r.suggested_technology} /></td>
                      <td className="py-2 pr-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${r.review_status === "approved" ? "bg-emerald-900/40 text-emerald-400" : "bg-amber-900/40 text-amber-400"}`}>
                          {r.review_status}
                        </span>
                      </td>
                      <td className="py-2">
                        <FixButton
                          projectId={r.id}
                          suggestedTech={r.suggested_technology}
                          onFixed={refresh}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* Duplicate source URLs */}
      <CollapsibleSection
        title="Duplicate Source URLs (Potential Duplicates)"
        count={duplicateSourceUrls.length}
        icon={Copy}
        variant={duplicateSourceUrls.length > 0 ? "warn" : "ok"}
        defaultOpen={false}
      >
        {duplicateSourceUrls.length === 0 ? (
          <p className="text-emerald-400 text-sm">No duplicate source URLs found.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-white/50 mb-3">
              Multiple approved projects share the same source URL — likely referring to the same deal. 
              Review via the Duplicate Scanner and merge as appropriate.
            </p>
            {duplicateSourceUrls.slice(0, 20).map((r, i) => (
              <div key={i} className="rounded-lg border border-white/8 bg-white/3 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <Copy size={12} />
                  <span className="truncate max-w-md font-mono">{r.source_url}</span>
                  <span className="shrink-0 text-amber-400 font-medium">{r.count} projects</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.ids.map((id, j) => (
                    <div key={id} className="text-xs bg-white/6 rounded px-2 py-1 flex items-center gap-1">
                      <span className="text-white/40">#{id}</span>
                      <span className="text-white truncate max-w-[200px]">{r.names[j]}</span>
                      <TechBadge tech={r.technologies[j]} />
                      {r.deal_sizes[j] && <span className="text-white/50">${r.deal_sizes[j]}M</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {duplicateSourceUrls.length > 20 && (
              <p className="text-xs text-white/40 text-center">… and {duplicateSourceUrls.length - 20} more. Use Duplicate Scanner for full merge workflow.</p>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* Missing deal size + capacity */}
      <CollapsibleSection
        title="Approved Projects Missing Deal Size AND Capacity"
        count={missingDealAndCapacity.length}
        icon={Search}
        variant="warn"
        defaultOpen={false}
      >
        {missingDealAndCapacity.length === 0 ? (
          <p className="text-emerald-400 text-sm">All approved projects have deal size or capacity data.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-white/50 mb-3">
              These approved projects have neither a deal size nor a capacity figure. They count in totals but contribute nothing to investment charts. Source research recommended.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white/40 border-b border-white/8">
                    <th className="text-left py-2 pr-3 font-medium">ID</th>
                    <th className="text-left py-2 pr-3 font-medium">Project</th>
                    <th className="text-left py-2 pr-3 font-medium">Country</th>
                    <th className="text-left py-2 pr-3 font-medium">Technology</th>
                    <th className="text-left py-2 font-medium">Year</th>
                  </tr>
                </thead>
                <tbody>
                  {missingDealAndCapacity.map((r) => (
                    <tr key={r.id} className="border-b border-white/4 hover:bg-white/4">
                      <td className="py-2 pr-3 font-mono text-white/50">#{r.id}</td>
                      <td className="py-2 pr-3 text-white max-w-xs truncate" title={r.project_name}>{r.project_name}</td>
                      <td className="py-2 pr-3 text-white/70">{r.country}</td>
                      <td className="py-2 pr-3"><TechBadge tech={r.technology} /></td>
                      <td className="py-2 text-white/60">{r.announced_year ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* Technology distribution table */}
      <CollapsibleSection
        title="Technology Distribution (All Statuses)"
        count={Object.keys(techGroups).length}
        icon={TrendingUp}
        variant="ok"
        defaultOpen={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-white/40 border-b border-white/8">
                <th className="text-left py-2 pr-4 font-medium">Technology</th>
                <th className="text-right py-2 pr-4 font-medium text-emerald-400">Approved</th>
                <th className="text-right py-2 pr-4 font-medium text-amber-400">Pending</th>
                <th className="text-right py-2 pr-4 font-medium text-orange-400">Needs Source</th>
                <th className="text-right py-2 font-medium">Total Approved $M</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(techGroups)
                .sort(([, a], [, b]) => b.approved - a.approved)
                .map(([tech, counts]) => (
                  <tr key={tech} className="border-b border-white/4 hover:bg-white/4">
                    <td className="py-2 pr-4">
                      <TechBadge tech={tech} />
                    </td>
                    <td className="py-2 pr-4 text-right text-emerald-400 font-mono">{counts.approved || 0}</td>
                    <td className="py-2 pr-4 text-right text-amber-400 font-mono">{counts.pending || 0}</td>
                    <td className="py-2 pr-4 text-right text-orange-400 font-mono">{counts.needs_source || 0}</td>
                    <td className="py-2 text-right text-white/60 font-mono">
                      {counts.investment > 0 ? `$${counts.investment.toLocaleString(undefined, { maximumFractionDigits: 0 })}M` : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      {/* Canonical technology reference */}
      <div className="rounded-xl border border-white/8 bg-white/3 p-5">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span className="font-semibold text-white text-sm">Canonical Technology Values</span>
        </div>
        <p className="text-xs text-white/40 mb-3">These are the only valid technology values. The API rejects PATCH updates with any other value. The database constraint enforces this at the storage layer.</p>
        <div className="flex flex-wrap gap-2">
          {validTechnologies.map(t => (
            <TechBadge key={t} tech={t} />
          ))}
        </div>
      </div>
    </div>
  );
}
