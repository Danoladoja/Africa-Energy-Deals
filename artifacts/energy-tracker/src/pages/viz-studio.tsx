import { useState, useRef, useMemo } from "react";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import {
  useGetStatsByCountry,
  useGetStatsByTechnology,
  useGetStatsByRegion,
  useGetStatsByYear,
  useListProjects,
} from "@workspace/api-client-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Download, RefreshCw, Layers, BarChart2, Globe, MapPin,
  ChevronDown, Zap, DollarSign, Code2, Copy, Check, X,
  ExternalLink, Monitor,
} from "lucide-react";
import { toPng } from "html-to-image";
import { ShareButton } from "@/components/share-button";
import { ExportDropdown } from "@/components/export-dropdown";
import { exportImageToPdf, exportImageToPptx } from "@/utils/export-utils";
import { SECTOR_COLORS, formatVal } from "@/utils/chart-colors";
import { TreemapChart, type TreemapMetric, type TreemapLevel1, type TreemapLevel2, type TreemapColorBy } from "@/components/charts/treemap-chart";
import { StackedBarChart, type StackMetric, type StackXAxis, type StackBy, type StackMode } from "@/components/charts/stacked-bar-chart";
import { SankeyChart, type SankeyFrom, type SankeyThrough, type SankeyTo, type SankeyTopN } from "@/components/charts/sankey-chart";
import { ScatterBubbleChart, type ScatterXMetric, type ScatterYMetric, type ScatterColorBy, type ScatterSizeBy, type ScatterDataLevel } from "@/components/charts/scatter-chart";

const COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))",
  "#00e676", "#00bcd4", "#ff9800", "#e91e63", "#9c27b0",
];

type BasicChartType = "bar" | "horizontal-bar" | "line" | "area" | "pie" | "donut";
type AdvancedChartType = "treemap" | "stacked-bar" | "stacked-bar-100" | "sankey" | "scatter";
type ChartType = BasicChartType | AdvancedChartType;
type Metric = "totalInvestmentUsdMn" | "projectCount";
type Grouping = "country" | "technology" | "region" | "year";
type ViewMode = "overview" | "spotlight";
type SpotlightType = "country" | "region";

const BASIC_CHART_OPTIONS: { value: BasicChartType; label: string }[] = [
  { value: "bar", label: "Vertical Bar" },
  { value: "horizontal-bar", label: "Horizontal Bar" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "pie", label: "Pie" },
  { value: "donut", label: "Donut" },
];

const ADVANCED_CHART_OPTIONS: { value: AdvancedChartType; label: string }[] = [
  { value: "treemap", label: "Treemap" },
  { value: "stacked-bar", label: "Stacked Bar" },
  { value: "stacked-bar-100", label: "100% Stacked Bar" },
  { value: "sankey", label: "Sankey Flow" },
  { value: "scatter", label: "Scatter / Bubble" },
];

function isAdvanced(ct: ChartType): ct is AdvancedChartType {
  return ["treemap", "stacked-bar", "stacked-bar-100", "sankey", "scatter"].includes(ct);
}

