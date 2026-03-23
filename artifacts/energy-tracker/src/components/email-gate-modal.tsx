import { useState } from "react";
import { X, Mail, ArrowRight, Loader2, CheckCircle2, ExternalLink } from "lucide-react";

const API = "/api";
const PENDING_REDIRECT_KEY = "afrienergy_pending_redirect";

interface EmailGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  pendingRedirect?: string;
}

export function EmailGateModal({ isOpen, onClose, onSuccess, pendingRedirect }: EmailGateModalProps) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [devLink, setDevLink] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!isOpen) return null;

  function handleClose() {
    setEmail("");
    setError("");
    setDevLink(null);
    setSent(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (pendingRedirect) {
      localStorage.setItem(PENDING_REDIRECT_KEY, pendingRedirect);
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API}/auth/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      const data = await res.json() as { success?: boolean; error?: string; devLink?: string };
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setSent(true);
      if (data.devLink) setDevLink(data.devLink);
      onSuccess?.();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-[#0f1724] border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={handleClose} className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors">
          <X size={18} />
        </button>

        {sent ? (
          <div className="text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-[#00e676]/15 border border-[#00e676]/30 mb-5 mx-auto">
              <CheckCircle2 size={26} className="text-[#00e676]" />
            </div>
            <h2 className="text-xl font-bold mb-2">Check your email</h2>
            <p className="text-white/50 text-sm mb-6">
              We sent a sign-in link to <span className="text-white font-medium">{email}</span>. Click it to access the tracker.
            </p>
            {devLink && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4 text-left">
                <p className="text-[11px] text-[#00e676] font-semibold uppercase tracking-wide mb-2">Dev mode — click to sign in instantly:</p>
                <a
                  href={devLink}
                  className="text-xs text-slate-300 break-all hover:text-white transition-colors flex items-start gap-1.5"
                >
                  <ExternalLink size={12} className="shrink-0 mt-0.5 text-[#00e676]" />
                  {devLink}
                </a>
              </div>
            )}
            <button onClick={handleClose} className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-[#00e676] to-[#00b8d4] mb-5 mx-auto shadow-lg shadow-[#00e676]/20">
              <Mail size={22} className="text-[#0b0f1a]" />
            </div>
            <h2 className="text-xl font-bold text-center mb-1">Access the Tracker</h2>
            <p className="text-white/50 text-sm text-center mb-6">
              Enter your email to get free access. We'll send you a sign-in link — no password needed.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  inputMode="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#00e676]/50 focus:border-[#00e676]/50 transition-all"
                  autoFocus
                  disabled={isLoading}
                />
                {error && <p className="mt-2 text-red-400 text-xs">{error}</p>}
              </div>
              <button
                type="submit"
                disabled={isLoading || !email.trim()}
                className="w-full flex items-center justify-center gap-2 bg-[#00e676] hover:bg-[#00c864] disabled:opacity-50 disabled:cursor-not-allowed text-[#0b0f1a] font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-[#00e676]/20"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <><span>Grant Me Access</span><ArrowRight size={16} /></>}
              </button>
            </form>
            <p className="text-white/25 text-xs text-center mt-4">No password. No spam. Unsubscribe anytime.</p>
          </>
        )}
      </div>
    </div>
  );
}
