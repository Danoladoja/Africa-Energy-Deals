import { useState } from "react";
import { useListProjects } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { 
  Search, Filter, ChevronLeft, ChevronRight, Eye, 
  MapPin, Calendar, DollarSign, Zap, ExternalLink 
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export default function DealTracker() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [technology, setTechnology] = useState("");
  
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  // Simple debounce for search
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
          <p className="text-muted-foreground text-lg">Search and filter through the complete database of energy transactions.</p>
        </header>

        {/* Filters Bar */}
        <div className="flex flex-col md:flex-row gap-4 mb-6 bg-card p-4 rounded-2xl border border-card-border shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search projects, investors..." 
              value={search}
              onChange={handleSearchChange}
              className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>
          
          <div className="flex gap-4">
            <select 
              value={technology}
              onChange={(e) => setTechnology(e.target.value)}
              className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none min-w-[150px]"
            >
              <option value="">All Technologies</option>
              <option value="Solar PV">Solar PV</option>
              <option value="Wind">Wind</option>
              <option value="Hydro">Hydro</option>
              <option value="Geothermal">Geothermal</option>
              <option value="Biomass">Biomass</option>
              <option value="Green Hydrogen">Green Hydrogen</option>
            </select>

            <select 
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none min-w-[150px]"
            >
              <option value="">All Statuses</option>
              <option value="Announced">Announced</option>
              <option value="Financed">Financed</option>
              <option value="Construction">Construction</option>
              <option value="Operational">Operational</option>
            </select>
            
            <button className="bg-secondary text-secondary-foreground px-4 py-2.5 rounded-xl border border-border hover:bg-secondary/80 transition-colors flex items-center gap-2 text-sm font-medium">
              <Filter className="w-4 h-4" />
              More Filters
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="flex-1 bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-background/50 border-b border-border text-muted-foreground text-sm">
                  <th className="font-semibold py-4 px-6">Project Name</th>
                  <th className="font-semibold py-4 px-6">Country</th>
                  <th className="font-semibold py-4 px-6">Technology</th>
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
                        <button 
                          className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProject(project);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
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
          <DialogContent className="max-w-2xl bg-card border-card-border p-0 overflow-hidden">
            {selectedProject && (
              <>
                <div className="bg-gradient-to-r from-primary/20 to-background p-6 border-b border-border">
                  <div className="flex justify-between items-start mb-4">
                    <Badge variant="outline" className={getStatusColor(selectedProject.status)}>
                      {selectedProject.status}
                    </Badge>
                    {selectedProject.sourceUrl && (
                      <a 
                        href={selectedProject.sourceUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 flex items-center gap-1 text-sm font-medium"
                      >
                        Source <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <DialogTitle className="text-2xl md:text-3xl font-bold font-display text-foreground mb-2">
                    {selectedProject.projectName}
                  </DialogTitle>
                  <p className="text-muted-foreground flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> {selectedProject.country}, {selectedProject.region}
                  </p>
                </div>
                
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Key Details</h4>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                          <span className="text-muted-foreground flex items-center gap-2"><Zap className="w-4 h-4"/> Technology</span>
                          <span className="font-medium">{selectedProject.technology}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                          <span className="text-muted-foreground flex items-center gap-2"><DollarSign className="w-4 h-4"/> Deal Size</span>
                          <span className="font-medium font-mono">{selectedProject.dealSizeUsdMn ? `$${selectedProject.dealSizeUsdMn}M` : 'Undisclosed'}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                          <span className="text-muted-foreground flex items-center gap-2"><Activity className="w-4 h-4"/> Capacity</span>
                          <span className="font-medium">{selectedProject.capacityMw ? `${selectedProject.capacityMw} MW` : 'N/A'}</span>
                        </div>
                        <div className="flex items-center justify-between pb-2">
                          <span className="text-muted-foreground flex items-center gap-2"><Calendar className="w-4 h-4"/> Announced</span>
                          <span className="font-medium">{selectedProject.announcedYear || 'Unknown'}</span>
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
