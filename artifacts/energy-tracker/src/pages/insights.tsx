import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Lightbulb, TrendingUp, Zap, Globe, BarChart3, GitBranch, Shield,
  Send, Plus, Trash2, Copy, MessageSquare, Newspaper, ChevronRight,
  CheckCheck, AlertTriangle, Loader2, ExternalLink, RotateCcw, X,
  Database, Clock, Download, FileDown,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChat, type InsightContext } from "@/contexts/chat-context";
import { TECHNOLOGY_SECTORS } from "@/config/technologyConfig";
import { SEOMeta } from "@/components/seo-meta";
import { Layout } from "@/components/layout";

const BASE = "/api";

// ── PDF export helper ─────────────────────────────────────────────────────────
function printAsPdf(title: string, markdownContent: string) {
  // Convert basic markdown to HTML for the print window
  const html = markdownContent
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)\s*(?=<li>|$)/g, '$1')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^---+$/gm, '<hr>')
    .replace(/\n\n/g, '</p><p>');

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @media print { body { margin: 0; } }
    body { font-family: 'Manrope', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.75; color: #111;
           max-width: 800px; margin: 32px auto; padding: 0 24px; }
    h1, h2, h3, h4 { font-family: 'Syne', 'Helvetica Neue', Helvetica, Arial, sans-serif; }
    h1 { font-size: 22px; font-weight: 800; border-bottom: 3px solid #10b981; padding-bottom: 10px; margin-bottom: 24px; letter-spacing: -0.5px; }
    h2 { font-size: 17px; font-weight: 700; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-top: 32px; letter-spacing: -0.2px; }
    h3 { font-size: 14px; font-weight: 700; margin-top: 24px; }
    h4 { font-size: 13px; font-weight: 700; margin-top: 18px; }
    p  { margin: 0 0 14px; }
    ul, ol { padding-left: 24px; margin: 12px 0; }
    li { margin: 4px 0; }
    blockquote { border-left: 4px solid #10b981; margin: 16px 0; padding: 8px 16px;
                 background: #f0fdf4; color: #166534; font-style: italic; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
    strong { font-weight: 700; }
    .meta { font-size: 11px; color: #6b7280; margin-bottom: 24px; font-family: 'Manrope', sans-serif; }
    .disclaimer { font-size: 11px; color: #6b7280; border-top: 1px solid #e5e7eb;
                  margin-top: 32px; padding-top: 12px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="meta">AfriEnergy Tracker · Africa Energy Pulse · Generated ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
  <p>${html}</p>
  <div class="disclaimer">⚠️ AI-generated analysis based on AfriEnergy Tracker database. Verify critical figures against primary sources.</div>
  <script>window.onload = () => { window.print(); };<\/script>
</body>
</html>`);
  win.document.close();
}

// ── Countries list ────────────────────────────────────────────────────────────
const COUNTRIES = [
  "Nigeria", "South Africa", "Kenya", "Egypt", "Morocco", "Ethiopia", "Ghana",
  "Tanzania", "Mozambique", "Senegal", "Rwanda", "Uganda", "Zambia", "Zimbabwe",
  "Malawi", "Cameroon", "DRC", "Madagascar", "Cape Verde", "Mali", "Benin",
  "Mauritania", "Côte d'Ivoire",
];

// ── Quick Insight cards ───────────────────────────────────────────────────────
interface QuickCard {
  id: string;
  icon: typeof TrendingUp;
  label: string;
  description: string;
  prompt: string | null;
  needsSector?: boolean;
  needsCountry?: boolean;
  color: string;
}

const QUICK_CARDS: QuickCard[] = [
  {
    id: "market-overview",
    icon: TrendingUp,
    label: "Market Overview",
    description: "Comprehensive African energy investment landscape",
    prompt: "Give me a comprehensive overview of the African energy investment market — total deal volume, leading sectors, key regions, and notable trends from the tracked data.",
    color: "#3b82f6",
  },
  {
    id: "sector-deep-dive",
    icon: Zap,
    label: "Sector Deep Dive",
    description: "Detailed analysis of a specific energy sector",
    prompt: null,
    needsSector: true,
    color: "#f59e0b",
  },
  {
    id: "country-analysis",
    icon: Globe,
    label: "Country Analysis",
    description: "Energy investment landscape for a specific country",
    prompt: null,
    needsCountry: true,
    color: "#10b981",
  },
  {
    id: "investment-trends",
    icon: BarChart3,
    label: "Investment Trends",
    description: "Capital flow patterns and financing structures",
    prompt: "What are the key investment trends and capital flow patterns across African energy? Focus on DFI involvement, blended finance, sector shifts, and year-over-year changes visible in the data.",
    color: "#8b5cf6",
  },
  {
    id: "deal-pipeline",
    icon: GitBranch,
    label: "Deal Pipeline",
    description: "Health and progression of the current deal pipeline",
    prompt: "Assess the health of the current deal pipeline — what's progressing from Announced to Financial Close, what's in Construction, and are there any stalled or delayed projects visible in the data?",
    color: "#06b6d4",
  },
  {
    id: "risk-assessment",
    icon: Shield,
    label: "Risk Assessment",
    description: "Market risks and concentration risks analysis",
    prompt: "What are the biggest market risks and concentration risks in African energy investment? Analyze geographic concentration, sector exposure, and any gaps in financing coverage visible in the data.",
    color: "#ef4444",
  },
];

const SUGGESTED_PROMPTS = [
  "Where is the capital going — which countries are attracting the most investment?",
  "Compare solar vs wind investment across African regions",
  "Which DFIs are most active and in which sectors?",
  "What's the average deal size by sector and region?",
];

// ── Data Provenance Badge ─────────────────────────────────────────────────────
function DataProvenanceBadge({ summary }: { summary: { projectsAnalyzed: number; totalInvestment: string; countriesCovered: number; sectorsCovered: number; queryTimestamp: string } }) {
  return (
    <div className="mt-3 p-3 rounded-xl bg-muted/30 border border-border/50 text-[11px] space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground/70 font-semibold uppercase tracking-wide text-[10px] mb-2">
        <Database className="w-3 h-3" />
        Data Source: AfriEnergy Tracker PostgreSQL
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
        <span>📋 {summary.projectsAnalyzed} projects analyzed</span>
        <span>💰 {summary.totalInvestment} tracked</span>
        <span>🌍 {summary.countriesCovered} countries</span>
        <span>⚡ {summary.sectorsCovered} sectors</span>
      </div>
      <div className="flex items-center gap-1 text-muted-foreground/60 mt-1">
        <Clock className="w-3 h-3" />
        <span>Query: {new Date(summary.queryTimestamp).toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 mt-1">
        <AlertTriangle className="w-3 h-3" />
        <span>AI-generated analysis — verify critical data against source records</span>
      </div>
    </div>
  );
}

// ── Assistant message bubble with markdown ────────────────────────────────────
function AssistantBubble({ message, onCopy }: { message: any; onCopy: () => void }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(message.content).catch(() => {});
    setCopied(true);
    onCopy();
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
        <Lightbulb className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`rounded-2xl rounded-tl-md px-4 py-3.5 ${message.error ? "bg-red-500/8 border border-red-500/20" : "bg-card border border-border/50"}`}>
          {message.isStreaming && !message.content ? (
            <StreamingIndicator />
          ) : (
            <div className={`prose prose-sm dark:prose-invert max-w-none ${message.error ? "text-red-400" : "text-foreground"}`}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ ...props }) => <div className="overflow-x-auto my-3"><table className="min-w-full text-xs border-collapse" {...props} /></div>,
                  th: ({ ...props }) => <th className="border border-border/50 bg-muted/50 px-3 py-2 text-left font-semibold text-foreground" {...props} />,
                  td: ({ ...props }) => <td className="border border-border/50 px-3 py-2 text-foreground/80" {...props} />,
                  h2: ({ ...props }) => <h2 className="text-base font-bold text-foreground mt-4 mb-2" {...props} />,
                  h3: ({ ...props }) => <h3 className="text-sm font-semibold text-foreground mt-3 mb-1.5" {...props} />,
                  strong: ({ ...props }) => <strong className="font-semibold text-foreground" {...props} />,
                  li: ({ ...props }) => <li className="text-foreground/80 my-0.5" {...props} />,
                  p: ({ ...props }) => <p className="text-foreground/80 leading-relaxed my-2" {...props} />,
                  code: ({ ...props }) => <code className="bg-muted/50 px-1.5 py-0.5 rounded text-xs font-mono text-primary" {...props} />,
                }}
              >
                {message.content}
              </ReactMarkdown>
              {message.isStreaming && <span className="inline-block w-1 h-4 bg-primary/70 animate-pulse ml-0.5 rounded-sm" />}
            </div>
          )}
        </div>

        {/* Data provenance badge */}
        {message.dataSummary && !message.isStreaming && (
          <DataProvenanceBadge summary={message.dataSummary} />
        )}

        {/* Actions */}
        {!message.isStreaming && !message.error && message.content && (
          <div className="flex items-center gap-1 mt-2 pl-1">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/50"
            >
              {copied ? <CheckCheck className="w-3 h-3 text-[#00e676]" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={() => printAsPdf("AfriEnergy AI Analysis", message.content)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/50"
              title="Export as PDF"
            >
              <FileDown className="w-3 h-3" />
              Export PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ── Chat Input ────────────────────────────────────────────────────────────────
function ChatInput({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (text.trim() && !disabled) {
        onSend(text.trim());
        setText("");
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim() && !disabled) {
      onSend(text.trim());
      setText("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className={`flex-1 flex items-end gap-2 rounded-2xl border px-4 py-3 transition-all ${text ? "border-primary/50 bg-background shadow-[0_0_0_2px_rgba(0,230,118,0.08)]" : "border-border bg-card"}`}>
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }}
          onKeyDown={handleKeyDown}
          placeholder="Ask about African energy deals, trends, or analysis… (Enter to send, Shift+Enter for new line)"
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground/60 resize-none disabled:opacity-50 leading-relaxed max-h-40"
          style={{ height: "24px" }}
        />
        <button
          type="submit"
          disabled={!text.trim() || disabled}
          className={`shrink-0 p-2 rounded-xl transition-all ${text.trim() && !disabled ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"}`}
        >
          {disabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </form>
  );
}

// ── Card with sector/country dropdown ────────────────────────────────────────
function QuickInsightCard({ card, onSend }: { card: QuickCard; onSend: (prompt: string, ctx?: InsightContext) => void }) {
  const [sector, setSector] = useState("");
  const [country, setCountry] = useState("");
  const Icon = card.icon;

  function handleClick() {
    if (card.needsSector && !sector) return;
    if (card.needsCountry && !country) return;

    let prompt = card.prompt ?? "";
    const ctx: InsightContext = {};

    if (card.needsSector && sector) {
      prompt = `Analyze the ${sector} sector in detail — how many projects, total investment, key investors, leading countries, deal stages, and notable trends visible in the data.`;
      ctx.sector = sector;
    }
    if (card.needsCountry && country) {
      prompt = `Analyze the energy investment landscape in ${country} — total investment, sectors represented, key investors and developers, deal pipeline, and notable patterns visible in the data.`;
      ctx.country = country;
    }

    onSend(prompt, ctx);
  }

  const isReady = (!card.needsSector || !!sector) && (!card.needsCountry || !!country);

  return (
    <button
      onClick={handleClick}
      disabled={!isReady}
      className={`group flex flex-col items-start gap-3 p-4 rounded-2xl border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left disabled:cursor-default ${isReady ? "cursor-pointer" : "opacity-80"}`}
    >
      <div className="flex items-center gap-2.5 w-full">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${card.color}20`, border: `1px solid ${card.color}30` }}>
          <Icon className="w-4 h-4" style={{ color: card.color }} />
        </div>
        <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{card.label}</span>
        {isReady && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 ml-auto group-hover:text-primary transition-colors" />}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>

      {card.needsSector && (
        <select
          value={sector}
          onChange={e => { e.stopPropagation(); setSector(e.target.value); }}
          onClick={e => e.stopPropagation()}
          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-primary/50"
        >
          <option value="">Select sector…</option>
          {TECHNOLOGY_SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {card.needsCountry && (
        <select
          value={country}
          onChange={e => { e.stopPropagation(); setCountry(e.target.value); }}
          onClick={e => e.stopPropagation()}
          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-primary/50"
        >
          <option value="">Select country…</option>
          {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
    </button>
  );
}

// ── Conversation History sidebar ──────────────────────────────────────────────
function HistorySidebar({ onClose }: { onClose?: () => void }) {
  const { conversations, loadConversation, deleteConversation, newConversation, conversationId } = useChat();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <h3 className="text-sm font-semibold text-foreground">History</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={newConversation}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 text-center py-8 px-4">No conversations yet. Start a new one!</p>
        ) : (
          conversations.map(convo => (
            <div
              key={convo.id}
              className={`group flex items-start gap-2 p-2.5 rounded-xl cursor-pointer transition-all hover:bg-muted/50 ${convo.id === conversationId ? "bg-primary/10 border border-primary/20" : "border border-transparent"}`}
              onClick={() => loadConversation(convo.id)}
            >
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{convo.title}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{new Date(convo.date).toLocaleDateString()}</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deleteConversation(convo.id); }}
                className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Newsletter tab ────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type?: string }) {
  if (type === "brief") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-semibold">
        Biweekly Brief
      </span>
    );
  }
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 font-semibold">
      Monthly Report
    </span>
  );
}

function NewsletterTab() {
  const [newsletters, setNewsletters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"all" | "insights" | "brief">("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [expandedContent, setExpandedContent] = useState<Record<number, { content: string; contentHtml?: string }>>({});
  const [subscribeEmail, setSubscribeEmail] = useState("");
  const [subscribeLoading, setSubscribeLoading] = useState(false);
  const [subscribeMsg, setSubscribeMsg] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${BASE}/newsletters?limit=30`)
      .then(r => r.json())
      .then(d => setNewsletters(d.newsletters ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function downloadNlPdf(id: number, title: string) {
    setPdfLoading(id);
    try {
      let cached = expandedContent[id];
      if (!cached) {
        const r = await fetch(`${BASE}/newsletters/${id}`);
        const d = await r.json();
        cached = { content: d.content, contentHtml: d.contentHtml };
        if (cached.content) setExpandedContent(prev => ({ ...prev, [id]: cached }));
      }
      if (cached.content) printAsPdf(title, cached.content);
    } catch {
      // silently fail
    } finally {
      setPdfLoading(null);
    }
  }

  async function loadContent(id: number) {
    if (expandedContent[id]) { setExpanded(id); return; }
    try {
      const r = await fetch(`${BASE}/newsletters/${id}`);
      const d = await r.json();
      setExpandedContent(prev => ({ ...prev, [id]: { content: d.content, contentHtml: d.contentHtml } }));
      setExpanded(id);
    } catch {}
  }

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!subscribeEmail.trim()) return;
    setSubscribeLoading(true);
    try {
      const r = await fetch(`${BASE}/newsletters/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: subscribeEmail.trim() }),
      });
      const d = await r.json();
      if (r.ok) setSubscribeMsg("Subscribed! You'll receive both publications.");
      else setSubscribeMsg(d.error ?? "Failed to subscribe.");
    } catch {
      setSubscribeMsg("Network error. Please try again.");
    } finally {
      setSubscribeLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const filtered = typeFilter === "all" ? newsletters : newsletters.filter(nl => (nl.type ?? "insights") === typeFilter);
  const [latest, ...past] = filtered;

  function renderContent(id: number, nlType?: string) {
    const cached = expandedContent[id];
    if (!cached) return null;
    if (cached.contentHtml) {
      const isBrief = nlType === "brief";
      return (
        <div className="nl-reader-shell rounded-xl overflow-hidden border border-border/20 shadow-md">
          {/* Branded reader header */}
          <div style={{ background: "#080d1a", padding: "14px 28px", display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ color: "#10b981", fontSize: "10px", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase" }}>
              {isBrief ? "AfriEnergy Brief" : "AfriEnergy Insights"}
            </span>
            <span style={{ color: "#1e293b", fontSize: "12px" }}>·</span>
            <span style={{ color: "#475569", fontSize: "11px" }}>
              {isBrief ? "Biweekly Intelligence Update" : "Monthly Intelligence Report"}
            </span>
          </div>
          {/* Light reader body — email HTML rendered at intended white background */}
          <div
            className="nl-reader-body"
            dangerouslySetInnerHTML={{ __html: cached.contentHtml }}
          />
        </div>
      );
    }
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/80">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{cached.content}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Subscribe CTA */}
      <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground mb-1">Subscribe to AfriEnergy Insights</h3>
            <p className="text-xs text-muted-foreground">Monthly deep-dive report (1st Monday) + biweekly AfriEnergy Brief (every other Monday).</p>
          </div>
          {subscribeMsg ? (
            <p className="text-xs text-primary font-medium">{subscribeMsg}</p>
          ) : (
            <form onSubmit={handleSubscribe} className="flex items-center gap-2 shrink-0">
              <input
                type="email"
                value={subscribeEmail}
                onChange={e => setSubscribeEmail(e.target.value)}
                placeholder="your@email.com"
                className="px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 w-48"
              />
              <button
                type="submit"
                disabled={subscribeLoading}
                className="px-3 py-2 text-xs font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {subscribeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Subscribe"}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Publication legend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
            <Newspaper className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-bold text-foreground">AfriEnergy Insights</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Monthly deep-dive · Published 1st Monday of each month · 2,500–3,500 words + charts</p>
          </div>
        </div>
        <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0 mt-0.5">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div>
            <p className="text-xs font-bold text-foreground">AfriEnergy Brief</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Biweekly quick-read · Every other Monday · 600–900 words · 3–5 min read</p>
          </div>
        </div>
      </div>

      {newsletters.length === 0 ? (
        <div className="text-center py-16">
          <Newspaper className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-sm font-medium text-foreground mb-1">No publications yet</h3>
          <p className="text-xs text-muted-foreground">AfriEnergy Insights publishes on the 1st Monday of each month. AfriEnergy Brief publishes every other Monday. Admins can trigger either manually.</p>
        </div>
      ) : (
        <>
          {/* Type filter toggle */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/50 border border-border w-fit">
            {(["all", "insights", "brief"] as const).map(f => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${typeFilter === f ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {f === "all" ? "All" : f === "insights" ? "Monthly Reports" : "Biweekly Briefs"}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-muted-foreground">No {typeFilter === "insights" ? "monthly reports" : "biweekly briefs"} yet.</p>
            </div>
          ) : (
            <>
              {/* Latest edition hero */}
              {latest && (
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border px-6 py-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">Latest Edition</span>
                      <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">#{latest.editionNumber}</span>
                      <TypeBadge type={latest.type} />
                    </div>
                    <h2 className="text-base font-bold text-foreground">{latest.title}</h2>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(latest.generatedAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
                  </div>
                  <div className="px-6 py-4">
                    {latest.executiveSummary && (
                      <p className="text-sm text-foreground/80 leading-relaxed mb-4 line-clamp-4">{latest.executiveSummary}</p>
                    )}
                    {latest.type !== "brief" && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {latest.spotlightSector && <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium">⚡ {latest.spotlightSector}</span>}
                        {latest.spotlightCountry && <span className="text-[11px] px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-medium">🌍 {latest.spotlightCountry}</span>}
                        {latest.projectsAnalyzed && <span className="text-[11px] px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border font-medium">📋 {latest.projectsAnalyzed} projects</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => expanded === latest.id ? setExpanded(null) : loadContent(latest.id)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        {expanded === latest.id ? "Collapse" : "Read Full Edition"}
                      </button>
                      <button
                        onClick={() => downloadNlPdf(latest.id, latest.title)}
                        disabled={pdfLoading === latest.id}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-border text-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-50"
                        title="Download as PDF"
                      >
                        {pdfLoading === latest.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                        Download PDF
                      </button>
                    </div>
                    {expanded === latest.id && expandedContent[latest.id] && (
                      <div className="mt-5 pt-5 border-t border-border/50">
                        {renderContent(latest.id, latest.type)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Past editions */}
              {past.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">Past Editions</h3>
                  <div className="space-y-2">
                    {past.map(nl => (
                      <div key={nl.id} className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground">#{nl.editionNumber}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{nl.title}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-muted-foreground">{new Date(nl.generatedAt).toLocaleDateString()}</span>
                              <TypeBadge type={nl.type} />
                              {nl.type !== "brief" && nl.spotlightSector && <span className="text-[10px] text-amber-600 dark:text-amber-400">⚡ {nl.spotlightSector}</span>}
                              {nl.type !== "brief" && nl.spotlightCountry && <span className="text-[10px] text-blue-600 dark:text-blue-400">🌍 {nl.spotlightCountry}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => expanded === nl.id ? setExpanded(null) : loadContent(nl.id)}
                              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-border text-foreground font-medium hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
                            >
                              {expanded === nl.id ? "Collapse" : "Read"}
                            </button>
                            <button
                              onClick={() => downloadNlPdf(nl.id, nl.title)}
                              disabled={pdfLoading === nl.id}
                              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-50"
                              title="Download PDF"
                            >
                              {pdfLoading === nl.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                        {expanded === nl.id && expandedContent[nl.id] && (
                          <div className="px-4 pb-4 border-t border-border/50 pt-4">
                            {renderContent(nl.id, nl.type)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Insights Page ────────────────────────────────────────────────────────
export default function InsightsPage() {
  const { messages, isStreaming, sendMessage, newConversation, copyLastResponse } = useChat();
  const [activeTab, setActiveTab] = useState<"chat" | "newsletter">("chat");
  const [showHistory, setShowHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isEmpty = messages.length === 0 && !isStreaming;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleSend = useCallback((text: string, context?: InsightContext) => {
    setActiveTab("chat");
    sendMessage(text, context);
  }, [sendMessage]);

  return (
    <Layout>
      <SEOMeta
        title="AI Insights | AfriEnergy Tracker"
        description="AI-powered chatbot for African energy investment intelligence, market analysis, and deal search"
      />

      <div className="flex h-full overflow-hidden">
        {/* ── Main area ─────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Page header */}
          <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border/50 bg-background/50 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
                <Lightbulb className="w-4.5 h-4.5 text-amber-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-foreground">Insights</h1>
                  <span className="text-[10px] bg-amber-500/20 text-amber-500 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-semibold">AI</span>
                </div>
                <p className="text-xs text-muted-foreground">AI-powered intelligence for African energy markets</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && activeTab === "chat" && (
                <button
                  onClick={newConversation}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-border text-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  New Chat
                </button>
              )}
              <button
                onClick={() => setShowHistory(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-border text-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all lg:hidden"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                History
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="shrink-0 flex items-center gap-0 px-6 pt-4 border-b border-border/30">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${activeTab === "chat" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <MessageSquare className="w-4 h-4" />
              Chat
            </button>
            <button
              onClick={() => setActiveTab("newsletter")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${activeTab === "newsletter" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <Newspaper className="w-4 h-4" />
              Newsletter
            </button>
          </div>

          {activeTab === "newsletter" ? (
            /* Newsletter tab */
            <div className="flex-1 overflow-y-auto p-6">
              <NewsletterTab />
            </div>
          ) : (
            /* Chat tab */
            <div className="flex flex-col flex-1 min-h-0">
              {/* Messages or empty state */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                {isEmpty ? (
                  <div className="max-w-2xl mx-auto space-y-6 pt-4">
                    {/* Greeting */}
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                        <Lightbulb className="w-4.5 h-4.5 text-primary" />
                      </div>
                      <div className="flex-1 bg-card border border-border/50 rounded-2xl rounded-tl-md px-5 py-4">
                        <p className="text-sm text-foreground leading-relaxed">
                          I'm your <strong>AfriEnergy AI analyst</strong>. I can search for specific deals, analyze market trends, compare sectors and regions, assess risks, and generate intelligence briefings — all grounded in the actual project data in the AfriEnergy Tracker database.
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">Ask me anything about African energy investment.</p>
                      </div>
                    </div>

                    {/* Quick Insight Cards */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">Quick Insights</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {QUICK_CARDS.map(card => (
                          <QuickInsightCard key={card.id} card={card} onSend={handleSend} />
                        ))}
                      </div>
                    </div>

                    {/* Suggested prompts */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">Suggested Questions</p>
                      <div className="flex flex-wrap gap-2">
                        {SUGGESTED_PROMPTS.map(p => (
                          <button
                            key={p}
                            onClick={() => handleSend(p)}
                            className="px-3.5 py-1.5 text-xs rounded-full border border-border text-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all font-medium"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto space-y-5">
                    {messages.map(msg => (
                      msg.role === "user" ? (
                        <div key={msg.id} className="flex justify-end">
                          <div className="max-w-[80%] bg-primary/10 border border-primary/20 rounded-2xl rounded-tr-md px-4 py-3">
                            <p className="text-sm text-foreground">{msg.content}</p>
                          </div>
                        </div>
                      ) : (
                        <AssistantBubble key={msg.id} message={msg} onCopy={copyLastResponse} />
                      )
                    ))}
                    {messages.length >= 50 && (
                      <div className="text-center py-2">
                        <p className="text-xs text-muted-foreground">This is a long conversation. For best results, consider <button onClick={newConversation} className="text-primary underline">starting a new one</button>.</p>
                      </div>
                    )}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input bar */}
              <div className="shrink-0 border-t border-border/50 px-6 py-4 bg-background/50 backdrop-blur-sm">
                <div className="max-w-3xl mx-auto">
                  <ChatInput onSend={text => handleSend(text)} disabled={isStreaming} />
                  <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
                    Press <kbd className="bg-muted px-1 py-0.5 rounded text-[9px] font-mono">⌘K</kbd> to open from any page · AI analysis is grounded in tracked deal data
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── History sidebar (desktop) ──────────────────────────────────────── */}
        <div className="hidden lg:flex w-72 shrink-0 flex-col border-l border-border/50 bg-card/30">
          <HistorySidebar />
        </div>

        {/* ── History sidebar (mobile overlay) ─────────────────────────────── */}
        {showHistory && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowHistory(false)} />
            <div className="absolute right-0 top-0 bottom-0 w-80 bg-background border-l border-border shadow-2xl flex flex-col">
              <HistorySidebar onClose={() => setShowHistory(false)} />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
