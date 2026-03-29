import { useState, useRef, useEffect } from "react";
import { Download, FileText, Presentation, ImageIcon, Loader2, ChevronDown } from "lucide-react";

export interface ExportOption {
  id: string;
  label: string;
  description?: string;
  type: "pdf" | "pptx" | "png";
  onExport: () => Promise<void>;
}

interface ExportDropdownProps {
  options: ExportOption[];
  className?: string;
  label?: string;
  size?: "sm" | "md";
}

const TYPE_ICON = {
  pdf:  <FileText className="w-4 h-4 text-red-400 shrink-0" />,
  pptx: <Presentation className="w-4 h-4 text-orange-400 shrink-0" />,
  png:  <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" />,
};

export function ExportDropdown({
  options,
  className = "",
  label = "Export",
  size = "md",
}: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleExport(opt: ExportOption) {
    if (loading) return;
    setOpen(false);
    setLoading(opt.id);
    try {
      await opt.onExport();
      setToast(`${opt.label} downloaded!`);
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.error("Export failed", err);
      setToast("Export failed. Please try again.");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setLoading(null);
    }
  }

  const btnCls =
    size === "sm"
      ? "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
      : "flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all";

  const currentOpt = loading ? options.find((o) => o.id === loading) : null;

  return (
    <>
      <div ref={ref} className={`relative inline-block ${className}`}>
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={!!loading}
          className={btnCls}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span>{loading ? `Generating ${currentOpt?.type?.toUpperCase() ?? "…"}…` : label}</span>
          {!loading && <ChevronDown className="w-3.5 h-3.5 opacity-50" />}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 z-50 bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden min-w-56">
            <div className="px-4 py-2.5 border-b border-border/50">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Download as
              </p>
            </div>
            {options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleExport(opt)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0 text-left group"
              >
                {TYPE_ICON[opt.type]}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {opt.label}
                  </p>
                  {opt.description && (
                    <p className="text-xs text-muted-foreground/60 mt-0.5">{opt.description}</p>
                  )}
                </div>
              </button>
            ))}
            <div className="px-4 py-2 bg-muted/20 border-t border-border/50">
              <p className="text-[9px] text-muted-foreground/50 leading-relaxed">
                Exports include AfriEnergy branding and data sourcing footer.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-card border border-primary/30 rounded-xl shadow-2xl text-sm text-primary animate-in fade-in slide-in-from-bottom-2">
          <Download className="w-4 h-4" />
          {toast}
        </div>
      )}
    </>
  );
}
