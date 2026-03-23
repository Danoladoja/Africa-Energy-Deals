import { useState, useRef, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import {
  Search, ChevronLeft, ChevronRight, Eye,
  MapPin, ExternalLink, Download, ChevronDown,
  FileText, Sheet, FileJson,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ShareButton } from "@/components/share-button";

const SECTOR_COLORS: Record<string, string> = {
  "Solar":          "#f59e0b",
  "Wind":           "#06b6d4",
  "Hydro":          "#3b82f6",
  "Grid & Storage": "#14b8a6",
  "Oil & Gas":      "#f97316",
  "Coal":           "#78716c",
  "Nuclear":        "#a855f7",
  "Bioenergy":      "#22c55e",
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DealTracker() {
  const rawSearch = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(rawSearch);
  const initialSearch     = params.get("search")     ?? "";
  const initialCountry    = params.get("country")    ?? "";
  const initialTechnology = params.get("technology") ?? "";

  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState(initialSearch);
  const [country, setCountry]         = useState(initialCountry);
  const [status, setStatus]           = useState("");
  const [technology, setTechnology]   = useState(initialTechnology);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setTimeout(() => setDebouncedSearch(e.target.value), 500);
  };

  const { data, isLoading } = useListProjects({
    page,
    limit: 15,
    search: debouncedSearch || undefined,
    status: status || undefined,
    technology: technology || undefined,
    country: country || undefined,
  });

  const activeFilters = { search: debouncedSearch, technology, status, country };

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
      <PageTransition className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col">

        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Deal Tracker</h1>
            <p className="text-muted-foreground text-base md:text-lg">Search and filter through the complete database of energy transactions.</p>
          </div>
          {/* Export on desktop header */}
          <div className="hidden md:block shrink-0 mt-1">
            <ExportDropdown filters={activeFilters} />
          </div>
        </header>

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
              <option value="Grid & Storage">Grid &amp; Storage</option>
              <option value="Oil & Gas">Oil &amp; Gas</option>
              <option value="Coal">Coal</option>
              <option value="Nuclear">Nuclear</option>
              <option value="Bioenergy">Bioenergy</option>
            </select>

            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="flex-1 min-w-32 bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
            >
              <option value="">All Statuses</option>
              <option value="Announced">Announced</option>
              <option value="Financed">Financed</option>
              <option value="Construction">Construction</option>
              <option value="Operational">Operational</option>
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
            data?.projects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate(`/deals/${project.id}`)}
                className="bg-card border border-card-border rounded-xl p-4 cursor-pointer hover:border-primary/40 transition-colors active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-sm leading-tight flex-1">{project.projectName}</h3>
                  <Badge variant="outline" className={`${getStatusColor(project.status)} text-xs shrink-0`}>
                    {project.status}
                  </Badge>
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
                  <div className="flex items-center gap-0.5">
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
                  </div>
                </div>
              </div>
            ))
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
                  <th className="font-semibold py-4 px-6">Project Name</th>
                  <th className="font-semibold py-4 px-6">Country</th>
                  <th className="font-semibold py-4 px-6">Sector</th>
                  <th className="font-semibold py-4 px-6">Deal Size</th>
                  <th className="font-semibold py-4 px-6">Status</th>
                  <th className="font-semibold py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td className="py-4 px-6"><div className="h-5 bg-muted rounded w-48 animate-pulse"></div></td>
                      <td className="py-4 px-6"><div className="h-5 bg-muted rounded w-24 animate-pulse"></div></td>
                      <td className="py-4 px-6"><div className="h-5 bg-muted rounded w-24 animate-pulse"></div></td>
                      <td className="py-4 px-6"><div className="h-5 bg-muted rounded w-20 animate-pulse"></div></td>
                      <td className="py-4 px-6"><div className="h-6 bg-muted rounded-full w-24 animate-pulse"></div></td>
                      <td className="py-4 px-6"></td>
                    </tr>
                  ))
                ) : data?.projects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      No projects found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  data?.projects.map((project) => (
                    <tr
                      key={project.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer group"
                      onClick={() => navigate(`/deals/${project.id}`)}
                    >
                      <td className="py-4 px-6 font-medium text-foreground">{project.projectName}</td>
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
                          <button
                            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                            title="View deal detail"
                            onClick={(e) => { e.stopPropagation(); navigate(`/deals/${project.id}`); }}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-background/50 border-t border-border p-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{data?.projects.length || 0}</span> of <span className="font-medium text-foreground">{data?.total || 0}</span> projects
            </p>
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

      </PageTransition>
    </Layout>
  );
}
