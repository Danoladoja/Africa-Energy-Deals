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
  ChevronDown, Zap, DollarSign,
} from "lucide-react";
import { toPng } from "html-to-image";
import { ShareButton } from "@/components/share-button";

const COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))",
  "#00e676", "#00bcd4", "#ff9800", "#e91e63", "#9c27b0",
];

type ChartType = "bar" | "horizontal-bar" | "line" | "area" | "pie" | "donut";
type Metric = "totalInvestmentUsdMn" | "projectCount";
type Grouping = "country" | "technology" | "region" | "year";
type ViewMode = "overview" | "spotlight";
type SpotlightType = "country" | "region";

const CHART_OPTIONS: { value: ChartType; label: string }[] = [
  { value: "bar", label: "Vertical Bar" },
  { value: "horizontal-bar", label: "Horizontal Bar" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "pie", label: "Pie" },
  { value: "donut", label: "Donut" },
];

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

function ChartRenderer({
  chartType, data, nameKey, metric, height = 420,
}: {
  chartType: ChartType;
  data: any[];
  nameKey: string;
  metric: Metric;
  height?: number;
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
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      ) : chartType === "horizontal-bar" ? (
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 60, left: 10, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatValue(v, metric)}
            label={{ value: metric === "totalInvestmentUsdMn" ? "Investment (USD)" : "Number of Projects", position: "insideBottom", offset: -5, style: { fill: "hsl(var(--muted-foreground))", fontSize: 12 } }} />
          <YAxis type="category" dataKey={nameKey} stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} width={160} />
          <Tooltip content={tooltipEl} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
          <Bar dataKey={metric} radius={[0, 6, 6, 0]}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      ) : chartType === "line" ? (
        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 90 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey={nameKey} stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} angle={-35} textAnchor="end" height={90} interval={0} />
          <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatValue(v, metric)}
            label={{ value: metric === "totalInvestmentUsdMn" ? "Investment (USD)" : "Number of Projects", angle: -90, position: "insideLeft", style: { textAnchor: "middle", fill: "hsl(var(--muted-foreground))", fontSize: 12 } }} />
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
          <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatValue(v, metric)}
            label={{ value: metric === "totalInvestmentUsdMn" ? "Investment (USD)" : "Number of Projects", angle: -90, position: "insideLeft", style: { textAnchor: "middle", fill: "hsl(var(--muted-foreground))", fontSize: 12 } }} />
          <Tooltip content={tooltipEl} />
          <Area type="monotone" dataKey={metric} stroke="hsl(var(--primary))" strokeWidth={3}
            fill="url(#areaGrad)" dot={{ r: 4, fill: "hsl(var(--primary))" }} />
        </AreaChart>
      ) : (
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" outerRadius={Math.min(height / 2 - 40, 160)} innerRadius={chartType === "donut" ? 80 : 0}
            dataKey={metric} nameKey={nameKey}
            label={({ name, percent }) => percent > 0.04 ? `${name} ${(percent * 100).toFixed(0)}%` : ""}
            labelLine={{ stroke: "hsl(var(--muted-foreground))" }}
            stroke="hsl(var(--background))" strokeWidth={2}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip content={tooltipEl} />
          <Legend />
        </PieChart>
      )}
    </ResponsiveContainer>
  );
}

