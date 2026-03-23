import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Bell, Trash2, Loader2, BellOff, Globe, Zap, Building2, Layers } from "lucide-react";
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

export default function WatchesPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [watches, setWatches] = useState<Watch[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/");
      return;
    }

    authedFetch(`${API}/watches`)
      .then((r) => r.json())
      .then((data: { watches?: Watch[] }) => {
        setWatches(data.watches ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    authedFetch(`${API}/watches/mark-seen`, { method: "POST" }).catch(() => {});
  }, [isAuthenticated, authLoading]);

  async function deleteWatch(id: number) {
    setDeleting(id);
    try {
      await authedFetch(`${API}/watches/${id}`, { method: "DELETE" });
      setWatches((prev) => prev.filter((w) => w.id !== id));
    } catch {}
    finally {
      setDeleting(null);
    }
  }

  const grouped = watches.reduce<Record<string, Watch[]>>((acc, w) => {
    if (!acc[w.watchType]) acc[w.watchType] = [];
    acc[w.watchType].push(w);
    return acc;
  }, {});

  return (
    <Layout>
      <PageTransition className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00e676]/15 border border-[#00e676]/30 flex items-center justify-center">
            <Bell className="w-5 h-5 text-[#00e676]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">My Watches</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Get notified when new deals match your interests.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
          </div>
        ) : watches.length === 0 ? (
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
        )}
      </PageTransition>
    </Layout>
  );
}
