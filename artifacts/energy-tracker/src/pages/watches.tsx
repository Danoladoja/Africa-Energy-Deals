import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  Bell, Trash2, Loader2, BellOff, Globe, Zap, Building2, Layers,
  Bookmark, BookmarkX, Play, Pencil, Check, X as XIcon, Filter,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { useAuth, authedFetch } from "@/contexts/auth";

const API = "/api";

interface Watch {
  id: number;
  watchType: string;
  watchValue: string;
  lastCheckedAt: string;
  createdAt: string;
}

interface SavedSearch {
  id: number;
  name: string;
  filters: { search?: string; technology?: string; status?: string; country?: string };
  createdAt: string;
  lastUsedAt: string;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  country: Globe,
  technology: Zap,
  developer: Building2,
  dealStage: Layers,
};

const TYPE_LABELS: Record<string, string> = {
  country: "Country",
  technology: "Sector",
  developer: "Investor / Developer",
  dealStage: "Deal Stage",
};

const TYPE_COLORS: Record<string, string> = {
  country: "#38bdf8",
  technology: "#f59e0b",
  developer: "#a855f7",
  dealStage: "#00e676",
};

function filterSummary(f: SavedSearch["filters"]): string {
  const parts: string[] = [];
  if (f.technology) parts.push(`Sector: ${f.technology}`);
  if (f.country)    parts.push(`Country: ${f.country}`);
  if (f.status)     parts.push(`Status: ${f.status}`);
  if (f.search)     parts.push(`"${f.search}"`);
  return parts.join(" · ") || "No filters";
}

function InlineEdit({
  value,
  onSave,
  onCancel,
}: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        ref={ref}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSave(v); if (e.key === "Escape") onCancel(); }}
        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#00e676]/40"
        maxLength={80}
      />
      <button onClick={() => onSave(v)} className="p-1.5 rounded-lg text-[#00e676] hover:bg-[#00e676]/10 transition-colors"><Check className="w-4 h-4" /></button>
      <button onClick={onCancel} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors"><XIcon className="w-4 h-4" /></button>
    </div>
  );
}

