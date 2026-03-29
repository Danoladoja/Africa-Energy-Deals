import { useRef, useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, X, Send, RotateCcw, Loader2, Copy, CheckCheck, ExternalLink, AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChat } from "@/contexts/chat-context";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ChatSlideOut({ open, onClose }: Props) {
  const [, navigate] = useLocation();
  const { messages, isStreaming, sendMessage, newConversation, copyLastResponse } = useChat();
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || isStreaming) return;
    setInput("");
    await sendMessage(q);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  }

  function handleCopyLast() {
    copyLastResponse();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="slide-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[1400] bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="slide-panel"
            initial={{ x: "100%", opacity: 0.8 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.8 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="fixed top-0 right-0 bottom-0 z-[1500] w-full max-w-[440px] flex flex-col bg-background border-l border-border shadow-2xl"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-foreground leading-tight">AfriEnergy AI</p>
                    <span className="text-[9px] bg-amber-500/20 text-amber-500 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-semibold">AI</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Powered by Claude · AfriEnergy data</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { onClose(); navigate("/insights"); }}
                  title="Open full Insights page"
                  className="flex items-center gap-1 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-[10px]"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                {messages.length > 0 && (
                  <button
                    onClick={newConversation}
                    title="New conversation"
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {isEmpty ? (
                <SlideOutEmpty onSelect={q => { setInput(""); sendMessage(q); }} />
              ) : (
                <>
                  {messages.map(msg => (
                    msg.role === "user" ? (
                      <div key={msg.id} className="flex justify-end">
                        <div className="max-w-[85%] bg-primary/10 border border-primary/20 rounded-2xl rounded-tr-md px-4 py-2.5">
                          <p className="text-sm text-foreground">{msg.content}</p>
                        </div>
                      </div>
                    ) : (
                      <div key={msg.id} className="flex items-start gap-2.5">
                        <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <Lightbulb className="w-3 h-3 text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`rounded-2xl rounded-tl-md px-4 py-3 ${msg.error ? "bg-red-500/8 border border-red-500/20" : "bg-card border border-border/50"}`}>
                            {msg.isStreaming && !msg.content ? (
                              <div className="flex items-center gap-1.5 py-1">
                                {[0, 1, 2].map(i => (
                                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                                ))}
                              </div>
                            ) : (
                              <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    p: ({ ...p }) => <p className="text-foreground/80 leading-relaxed my-1.5 text-sm" {...p} />,
                                    strong: ({ ...p }) => <strong className="font-semibold text-foreground" {...p} />,
                                    li: ({ ...p }) => <li className="text-foreground/80 my-0.5 text-sm" {...p} />,
                                    h2: ({ ...p }) => <h2 className="text-sm font-bold text-foreground mt-3 mb-1.5" {...p} />,
                                    h3: ({ ...p }) => <h3 className="text-sm font-semibold text-foreground mt-2 mb-1" {...p} />,
                                    table: ({ ...p }) => <div className="overflow-x-auto my-2"><table className="min-w-full text-xs border-collapse" {...p} /></div>,
                                    th: ({ ...p }) => <th className="border border-border/50 bg-muted/50 px-2 py-1.5 text-left font-semibold text-foreground" {...p} />,
                                    td: ({ ...p }) => <td className="border border-border/50 px-2 py-1.5 text-foreground/80" {...p} />,
                                  }}
                                >
                                  {msg.content}
                                </ReactMarkdown>
                                {msg.isStreaming && <span className="inline-block w-1 h-4 bg-primary/70 animate-pulse ml-0.5 rounded-sm" />}
                              </div>
                            )}
                          </div>

                          {/* Compact data badge */}
                          {msg.dataSummary && !msg.isStreaming && (
                            <div className="mt-2 px-3 py-2 rounded-xl bg-muted/30 border border-border/30 text-[10px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                              <span>📋 {msg.dataSummary.projectsAnalyzed} projects</span>
                              <span>💰 {msg.dataSummary.totalInvestment}</span>
                              <span>🌍 {msg.dataSummary.countriesCovered} countries</span>
                              <span className="flex items-center gap-1 text-amber-500/80 w-full mt-0.5"><AlertTriangle className="w-2.5 h-2.5" /> AI analysis — verify critical data</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  ))}
                </>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-border/50 p-4">
              <form onSubmit={handleSubmit}>
                <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all ${input ? "border-primary/50 bg-card shadow-[0_0_0_2px_rgba(0,230,118,0.08)]" : "border-border bg-card"}`}>
                  <Lightbulb className="w-4 h-4 text-amber-500/60 shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about African energy deals, trends…"
                    disabled={isStreaming}
                    className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground/60 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isStreaming}
                    className={`shrink-0 p-1.5 rounded-lg transition-all ${input.trim() && !isStreaming ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground cursor-not-allowed opacity-50"}`}
                  >
                    {isStreaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </form>
              <div className="flex items-center justify-between mt-2 px-0.5">
                <p className="text-[10px] text-muted-foreground/50">
                  <kbd className="bg-muted px-1 py-0.5 rounded text-[9px] font-mono">Esc</kbd> to close ·{" "}
                  <button onClick={() => { onClose(); navigate("/insights"); }} className="underline hover:text-muted-foreground transition-colors">Open full page</button>
                </p>
                {messages.length > 0 && (
                  <button onClick={handleCopyLast} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    {copied ? <CheckCheck className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copied" : "Copy last"}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Empty state for slide-out ─────────────────────────────────────────────────
const SLIDE_SUGGESTED = [
  "Solar deals in West Africa above $100M",
  "Wind projects in South Africa since 2022",
  "IFC-funded projects in East Africa",
  "Give me a market overview",
  "Oil & gas deals in Nigeria over $500M",
  "Compare East Africa vs West Africa solar investment",
];

function SlideOutEmpty({ onSelect }: { onSelect: (q: string) => void }) {
  return (
    <div className="h-full flex flex-col py-2">
      <div className="flex flex-col items-center py-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center mb-4">
          <Lightbulb className="w-7 h-7 text-amber-500" />
        </div>
        <p className="text-sm font-bold text-foreground mb-1.5">AfriEnergy AI Analyst</p>
        <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
          Search deals, analyze trends, compare sectors and regions, or generate intelligence briefings — all grounded in real tracked data.
        </p>
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2 px-1">Try asking…</p>
      <div className="space-y-1.5">
        {SLIDE_SUGGESTED.map(q => (
          <button
            key={q}
            onClick={() => onSelect(q)}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-foreground/80 hover:text-foreground bg-card hover:bg-muted/50 border border-border/50 hover:border-border transition-all text-left group"
          >
            <Lightbulb className="w-3.5 h-3.5 text-amber-500/50 shrink-0 group-hover:text-amber-500/80 transition-colors" />
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
