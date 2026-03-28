import { useState, useRef, useEffect, useCallback } from "react";
import { Share2, Copy, Check, X, FileDown } from "lucide-react";
import { toPng } from "html-to-image";

/* ── Inline brand icons ───────────────────────────────────────────── */
function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function TwitterXIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.26 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

/* ── Platform config ──────────────────────────────────────────────── */
const PLATFORMS = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: <WhatsAppIcon />,
    bg: "hover:bg-[#25D366]/15 hover:text-[#25D366]",
    getUrl: (text: string, url: string) =>
      `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
  },
  {
    id: "twitter",
    label: "X",
    icon: <TwitterXIcon />,
    bg: "hover:bg-white/10 hover:text-white",
    getUrl: (text: string, url: string) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: <LinkedInIcon />,
    bg: "hover:bg-[#0A66C2]/15 hover:text-[#0A66C2]",
    getUrl: (_: string, url: string) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: <FacebookIcon />,
    bg: "hover:bg-[#1877F2]/15 hover:text-[#1877F2]",
    getUrl: (_: string, url: string) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
];

/* ── Props ────────────────────────────────────────────────────────── */
export interface ShareButtonProps {
  /** Human-readable text sent to platforms */
  text: string;
  /** Page URL to share — defaults to window.location.href */
  url?: string;
  /** Optional chart container ref — enables "Share image" via Web Share API */
  chartRef?: React.RefObject<HTMLDivElement | null>;
  /** Optional PDF generator — adds "Download PDF" option to the dropdown */
  onDownloadPdf?: () => void;
  /** Additional classes on the trigger button */
  className?: string;
  /** Button variant */
  variant?: "icon" | "icon-label";
  /** Stop click from bubbling (e.g. inside a table row) */
  stopPropagation?: boolean;
}

/* ── Component ────────────────────────────────────────────────────── */
export function ShareButton({
  text,
  url,
  chartRef,
  onDownloadPdf,
  className = "",
  variant = "icon",
  stopPropagation = false,
}: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const shareUrl = url ?? (typeof window !== "undefined" ? window.location.href : "");

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  /* Copy link */
  const copyLink = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback: do nothing */
    }
  }, [shareUrl]);

  /* Share chart image via Web Share API, or fall back gracefully */
  const shareChartImage = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!chartRef?.current) return;
    setSharingImage(true);
    try {
      await new Promise(r => setTimeout(r, 100));
      const dataUrl = await toPng(chartRef.current, {
        backgroundColor: "#0B0F19",
        pixelRatio: 2,
        cacheBust: true,
        filter: (node: HTMLElement) => !node.dataset?.noExport,
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], "afrienergy-chart.png", { type: "image/png" });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "AfriEnergy Chart", text });
      } else {
        /* fallback — download */
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "afrienergy-chart.png";
        a.click();
      }
    } catch {
      /* ignore */
    } finally {
      setSharingImage(false);
    }
  }, [chartRef, text]);

  const toggle = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    setOpen(v => !v);
  };

  return (
    <div className="relative inline-block">
      {/* Trigger */}
      <button
        ref={triggerRef}
        onClick={toggle}
        title="Share"
        className={`flex items-center gap-1.5 p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors ${className}`}
      >
        <Share2 className="w-4 h-4" />
        {variant === "icon-label" && <span className="text-sm font-medium">Share</span>}
      </button>

      {/* Popover panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute z-50 right-0 mt-2 bg-card border border-border rounded-2xl shadow-2xl p-3 min-w-[200px]"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Share via</span>
            <button
              onClick={e => { e.stopPropagation(); setOpen(false); }}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Platform buttons */}
          <div className="grid grid-cols-4 gap-1 mb-2">
            {PLATFORMS.map(p => (
              <a
                key={p.id}
                href={p.getUrl(text, shareUrl)}
                target="_blank"
                rel="noopener noreferrer"
                title={p.label}
                onClick={e => e.stopPropagation()}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl text-muted-foreground transition-colors ${p.bg}`}
              >
                {p.icon}
                <span className="text-[9px] font-medium leading-none">{p.label}</span>
              </a>
            ))}
          </div>

          {/* Divider */}
          <div className="h-px bg-border my-2" />

          {/* Copy link */}
          <button
            onClick={copyLink}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-primary shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
            <span>{copied ? "Copied!" : "Copy link"}</span>
          </button>

          {/* Share chart image (only if chartRef provided) */}
          {chartRef && (
            <button
              onClick={shareChartImage}
              disabled={sharingImage}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              <Share2 className="w-4 h-4 shrink-0" />
              <span>{sharingImage ? "Preparing…" : "Share chart image"}</span>
            </button>
          )}

          {/* Download PDF (only if onDownloadPdf provided) */}
          {onDownloadPdf && (
            <>
              <div className="h-px bg-border my-2" />
              <button
                onClick={e => { e.stopPropagation(); onDownloadPdf(); setOpen(false); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-[#00e676] hover:bg-[#00e676]/10 transition-colors"
              >
                <FileDown className="w-4 h-4 shrink-0" />
                <span>Download PDF overview</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