function formatValue(value: number, metric: Metric) {
  if (metric === "projectCount") return value.toString();
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}B`;
  return `$${value.toFixed(0)}M`;
}

function CustomTooltip({ active, payload, label, metric }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border p-3 rounded-lg shadow-xl z-50">
        <p className="font-medium mb-1 text-sm">{label ?? payload[0]?.name}</p>
        <p className="text-primary font-bold text-lg">
          {formatValue(payload[0].value, metric)}
        </p>
      </div>
    );
  }
  return null;
}

function getCellColor(item: any, nameKey: string, index: number, colorMap?: Record<string, string>) {
  if (colorMap) {
    const name = item[nameKey];
    if (name && colorMap[name]) return colorMap[name];
  }
  return COLORS[index % COLORS.length];
}

function ChartRenderer({
  chartType, data, nameKey, metric, height = 420, colorMap,
}: {
  chartType: BasicChartType;
  data: any[];
  nameKey: string;
  metric: Metric;
  height?: number;
  colorMap?: Record<string, string>;
}) {
  const tooltipEl = <CustomTooltip metric={metric} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      {chartType === "bar" ? (
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 90 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey={nameKey} stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} angle={-35} textAnchor="end" height={90} interval={0} />
          <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatValue(v, metric)} width={80}
            label={{ value: metric === "totalInvestmentUsdMn" ? "Investment (USD)" : "Number of Projects", angle: -90, position: "insideLeft", style: { textAnchor: "middle", fill: "hsl(var(--muted-foreground))", fontSize: 12 } }} />
          <Tooltip content={tooltipEl} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
          <Bar dataKey={metric} radius={[6, 6, 0, 0]}>
            {data.map((entry, i) => <Cell key={i} fill={getCellColor(entry, nameKey, i, colorMap)} />)}
          </Bar>
        </BarChart>
      ) : chartType === "horizontal-bar" ? (
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 80, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatValue(v, metric)} />
          <YAxis type="category" dataKey={nameKey} stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} width={150} tickLine={false} axisLine={false} />
          <Tooltip content={tooltipEl} cursor={{ fill: "hsl(var(--muted)/0.15)" }} />
          <Bar dataKey={metric} radius={[0, 6, 6, 0]} maxBarSize={28}>
            {data.map((entry, i) => <Cell key={i} fill={getCellColor(entry, nameKey, i, colorMap)} />)}
          </Bar>
        </BarChart>
      ) : chartType === "line" ? (
        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 90 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey={nameKey} stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} angle={-35} textAnchor="end" height={90} interval={0} />
          <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatValue(v, metric)} label={{ value: metric === "totalInvestmentUsdMn" ? "Investment (USD)" : "Number of Projects", angle: -90, position: "insideLeft", style: { textAnchor: "middle", fill: "hsl(var(--muted-foreground))", fontSize: 12 } }} />
          <Tooltip content={tooltipEl} />
          <Line type="monotone" dataKey={metric} stroke="hsl(var(--primary))" strokeWidth={3}
            dot={{ r: 5, fill: "hsl(var(--background))", strokeWidth: 2 }}
            activeDot={{ r: 7, stroke: "hsl(var(--accent))" }} />
        </LineChart>
      ) : chartType === "area" ? (
        <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 90 }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey={nameKey} stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} angle={-35} textAnchor="end" height={90} interval={0} />
          <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatValue(v, metric)} label={{ value: metric === "totalInvestmentUsdMn" ? "Investment (USD)" : "Number of Projects", angle: -90, position: "insideLeft", style: { textAnchor: "middle", fill: "hsl(var(--muted-foreground))", fontSize: 12 } }} />
          <Tooltip content={tooltipEl} />
          <Area type="monotone" dataKey={metric} stroke="hsl(var(--primary))" strokeWidth={3} fill="url(#areaGrad)" dot={{ r: 4, fill: "hsl(var(--primary))" }} />
        </AreaChart>
      ) : (
        <PieChart>
          <Pie
            data={data} cx="50%" cy="44%"
            outerRadius={Math.min(height / 2 - 70, 120)}
            innerRadius={chartType === "donut" ? Math.min(height / 4 - 20, 65) : 0}
            dataKey={metric} nameKey={nameKey} paddingAngle={3}
            stroke="hsl(var(--background))" strokeWidth={2}
          >
            {data.map((entry, i) => <Cell key={i} fill={getCellColor(entry, nameKey, i, colorMap)} />)}
          </Pie>
          <Tooltip content={tooltipEl} />
          <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
        </PieChart>
      )}
    </ResponsiveContainer>
  );
}

const EMBED_CHART_TYPES = [
  { value: "bar", label: "Vertical Bar" }, { value: "horizontal-bar", label: "Horizontal Bar" },
  { value: "line", label: "Line" }, { value: "area", label: "Area" },
  { value: "pie", label: "Pie" }, { value: "donut", label: "Donut" },
];
const EMBED_GROUP_BY = [
  { value: "technology", label: "Sector" }, { value: "country", label: "Country" },
  { value: "region", label: "Region" }, { value: "year", label: "Year" },
];
const EMBED_METRICS = [
  { value: "investment", label: "Investment ($)" }, { value: "count", label: "Project Count" },
];

function EmbedCodeModal({ chartType, groupBy, metric, onClose }: {
  chartType: ChartType; groupBy: Grouping; metric: Metric; onClose: () => void;
}) {
  const [modalChartType, setModalChartType] = useState<string>(isAdvanced(chartType) ? "bar" : chartType);
  const [modalGroupBy, setModalGroupBy] = useState<string>(groupBy);
  const [modalMetric, setModalMetric] = useState<string>(metric === "projectCount" ? "count" : "investment");
  const [width, setWidth] = useState("600");
  const [height, setHeight] = useState("400");
  const [copied, setCopied] = useState<"iframe" | "js" | null>(null);

  const basePath = import.meta.env.BASE_URL;
  const origin = window.location.origin;
  const embedSrc = `${origin}${basePath}embed/chart?type=${modalChartType}&groupBy=${modalGroupBy}&metric=${modalMetric}`;

  const iframeCode = `<iframe\n  src="${embedSrc}"\n  width="${width}"\n  height="${height}"\n  frameborder="0"\n  scrolling="no"\n  style="border-radius:12px;overflow:hidden;"\n  title="Africa Energy Investment Chart"\n></iframe>`;
  const jsCode = `<div id="afrienergy-chart"></div>\n<script>\n  (function() {\n    var iframe = document.createElement('iframe');\n    iframe.src = '${embedSrc}';\n    iframe.width = '${width}';\n    iframe.height = '${height}';\n    iframe.frameBorder = '0';\n    iframe.scrolling = 'no';\n    iframe.style.borderRadius = '12px';\n    iframe.style.overflow = 'hidden';\n    document.getElementById('afrienergy-chart').appendChild(iframe);\n  })();\n</script>`;

  async function copyCode(code: string, key: "iframe" | "js") {
    await navigator.clipboard.writeText(code);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-[#0f1724] border border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-[#00e676]" />
            <h2 className="text-lg font-bold">Embed Chart</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Chart type", value: modalChartType, opts: EMBED_CHART_TYPES, set: setModalChartType },
              { label: "Group by", value: modalGroupBy, opts: EMBED_GROUP_BY, set: setModalGroupBy },
              { label: "Metric", value: modalMetric, opts: EMBED_METRICS, set: setModalMetric },
            ].map(({ label, value, opts, set }) => (
              <div key={label}>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">{label}</label>
                <div className="relative">
                  <select value={value} onChange={e => set(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#00e676]/40 appearance-none pr-7">
                    {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                </div>
              </div>
            ))}
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Size (px)</label>
              <div className="flex gap-1">
                <input value={width} onChange={e => setWidth(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#00e676]/40" placeholder="W" />
                <span className="text-slate-600 self-center">×</span>
                <input value={height} onChange={e => setHeight(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#00e676]/40" placeholder="H" />
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Monitor className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-300">Live Preview</span>
              <a href={embedSrc} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 text-xs text-[#00e676] hover:underline">
                Open in new tab <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0b0f1a]" style={{ height: "260px" }}>
              <iframe src={embedSrc} width="100%" height="100%" frameBorder="0" scrolling="no" title="Embed Preview" key={`${modalChartType}-${modalGroupBy}-${modalMetric}`} />
            </div>
          </div>
          <div className="space-y-3">
            {[
              { key: "iframe" as const, label: "HTML iframe", code: iframeCode },
              { key: "js" as const, label: "JavaScript snippet", code: jsCode },
            ].map(({ key, label, code }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-400">{label}</span>
                  <button onClick={() => copyCode(code, key)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors">
                    {copied === key ? <><Check className="w-3 h-3 text-[#00e676]" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                  </button>
                </div>
                <pre className="bg-[#0b0f1a] border border-white/10 rounded-xl p-4 text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">{code}</pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">{label}</label>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none pr-8">
          {children}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}

function ToggleGroup({ label, value, options, onChange }: {
  label: string; value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">{label}</label>
      <div className="flex gap-1">
        {options.map(o => (
          <button key={o.value} onClick={() => onChange(o.value)}
            className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors border
              ${value === o.value ? "bg-primary/20 border-primary/50 text-primary" : "bg-background border-border hover:bg-muted text-muted-foreground"}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function VizStudio() {
  const [viewMode, setViewMode] = useState<ViewMode>("overview");

  // Basic chart state
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [metric, setMetric] = useState<Metric>("totalInvestmentUsdMn");
  const [grouping, setGrouping] = useState<Grouping>("technology");

  // Treemap state
  const [tmMetric, setTmMetric] = useState<TreemapMetric>("totalInvestmentUsdMn");
  const [tmLevel1, setTmLevel1] = useState<TreemapLevel1>("region");
  const [tmLevel2, setTmLevel2] = useState<TreemapLevel2>("country");
  const [tmColorBy, setTmColorBy] = useState<TreemapColorBy>("region");

  // Stacked bar state
  const [sbMetric, setSbMetric] = useState<StackMetric>("totalInvestmentUsdMn");
  const [sbXAxis, setSbXAxis] = useState<StackXAxis>("year");
  const [sbStackBy, setSbStackBy] = useState<StackBy>("sector");
  const [sbMode, setSbMode] = useState<StackMode>("absolute");

  // Sankey state
  const [skFrom, setSkFrom] = useState<SankeyFrom>("region");
  const [skThrough, setSkThrough] = useState<SankeyThrough>("country");
  const [skTo, setSkTo] = useState<SankeyTo>("sector");
  const [skTopN, setSkTopN] = useState<SankeyTopN>(20);

  // Scatter state
  const [scXField, setScXField] = useState<ScatterXMetric>("capacityMw");
  const [scYField, setScYField] = useState<ScatterYMetric>("dealSizeUsdMn");
  const [scColorBy, setScColorBy] = useState<ScatterColorBy>("sector");
  const [scSizeBy, setScSizeBy] = useState<ScatterSizeBy>("none");
  const [scDataLevel, setScDataLevel] = useState<ScatterDataLevel>("project");
  const [scShowAvg, setScShowAvg] = useState(true);

  // Spotlight state
  const [spotlightType, setSpotlightType] = useState<SpotlightType>("country");
  const [selectedSpotlight, setSelectedSpotlight] = useState<string>("");
  const [spotlightChartType, setSpotlightChartType] = useState<BasicChartType>("horizontal-bar");
  const [spotlightMetric, setSpotlightMetric] = useState<Metric>("totalInvestmentUsdMn");
  const [spotlightGrouping, setSpotlightGrouping] = useState<string>("technology");

  const [isExporting, setIsExporting] = useState(false);
  const [isExportingSpotlightChart, setIsExportingSpotlightChart] = useState(false);
  const [showEmbedModal, setShowEmbedModal] = useState(false);

  const chartRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const spotlightChartRef = useRef<HTMLDivElement>(null);

  const { data: byCountry, isLoading: loadC } = useGetStatsByCountry();
  const { data: byTech, isLoading: loadT } = useGetStatsByTechnology();
  const { data: byRegion, isLoading: loadR } = useGetStatsByRegion();
  const { data: byYear, isLoading: loadY } = useGetStatsByYear();

  const advancedParams = useMemo(() => ({ page: 1, limit: 500 }), []);
  const { data: allProjectsData, isLoading: loadProjects } = useListProjects(advancedParams);
  const allProjects = allProjectsData?.projects ?? [];

  const spotlightParams = useMemo(() => {
    if (!selectedSpotlight) return { page: 1, limit: 1 };
    return spotlightType === "country"
      ? { country: selectedSpotlight, page: 1, limit: 100 }
      : { region: selectedSpotlight, page: 1, limit: 100 };
  }, [spotlightType, selectedSpotlight]);
  const { data: spotlightProjects, isLoading: loadSpotlight } = useListProjects(spotlightParams);

  const isLoading = loadC || loadT || loadR || loadY;
  const isAdvancedLoading = loadProjects;

  // Overview chart data (basic)
  let activeData: any[] = [];
  let nameKey = "";
  if (grouping === "country") { activeData = byCountry || []; nameKey = "country"; }
  else if (grouping === "technology") { activeData = byTech || []; nameKey = "technology"; }
  else if (grouping === "region") { activeData = byRegion || []; nameKey = "region"; }
  else if (grouping === "year") { activeData = byYear || []; nameKey = "year"; }

  if (!isAdvanced(chartType) && chartType !== "line" && chartType !== "area" && grouping !== "year") {
    activeData = [...activeData].sort((a, b) => b[metric] - a[metric]).slice(0, 15);
  }

  // Spotlight derived data
  const spotlightTechData = useMemo(() => {
    if (!spotlightProjects?.projects?.length) return [];
    const map = new Map<string, { technology: string; totalInvestmentUsdMn: number; projectCount: number }>();
    for (const p of spotlightProjects.projects) {
      const ex = map.get(p.technology) ?? { technology: p.technology, totalInvestmentUsdMn: 0, projectCount: 0 };
      map.set(p.technology, { technology: p.technology, totalInvestmentUsdMn: ex.totalInvestmentUsdMn + (p.dealSizeUsdMn ?? 0), projectCount: ex.projectCount + 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.totalInvestmentUsdMn - a.totalInvestmentUsdMn);
  }, [spotlightProjects]);

  const spotlightYearData = useMemo(() => {
    if (!spotlightProjects?.projects?.length) return [];
    const map = new Map<number, { year: number; totalInvestmentUsdMn: number; projectCount: number }>();
    for (const p of spotlightProjects.projects) {
      if (!p.announcedYear) continue;
      const ex = map.get(p.announcedYear) ?? { year: p.announcedYear, totalInvestmentUsdMn: 0, projectCount: 0 };
      map.set(p.announcedYear, { year: p.announcedYear, totalInvestmentUsdMn: ex.totalInvestmentUsdMn + (p.dealSizeUsdMn ?? 0), projectCount: ex.projectCount + 1 });
    }
    return Array.from(map.values()).sort((a, b) => a.year - b.year);
  }, [spotlightProjects]);

  const spotlightCountriesData = useMemo(() => {
    if (spotlightType !== "region" || !byCountry || !selectedSpotlight) return [];
    return [...(byCountry || [])].filter(c => c.region === selectedSpotlight).sort((a, b) => b.totalInvestmentUsdMn - a.totalInvestmentUsdMn);
  }, [spotlightType, byCountry, selectedSpotlight]);

  const spotlightTotalInvestment = useMemo(() => spotlightProjects?.projects?.reduce((s, p) => s + (p.dealSizeUsdMn ?? 0), 0) ?? 0, [spotlightProjects]);
  const spotlightProjectCount = spotlightProjects?.projects?.length ?? 0;
  const spotlightTopTech = spotlightTechData[0]?.technology ?? "—";

  const countryOptions = useMemo(() => [...(byCountry || [])].sort((a, b) => a.country.localeCompare(b.country)), [byCountry]);
  const regionOptions = useMemo(() => [...(byRegion || [])].sort((a, b) => a.region.localeCompare(b.region)), [byRegion]);
  const spotlightOptions = spotlightType === "country" ? countryOptions.map(c => c.country) : regionOptions.map(r => r.region);

  const spotlightGroupByOptions = useMemo(() => {
    const base = [{ value: "technology", label: "Sector" }, { value: "year", label: "Year" }];
    if (spotlightType === "region") base.push({ value: "countries", label: "Countries in Region" });
    return base;
  }, [spotlightType]);

  const spotlightActiveData = useMemo(() => {
    if (spotlightGrouping === "technology") return spotlightTechData;
    if (spotlightGrouping === "year") return spotlightYearData;
    if (spotlightGrouping === "countries") return spotlightCountriesData;
    return [];
  }, [spotlightGrouping, spotlightTechData, spotlightYearData, spotlightCountriesData]);

  const spotlightNameKey = spotlightGrouping === "year" ? "year" : spotlightGrouping === "countries" ? "country" : "technology";
  const spotlightChartTitle = `${spotlightMetric === "totalInvestmentUsdMn" ? "Investment Volume" : "Number of Projects"} by ${
    spotlightGrouping === "technology" ? "Sector" : spotlightGrouping === "year" ? "Year" : "Country"
  } — ${selectedSpotlight}`;

  const exportChart = async (ref: React.RefObject<HTMLDivElement | null>, filename: string, setLoading: (v: boolean) => void) => {
    if (!ref.current) return;
    setLoading(true);
    try {
      await new Promise(r => setTimeout(r, 150));
      const dataUrl = await toPng(ref.current, {
        backgroundColor: "#0B0F19", pixelRatio: 2, cacheBust: true,
        filter: (node: HTMLElement) => !node.dataset?.noExport,
      });
      const link = document.createElement("a");
      link.download = `afrienergy-${filename}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setLoading(false);
    }
  };

  const overviewTitle = useMemo(() => {
    if (chartType === "treemap") return `Investment Treemap — ${tmLevel1.charAt(0).toUpperCase() + tmLevel1.slice(1)} → ${tmLevel2.charAt(0).toUpperCase() + tmLevel2.slice(1)}`;
    if (chartType === "stacked-bar" || chartType === "stacked-bar-100") return `${sbMode === "percentage" || chartType === "stacked-bar-100" ? "100%" : ""} Stacked ${sbMetric === "totalInvestmentUsdMn" ? "Investment" : "Projects"} by ${sbXAxis.charAt(0).toUpperCase() + sbXAxis.slice(1)} × ${sbStackBy.charAt(0).toUpperCase() + sbStackBy.slice(1)}`;
    if (chartType === "sankey") return `Capital Flow: ${skFrom} → ${skThrough !== "none" ? skThrough + " → " : ""}${skTo}`;
    if (chartType === "scatter") return `${scYField.replace("Usd", " (USD)").replace("Mw", " (MW)")} vs ${scXField.replace("Usd", " (USD)").replace("Mw", " (MW)")} — by ${scColorBy}`;
    return `${metric === "totalInvestmentUsdMn" ? "Investment Volume" : "Number of Projects"} by ${grouping.charAt(0).toUpperCase() + grouping.slice(1)}`;
  }, [chartType, metric, grouping, tmLevel1, tmLevel2, sbMetric, sbMode, sbXAxis, sbStackBy, skFrom, skThrough, skTo, scXField, scYField, scColorBy]);

  const stackedMode: StackMode = chartType === "stacked-bar-100" ? "percentage" : sbMode;

  return (
    <Layout>
      <PageTransition className="p-4 md:p-8 max-w-7xl mx-auto">

        {/* Header */}
        <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Visualization Studio</h1>
            <p className="text-muted-foreground text-lg">Generate custom charts and download infographics.</p>
          </div>
          <div className="flex items-center gap-2">
            <ShareButton
              text={viewMode === "overview"
                ? `📊 ${overviewTitle} | Africa Energy Investment Tracker`
                : `📊 ${spotlightChartTitle} | Africa Energy Investment Tracker`}
              chartRef={viewMode === "overview" ? chartRef : spotlightRef}
              variant="icon-label"
              className="border border-border rounded-xl px-3 py-3 bg-card hover:bg-muted"
            />
            {viewMode === "overview" && !isAdvanced(chartType) && (
              <button
                onClick={() => setShowEmbedModal(true)}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium transition-colors"
              >
                <Code2 className="w-4 h-4 text-[#00e676]" />
                Embed
              </button>
            )}
            <ExportDropdown
              label={viewMode === "overview" ? "Download Chart" : "Export Profile"}
              options={[
                {
                  id: "png", label: "PNG Image", description: "High-res chart screenshot", type: "png",
                  onExport: async () => {
                    const ref = viewMode === "overview" ? chartRef : spotlightRef;
                    await exportChart(ref, viewMode === "overview" ? `${grouping}-${metric}` : `spotlight-${selectedSpotlight}`, setIsExporting);
                  },
                },
                {
                  id: "pdf", label: "PDF Document", description: "Chart embedded in A4 landscape", type: "pdf",
                  onExport: async () => {
                    const ref = viewMode === "overview" ? chartRef : spotlightRef;
                    if (!ref.current) return;
                    const title = viewMode === "overview" ? overviewTitle : `${selectedSpotlight} Energy Profile`;
                    await exportImageToPdf(ref.current, title, `afrienergy-${viewMode === "overview" ? `${grouping}-${metric}` : `spotlight-${selectedSpotlight}`}.pdf`);
                  },
                },
                {
                  id: "pptx", label: "PowerPoint Slide", description: "Single branded slide with chart", type: "pptx",
                  onExport: async () => {
                    const ref = viewMode === "overview" ? chartRef : spotlightRef;
                    if (!ref.current) return;
                    const title = viewMode === "overview" ? overviewTitle : `${selectedSpotlight} Energy Profile`;
                    await exportImageToPptx(ref.current, title, `afrienergy-${viewMode === "overview" ? `${grouping}-${metric}` : `spotlight-${selectedSpotlight}`}.pptx`);
                  },
                },
              ]}
            />
          </div>
        </header>

        {showEmbedModal && (
          <EmbedCodeModal chartType={chartType} groupBy={grouping} metric={metric} onClose={() => setShowEmbedModal(false)} />
        )}

        {/* View Mode Tabs */}
        <div className="flex gap-2 mb-6 bg-card border border-border rounded-xl p-1 w-fit">
          {([
            { value: "overview", label: "Overview Charts", icon: <BarChart2 className="w-4 h-4" /> },
            { value: "spotlight", label: "Country / Region Spotlight", icon: <Globe className="w-4 h-4" /> },
          ] as { value: ViewMode; label: string; icon: React.ReactNode }[]).map(tab => (
            <button key={tab.value} onClick={() => setViewMode(tab.value)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                ${viewMode === tab.value ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"}`}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW MODE ── */}
        {viewMode === "overview" && (
          <>
            {/* Chart Type Selector */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm mb-4">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <BarChart2 className="w-4 h-4" /> Chart Type
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <div className="md:col-span-4">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Basic</p>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
                    {BASIC_CHART_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => setChartType(opt.value)}
                        className={`py-2 px-2 rounded-lg text-xs font-medium transition-colors border text-center
                          ${chartType === opt.value ? "bg-primary/20 border-primary/50 text-primary" : "bg-background border-border hover:bg-muted text-muted-foreground"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-4">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Advanced</p>
                    <span className="text-[10px] bg-[#00e676]/10 text-[#00e676] border border-[#00e676]/20 px-1.5 py-0.5 rounded-full font-bold tracking-wide">NEW</span>
                  </div>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-1.5">
                    {ADVANCED_CHART_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => setChartType(opt.value)}
                        className={`py-2 px-2 rounded-lg text-xs font-medium transition-colors border text-center
                          ${chartType === opt.value ? "bg-primary/20 border-primary/50 text-primary" : "bg-background border-border hover:bg-muted text-muted-foreground"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Config Panel — dynamic per chart type */}
            {!isAdvanced(chartType) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <ToggleGroup
                    label="Metric"
                    value={metric}
                    options={[{ value: "totalInvestmentUsdMn", label: "Investment ($)" }, { value: "projectCount", label: "Projects (#)" }]}
                    onChange={v => setMetric(v as Metric)}
                  />
                </div>
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <SelectField label="Group By" value={grouping} onChange={v => setGrouping(v as Grouping)}>
                    <option value="technology">Sector</option>
                    <option value="region">Region</option>
                    <option value="country">Country</option>
                    <option value="year">Year</option>
                  </SelectField>
                </div>
              </div>
            )}

            {chartType === "treemap" && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <ToggleGroup label="Metric" value={tmMetric}
                    options={[{ value: "totalInvestmentUsdMn", label: "Investment ($)" }, { value: "projectCount", label: "Projects (#)" }]}
                    onChange={v => setTmMetric(v as TreemapMetric)} />
                </div>
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <SelectField label="Level 1 (outer)" value={tmLevel1} onChange={v => setTmLevel1(v as TreemapLevel1)}>
                    <option value="region">Region</option>
                    <option value="sector">Sector</option>
                    <option value="year">Year</option>
                  </SelectField>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <SelectField label="Level 2 (inner)" value={tmLevel2} onChange={v => setTmLevel2(v as TreemapLevel2)}>
                    <option value="country">Country</option>
                    <option value="sector">Sector</option>
                    <option value="status">Status</option>
                  </SelectField>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <ToggleGroup label="Color By" value={tmColorBy}
                    options={[{ value: "region", label: "Region" }, { value: "sector", label: "Sector" }]}
                    onChange={v => setTmColorBy(v as TreemapColorBy)} />
                </div>
              </div>
            )}

            {(chartType === "stacked-bar" || chartType === "stacked-bar-100") && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <ToggleGroup label="Metric" value={sbMetric}
                    options={[{ value: "totalInvestmentUsdMn", label: "Investment ($)" }, { value: "projectCount", label: "Projects (#)" }]}
                    onChange={v => setSbMetric(v as StackMetric)} />
                </div>
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <SelectField label="X-Axis" value={sbXAxis} onChange={v => setSbXAxis(v as StackXAxis)}>
                    <option value="year">Year</option>
                    <option value="region">Region</option>
                    <option value="country">Country</option>
                  </SelectField>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <SelectField label="Stack By" value={sbStackBy} onChange={v => setSbStackBy(v as StackBy)}>
                    <option value="sector">Sector</option>
                    <option value="region">Region</option>
                    <option value="status">Status</option>
                    <option value="financing">Financing Type</option>
                  </SelectField>
                </div>
                {chartType === "stacked-bar" && (
                  <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <ToggleGroup label="Mode" value={sbMode}
                      options={[{ value: "absolute", label: "Absolute" }, { value: "percentage", label: "100%" }]}
                      onChange={v => setSbMode(v as StackMode)} />
                  </div>
                )}
              </div>
            )}

            {chartType === "sankey" && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <SelectField label="From (left)" value={skFrom} onChange={v => setSkFrom(v as SankeyFrom)}>
                    <option value="region">Region</option>
                    <option value="financing">Financing Type</option>
                  </SelectField>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <SelectField label="Through (middle)" value={skThrough} onChange={v => setSkThrough(v as SankeyThrough)}>
                    <option value="country">Country</option>
                    <option value="sector">Sector</option>
                    <option value="none">None (2-step)</option>
                  </SelectField>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <SelectField label="To (right)" value={skTo} onChange={v => setSkTo(v as SankeyTo)}>
                    <option value="sector">Sector</option>
                    <option value="status">Status</option>
                    <option value="country">Country</option>
                  </SelectField>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <SelectField label="Top N flows" value={String(skTopN)} onChange={v => setSkTopN(Number(v) as SankeyTopN)}>
                    <option value="10">Top 10</option>
                    <option value="20">Top 20</option>
                    <option value="50">Top 50</option>
                  </SelectField>
                </div>
              </div>
            )}

            {chartType === "scatter" && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <SelectField label="X-Axis" value={scXField} onChange={v => setScXField(v as ScatterXMetric)}>
                    <option value="capacityMw">Capacity (MW)</option>
                    <option value="dealSizeUsdMn">Deal Size ($M)</option>
                    <option value="announcedYear">Year Announced</option>
                    {scDataLevel === "country" && <option value="projectCount">Project Count</option>}
                  </SelectField>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <SelectField label="Y-Axis" value={scYField} onChange={v => setScYField(v as ScatterYMetric)}>
                    <option value="dealSizeUsdMn">Deal Size ($M)</option>
                    <option value="capacityMw">Capacity (MW)</option>
                    <option value="announcedYear">Year Announced</option>
                    {scDataLevel === "country" && <option value="projectCount">Project Count</option>}
                  </SelectField>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <SelectField label="Color By" value={scColorBy} onChange={v => setScColorBy(v as ScatterColorBy)}>
                    <option value="sector">Sector</option>
                    <option value="region">Region</option>
                    <option value="status">Status</option>
                  </SelectField>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <SelectField label="Bubble Size" value={scSizeBy} onChange={v => setScSizeBy(v as ScatterSizeBy)}>
                    <option value="none">None (scatter)</option>
                    <option value="dealSizeUsdMn">Deal Size ($M)</option>
                    <option value="capacityMw">Capacity (MW)</option>
                  </SelectField>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <ToggleGroup label="Data Level" value={scDataLevel}
                    options={[{ value: "project", label: "Project" }, { value: "country", label: "Country" }]}
                    onChange={v => setScDataLevel(v as ScatterDataLevel)} />
                </div>
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center gap-3">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Show Averages</p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div
                        onClick={() => setScShowAvg(v => !v)}
                        className={`w-10 h-5 rounded-full border transition-colors cursor-pointer relative flex items-center px-0.5
                          ${scShowAvg ? "bg-primary/30 border-primary/50" : "bg-background border-border"}`}
                      >
                        <div className={`w-4 h-4 rounded-full transition-all ${scShowAvg ? "bg-primary translate-x-5" : "bg-muted-foreground translate-x-0"}`} />
                      </div>
                      <span className="text-sm text-muted-foreground">{scShowAvg ? "On" : "Off"}</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Chart Canvas */}
            <div ref={chartRef} className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-visible" style={{ minHeight: 520 }}>
              <div className="absolute bottom-4 right-6 opacity-10 font-display font-bold text-2xl pointer-events-none select-none">
                AfriEnergy Tracker
              </div>
              <h2 className="text-xl md:text-2xl font-bold font-display text-center mb-6">{overviewTitle}</h2>

              {/* Basic Charts */}
              {!isAdvanced(chartType) && (
                isLoading ? (
                  <div className="w-full h-96 flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                  </div>
                ) : (
                  <ChartRenderer chartType={chartType as BasicChartType} data={activeData} nameKey={nameKey} metric={metric} height={420} colorMap={nameKey === "technology" ? SECTOR_COLORS : undefined} />
                )
              )}

              {/* Treemap */}
              {chartType === "treemap" && (
                isAdvancedLoading ? (
                  <div className="w-full h-96 flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                  </div>
                ) : (
                  <TreemapChart
                    projects={allProjects}
                    metric={tmMetric}
                    level1={tmLevel1}
                    level2={tmLevel2}
                    colorBy={tmColorBy}
                    height={480}
                  />
                )
              )}

              {/* Stacked Bar */}
              {(chartType === "stacked-bar" || chartType === "stacked-bar-100") && (
                isAdvancedLoading ? (
                  <div className="w-full h-96 flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                  </div>
                ) : (
                  <StackedBarChart
                    projects={allProjects}
                    metric={sbMetric}
                    xAxis={sbXAxis}
                    stackBy={sbStackBy}
                    mode={stackedMode}
                    height={420}
                  />
                )
              )}

              {/* Sankey */}
              {chartType === "sankey" && (
                isAdvancedLoading ? (
                  <div className="w-full h-96 flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                  </div>
                ) : (
                  <SankeyChart
                    projects={allProjects}
                    from={skFrom}
                    through={skThrough}
                    to={skTo}
                    topN={skTopN}
                    height={520}
                  />
                )
              )}

              {/* Scatter / Bubble */}
              {chartType === "scatter" && (
                isAdvancedLoading ? (
                  <div className="w-full h-96 flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                  </div>
                ) : (
                  <ScatterBubbleChart
                    projects={allProjects}
                    xField={scXField}
                    yField={scYField}
                    colorBy={scColorBy}
                    sizeBy={scSizeBy}
                    dataLevel={scDataLevel}
                    showAverages={scShowAvg}
                    height={460}
                  />
                )
              )}
            </div>
          </>
        )}

        {/* ── SPOTLIGHT MODE ── */}
        {viewMode === "spotlight" && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Globe className="w-4 h-4" /> View By
                </label>
                <div className="flex gap-2">
                  {([{ value: "country", label: "Country" }, { value: "region", label: "Region" }] as { value: SpotlightType; label: string }[]).map(t => (
                    <button key={t.value} onClick={() => { setSpotlightType(t.value); setSelectedSpotlight(""); setSpotlightGrouping("technology"); }}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors border
                        ${spotlightType === t.value ? "bg-primary/20 border-primary/50 text-primary" : "bg-background border-border hover:bg-muted text-muted-foreground"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm md:col-span-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Select {spotlightType === "country" ? "Country" : "Region"}
                </label>
                <div className="relative">
                  <select value={selectedSpotlight} onChange={e => setSelectedSpotlight(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none pr-10">
                    <option value="">— Choose a {spotlightType} —</option>
                    {spotlightOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>

            {!selectedSpotlight ? (
              <div className="bg-card border border-border rounded-2xl flex items-center justify-center text-center p-16" style={{ minHeight: 400 }}>
                <div>
                  <Globe className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                  <p className="text-muted-foreground text-lg font-medium">Select a {spotlightType} above to generate its data profile</p>
                  <p className="text-muted-foreground/60 text-sm mt-2">Charts, investment stats, and project breakdown will appear here</p>
                </div>
              </div>
            ) : loadSpotlight ? (
              <div className="bg-card border border-border rounded-2xl flex items-center justify-center" style={{ minHeight: 400 }}>
                <RefreshCw className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : (
              <div ref={spotlightRef} className="bg-card border border-border rounded-2xl p-8 shadow-2xl relative overflow-hidden space-y-8">
                <div className="absolute bottom-4 right-6 opacity-10 font-display font-bold text-2xl pointer-events-none select-none">
                  AfriEnergy Tracker
                </div>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">
                      {spotlightType === "country" ? "Country Profile" : "Regional Profile"}
                    </div>
                    <h2 className="text-3xl font-bold font-display">{selectedSpotlight}</h2>
                    {spotlightType === "country" && byCountry && (
                      <p className="text-muted-foreground mt-1">{byCountry.find(c => c.country === selectedSpotlight)?.region}</p>
                    )}
                    {spotlightType === "region" && (
                      <p className="text-muted-foreground mt-1">{spotlightCountriesData.length} countries in this region</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Total Investment", value: formatValue(spotlightTotalInvestment, "totalInvestmentUsdMn"), icon: <DollarSign className="w-5 h-5" />, color: "text-primary" },
                    { label: "Projects", value: spotlightProjectCount.toString(), icon: <Layers className="w-5 h-5" />, color: "text-blue-400" },
                    { label: "Top Sector", value: spotlightTopTech, icon: <Zap className="w-5 h-5" />, color: "text-amber-400" },
                    {
                      label: spotlightType === "country" ? "Region" : "Countries",
                      value: spotlightType === "country" ? (byCountry?.find(c => c.country === selectedSpotlight)?.region ?? "—") : spotlightCountriesData.length.toString(),
                      icon: <Globe className="w-5 h-5" />, color: "text-green-400",
                    },
                  ].map(kpi => (
                    <div key={kpi.label} className="bg-background border border-border rounded-xl p-4">
                      <div className={`mb-2 ${kpi.color}`}>{kpi.icon}</div>
                      <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
                      <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-background border border-border rounded-xl p-4">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <BarChart2 className="w-4 h-4" /> Chart Type
                    </label>
                    <div className="relative">
                      <select value={spotlightChartType} onChange={e => setSpotlightChartType(e.target.value as BasicChartType)}
                        className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none pr-10">
                        {BASIC_CHART_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  <div className="bg-background border border-border rounded-xl p-4">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Layers className="w-4 h-4" /> Metric
                    </label>
                    <div className="flex gap-2">
                      {([{ value: "totalInvestmentUsdMn", label: "Investment ($)" }, { value: "projectCount", label: "Projects (#)" }] as { value: Metric; label: string }[]).map(m => (
                        <button key={m.value} onClick={() => setSpotlightMetric(m.value)}
                          className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors border
                            ${spotlightMetric === m.value ? "bg-primary/20 border-primary/50 text-primary" : "bg-card border-border hover:bg-muted text-muted-foreground"}`}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-background border border-border rounded-xl p-4">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <RefreshCw className="w-4 h-4" /> Group By
                    </label>
                    <div className="relative">
                      <select value={spotlightGrouping} onChange={e => setSpotlightGrouping(e.target.value)}
                        className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none pr-10">
                        {spotlightGroupByOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div ref={spotlightChartRef} className="bg-background border border-border rounded-2xl p-6 relative overflow-hidden">
                  <div className="absolute bottom-3 right-5 opacity-10 font-display font-bold text-xl pointer-events-none select-none">AfriEnergy Tracker</div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-lg">{spotlightChartTitle}</h3>
                    <button data-no-export=""
                      onClick={() => exportChart(spotlightChartRef, `${selectedSpotlight}-${spotlightGrouping}-${spotlightMetric}`, setIsExportingSpotlightChart)}
                      disabled={isExportingSpotlightChart || !spotlightActiveData.length}
                      className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                      {isExportingSpotlightChart ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      Download Chart
                    </button>
                  </div>
                  {spotlightActiveData.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No data available for this selection</div>
                  ) : (
                    <ChartRenderer chartType={spotlightChartType} data={spotlightActiveData} nameKey={spotlightNameKey}
                      metric={spotlightMetric} height={380} colorMap={spotlightNameKey === "technology" ? SECTOR_COLORS : undefined} />
                  )}
                </div>

                {spotlightProjects?.projects && spotlightProjects.projects.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" /> Projects ({spotlightProjectCount})
                    </h3>
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/30">
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Project</th>
                            {spotlightType === "region" && <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Country</th>}
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Sector</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Deal Size</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {spotlightProjects.projects.map((p, i) => (
                            <tr key={p.id} className={`border-b border-border/50 ${i % 2 === 0 ? "" : "bg-muted/10"} hover:bg-muted/20 transition-colors`}>
                              <td className="px-4 py-3 font-medium">{p.projectName}</td>
                              {spotlightType === "region" && <td className="px-4 py-3 text-muted-foreground">{p.country}</td>}
                              <td className="px-4 py-3 text-muted-foreground">{p.technology}</td>
                              <td className="px-4 py-3 text-right font-mono font-semibold text-primary">
                                {p.dealSizeUsdMn ? `$${p.dealSizeUsdMn.toLocaleString()}M` : "—"}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium border
                                  ${p.status.toLowerCase() === "operational" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : p.status.toLowerCase() === "under construction" ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                    : p.status.toLowerCase() === "development" ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                    : "bg-muted text-muted-foreground border-border"}`}>
                                  {p.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

      </PageTransition>
    </Layout>
  );
}
