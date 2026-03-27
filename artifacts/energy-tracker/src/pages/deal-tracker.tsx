import { useState, useRef, useEffect, useCallback } from "react";
import { useSearch, useLocation } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { SEOMeta, datasetSchema } from "@/components/seo-meta";
import {
  Search, ChevronLeft, ChevronRight,
  MapPin, ExternalLink, Download, ChevronDown,
  FileText, Sheet, FileJson, Sparkles, X as XIcon,
  GitCompareArrows, Check, Bookmark, BookmarkPlus, BookmarkCheck,
  Clock, ChevronRight as ChevRight, Share2, CheckCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ShareButton } from "@/components/share-button";
import { NlqSearchBar, type NlqResult } from "@/components/nlq-search-bar";
import { useAuth, authedFetch } from "@/contexts/auth";

const SECTOR_COLORS: Record<string, string> = {
  "Solar":          "#facc15",
  "Wind":           "#38bdf8",
  "Hydro":          "#22d3ee",
  "Grid & Storage": "#a78bfa",
  "Oil & Gas":      "#f87171",
  "Coal":           "#6b7280",
  "Nuclear":        "#fb923c",
  "Bioenergy":      "#4ade80",
};
const FALLBACK_SECTOR_COLOR = "#94a3b8";

function dealShareText(project: any) {
  const size = project.dealSizeUsdMn
    ? (project.dealSizeUsdMn >= 1000 ? `$${(project.dealSizeUsdMn / 1000).toFixed(1)}B` : `$${project.dealSizeUsdMn}M`)
    : "undisclosed investment";
  return `🌍 ${project.projectName} — ${size} ${project.technology} project in ${project.country} (${project.status}) | Africa Energy Investment Tracker`;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// Build query string for export endpoint from active filters
function buildExportParams(opts: {
  search: string; technology: string; status: string; country: string;
}) {
  const p = new URLSearchParams();
  if (opts.search)     p.set("search",     opts.search);
  if (opts.technology) p.set("technology", opts.technology);
  if (opts.status)     p.set("status",     opts.status);
  if (opts.country)    p.set("country",    opts.country);
  return p.toString();
}

// ── Export Dropdown ──────────────────────────────────────────────────────────
function ExportDropdown({ filters }: {
  filters: { search: string; technology: string; status: string; country: string };
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<"csv" | "excel" | "pdf" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function fetchAllProjects() {
    const qs = buildExportParams(filters);
    const url = `/api/export?format=json${qs ? "&" + qs : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Export failed");
    return res.json() as Promise<any[]>;
  }

  async function downloadCSV() {
    setLoading("csv");
    setOpen(false);
    try {
      const qs = buildExportParams(filters);
      const url = `/api/export?format=csv${qs ? "&" + qs : ""}`;
      const res = await fetch(url);
      const blob = await res.blob();
      triggerDownload(blob, `africa_energy_projects_${todayStr()}.csv`);
    } finally {
      setLoading(null);
    }
  }

  async function downloadExcel() {
    setLoading("excel");
    setOpen(false);
    try {
      const projects = await fetchAllProjects();
      const XLSX = await import("xlsx");

      const headers = [
        "Project Name", "Country", "Region", "Technology", "Status",
        "Deal Stage", "Deal Size (USD M)", "Capacity (MW)", "Developer",
        "Financiers", "Year Announced", "Latitude", "Longitude", "Description",
      ];
      const rows = projects.map(p => [
        p.projectName, p.country, p.region, p.technology, p.status,
        p.dealStage ?? "", p.dealSizeUsdMn ?? "", p.capacityMw ?? "",
        p.developer ?? "", p.investors ?? "", p.announcedYear ?? "",
        p.latitude ?? "", p.longitude ?? "", p.description ?? "",
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      // Column widths
      ws["!cols"] = [
        { wch: 40 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 14 },
        { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 24 },
        { wch: 40 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 50 },
      ];

      // Bold header row
      headers.forEach((_, i) => {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
        if (ws[cellRef]) ws[cellRef].s = { font: { bold: true } };
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Projects");
      XLSX.writeFile(wb, `africa_energy_projects_${todayStr()}.xlsx`);
    } finally {
      setLoading(null);
    }
  }

  async function downloadPDF() {
    setLoading("pdf");
    setOpen(false);
    try {
      const projects = await fetchAllProjects();
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      // Header bar
      doc.setFillColor(11, 15, 26);
      doc.rect(0, 0, 297, 22, "F");

      // Title
      doc.setTextColor(0, 230, 118);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("AfriEnergy Tracker", 14, 10);

      doc.setTextColor(200, 200, 200);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("Africa Energy Investment Database  |  Africa Energy Pulse", 14, 16);

      // Filter summary
      const activeFilters: string[] = [];
      if (filters.search)     activeFilters.push(`Search: "${filters.search}"`);
      if (filters.technology) activeFilters.push(`Sector: ${filters.technology}`);
      if (filters.status)     activeFilters.push(`Status: ${filters.status}`);
      if (filters.country)    activeFilters.push(`Country: ${filters.country}`);
      const filterText = activeFilters.length
        ? `Filters: ${activeFilters.join(" · ")}`
        : "All projects";

      doc.setTextColor(120, 120, 140);
      doc.setFontSize(7.5);
      doc.text(filterText, 14, 28);
      doc.text(`Exported ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}  ·  ${projects.length} projects`, 14, 33);

      autoTable(doc, {
        startY: 37,
        head: [["Project Name", "Country", "Sector", "Deal Size", "Status", "Deal Stage", "Cap. (MW)", "Year", "Investors"]],
        body: projects.map(p => [
          p.projectName,
          p.country,
          p.technology,
          p.dealSizeUsdMn ? `$${p.dealSizeUsdMn >= 1000 ? (p.dealSizeUsdMn / 1000).toFixed(1) + "B" : p.dealSizeUsdMn + "M"}` : "—",
          p.status,
          p.dealStage ?? "—",
          p.capacityMw ? String(p.capacityMw) : "—",
          p.announcedYear ? String(p.announcedYear) : "—",
          (p.investors ?? "").slice(0, 60) || "—",
        ]),
        styles: {
          fontSize: 7.5,
          cellPadding: 2.5,
          textColor: [220, 220, 230],
          fillColor: [18, 24, 38],
          lineColor: [40, 50, 70],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: [0, 40, 20],
          textColor: [0, 230, 118],
          fontStyle: "bold",
          fontSize: 7.5,
        },
        alternateRowStyles: { fillColor: [22, 30, 46] },
        columnStyles: {
          0: { cellWidth: 48 },
          1: { cellWidth: 20 },
          2: { cellWidth: 20 },
          3: { cellWidth: 18, halign: "right" },
          4: { cellWidth: 20 },
          5: { cellWidth: 22 },
          6: { cellWidth: 16, halign: "right" },
          7: { cellWidth: 12, halign: "center" },
          8: { cellWidth: "auto" },
        },
        margin: { left: 10, right: 10 },
        didDrawPage: (data: any) => {
          // Footer
          doc.setFontSize(6.5);
          doc.setTextColor(80, 80, 100);
          doc.text(
            `Page ${data.pageNumber}  ·  AfriEnergy Tracker — africa-energy-pulse.com`,
            doc.internal.pageSize.getWidth() / 2,
            doc.internal.pageSize.getHeight() - 5,
            { align: "center" }
          );
        },
      });

      doc.save(`africa_energy_projects_${todayStr()}.pdf`);
    } finally {
      setLoading(null);
    }
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isLoading = loading !== null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={isLoading}
        className="flex items-center gap-2 px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/50 transition-all disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {isLoading ? (
          <svg className="w-4 h-4 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <Download className="w-4 h-4" />
        )}
        {isLoading ? (
          <span className="text-primary">
            {loading === "csv" ? "CSV…" : loading === "excel" ? "Excel…" : "PDF…"}
          </span>
        ) : "Export"}
        {!isLoading && <ChevronDown className="w-3.5 h-3.5 opacity-50" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-card-border rounded-xl shadow-2xl overflow-hidden w-48">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Export filtered data
            </p>
          </div>
          <button
            onClick={downloadCSV}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted/60 transition-colors text-left"
          >
            <FileText className="w-4 h-4 text-green-400 shrink-0" />
            <div>
              <div className="font-medium">CSV</div>
              <div className="text-[10px] text-muted-foreground">Spreadsheet-ready</div>
            </div>
          </button>
          <button
            onClick={downloadExcel}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted/60 transition-colors text-left border-t border-border"
          >
            <Sheet className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="font-medium">Excel (.xlsx)</div>
              <div className="text-[10px] text-muted-foreground">With formatting</div>
            </div>
          </button>
          <button
            onClick={downloadPDF}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted/60 transition-colors text-left border-t border-border"
          >
            <FileJson className="w-4 h-4 text-red-400 shrink-0" />
            <div>
              <div className="font-medium">PDF</div>
              <div className="text-[10px] text-muted-foreground">Print-ready report</div>
            </div>
          </button>
          <div className="px-4 py-2 border-t border-border bg-muted/20">
            <p className="text-[9px] text-muted-foreground leading-relaxed">
              Exports up to 500 projects matching current filters.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Deal Size Presets ─────────────────────────────────────────────────────────

const DEAL_SIZE_PRESETS = [
  { id: "",       label: "All Sizes",   min: undefined,  max: undefined  },
  { id: "0-50",   label: "$0 – 50M",   min: 0,          max: 50         },
  { id: "50-200", label: "$50 – 200M", min: 50,         max: 200        },
  { id: "200-1000", label: "$200M – 1B", min: 200,      max: 1000       },
  { id: "1000+",  label: "$1B+",       min: 1000,       max: undefined  },
] as const;

type DealSizePresetId = (typeof DEAL_SIZE_PRESETS)[number]["id"];

// ── Saved Searches ────────────────────────────────────────────────────────────

interface SavedSearch {
  id: number;
  name: string;
  filters: { search?: string; technology?: string; status?: string; country?: string; dealSizePreset?: string };
  createdAt: string;
  lastUsedAt: string;
}

type ActiveFilters = { search: string; technology: string; status: string; country: string; dealSizePreset: string; financingType: string };

function buildDefaultName(f: ActiveFilters): string {
  const parts: string[] = [];
  if (f.technology) parts.push(f.technology);
  if (f.dealSizePreset) {
    const preset = DEAL_SIZE_PRESETS.find((p) => p.id === f.dealSizePreset);
    if (preset) parts.push(preset.label);
  }
  if (f.search)     parts.push(`"${f.search}"`);
  if (f.country)    parts.push(`in ${f.country}`);
  if (f.status)     parts.push(`· ${f.status}`);
  return parts.length ? parts.join(" ") + " deals" : "My search";
}

function filterSummary(f: SavedSearch["filters"]): string {
  const parts: string[] = [];
  if (f.technology) parts.push(`Sector: ${f.technology}`);
  if (f.dealSizePreset) {
    const preset = DEAL_SIZE_PRESETS.find((p) => p.id === f.dealSizePreset);
    if (preset) parts.push(`Size: ${preset.label}`);
  }
  if (f.country)    parts.push(`Country: ${f.country}`);
  if (f.status)     parts.push(`Status: ${f.status}`);
  if (f.search)     parts.push(`"${f.search}"`);
  return parts.join(" · ") || "No filters";
}

function SaveSearchModal({
  filters,
  onClose,
  onSaved,
}: {
  filters: ActiveFilters;
  onClose: () => void;
  onSaved: (s: SavedSearch) => void;
}) {
  const { isAuthenticated } = useAuth();
  const [name, setName] = useState(() => buildDefaultName(filters));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.select(); }, []);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await authedFetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), filters }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Failed to save search. Please try again.");
        return;
      }
      if (data.savedSearch) onSaved(data.savedSearch);
    } catch {
      setSaveError("Failed to save search. Please try again.");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50" data-testid="save-search-modal">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Save this search"
          className="relative bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6 pointer-events-auto"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-[#00e676]/10 border border-[#00e676]/20 flex items-center justify-center">
              <Bookmark className="w-4 h-4 text-[#00e676]" />
            </div>
            <h3 className="text-base font-bold text-white">Save this search</h3>
          </div>

          {!isAuthenticated ? (
            <div className="text-center py-4">
              <p className="text-sm text-slate-400 mb-4">Sign in to save searches and access them later.</p>
              <a href="/energy-tracker/" className="inline-flex items-center gap-2 px-4 py-2 bg-[#00e676] text-[#0b0f1a] text-sm font-semibold rounded-xl hover:bg-[#00c864] transition-colors">
                Sign in
              </a>
            </div>
          ) : (
            <>
              <div className="bg-white/5 rounded-xl px-4 py-2.5 mb-4 text-xs text-slate-500">
                {filterSummary(filters)}
              </div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Name</label>
              <input
                ref={inputRef}
                data-testid="save-search-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#00e676]/40 focus:border-[#00e676]/40 transition-all mb-4"
                placeholder="e.g. Solar deals in Kenya"
                maxLength={80}
              />
              {saveError && (
                <div className="mb-3 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 leading-relaxed">
                  {saveError}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  data-testid="save-search-submit-btn"
                  onClick={handleSave}
                  disabled={saving || !name.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#00e676] text-[#0b0f1a] text-sm font-semibold hover:bg-[#00c864] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  ) : (
                    <BookmarkPlus className="w-4 h-4" />
                  )}
                  Save Search
                </button>
                <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/5 border border-white/10 transition-colors">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MySavedSearchesDropdown({
  searches,
  onApply,
  onDelete,
}: {
  searches: SavedSearch[];
  onApply: (s: SavedSearch) => void;
  onDelete: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleDelete(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await authedFetch(`/api/saved-searches/${id}`, { method: "DELETE" });
      onDelete(id);
    } catch {}
    finally { setDeletingId(null); }
  }

  const MAX = 10;
  const atLimit = searches.length >= MAX;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-background text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/50 transition-all whitespace-nowrap"
      >
        <Bookmark className="w-4 h-4" />
        <span className="hidden sm:inline">My Searches</span>
        {searches.length > 0 && (
          <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">
            {searches.length}
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 opacity-50" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 bg-[#0f172a] border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-72 max-w-sm">
          <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Saved Searches</p>
            {atLimit && (
              <span className="text-[10px] text-amber-400 font-medium">{searches.length}/{MAX} limit reached</span>
            )}
          </div>
          {searches.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Bookmark className="w-6 h-6 text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No saved searches yet.</p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Apply filters and click "Save Search" to bookmark your favourite queries.
              </p>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {searches.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-1 border-b border-white/5 last:border-0 group hover:bg-white/5 transition-colors"
                >
                  <button
                    onClick={() => { onApply(s); setOpen(false); }}
                    className="flex-1 px-4 py-3 text-left"
                  >
                    <p className="text-sm font-medium text-slate-200 group-hover:text-white line-clamp-1">{s.name}</p>
                    <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">{filterSummary(s.filters)}</p>
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, s.id)}
                    disabled={deletingId === s.id}
                    className="shrink-0 mr-3 p-1 rounded text-slate-700 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
                    title="Delete saved search"
                  >
                    {deletingId === s.id
                      ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      : <XIcon className="w-3.5 h-3.5" />
                    }
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Comparison Panel ─────────────────────────────────────────────────────────

type AnyProject = Record<string, any>;

const COMPARE_ROWS: { label: string; key: string; fmt?: (v: any) => string }[] = [
  { label: "Country",        key: "country" },
  { label: "Region",         key: "region" },
  { label: "Sector",         key: "technology" },
  { label: "Deal Size",      key: "dealSizeUsdMn",  fmt: (v) => v ? (v >= 1000 ? `$${(v/1000).toFixed(1)}B` : `$${v}M`) : "—" },
  { label: "Capacity (MW)",  key: "capacityMw",     fmt: (v) => v ? `${v} MW` : "—" },
  { label: "Status",         key: "status",         fmt: (v) => v ?? "—" },
  { label: "Deal Stage",     key: "dealStage",      fmt: (v) => v ?? "—" },
  { label: "Year Announced", key: "announcedYear",  fmt: (v) => v ? String(v) : "—" },
  { label: "Developer",      key: "developer",      fmt: (v) => v ?? "—" },
  { label: "Financiers",     key: "financiers",     fmt: (v) => v ?? "—" },
];

function exportComparisonCSV(deals: AnyProject[]) {
  const headers = ["Attribute", ...deals.map((d) => d.projectName)];
  const rows = COMPARE_ROWS.map(({ label, key, fmt }) => [
    label,
    ...deals.map((d) => {
      const v = d[key];
      return fmt ? fmt(v) : (v ?? "—");
    }),
  ]);
  const lines = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `deal_comparison_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ComparisonPanel({
  deals,
  onClose,
  onNavigate,
}: {
  deals: AnyProject[];
  onClose: () => void;
  onNavigate: (id: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const sizes = deals.map((d) => d.dealSizeUsdMn ?? null).filter(Boolean) as number[];
  const maxSize = sizes.length ? Math.max(...sizes) : null;
  const minSize = sizes.length > 1 ? Math.min(...sizes) : null;

  function dealSizeStyle(val: any) {
    if (!val || sizes.length < 2) return {};
    if (val === maxSize) return { color: "#00e676" };
    if (val === minSize) return { color: "#475569" };
    return {};
  }

  function shareComparison() {
    const ids = deals.map((d) => d.id).join(",");
    const url = `${window.location.origin}${window.location.pathname.replace(/\/deals.*/, "/deals")}?ids=${ids}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Panel slides in from right */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-4xl bg-[#0b0f1a] border-l border-white/10 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <GitCompareArrows className="w-5 h-5 text-[#00e676]" />
            <h2 className="text-lg font-bold text-white">Deal Comparison</h2>
            <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">
              {deals.length} deal{deals.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={shareComparison}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/5 border border-white/10 transition-all"
            >
              {copied ? <CheckCheck className="w-3.5 h-3.5 text-[#00e676]" /> : <Share2 className="w-3.5 h-3.5" />}
              {copied ? "Link copied!" : "Share comparison"}
            </button>
            <button
              onClick={() => exportComparisonCSV(deals)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/5 border border-white/10 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Comparison table */}
        <div className="flex-1 overflow-auto p-6">
          {/* Deal name header row */}
          <div className="grid mb-3" style={{ gridTemplateColumns: `180px repeat(${deals.length}, 1fr)` }}>
            <div />
            {deals.map((d) => {
              const color = SECTOR_COLORS[d.technology] ?? FALLBACK_SECTOR_COLOR;
              return (
                <div key={d.id} className="px-4 pb-3 border-b-2" style={{ borderColor: color }}>
                  <p className="font-bold text-white text-sm leading-tight line-clamp-2">{d.projectName}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs text-slate-400">{d.technology}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Attribute rows */}
          {COMPARE_ROWS.map(({ label, key, fmt }, rowIdx) => (
            <div
              key={key}
              className="grid items-center"
              style={{ gridTemplateColumns: `180px repeat(${deals.length}, 1fr)`, backgroundColor: rowIdx % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}
            >
              <div className="px-2 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
              {deals.map((d) => {
                const raw = d[key];
                const display = fmt ? fmt(raw) : (raw ?? "—");
                const style = key === "dealSizeUsdMn" ? dealSizeStyle(raw) : {};
                return (
                  <div key={d.id} className="px-4 py-3 text-sm font-medium text-slate-200" style={style}>
                    {display === "—" ? <span className="text-slate-600">—</span> : display}
                  </div>
                );
              })}
            </div>
          ))}

          {/* View Details row */}
          <div
            className="grid mt-4 pt-4 border-t border-white/5"
            style={{ gridTemplateColumns: `180px repeat(${deals.length}, 1fr)` }}
          >
            <div />
            {deals.map((d) => (
              <div key={d.id} className="px-4 py-2">
                <button
                  onClick={() => onNavigate(d.id)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium text-[#00e676] border border-[#00e676]/30 hover:bg-[#00e676]/10 transition-colors"
                >
                  View Details
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 shrink-0 flex items-center justify-between">
          <p className="text-xs text-slate-600">
            Deal Size: <span className="text-[#00e676]">▲ highest</span>
            {sizes.length > 1 && <span className="text-slate-600"> · <span className="text-slate-500">lowest</span></span>}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors border border-white/10"
          >
            Close &amp; return to table
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DealTracker() {
  const rawSearch = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(rawSearch);
  const initialSearch     = params.get("search")     ?? "";
  const initialCountry    = params.get("country")    ?? "";
  const initialTechnology = params.get("technology") ?? "";
  const initialNlq        = params.get("nlq")        ?? "";

  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState(initialSearch);
  const [country, setCountry]         = useState(initialCountry);
  const [status, setStatus]           = useState("");
  const [technology, setTechnology]   = useState(initialTechnology);
  const [dealSizePreset, setDealSizePreset] = useState<DealSizePresetId>("");
  const [financingType, setFinancingType] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);

  // NLQ state
  const [nlqResult, setNlqResult]     = useState<NlqResult | null>(null);
  const [nlqLoading, setNlqLoading]   = useState(false);
  const nlqMode = nlqResult !== null || nlqLoading;

  // Saved searches state
  const { isAuthenticated } = useAuth();
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveToast, setSaveToast]         = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    authedFetch("/api/saved-searches")
      .then((r) => r.json())
      .then((d: { savedSearches?: SavedSearch[] }) => setSavedSearches(d.savedSearches ?? []))
      .catch(() => {});
  }, [isAuthenticated]);

  function applySearch(s: SavedSearch) {
    setSearch(s.filters.search ?? "");
    setDebouncedSearch(s.filters.search ?? "");
    setTechnology(s.filters.technology ?? "");
    setStatus(s.filters.status ?? "");
    setCountry(s.filters.country ?? "");
    setDealSizePreset((s.filters.dealSizePreset ?? "") as DealSizePresetId);
    setPage(1);
    authedFetch(`/api/saved-searches/${s.id}/touch`, { method: "PATCH" }).catch(() => {});
    setSavedSearches((prev) =>
      prev.map((x) => x.id === s.id ? { ...x, lastUsedAt: new Date().toISOString() } : x)
        .sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime())
    );
  }

  function handleSearchSaved(saved: SavedSearch) {
    setSaveModalOpen(false);
    setSavedSearches((prev) => [saved, ...prev]);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  }

  // Deal comparison selection state
  const [selectedDeals, setSelectedDeals] = useState<Map<number, AnyProject>>(new Map());
  const [compareOpen, setCompareOpen]     = useState(false);
  const [maxToast, setMaxToast]           = useState(false);

  // Pre-select a deal from URL param ?compareId=X (coming from deal detail page)
  const preSelectId = params.get("compareId") ? Number(params.get("compareId")) : null;
  const { data: preSelectProject } = useQuery({
    queryKey: ["project-preselect", preSelectId],
    queryFn: async () => {
      if (!preSelectId) return null;
      const r = await fetch(`/api/projects/${preSelectId}`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!preSelectId,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (preSelectProject && !selectedDeals.has(preSelectProject.id)) {
      setSelectedDeals((prev) => new Map(prev).set(preSelectProject.id, preSelectProject));
    }
  }, [preSelectProject]);

  // Deep-link: ?ids=1,5,23 — fetch all those deals, populate tray, auto-open comparison
  const deepLinkIds = params.get("ids")
    ? params.get("ids")!.split(",").map(Number).filter((n) => !isNaN(n) && n > 0).slice(0, 3)
    : [];
  const { data: deepLinkProjects } = useQuery({
    queryKey: ["project-deeplink", deepLinkIds.join(",")],
    queryFn: async () => {
      if (!deepLinkIds.length) return [];
      const results = await Promise.all(
        deepLinkIds.map(async (id) => {
          const r = await fetch(`/api/projects/${id}`);
          return r.ok ? r.json() : null;
        })
      );
      return results.filter(Boolean);
    },
    enabled: deepLinkIds.length > 0,
    staleTime: Infinity,
  });
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (!deepLinkProjects || deepLinkProjects.length === 0 || deepLinkApplied.current) return;
    deepLinkApplied.current = true;
    const map = new Map<number, AnyProject>();
    deepLinkProjects.forEach((p: AnyProject) => map.set(p.id, p));
    setSelectedDeals(map);
    if (deepLinkProjects.length >= 2) setCompareOpen(true);
  }, [deepLinkProjects]);

  const toggleSelect = useCallback((project: AnyProject, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDeals((prev) => {
      const next = new Map(prev);
      if (next.has(project.id)) {
        next.delete(project.id);
      } else if (next.size >= 3) {
        setMaxToast(true);
        setTimeout(() => setMaxToast(false), 3000);
        return prev;
      } else {
        next.set(project.id, project);
      }
      return next;
    });
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setTimeout(() => setDebouncedSearch(e.target.value), 500);
  };

  const activeSizePreset = DEAL_SIZE_PRESETS.find((p) => p.id === dealSizePreset) ?? DEAL_SIZE_PRESETS[0];

  const { data, isLoading } = useListProjects({
    page,
    limit: 15,
    search: debouncedSearch || undefined,
    status: status || undefined,
    technology: technology || undefined,
    country: country || undefined,
    minDealSize: activeSizePreset.min,
    maxDealSize: activeSizePreset.max,
    financingType: financingType || undefined,
  });

  const activeFilters: ActiveFilters = { search: debouncedSearch, technology, status, country, dealSizePreset, financingType };
  const hasActiveFilters = !!(debouncedSearch || technology || status || country || dealSizePreset || financingType);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'operational': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'construction': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'announced': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'cancelled': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  return (
    <Layout>
      <SEOMeta
        title="Deal Tracker"
        description="Search and filter 123+ African energy investment deals. Filter by country, technology, status, and deal size across solar, wind, hydro, gas and more."
        url="/deals"
        jsonLd={datasetSchema()}
      />
      <PageTransition className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">

        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Deal Tracker</h1>
            <p className="text-muted-foreground text-base md:text-lg">Search and filter through the complete database of energy transactions.</p>
          </div>
          <div className="hidden md:flex items-center gap-2 shrink-0 mt-1">
            <MySavedSearchesDropdown
              searches={savedSearches}
              onApply={applySearch}
              onDelete={(id) => setSavedSearches((prev) => prev.filter((s) => s.id !== id))}
            />
            <ExportDropdown filters={activeFilters} />
          </div>
        </header>

        {/* ── AI Search Bar ── */}
        <div className="mb-4">
          <NlqSearchBar
            initialQuery={initialNlq}
            onResult={(r) => { setNlqResult(r); }}
            onLoading={setNlqLoading}
            placeholder='Ask AI… e.g., "Solar deals in Nigeria above $50M since 2021"'
            size="sm"
          />
        </div>

        {/* ── NLQ Results Banner + Table ── */}
        {nlqMode && (
          <div className="mb-6">
            {/* Summary banner */}
            {nlqResult && (
              <div className="flex items-start gap-3 bg-[#001a0a] border border-[#00e676]/20 rounded-2xl px-5 py-4 mb-4">
                <Sparkles className="w-4 h-4 text-[#00e676] mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#00e676]/90 leading-relaxed">{nlqResult.summary}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {nlqResult.total === 0
                      ? "No projects matched"
                      : `${nlqResult.total} project${nlqResult.total !== 1 ? "s" : ""} matched`}
                    {Object.entries(nlqResult.filters)
                      .filter(([, v]) => v != null)
                      .map(([k, v]) => ` · ${k}: ${v}`)
                      .join("")}
                  </p>
                </div>
                <button
                  onClick={() => setNlqResult(null)}
                  className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors p-1"
                  title="Clear AI results"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* NLQ results table */}
            {nlqLoading ? (
              <div className="bg-card border border-card-border rounded-2xl p-8 flex items-center justify-center gap-3 text-muted-foreground">
                <svg className="w-5 h-5 animate-spin text-[#00e676]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">Searching with AI…</span>
              </div>
            ) : nlqResult && nlqResult.total === 0 ? (
              <div className="bg-card border border-card-border rounded-2xl p-8 text-center">
                <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No projects matched your query. Try broadening your search.</p>
              </div>
            ) : nlqResult && nlqResult.projects.length > 0 ? (
              <div className="bg-card border border-card-border rounded-2xl overflow-hidden hidden md:block">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-background/50 border-b border-border text-muted-foreground text-sm">
                      <th className="font-semibold py-3 px-5">Project Name</th>
                      <th className="font-semibold py-3 px-5">Country</th>
                      <th className="font-semibold py-3 px-5">Sector</th>
                      <th className="font-semibold py-3 px-5">Deal Size</th>
                      <th className="font-semibold py-3 px-5">Status</th>
                      <th className="font-semibold py-3 px-5 text-right">Year</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {nlqResult.projects.slice().reverse().map((p) => (
                      <tr
                        key={p.id}
                        className="hover:bg-muted/30 transition-colors cursor-pointer group"
                        onClick={() => navigate(`/deals/${p.id}`)}
                      >
                        <td className="py-3 px-5 font-medium text-foreground">{p.projectName}</td>
                        <td className="py-3 px-5 text-muted-foreground text-sm">{p.country}</td>
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SECTOR_COLORS[p.technology] ?? FALLBACK_SECTOR_COLOR }} />
                            {p.technology}
                          </div>
                        </td>
                        <td className="py-3 px-5 font-mono text-sm">
                          {p.dealSizeUsdMn
                            ? p.dealSizeUsdMn >= 1000 ? `$${(p.dealSizeUsdMn / 1000).toFixed(1)}B` : `$${p.dealSizeUsdMn}M`
                            : "—"}
                        </td>
                        <td className="py-3 px-5">
                          <Badge variant="outline" className={getStatusColor(p.status)}>{p.status}</Badge>
                        </td>
                        <td className="py-3 px-5 text-right text-sm text-muted-foreground font-mono">
                          {p.announcedYear ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {/* Mobile NLQ cards */}
            {!nlqLoading && nlqResult && nlqResult.projects.length > 0 && (
              <div className="flex flex-col gap-3 md:hidden">
                {nlqResult.projects.slice().reverse().map((p) => (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/deals/${p.id}`)}
                    className="bg-card border border-card-border rounded-xl p-4 cursor-pointer hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-sm leading-tight flex-1">{p.projectName}</h3>
                      <Badge variant="outline" className={`${getStatusColor(p.status)} text-xs shrink-0`}>{p.status}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{p.country}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SECTOR_COLORS[p.technology] ?? FALLBACK_SECTOR_COLOR }} />
                        {p.technology}
                      </span>
                      {p.dealSizeUsdMn && (
                        <span className="font-mono font-semibold text-foreground">
                          {p.dealSizeUsdMn >= 1000 ? `$${(p.dealSizeUsdMn/1000).toFixed(1)}B` : `$${p.dealSizeUsdMn}M`}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Regular Filters (shown when not in NLQ mode) ── */}
        {!nlqMode && (
          <>
        {/* Filters */}
        <div className="flex flex-col gap-3 mb-6 bg-card p-4 rounded-2xl border border-card-border shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <input
              type="text"
              placeholder="Search projects, investors..."
              value={search}
              onChange={handleSearchChange}
              className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>

          <div className="flex gap-3 flex-wrap">
            <select
              value={technology}
              onChange={(e) => { setTechnology(e.target.value); setPage(1); }}
              className="flex-1 min-w-32 bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
            >
              <option value="">All Sectors</option>
              <option value="Solar">Solar</option>
              <option value="Wind">Wind</option>
              <option value="Hydro">Hydro</option>
              <option value="Geothermal">Geothermal</option>
              <option value="Oil & Gas">Oil &amp; Gas</option>
              <option value="Grid Expansion">Grid Expansion</option>
              <option value="Battery & Storage">Battery &amp; Storage</option>
              <option value="Hydrogen">Hydrogen</option>
              <option value="Nuclear">Nuclear</option>
              <option value="Bioenergy">Bioenergy</option>
              <option value="Clean Cooking">Clean Cooking</option>
              <option value="Coal">Coal</option>
            </select>

            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="flex-1 min-w-32 bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
            >
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Completed">Completed</option>
              <option value="Development">Development</option>
              <option value="Operational">Operational</option>
              <option value="Proposed">Proposed</option>
              <option value="Suspended">Suspended</option>
              <option value="Under Construction">Under Construction</option>
            </select>

            <select
              value={dealSizePreset}
              onChange={(e) => { setDealSizePreset(e.target.value as DealSizePresetId); setPage(1); }}
              className="flex-1 min-w-32 bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
            >
              {DEAL_SIZE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
            </select>

            <select
              value={financingType}
              onChange={(e) => { setFinancingType(e.target.value); setPage(1); }}
              className="flex-1 min-w-32 bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
            >
              <option value="">All Financing</option>
              <option value="Project Finance">Project Finance</option>
              <option value="Blended Finance">Blended Finance</option>
              <option value="Concessional Loan">Concessional Loan</option>
              <option value="Grant / Donor Funding">Grant / Donor</option>
              <option value="IPP / Concession">IPP / Concession</option>
              <option value="Corporate Finance">Corporate Finance</option>
              <option value="Green / Climate Bond">Green Bond</option>
              <option value="Sovereign Lending">Sovereign Lending</option>
            </select>

            {/* Export on mobile — inline with filters */}
            <div className="md:hidden">
              <ExportDropdown filters={activeFilters} />
            </div>
          </div>

          {/* Active filter chips (from URL params / heatmap navigation) */}
          {(country || (initialTechnology && technology === initialTechnology)) && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {country && (
                <span className="flex items-center gap-1.5 text-xs bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-full">
                  <MapPin className="w-3 h-3" />
                  {country}
                  <button onClick={() => setCountry("")} className="hover:text-red-400 ml-0.5">×</button>
                </span>
              )}
              {technology && (
                <span
                  className="flex items-center gap-1.5 text-xs border px-2.5 py-1 rounded-full"
                  style={{
                    backgroundColor: `${SECTOR_COLORS[technology] ?? FALLBACK_SECTOR_COLOR}20`,
                    color: SECTOR_COLORS[technology] ?? FALLBACK_SECTOR_COLOR,
                    borderColor: `${SECTOR_COLORS[technology] ?? FALLBACK_SECTOR_COLOR}40`,
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: SECTOR_COLORS[technology] ?? FALLBACK_SECTOR_COLOR }} />
                  {technology}
                  <button onClick={() => setTechnology("")} className="hover:text-red-400 ml-0.5">×</button>
                </span>
              )}
            </div>
          )}

          {/* Save Search button — only shown when filters are active */}
          {hasActiveFilters && (
            <div className="flex justify-end pt-1 border-t border-border/50 mt-1">
              <button
                onClick={() => setSaveModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-[#00e676] hover:bg-[#00e676]/5 hover:border-[#00e676]/30 border border-transparent transition-all"
                title="Save this search"
              >
                <BookmarkPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Save Search</span>
              </button>
            </div>
          )}
        </div>

        {/* Mobile Card List */}
        <div className="flex-1 flex flex-col md:hidden gap-3 overflow-y-auto">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-card-border rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-3" />
                <div className="h-3 bg-muted rounded w-1/2 mb-2" />
                <div className="h-6 bg-muted rounded-full w-24" />
              </div>
            ))
          ) : data?.projects.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm py-12">
              No projects found matching your criteria.
            </div>
          ) : (
            data?.projects.map((project) => {
              const isChecked = selectedDeals.has(project.id);
              return (
              <div
                key={project.id}
                onClick={() => navigate(`/deals/${project.id}`)}
                className={`bg-card border rounded-xl p-4 cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-all active:scale-[0.99] group ${isChecked ? "border-primary/40 bg-primary/5" : "border-card-border"}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-sm leading-tight flex-1 group-hover:text-primary transition-colors">{project.projectName}</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isChecked ? "bg-primary border-primary" : "border-border"}`}
                      onClick={(e) => toggleSelect(project as AnyProject, e)}
                      title="Select to compare"
                    >
                      {isChecked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <Badge variant="outline" className={`${getStatusColor(project.status)} text-xs shrink-0`}>
                      {project.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 flex-wrap">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{project.country}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SECTOR_COLORS[project.technology] ?? FALLBACK_SECTOR_COLOR }} />
                    {project.technology}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {project.dealSizeUsdMn ? `$${project.dealSizeUsdMn >= 1000 ? `${(project.dealSizeUsdMn/1000).toFixed(1)}B` : `${project.dealSizeUsdMn}M`}` : "Undisclosed"}
                  </span>
                  <div className="flex items-center gap-1">
                    <ShareButton text={dealShareText(project)} stopPropagation className="p-1" />
                    {project.sourceUrl && (
                      <a
                        href={project.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground hover:text-accent p-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <span className="text-xs text-muted-foreground/50 group-hover:text-primary transition-colors flex items-center gap-0.5 ml-1">
                      View <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </div>
              );
            })
          )}

          {/* Mobile Pagination */}
          <div className="bg-card border border-card-border rounded-xl p-3 flex items-center justify-between mt-1 shrink-0">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{data?.projects.length || 0}</span> of <span className="font-medium text-foreground">{data?.total || 0}</span>
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || isLoading} className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium px-2">Page {page} of {data?.totalPages || 1}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= (data?.totalPages || 1) || isLoading} className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="flex-1 bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden flex-col hidden md:flex">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-background/50 border-b border-border text-muted-foreground text-sm">
                  <th className="py-4 pl-4 pr-2 w-10">
                    <GitCompareArrows className="w-3.5 h-3.5 text-muted-foreground/40" title="Select to compare" />
                  </th>
                  <th className="font-semibold py-4 px-6">Project Name</th>
                  <th className="font-semibold py-4 px-6">Country</th>
                  <th className="font-semibold py-4 px-6">Sector</th>
                  <th className="font-semibold py-4 px-6">Deal Size</th>
                  <th className="font-semibold py-4 px-6">Status</th>
                  <th className="font-semibold py-4 px-6 hidden xl:table-cell">Financing</th>
                  <th className="font-semibold py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td className="py-4 pl-4 pr-2"><div className="w-5 h-5 bg-muted rounded animate-pulse"></div></td>
                      <td className="py-4 px-6"><div className="h-5 bg-muted rounded w-48 animate-pulse"></div></td>
                      <td className="py-4 px-6"><div className="h-5 bg-muted rounded w-24 animate-pulse"></div></td>
                      <td className="py-4 px-6"><div className="h-5 bg-muted rounded w-24 animate-pulse"></div></td>
                      <td className="py-4 px-6"><div className="h-5 bg-muted rounded w-20 animate-pulse"></div></td>
                      <td className="py-4 px-6"><div className="h-6 bg-muted rounded-full w-24 animate-pulse"></div></td>
                      <td className="py-4 px-6 hidden xl:table-cell"><div className="h-5 bg-muted rounded-full w-28 animate-pulse"></div></td>
                      <td className="py-4 px-6"></td>
                    </tr>
                  ))
                ) : data?.projects.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      No projects found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  data?.projects.map((project) => {
                    const isChecked = selectedDeals.has(project.id);
                    return (
                      <tr
                        key={project.id}
                        className={`hover:bg-muted/30 transition-colors cursor-pointer group ${isChecked ? "bg-primary/5" : ""}`}
                        onClick={() => navigate(`/deals/${project.id}`)}
                      >
                        <td className="py-4 pl-4 pr-2" onClick={(e) => toggleSelect(project as AnyProject, e)}>
                          <div
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
                              isChecked
                                ? "bg-primary border-primary"
                                : "border-border group-hover:border-primary/50"
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3 text-primary-foreground" />}
                          </div>
                        </td>
                        <td className="py-4 px-6 font-medium text-foreground group-hover:text-primary transition-colors">{project.projectName}</td>
                        <td className="py-4 px-6 text-muted-foreground">{project.country}</td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: SECTOR_COLORS[project.technology] ?? FALLBACK_SECTOR_COLOR }} />
                            {project.technology}
                          </div>
                        </td>
                        <td className="py-4 px-6 font-mono text-sm">
                          {project.dealSizeUsdMn ? `$${project.dealSizeUsdMn}M` : 'Undisclosed'}
                        </td>
                        <td className="py-4 px-6">
                          <Badge variant="outline" className={getStatusColor(project.status)}>
                            {project.status}
                          </Badge>
                        </td>
                        <td className="py-4 px-6 hidden xl:table-cell">
                          {(project as any).financingType ? (() => {
                            const FCOLORS: Record<string, string> = {
                              "Project Finance": "#3b82f6",
                              "Blended Finance": "#06b6d4",
                              "Concessional Loan": "#f59e0b",
                              "Grant / Donor Funding": "#10b981",
                              "Corporate Finance": "#8b5cf6",
                              "Sovereign Lending": "#ef4444",
                              "IPP / Concession": "#ec4899",
                              "PPP / Public-Private": "#f97316",
                              "Green / Climate Bond": "#22c55e",
                            };
                            const ft = (project as any).financingType as string;
                            const c = FCOLORS[ft] ?? "#64748b";
                            return (
                              <span
                                className="px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap"
                                style={{ backgroundColor: `${c}18`, color: c, borderColor: `${c}40` }}
                              >
                                {ft}
                              </span>
                            );
                          })() : <span className="text-muted-foreground/40 text-xs">—</span>}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {project.sourceUrl && (
                              <a
                                href={project.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View source"
                                className="p-2 rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors opacity-0 group-hover:opacity-100"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                            <ShareButton text={dealShareText(project)} stopPropagation className="opacity-0 group-hover:opacity-100" />
                            <div className="p-2 rounded-lg transition-colors text-muted-foreground/40 group-hover:text-primary group-hover:bg-primary/10">
                              <ChevronRight className="w-4 h-4" />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-background/50 border-t border-border p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{data?.projects.length || 0}</span> of <span className="font-medium text-foreground">{data?.total || 0}</span> projects
              </p>
              <span className="text-xs text-muted-foreground/50 hidden lg:inline">· Click any row to view full deal details</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || isLoading} className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium px-4">Page {page} of {data?.totalPages || 1}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= (data?.totalPages || 1) || isLoading} className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
          </>
        )}

        {/* Floating action bar — appears when deals are selected */}
        {selectedDeals.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 bg-[#1e293b] border border-t-[#334155] border-[#334155] rounded-2xl shadow-2xl shadow-black/60 backdrop-blur-sm max-w-[90vw]">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
              {selectedDeals.size} selected
            </span>
            <div className="flex items-center gap-1.5 flex-wrap max-w-xs">
              {Array.from(selectedDeals.values()).map((deal) => (
                <span
                  key={deal.id}
                  className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-slate-300 whitespace-nowrap max-w-[140px]"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: SECTOR_COLORS[deal.technology] ?? FALLBACK_SECTOR_COLOR }}
                  />
                  <span className="truncate">{deal.projectName}</span>
                  <button
                    onClick={() => setSelectedDeals((prev) => { const n = new Map(prev); n.delete(deal.id); return n; })}
                    className="ml-0.5 text-slate-500 hover:text-red-400 transition-colors shrink-0"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="w-px h-5 bg-white/10 shrink-0" />
            <button
              onClick={() => setCompareOpen(true)}
              disabled={selectedDeals.size < 2}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold bg-[#00e676] text-[#0b0f1a] hover:bg-[#00e676]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <GitCompareArrows className="w-4 h-4" />
              Compare
            </button>
            <button
              onClick={() => setSelectedDeals(new Map())}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors shrink-0"
            >
              <XIcon className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
        )}

        {/* Max-3 toast */}
        {maxToast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 px-5 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-400 shadow-xl whitespace-nowrap">
            Maximum 3 deals for comparison. Deselect one first.
          </div>
        )}

      </PageTransition>

      {/* Comparison Panel (portal-like, rendered outside PageTransition so it overlays everything) */}
      {compareOpen && selectedDeals.size >= 2 && (
        <ComparisonPanel
          deals={Array.from(selectedDeals.values())}
          onClose={() => setCompareOpen(false)}
          onNavigate={(id) => { setCompareOpen(false); navigate(`/deals/${id}`); }}
        />
      )}

      {/* Save Search Modal */}
      {saveModalOpen && (
        <SaveSearchModal
          filters={activeFilters}
          onClose={() => setSaveModalOpen(false)}
          onSaved={handleSearchSaved}
        />
      )}

      {/* "Search saved!" toast */}
      {saveToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-[#0b0f1a] border border-[#00e676]/30 rounded-xl shadow-2xl text-sm text-[#00e676]">
          <BookmarkCheck className="w-4 h-4" />
          Search saved!
        </div>
      )}

    </Layout>
  );
}