export default function VizStudio() {
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [metric, setMetric] = useState<Metric>("totalInvestmentUsdMn");
  const [grouping, setGrouping] = useState<Grouping>("technology");
  const [spotlightType, setSpotlightType] = useState<SpotlightType>("country");
  const [selectedSpotlight, setSelectedSpotlight] = useState<string>("");
  const [spotlightChartType, setSpotlightChartType] = useState<ChartType>("horizontal-bar");
  const [spotlightMetric, setSpotlightMetric] = useState<Metric>("totalInvestmentUsdMn");
  const [spotlightGrouping, setSpotlightGrouping] = useState<string>("technology");
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingSpotlightChart, setIsExportingSpotlightChart] = useState(false);

  const chartRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const spotlightChartRef = useRef<HTMLDivElement>(null);

  const { data: byCountry, isLoading: loadC } = useGetStatsByCountry();
  const { data: byTech, isLoading: loadT } = useGetStatsByTechnology();
  const { data: byRegion, isLoading: loadR } = useGetStatsByRegion();
  const { data: byYear, isLoading: loadY } = useGetStatsByYear();

  const spotlightParams = useMemo(() => {
    if (!selectedSpotlight) return { page: 1, limit: 1 };
    return spotlightType === "country"
      ? { country: selectedSpotlight, page: 1, limit: 100 }
      : { region: selectedSpotlight, page: 1, limit: 100 };
  }, [spotlightType, selectedSpotlight]);

  const { data: spotlightProjects, isLoading: loadSpotlight } = useListProjects(spotlightParams);

  const isLoading = loadC || loadT || loadR || loadY;

  // Overview chart data
  let activeData: any[] = [];
  let nameKey = "";
  if (grouping === "country") { activeData = byCountry || []; nameKey = "country"; }
  else if (grouping === "technology") { activeData = byTech || []; nameKey = "technology"; }
  else if (grouping === "region") { activeData = byRegion || []; nameKey = "region"; }
  else if (grouping === "year") { activeData = byYear || []; nameKey = "year"; }

  if (chartType !== "line" && chartType !== "area" && grouping !== "year") {
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
    const base = [
      { value: "technology", label: "Technology" },
      { value: "year", label: "Year" },
    ];
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
    spotlightGrouping === "technology" ? "Technology" : spotlightGrouping === "year" ? "Year" : "Country"
  } — ${selectedSpotlight}`;

  const exportChart = async (ref: React.RefObject<HTMLDivElement | null>, filename: string, setLoading: (v: boolean) => void) => {
    if (!ref.current) return;
    setLoading(true);
    try {
      // Small delay to ensure recharts SVG is fully painted
      await new Promise(r => setTimeout(r, 150));
      const dataUrl = await toPng(ref.current, {
        backgroundColor: "#0B0F19",
        pixelRatio: 2,
        cacheBust: true,
        // Exclude UI controls (buttons with data-no-export) from the image
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

  const overviewTitle = `${metric === "totalInvestmentUsdMn" ? "Investment Volume" : "Number of Projects"} by ${grouping.charAt(0).toUpperCase() + grouping.slice(1)}`;

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
            <button
              onClick={() => viewMode === "overview"
                ? exportChart(chartRef, `${grouping}-${metric}`, setIsExporting)
                : exportChart(spotlightRef, `spotlight-${selectedSpotlight}`, setIsExporting)
              }
              disabled={isExporting || isLoading || (viewMode === "spotlight" && !selectedSpotlight)}
              className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:transform-none"
            >
              {isExporting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              {viewMode === "overview" ? "Download Chart" : "Export Full Profile"}
            </button>
          </div>
        </header>

        {/* View Mode Tabs */}
        <div className="flex gap-2 mb-6 bg-card border border-border rounded-xl p-1 w-fit">
          {([
            { value: "overview", label: "Overview Charts", icon: <BarChart2 className="w-4 h-4" /> },
            { value: "spotlight", label: "Country / Region Spotlight", icon: <Globe className="w-4 h-4" /> },
          ] as { value: ViewMode; label: string; icon: React.ReactNode }[]).map(tab => (
            <button
              key={tab.value}
              onClick={() => setViewMode(tab.value)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                ${viewMode === tab.value ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"}`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW MODE ── */}
        {viewMode === "overview" && (
          <>
            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

              {/* Chart Type Dropdown */}
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4" /> Chart Type
                </label>
                <div className="relative">
                  <select
                    value={chartType}
                    onChange={e => setChartType(e.target.value as ChartType)}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none pr-10"
                  >
                    {CHART_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              {/* Metric */}
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Layers className="w-4 h-4" /> Metric
                </label>
                <div className="flex gap-2">
                  {([
                    { value: "totalInvestmentUsdMn", label: "Investment ($)" },
                    { value: "projectCount", label: "Projects (#)" },
                  ] as { value: Metric; label: string }[]).map(m => (
                    <button key={m.value} onClick={() => setMetric(m.value)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors border
                        ${metric === m.value ? "bg-primary/20 border-primary/50 text-primary" : "bg-background border-border hover:bg-muted text-muted-foreground"}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Group By */}
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" /> Group By
                </label>
                <div className="relative">
                  <select
                    value={grouping}
                    onChange={e => setGrouping(e.target.value as Grouping)}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none pr-10"
                  >
                    <option value="technology">Technology</option>
                    <option value="region">Region</option>
                    <option value="country">Country</option>
                    <option value="year">Year</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Chart Canvas */}
            <div ref={chartRef} className="bg-card border border-border rounded-2xl p-8 shadow-2xl relative overflow-hidden" style={{ minHeight: 520 }}>
              <div className="absolute bottom-4 right-6 opacity-10 font-display font-bold text-2xl pointer-events-none select-none">
                AfriEnergy Tracker
              </div>
              <h2 className="text-2xl font-bold font-display text-center mb-8">{overviewTitle}</h2>
              {isLoading ? (
                <div className="w-full h-96 flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                </div>
              ) : (
                <ChartRenderer chartType={chartType} data={activeData} nameKey={nameKey} metric={metric} height={420} />
              )}
            </div>
          </>
        )}

        {/* ── SPOTLIGHT MODE ── */}
        {viewMode === "spotlight" && (
          <>
            {/* Spotlight Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

              {/* Spotlight Type */}
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Globe className="w-4 h-4" /> View By
                </label>
                <div className="flex gap-2">
                  {([
                    { value: "country", label: "Country" },
                    { value: "region", label: "Region" },
                  ] as { value: SpotlightType; label: string }[]).map(t => (
                    <button key={t.value} onClick={() => { setSpotlightType(t.value); setSelectedSpotlight(""); setSpotlightGrouping("technology"); }}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors border
                        ${spotlightType === t.value ? "bg-primary/20 border-primary/50 text-primary" : "bg-background border-border hover:bg-muted text-muted-foreground"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Select Country/Region */}
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm md:col-span-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Select {spotlightType === "country" ? "Country" : "Region"}
                </label>
                <div className="relative">
                  <select
                    value={selectedSpotlight}
                    onChange={e => setSelectedSpotlight(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none pr-10"
                  >
                    <option value="">— Choose a {spotlightType} —</option>
                    {spotlightOptions.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
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

                {/* Spotlight Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">
                      {spotlightType === "country" ? "Country Profile" : "Regional Profile"}
                    </div>
                    <h2 className="text-3xl font-bold font-display">{selectedSpotlight}</h2>
                    {spotlightType === "country" && byCountry && (
                      <p className="text-muted-foreground mt-1">
                        {byCountry.find(c => c.country === selectedSpotlight)?.region}
                      </p>
                    )}
                    {spotlightType === "region" && (
                      <p className="text-muted-foreground mt-1">{spotlightCountriesData.length} countries in this region</p>
                    )}
                  </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Total Investment", value: formatValue(spotlightTotalInvestment, "totalInvestmentUsdMn"), icon: <DollarSign className="w-5 h-5" />, color: "text-primary" },
                    { label: "Projects", value: spotlightProjectCount.toString(), icon: <Layers className="w-5 h-5" />, color: "text-blue-400" },
                    { label: "Top Technology", value: spotlightTopTech, icon: <Zap className="w-5 h-5" />, color: "text-amber-400" },
                    {
                      label: spotlightType === "country" ? "Region" : "Countries",
                      value: spotlightType === "country"
                        ? (byCountry?.find(c => c.country === selectedSpotlight)?.region ?? "—")
                        : spotlightCountriesData.length.toString(),
                      icon: <Globe className="w-5 h-5" />,
                      color: "text-green-400"
                    },
                  ].map(kpi => (
                    <div key={kpi.label} className="bg-background border border-border rounded-xl p-4">
                      <div className={`mb-2 ${kpi.color}`}>{kpi.icon}</div>
                      <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
                      <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
                    </div>
                  ))}
                </div>

                {/* Chart Controls */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                  <div className="bg-background border border-border rounded-xl p-4">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <BarChart2 className="w-4 h-4" /> Chart Type
                    </label>
                    <div className="relative">
                      <select
                        value={spotlightChartType}
                        onChange={e => setSpotlightChartType(e.target.value as ChartType)}
                        className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none pr-10"
                      >
                        {CHART_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  <div className="bg-background border border-border rounded-xl p-4">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Layers className="w-4 h-4" /> Metric
                    </label>
                    <div className="flex gap-2">
                      {([
                        { value: "totalInvestmentUsdMn", label: "Investment ($)" },
                        { value: "projectCount", label: "Projects (#)" },
                      ] as { value: Metric; label: string }[]).map(m => (
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
                      <select
                        value={spotlightGrouping}
                        onChange={e => setSpotlightGrouping(e.target.value)}
                        className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none pr-10"
                      >
                        {spotlightGroupByOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Spotlight Chart Canvas */}
                <div ref={spotlightChartRef} className="bg-background border border-border rounded-2xl p-6 relative overflow-hidden">
                  <div className="absolute bottom-3 right-5 opacity-10 font-display font-bold text-xl pointer-events-none select-none">
                    AfriEnergy Tracker
                  </div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-lg">{spotlightChartTitle}</h3>
                    <button
                      data-no-export=""
                      onClick={() => exportChart(spotlightChartRef, `${selectedSpotlight}-${spotlightGrouping}-${spotlightMetric}`, setIsExportingSpotlightChart)}
                      disabled={isExportingSpotlightChart || !spotlightActiveData.length}
                      className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {isExportingSpotlightChart ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      Download Chart
                    </button>
                  </div>
                  {spotlightActiveData.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                      No data available for this selection
                    </div>
                  ) : (
                    <ChartRenderer
                      chartType={spotlightChartType}
                      data={spotlightActiveData}
                      nameKey={spotlightNameKey}
                      metric={spotlightMetric}
                      height={380}
                    />
                  )}
                </div>

                {/* Project List */}
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
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Technology</th>
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
