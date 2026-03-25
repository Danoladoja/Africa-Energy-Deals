import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, X, ArrowRight, Loader2, MapPin, Zap, TrendingUp,
  MessageSquare, RotateCcw, ExternalLink,
} from "lucide-react";
import type { NlqProject } from "./nlq-search-bar";

const BASE = "/api";

const SUGGESTED = [
  "Solar deals in West Africa above $100M",
  "Wind projects in South Africa since 2022",
  "IFC-funded projects in East Africa",
  "Oil & gas deals in Nigeria over $500M",
  "Grid storage projects commissioned after 2020",
  "Hydro projects with blended finance",
];

function fmt(mn: number | null | undefined) {
  if (!mn) return null;
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  return `$${mn.toFixed(0)}M`;
}

const SECTOR_COLORS: Record<string, string> = {
  Solar: "#facc15", Wind: "#38bdf8", Hydro: "#22d3ee",
  "Grid & Storage": "#a78bfa", "Oil & Gas": "#f87171",
  Coal: "#6b7280", Nuclear: "#fb923c", Bioenergy: "#4ade80",
};

type Message =
  | { role: "user"; text: string }
  | { role: "ai"; summary: string; projects: NlqProject[]; total: number; query: string }
  | { role: "error"; text: string };

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AiAssistant({ open, onClose }: Props) {
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function submit(q: string) {
    const query = q.trim();
    if (!query || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: query }]);
    setLoading(true);

    try {
      const res = await fetch(`${BASE}/nlq`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Query failed");
      setMessages((prev) => [
        ...prev,
        { role: "ai", summary: data.summary, projects: data.projects ?? [], total: data.total ?? 0, query },
      ]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "error", text: err.message ?? "Something went wrong." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit(input);
  }

  function handleDeal(id: number) {
    navigate(`/deals/${id}`);
    onClose();
  }

  function clearChat() {
    setMessages([]);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const isEmpty = messages.length === 0 && !loading;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop (mobile full, desktop subtle) */}
          <motion.div
            key="ai-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[1400] bg-black/40 md:bg-black/20 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="ai-panel"
            initial={{ x: "100%", opacity: 0.8 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.8 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="fixed top-0 right-0 bottom-0 z-[1500] w-full max-w-[440px] flex flex-col bg-[#0d1424] border-l border-white/8 shadow-2xl"
          >
            {/* ── Header ── */}
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/6">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#00e676]/20 to-[#00e676]/5 border border-[#00e676]/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-[#00e676]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">Ask AI</p>
                  <p className="text-[10px] text-slate-500">Powered by Claude · AfriEnergy data</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={clearChat}
                    title="Clear conversation"
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/6 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/6 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ── Messages / Empty state ── */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {isEmpty ? (
                <EmptyState onSelect={(q) => submit(q)} />
              ) : (
                <>
                  {messages.map((msg, i) => (
                    <MessageBubble key={i} message={msg} onDeal={handleDeal} />
                  ))}
                  {loading && <TypingIndicator />}
                </>
              )}
              <div ref={bottomRef} />
            </div>

            {/* ── Input ── */}
            <div className="shrink-0 border-t border-white/6 p-4">
              <form onSubmit={handleSubmit}>
                <div className={`
                  flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all
                  ${input
                    ? "border-[#00e676]/40 bg-white/4 shadow-[0_0_0_2px_rgba(0,230,118,0.08)]"
                    : "border-white/8 bg-white/3"
                  }
                `}>
                  <Sparkles className="w-4 h-4 text-[#00e676]/60 shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask anything about African energy deals…"
                    disabled={loading}
                    className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-slate-600 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || loading}
                    className={`shrink-0 p-1.5 rounded-lg transition-all ${
                      input.trim() && !loading
                        ? "bg-[#00e676] text-[#0b0f1a] hover:bg-[#00ff85]"
                        : "text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    {loading
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <ArrowRight className="w-3.5 h-3.5" />
                    }
                  </button>
                </div>
              </form>
              <p className="text-[10px] text-slate-600 text-center mt-2">
                Press <kbd className="bg-white/8 px-1 py-0.5 rounded text-[9px]">Esc</kbd> to close ·{" "}
                <kbd className="bg-white/8 px-1 py-0.5 rounded text-[9px]">⌘K</kbd> to reopen
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Empty state with suggested queries ────────────────────────────────────────

function EmptyState({ onSelect }: { onSelect: (q: string) => void }) {
  return (
    <div className="h-full flex flex-col justify-between py-2">
      <div>
        <div className="flex flex-col items-center py-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00e676]/15 to-[#00e676]/5 border border-[#00e676]/15 flex items-center justify-center mb-4">
            <Sparkles className="w-7 h-7 text-[#00e676]" />
          </div>
          <p className="text-base font-bold text-white mb-1.5">Ask anything about Africa's energy deals</p>
          <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
            Search across 360+ projects, investors, countries, and financing structures using plain English.
          </p>
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 mb-2 px-1">
          Try asking…
        </p>
        <div className="space-y-1.5">
          {SUGGESTED.map((q) => (
            <button
              key={q}
              onClick={() => onSelect(q)}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-slate-300 hover:text-white bg-white/3 hover:bg-white/6 border border-white/5 hover:border-white/12 transition-all text-left group"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#00e676]/50 shrink-0 group-hover:text-[#00e676]/80 transition-colors" />
              {q}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 px-1">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/2 border border-white/5">
          <TrendingUp className="w-4 h-4 text-slate-500 shrink-0" />
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Searches 500 projects by country, sector, deal size, investor, year, and financing type.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Individual message bubble ─────────────────────────────────────────────────

function MessageBubble({
  message,
  onDeal,
}: {
  message: Message;
  onDeal: (id: number) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-[#00e676]/10 border border-[#00e676]/20 rounded-2xl rounded-tr-md px-4 py-2.5">
          <p className="text-sm text-white">{message.text}</p>
        </div>
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] bg-red-500/8 border border-red-500/20 rounded-2xl rounded-tl-md px-4 py-2.5">
          <p className="text-xs text-red-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            {message.text}
          </p>
        </div>
      </div>
    );
  }

  // AI response
  const { summary, projects, total } = message;
  const shown = projects.slice(0, 8);

  return (
    <div className="flex justify-start">
      <div className="w-full space-y-3">
        {/* AI icon + summary */}
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-[#00e676]/15 border border-[#00e676]/20 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-3 h-3 text-[#00e676]" />
          </div>
          <div className="flex-1 bg-white/3 border border-white/7 rounded-2xl rounded-tl-md px-4 py-3">
            <p className="text-sm text-slate-200 leading-relaxed">{summary}</p>
            {total > 0 && (
              <p className="text-[11px] text-slate-500 mt-1.5 font-medium">
                {total} result{total !== 1 ? "s" : ""} found
              </p>
            )}
          </div>
        </div>

        {/* Deal cards */}
        {shown.length > 0 && (
          <div className="ml-8 space-y-1.5">
            {shown.map((p) => (
              <DealCard key={p.id} project={p} onSelect={() => onDeal(p.id)} />
            ))}
            {total > shown.length && (
              <p className="text-[11px] text-slate-600 px-1 pt-0.5">
                +{total - shown.length} more — refine your query to narrow results
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Deal card ─────────────────────────────────────────────────────────────────

function DealCard({ project: p, onSelect }: { project: NlqProject; onSelect: () => void }) {
  const color = SECTOR_COLORS[p.technology] ?? "#94a3b8";
  const size = fmt(p.dealSizeUsdMn);
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/3 hover:bg-white/6 border border-white/5 hover:border-white/12 transition-all text-left group"
    >
      <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-white transition-colors">
          {p.projectName}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <MapPin className="w-2.5 h-2.5" />{p.country}
          </span>
          <span className="flex items-center gap-1 text-[10px]" style={{ color }}>
            <Zap className="w-2.5 h-2.5" />{p.technology}
          </span>
          {p.announcedYear && (
            <span className="text-[10px] text-slate-600">{p.announcedYear}</span>
          )}
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        {size && <span className="font-mono text-[11px] font-bold text-[#00e676]">{size}</span>}
        <ExternalLink className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-colors" />
      </div>
    </button>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-6 h-6 rounded-lg bg-[#00e676]/15 border border-[#00e676]/20 flex items-center justify-center shrink-0">
        <Sparkles className="w-3 h-3 text-[#00e676]" />
      </div>
      <div className="bg-white/3 border border-white/7 rounded-2xl rounded-tl-md px-4 py-3 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-slate-500"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}
