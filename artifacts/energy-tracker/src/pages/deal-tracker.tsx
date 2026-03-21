import { useState } from "react";
import { useSearch } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { 
  Search, ChevronLeft, ChevronRight, Eye,
  MapPin, Calendar, DollarSign, Zap, ExternalLink, Activity
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ShareButton } from "@/components/share-button";

function dealShareText(project: any) {
  const size = project.dealSizeUsdMn
    ? (project.dealSizeUsdMn >= 1000 ? `$${(project.dealSizeUsdMn / 1000).toFixed(1)}B` : `$${project.dealSizeUsdMn}M`)
    : "undisclosed investment";
  return `🌍 ${project.projectName} — ${size} ${project.technology} project in ${project.country} (${project.status}) | Africa Energy Investment Tracker`;
}

export default function DealTracker() {
  const rawSearch = useSearch();
  const initialSearch = new URLSearchParams(rawSearch).get("search") ?? "";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState("");
  const [technology, setTechnology] = useState("");
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
    technology: technology || undefined
  });

  const [selectedProject, setSelectedProject] = useState<any>(null);

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

        <header className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Deal Tracker</h1>
          <p className="text-muted-foreground text-base md:text-lg">Search and filter through the complete database of energy transactions.</p>
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

          <div className="flex gap-3">
            <select
              value={technology}
              onChange={(e) => { setTechnology(e.target.value); setPage(1); }}
              className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
            >
              <option value="">All Sectors</option>
              <option value="Solar">Solar</option>
              <option value="Wind">Wind</option>
              <option value="Hydro">Hydro</option>
              <option value="Geothermal">Geothermal</option>
              <option value="Natural Gas">Natural Gas</option>
              <option value="Oil">Oil</option>
              <option value="EV">EV</option>
            </select>

            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
            >
              <option value="">All Statuses</option>
              <option value="Announced">Announced</option>
              <option value="Financed">Financed</option>
              <option value="Construction">Construction</option>
              <option value="Operational">Operational</option>
            </select>
          </div>
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
                onClick={() => setSelectedProject(project)}
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
                  <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-accent" />{project.technology}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {project.dealSizeUsdMn ? `$${project.dealSizeUsdMn >= 1000 ? `${(project.dealSizeUsdMn/1000).toFixed(1)}B` : `${project.dealSizeUsdMn}M`}` : "Undisclosed"}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <ShareButton
                      text={dealShareText(project)}
                      stopPropagation
                      className="p-1"
                    />
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
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium px-2">Page {page} of {data?.totalPages || 1}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= (data?.totalPages || 1) || isLoading}
                className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
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
                      onClick={() => setSelectedProject(project)}
                    >
                      <td className="py-4 px-6 font-medium text-foreground">{project.projectName}</td>
                      <td className="py-4 px-6 text-muted-foreground">{project.country}</td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2 text-sm">
                          <Zap className="w-4 h-4 text-accent" />
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
                          <ShareButton
                            text={dealShareText(project)}
                            stopPropagation
                            className="opacity-0 group-hover:opacity-100"
                          />
                          <button
                            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProject(project);
                            }}
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
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
                className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium px-4">Page {page} of {data?.totalPages || 1}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= (data?.totalPages || 1) || isLoading}
                className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Project Details Modal */}
        <Dialog open={!!selectedProject} onOpenChange={(open) => !open && setSelectedProject(null)}>
          <DialogContent className="max-w-2xl bg-card border-card-border p-0 overflow-hidden mx-4 md:mx-auto">
            {selectedProject && (
              <>
                <div className="bg-gradient-to-r from-primary/20 to-background p-5 md:p-6 border-b border-border">
                  <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
                    <Badge variant="outline" className={getStatusColor(selectedProject.status)}>
                      {selectedProject.status}
                    </Badge>
                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedProject.newsUrl && (
                        <a
                          href={selectedProject.newsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-medium bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 rounded-full transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          News
                        </a>
                      )}
                      {selectedProject.sourceUrl && (
                        <a
                          href={selectedProject.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-medium bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 px-3 py-1.5 rounded-full transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Source
                        </a>
                      )}
                      <ShareButton
                        text={dealShareText(selectedProject)}
                        variant="icon-label"
                        className="text-xs border border-border px-1 py-0.5 rounded-full bg-muted/40 hover:bg-muted"
                      />
                    </div>
                  </div>
                  <DialogTitle className="text-xl md:text-3xl font-bold font-display text-foreground mb-2">
                    {selectedProject.projectName}
                  </DialogTitle>
                  <p className="text-muted-foreground flex items-center gap-2 text-sm md:text-base">
                    <MapPin className="w-4 h-4 shrink-0" /> {selectedProject.country}, {selectedProject.region}
                  </p>
                </div>

                <div className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 overflow-y-auto max-h-[60vh]">
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Key Details</h4>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                          <span className="text-muted-foreground flex items-center gap-2 text-sm"><Zap className="w-4 h-4"/> Sector</span>
                          <span className="font-medium text-sm">{selectedProject.technology}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                          <span className="text-muted-foreground flex items-center gap-2 text-sm"><DollarSign className="w-4 h-4"/> Deal Size</span>
                          <span className="font-medium font-mono text-sm">{selectedProject.dealSizeUsdMn ? `$${selectedProject.dealSizeUsdMn}M` : 'Undisclosed'}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                          <span className="text-muted-foreground flex items-center gap-2 text-sm"><Activity className="w-4 h-4"/> Capacity</span>
                          <span className="font-medium text-sm">{selectedProject.capacityMw ? `${selectedProject.capacityMw} MW` : 'N/A'}</span>
                        </div>
                        <div className="flex items-center justify-between pb-2">
                          <span className="text-muted-foreground flex items-center gap-2 text-sm"><Calendar className="w-4 h-4"/> Announced</span>
                          <span className="font-medium text-sm">{selectedProject.announcedYear || 'Unknown'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Investors & Partners</h4>
                      <div className="bg-background rounded-xl p-4 border border-border">
                        {selectedProject.investors ? (
                          <p className="text-foreground text-sm leading-relaxed">{selectedProject.investors}</p>
                        ) : (
                          <p className="text-muted-foreground text-sm italic">Investor details undisclosed</p>
                        )}
                      </div>
                    </div>

                    {selectedProject.description && (
                      <div>
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</h4>
                        <p className="text-sm leading-relaxed text-foreground/80">
                          {selectedProject.description}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

      </PageTransition>
    </Layout>
  );
}