export default function WatchesPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<"watches" | "saved">("watches");

  // Watches state
  const [watches, setWatches]       = useState<Watch[]>([]);
  const [watchLoading, setWatchLoading] = useState(true);
  const [deleting, setDeleting]     = useState<number | null>(null);

  // Saved searches state
  const [searches, setSearches]     = useState<SavedSearch[]>([]);
  const [searchLoading, setSearchLoading] = useState(true);
  const [deletingS, setDeletingS]   = useState<number | null>(null);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { navigate("/"); return; }

    authedFetch(`${API}/watches`)
      .then((r) => r.json())
      .then((d: { watches?: Watch[] }) => setWatches(d.watches ?? []))
      .catch(() => {})
      .finally(() => setWatchLoading(false));

    authedFetch(`${API}/watches/mark-seen`, { method: "POST" }).catch(() => {});

    authedFetch(`${API}/saved-searches`)
      .then((r) => r.json())
      .then((d: { savedSearches?: SavedSearch[] }) => setSearches(d.savedSearches ?? []))
      .catch(() => {})
      .finally(() => setSearchLoading(false));
  }, [isAuthenticated, authLoading]);

  async function deleteWatch(id: number) {
    setDeleting(id);
    try {
      await authedFetch(`${API}/watches/${id}`, { method: "DELETE" });
      setWatches((prev) => prev.filter((w) => w.id !== id));
    } catch {}
    finally { setDeleting(null); }
  }

  async function deleteSavedSearch(id: number) {
    setDeletingS(id);
    try {
      await authedFetch(`${API}/saved-searches/${id}`, { method: "DELETE" });
      setSearches((prev) => prev.filter((s) => s.id !== id));
    } catch {}
    finally { setDeletingS(null); setDeleteConfirm(null); }
  }

  async function renameSavedSearch(id: number, name: string) {
    if (!name.trim()) return;
    try {
      const res = await authedFetch(`${API}/saved-searches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (data.savedSearch) {
        setSearches((prev) => prev.map((s) => s.id === id ? { ...s, name: data.savedSearch.name } : s));
      }
    } catch {}
    finally { setEditingId(null); }
  }

  async function applySearch(s: SavedSearch) {
    await authedFetch(`${API}/saved-searches/${s.id}/touch`, { method: "PATCH" }).catch(() => {});
    const p = new URLSearchParams();
    if (s.filters.search)     p.set("search", s.filters.search);
    if (s.filters.technology) p.set("technology", s.filters.technology);
    if (s.filters.status)     p.set("status", s.filters.status);
    if (s.filters.country)    p.set("country", s.filters.country);
    navigate(`/deals${p.toString() ? "?" + p.toString() : ""}`);
  }

  const grouped = watches.reduce<Record<string, Watch[]>>((acc, w) => {
    if (!acc[w.watchType]) acc[w.watchType] = [];
    acc[w.watchType].push(w);
    return acc;
  }, {});

  const loading = tab === "watches" ? watchLoading : searchLoading;

  return (
    <Layout>
      <PageTransition className="max-w-2xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00e676]/15 border border-[#00e676]/30 flex items-center justify-center">
            <Bell className="w-5 h-5 text-[#00e676]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">My Watches</h1>
            <p className="text-sm text-slate-500 mt-0.5">Alerts and saved filter configurations.</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-white/5 mb-6">
          <button
            onClick={() => setTab("watches")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === "watches" ? "border-[#00e676] text-[#00e676]" : "border-transparent text-slate-500 hover:text-slate-300"}`}
          >
            <Bell className="w-4 h-4" />
            Watches
            {watches.length > 0 && <span className="text-xs bg-white/5 px-1.5 py-0.5 rounded-full">{watches.length}</span>}
          </button>
          <button
            onClick={() => setTab("saved")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === "saved" ? "border-[#00e676] text-[#00e676]" : "border-transparent text-slate-500 hover:text-slate-300"}`}
          >
            <Bookmark className="w-4 h-4" />
            Saved Searches
            {searches.length > 0 && <span className="text-xs bg-white/5 px-1.5 py-0.5 rounded-full">{searches.length}</span>}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
          </div>
        ) : tab === "watches" ? (
          /* ─── WATCHES TAB ─── */
          watches.length === 0 ? (
            <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-12 text-center">
              <BellOff className="w-10 h-10 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-300 mb-2">No watches yet</h3>
              <p className="text-sm text-slate-500 mb-6 max-w-xs mx-auto">
                Set up watches on countries, sectors, investors, or deal stages to get email alerts when matching deals are added.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => navigate("/countries")}
                  className="inline-flex items-center gap-2 bg-[#1e293b] border border-white/10 hover:border-[#00e676]/40 hover:text-[#00e676] text-slate-300 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
                >
                  <Globe className="w-4 h-4" /> Browse Countries
                </button>
                <button
                  onClick={() => navigate("/deals")}
                  className="inline-flex items-center gap-2 bg-[#00e676] hover:bg-[#00c864] text-[#0b0f1a] text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
                >
                  Browse Deals
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([type, items]) => {
                const Icon = TYPE_ICONS[type] ?? Bell;
                const color = TYPE_COLORS[type] ?? "#94a3b8";
                return (
                  <div key={type} className="bg-[#1e293b] border border-white/5 rounded-2xl overflow-hidden">
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
                      <Icon className="w-4 h-4" style={{ color }} />
                      <h2 className="text-sm font-semibold">{TYPE_LABELS[type] ?? type}</h2>
                      <span className="ml-auto text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">{items.length}</span>
                    </div>
                    <div className="divide-y divide-white/5">
                      {items.map((watch) => (
                        <div key={watch.id} className="flex items-center justify-between px-5 py-3.5 group">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                            <span className="text-sm font-medium text-slate-200">{watch.watchValue}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-600 hidden sm:block">
                              Since {new Date(watch.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                            <button
                              onClick={() => deleteWatch(watch.id)}
                              disabled={deleting === watch.id}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Remove watch"
                            >
                              {deleting === watch.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-center text-slate-600 pb-4">
                You'll receive email notifications when new deals match your watches.
              </p>
            </div>
          )
        ) : (
          /* ─── SAVED SEARCHES TAB ─── */
          searches.length === 0 ? (
            <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-12 text-center">
              <Bookmark className="w-10 h-10 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-300 mb-2">No saved searches yet</h3>
              <p className="text-sm text-slate-500 mb-6 max-w-xs mx-auto">
                Apply filters on the Deal Tracker and click "Save Search" to save them here.
              </p>
              <button
                onClick={() => navigate("/deals")}
                className="inline-flex items-center gap-2 bg-[#00e676] hover:bg-[#00c864] text-[#0b0f1a] text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
              >
                <Filter className="w-4 h-4" />
                Go to Deal Tracker
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {searches.map((s) => (
                <div key={s.id} className="bg-[#1e293b] border border-white/5 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4">
                    {/* Name row */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      {editingId === s.id ? (
                        <InlineEdit
                          value={s.name}
                          onSave={(v) => renameSavedSearch(s.id, v)}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <>
                          <h3 className="text-sm font-semibold text-slate-100 leading-snug">{s.name}</h3>
                          <button
                            onClick={() => setEditingId(s.id)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors shrink-0"
                            title="Rename"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Filter summary */}
                    <p className="text-xs text-slate-500 mb-3">{filterSummary(s.filters)}</p>

                    {/* Dates */}
                    <div className="flex items-center gap-4 text-[11px] text-slate-600 mb-4">
                      <span>Saved {new Date(s.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                      {s.lastUsedAt !== s.createdAt && (
                        <span>Last used {new Date(s.lastUsedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => applySearch(s)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#00e676] text-[#0b0f1a] hover:bg-[#00c864] transition-colors"
                      >
                        <Play className="w-3 h-3" />
                        Apply
                      </button>

                      {deleteConfirm === s.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-red-400">Delete?</span>
                          <button
                            onClick={() => deleteSavedSearch(s.id)}
                            disabled={deletingS === s.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                          >
                            {deletingS === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, delete"}
                          </button>
                          <button onClick={() => setDeleteConfirm(null)} className="px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-white hover:bg-white/5 transition-colors">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(s.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
                        >
                          <BookmarkX className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <p className="text-xs text-center text-slate-600 pb-4">
                Click "Apply" to jump to the Deal Tracker with those filters active.
              </p>
            </div>
          )
        )}
      </PageTransition>
    </Layout>
  );
}
