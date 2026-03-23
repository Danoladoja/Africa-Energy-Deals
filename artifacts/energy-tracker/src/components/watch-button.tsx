import { useState, useEffect } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { useAuth, authedFetch } from "@/contexts/auth";
import { EmailGateModal } from "./email-gate-modal";

const API = "/api";

interface WatchButtonProps {
  watchType: "country" | "technology" | "developer" | "dealStage";
  watchValue: string;
  label?: string;
  size?: "sm" | "md";
  variant?: "pill" | "icon";
}

export function WatchButton({ watchType, watchValue, label, size = "md", variant = "pill" }: WatchButtonProps) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [watchId, setWatchId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || checked) return;
    setChecked(true);

    authedFetch(`${API}/watches`)
      .then((r) => r.json())
      .then((data: { watches?: Array<{ id: number; watchType: string; watchValue: string }> }) => {
        const match = data.watches?.find(
          (w) => w.watchType === watchType && w.watchValue === watchValue
        );
        if (match) setWatchId(match.id);
      })
      .catch(() => {});
  }, [isAuthenticated, watchType, watchValue, checked]);

  async function toggle() {
    if (authLoading) return;
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    setLoading(true);
    try {
      if (watchId !== null) {
        await authedFetch(`${API}/watches/${watchId}`, { method: "DELETE" });
        setWatchId(null);
      } else {
        const res = await authedFetch(`${API}/watches`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ watchType, watchValue }),
        });
        const data = await res.json() as { watch?: { id: number }; id?: number };
        if (res.ok && data.watch) {
          setWatchId(data.watch.id);
        }
      }
    } catch {}
    finally {
      setLoading(false);
    }
  }

  const isActive = watchId !== null;
  const displayLabel = label ?? `Watch ${watchValue}`;

  if (variant === "icon") {
    return (
      <>
        <button
          onClick={toggle}
          disabled={loading}
          title={isActive ? `Stop watching ${watchValue}` : `Watch ${watchValue}`}
          className={`p-1.5 rounded-lg transition-colors ${
            isActive
              ? "text-[#00e676] bg-[#00e676]/10"
              : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
          }`}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isActive ? (
            <Bell className="w-4 h-4 fill-current" />
          ) : (
            <Bell className="w-4 h-4" />
          )}
        </button>
        <EmailGateModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </>
    );
  }

  const sizeClasses = size === "sm"
    ? "px-3 py-1.5 text-xs gap-1.5"
    : "px-4 py-2 text-sm gap-2";

  return (
    <>
      <button
        onClick={toggle}
        disabled={loading}
        className={`inline-flex items-center rounded-full font-medium border transition-all ${sizeClasses} ${
          isActive
            ? "border-[#00e676]/40 bg-[#00e676]/10 text-[#00e676]"
            : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200"
        }`}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : isActive ? (
          <Bell className="w-3.5 h-3.5 fill-current" />
        ) : (
          <Bell className="w-3.5 h-3.5" />
        )}
        <span>{isActive ? "Watching" : displayLabel}</span>
      </button>
      <EmailGateModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        pendingRedirect={window.location.pathname + window.location.search}
      />
    </>
  );
}
