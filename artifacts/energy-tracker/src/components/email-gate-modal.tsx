import { useState } from "react";
import { X, Mail, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth";

const API = "/api";

interface EmailGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function EmailGateModal({ isOpen, onClose, onSuccess }: EmailGateModalProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API}/auth/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      login(trimmed);
      onSuccess();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-[#0f1724] border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent mb-5 mx-auto shadow-lg shadow-primary/20">
          <Mail size={22} className="text-[#0b0f1a]" />
        </div>

        <h2 className="text-xl font-bold text-center mb-1">Access the Tracker</h2>
        <p className="text-white/50 text-sm text-center mb-6">
          Enter your email to get free access to AfriEnergy Tracker's full database of Africa energy investment deals.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              inputMode="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
              autoFocus
              disabled={isLoading}
            />
            {error && (
              <p className="mt-2 text-red-400 text-xs">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || !email.trim()}
            className="w-full flex items-center justify-center gap-2 bg-[#00e676] hover:bg-[#00c864] disabled:opacity-50 disabled:cursor-not-allowed text-[#0b0f1a] font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-[#00e676]/20"
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                Get Free Access
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <p className="text-white/25 text-xs text-center mt-4">
          No password required. No spam. Unsubscribe anytime.
        </p>
      </div>
    </div>
  );
}
