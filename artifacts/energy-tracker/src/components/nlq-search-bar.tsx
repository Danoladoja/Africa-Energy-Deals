import { useState, useRef, useEffect, type FormEvent } from "react";
import { Sparkles, X, ArrowRight, Loader2 } from "lucide-react";

const EXAMPLE_QUERIES = [
  "Solar deals in West Africa above $100M",
  "Wind projects in South Africa since 2022",
  "Large oil & gas deals in Nigeria",
  "IFC-funded projects in East Africa",
  "Grid storage projects commissioned after 2020",
];

export interface NlqProject {
  id: number;
  projectName: string;
  country: string;
  region: string;
  technology: string;
  dealSizeUsdMn?: number | null;
  status: string;
  dealStage?: string | null;
  investors?: string | null;
  announcedYear?: number | null;
}

export interface NlqResult {
  projects: NlqProject[];
  summary: string;
  filters: Record<string, any>;
  total: number;
}

interface Props {
  /** If provided, submit navigates to this path + ?nlq=<query> instead of showing results inline */
  navigateTo?: (path: string) => void;
  /** Initial query (from URL param) — auto-submits */
  initialQuery?: string;
  /** Called when results come back (inline mode) */
  onResult?: (result: NlqResult | null) => void;
  onLoading?: (v: boolean) => void;
  placeholder?: string;
  className?: string;
  size?: "sm" | "lg";
}

export function NlqSearchBar({
  navigateTo,
  initialQuery = "",
  onResult,
  onLoading,
  placeholder = "Ask anything… e.g., \"Show me wind projects in East Africa over $200M\"",
  className = "",
  size = "lg",
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasAutoSubmitted = useRef(false);

  // Auto-submit if initialQuery provided (from URL param)
  useEffect(() => {
    if (initialQuery && !hasAutoSubmitted.current && !navigateTo) {
      hasAutoSubmitted.current = true;
      submitQuery(initialQuery);
    }
  }, []); // eslint-disable-line

  async function submitQuery(q: string) {
    if (!q.trim()) return;

    // Navigate mode — just redirect
    if (navigateTo) {
      navigateTo(`/deals?nlq=${encodeURIComponent(q.trim())}`);
      return;
    }

    setLoading(true);
    setError(null);
    onLoading?.(true);
    setShowExamples(false);

    try {
      const res = await fetch("/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Query failed");
      onResult?.(data);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
      onResult?.(null);
    } finally {
      setLoading(false);
      onLoading?.(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submitQuery(query);
  }

  const isLg = size === "lg";

  return (
    <div className={`relative ${className}`}>
      <form onSubmit={handleSubmit}>
        <div
          className={`
            relative flex items-center gap-3 rounded-2xl border transition-all duration-300
            ${isLg ? "px-4 py-3.5" : "px-3 py-2.5"}
            ${focused
              ? "border-[#00e676]/50 shadow-[0_0_0_3px_rgba(0,230,118,0.12),0_8px_32px_rgba(0,0,0,0.4)] bg-[rgba(255,255,255,0.05)]"
              : "border-[rgba(0,230,118,0.15)] bg-[rgba(255,255,255,0.03)] shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
            }
            backdrop-blur-sm
          `}
          style={{ backdropFilter: "blur(12px)" }}
        >
          {/* Sparkle icon */}
          <div className={`shrink-0 transition-all duration-200 ${focused ? "text-[#00e676]" : "text-[#00e676]/60"}`}>
            {loading
              ? <Loader2 className={`${isLg ? "w-5 h-5" : "w-4 h-4"} animate-spin`} />
              : <Sparkles className={`${isLg ? "w-5 h-5" : "w-4 h-4"}`} />
            }
          </div>

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => { setFocused(true); setShowExamples(true); }}
            onBlur={() => { setFocused(false); setTimeout(() => setShowExamples(false), 150); }}
            placeholder={loading ? "Searching with AI…" : placeholder}
            disabled={loading}
            className={`
              flex-1 bg-transparent outline-none text-white placeholder:text-slate-500 disabled:opacity-50
              ${isLg ? "text-base" : "text-sm"}
            `}
          />

          {/* Clear button */}
          {query && !loading && (
            <button
              type="button"
              onClick={() => { setQuery(""); onResult?.(null); inputRef.current?.focus(); }}
              className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!query.trim() || loading}
            className={`
              shrink-0 flex items-center gap-1.5 font-semibold rounded-xl transition-all
              ${isLg ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"}
              ${query.trim() && !loading
                ? "bg-[#00e676] text-[#0b0f1a] hover:bg-[#00ff85] shadow-[0_0_12px_rgba(0,230,118,0.3)]"
                : "bg-white/5 text-slate-500 cursor-not-allowed"
              }
            `}
          >
            {loading ? "Searching…" : "Ask AI"}
            {!loading && <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5 px-1">
          <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
          {error}
        </p>
      )}

      {/* Example queries dropdown */}
      {showExamples && !loading && !query && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-[#131b2e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
            Try asking…
          </p>
          {EXAMPLE_QUERIES.map((ex, i) => (
            <button
              key={i}
              onMouseDown={() => { setQuery(ex); submitQuery(ex); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors text-left"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#00e676]/50 shrink-0" />
              {ex}
            </button>
          ))}
          <div className="px-4 py-2.5 border-t border-white/5">
            <p className="text-[10px] text-slate-600">
              Powered by Claude AI · Searches up to 500 projects
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
