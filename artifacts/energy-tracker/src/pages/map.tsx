import { useState } from "react";
import { useListProjects } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { Zap, ExternalLink, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Tech colors matching CSS variables
const techColors: Record<string, string> = {
  "Solar PV": "hsl(160, 84%, 39%)", // chart-1
  "Wind": "hsl(189, 94%, 43%)",     // chart-2
  "Hydro": "hsl(217, 91%, 60%)",    // chart-3
  "Geothermal": "hsl(280, 65%, 60%)", // chart-4
  "Biomass": "hsl(35, 91%, 55%)",     // chart-5
};

const defaultColor = "hsl(215, 20%, 65%)";

export default function MapPage() {
  const [activeProject, setActiveProject] = useState<any>(null);
  
  // Fetch all projects that have coordinates for the map
  const { data, isLoading } = useListProjects({ limit: 500 });
  
  const mapProjects = data?.projects.filter(p => p.latitude != null && p.longitude != null) || [];

  return (
    <Layout>
      <PageTransition className="h-full flex flex-col md:flex-row relative">
        
        {/* Map Area */}
        <div className="flex-1 h-[50vh] md:h-full relative z-0">
          <MapContainer 
            center={[0, 20]} // Center of Africa
            zoom={4} 
            style={{ height: '100%', width: '100%', zIndex: 0 }}
            zoomControl={false}
          >
            {/* Dark styled map tiles */}
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />
            
            {mapProjects.map((project) => (
              <CircleMarker
                key={project.id}
                center={[project.latitude!, project.longitude!]}
                radius={project.dealSizeUsdMn ? Math.max(6, Math.min(20, Math.sqrt(project.dealSizeUsdMn) * 1.5)) : 8}
                pathOptions={{ 
                  color: activeProject?.id === project.id ? '#fff' : techColors[project.technology] || defaultColor,
                  fillColor: techColors[project.technology] || defaultColor,
                  fillOpacity: 0.7,
                  weight: activeProject?.id === project.id ? 4 : 1,
                }}
                eventHandlers={{
                  click: () => setActiveProject(project)
                }}
              >
                <Popup className="custom-popup">
                  <div className="p-1 min-w-[200px]">
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                      {project.technology}
                    </div>
                    <h3 className="font-display font-bold text-lg leading-tight mb-2">
                      {project.projectName}
                    </h3>
                    <div className="flex items-center justify-between text-sm mb-2 pb-2 border-b border-border">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <MapPin className="w-3 h-3"/> {project.country}
                      </span>
                      <span className="font-mono font-medium">
                        {project.dealSizeUsdMn ? `$${project.dealSizeUsdMn}M` : 'N/A'}
                      </span>
                    </div>
                    <Badge variant="secondary" className="text-xs">{project.status}</Badge>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>

          {/* Map Controls / Legend */}
          <div className="absolute bottom-6 left-6 z-[1000] bg-card/90 backdrop-blur-md border border-border p-4 rounded-xl shadow-xl">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Technologies</h4>
            <div className="space-y-2">
              {Object.entries(techColors).map(([tech, color]) => (
                <div key={tech} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span>{tech}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Project List */}
        <div className="w-full md:w-96 bg-card border-l border-card-border flex flex-col h-[50vh] md:h-full z-10 shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.5)]">
          <div className="p-6 border-b border-border">
            <h2 className="text-2xl font-bold font-display mb-2">Project Explorer</h2>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Loading projects..." : `${mapProjects.length} mapped projects across Africa.`}
            </p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoading ? (
              Array.from({length: 5}).map((_, i) => (
                <div key={i} className="p-4 rounded-xl border border-border bg-background animate-pulse">
                  <div className="h-4 bg-muted w-3/4 mb-3 rounded" />
                  <div className="h-3 bg-muted w-1/2 mb-2 rounded" />
                  <div className="h-8 bg-muted w-24 rounded-full" />
                </div>
              ))
            ) : (
              mapProjects.map((project) => (
                <div 
                  key={project.id}
                  onClick={() => setActiveProject(project)}
                  className={`
                    p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden
                    ${activeProject?.id === project.id 
                      ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(16,185,129,0.15)]' 
                      : 'bg-background border-border hover:border-primary/50'
                    }
                  `}
                >
                  <div 
                    className="absolute left-0 top-0 bottom-0 w-1" 
                    style={{ backgroundColor: techColors[project.technology] || defaultColor }}
                  />
                  <h3 className="font-bold mb-1 pl-2">{project.projectName}</h3>
                  <p className="text-sm text-muted-foreground pl-2 mb-3 flex flex-wrap gap-2">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {project.country}</span>
                    <span className="flex items-center gap-1"><Zap className="w-3 h-3"/> {project.technology}</span>
                  </p>
                  <div className="flex justify-between items-center pl-2">
                    <Badge variant="outline" className="bg-card text-xs">{project.status}</Badge>
                    <span className="font-mono text-sm font-semibold">
                      {project.dealSizeUsdMn ? `$${project.dealSizeUsdMn}M` : ''}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </PageTransition>
    </Layout>
  );
}
