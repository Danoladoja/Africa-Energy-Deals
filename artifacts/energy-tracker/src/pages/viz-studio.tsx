import { useState, useRef } from "react";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { 
  useGetStatsByCountry, 
  useGetStatsByTechnology, 
  useGetStatsByRegion, 
  useGetStatsByYear 
} from "@workspace/api-client-react";
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from "recharts";
import { Download, RefreshCw, Layers, BarChart2 } from "lucide-react";
import html2canvas from "html2canvas";

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

type ChartType = 'bar' | 'line' | 'pie';
type Metric = 'totalInvestmentUsdMn' | 'projectCount';
type Grouping = 'country' | 'technology' | 'region' | 'year';

export default function VizStudio() {
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [metric, setMetric] = useState<Metric>('totalInvestmentUsdMn');
  const [grouping, setGrouping] = useState<Grouping>('technology');
  const [isExporting, setIsExporting] = useState(false);
  
  const chartRef = useRef<HTMLDivElement>(null);

  // Fetch all stats (React Query will cache them)
  const { data: byCountry, isLoading: loadC } = useGetStatsByCountry();
  const { data: byTech, isLoading: loadT } = useGetStatsByTechnology();
  const { data: byRegion, isLoading: loadR } = useGetStatsByRegion();
  const { data: byYear, isLoading: loadY } = useGetStatsByYear();

  const isLoading = loadC || loadT || loadR || loadY;

  // Select appropriate data and format keys
  let activeData: any[] = [];
  let nameKey = '';
  
  if (grouping === 'country') { activeData = byCountry || []; nameKey = 'country'; }
  else if (grouping === 'technology') { activeData = byTech || []; nameKey = 'technology'; }
  else if (grouping === 'region') { activeData = byRegion || []; nameKey = 'region'; }
  else if (grouping === 'year') { activeData = byYear || []; nameKey = 'year'; }

  // Sort data for better visualization if it's a bar chart and not time series
  if (chartType === 'bar' && grouping !== 'year') {
    activeData = [...activeData].sort((a, b) => b[metric] - a[metric]).slice(0, 15); // Top 15 max
  }

  const handleExport = async () => {
    if (!chartRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#0B0F19', // Match dark theme
        scale: 2, // High res
        logging: false
      });
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `afrienergy-${grouping}-${metric}.png`;
      link.href = url;
      link.click();
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setIsExporting(false);
    }
  };

  const formatValue = (value: number) => {
    if (metric === 'projectCount') return value;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}B`;
    return `$${value.toFixed(0)}M`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border p-3 rounded-lg shadow-xl z-50 relative">
          <p className="font-medium mb-1">{label}</p>
          <p className="text-primary font-bold text-lg">
            {formatValue(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Layout>
      <PageTransition className="p-4 md:p-8 max-w-7xl mx-auto flex flex-col h-full">
        
        <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Visualization Studio</h1>
            <p className="text-muted-foreground text-lg">Generate custom charts and infographics from the data.</p>
          </div>
          <button 
            onClick={handleExport}
            disabled={isExporting || isLoading}
            className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:transform-none"
          >
            {isExporting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            Export as PNG
          </button>
        </header>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <BarChart2 className="w-4 h-4" /> Chart Type
            </label>
            <div className="flex gap-2">
              {(['bar', 'line', 'pie'] as ChartType[]).map(type => (
                <button
                  key={type}
                  onClick={() => setChartType(type)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium capitalize transition-colors border
                    ${chartType === type 
                      ? 'bg-primary/20 border-primary/50 text-primary' 
                      : 'bg-background border-border hover:bg-muted text-muted-foreground'}
                  `}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4" /> Metric
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setMetric('totalInvestmentUsdMn')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors border
                  ${metric === 'totalInvestmentUsdMn' 
                    ? 'bg-primary/20 border-primary/50 text-primary' 
                    : 'bg-background border-border hover:bg-muted text-muted-foreground'}
                `}
              >
                Investment ($)
              </button>
              <button
                onClick={() => setMetric('projectCount')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors border
                  ${metric === 'projectCount' 
                    ? 'bg-primary/20 border-primary/50 text-primary' 
                    : 'bg-background border-border hover:bg-muted text-muted-foreground'}
                `}
              >
                Projects (#)
              </button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Group By
            </label>
            <select 
              value={grouping}
              onChange={(e) => setGrouping(e.target.value as Grouping)}
              className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
            >
              <option value="technology">Technology</option>
              <option value="region">Region</option>
              <option value="country">Country</option>
              <option value="year">Year</option>
            </select>
          </div>

        </div>

        {/* Chart Canvas */}
        <div 
          ref={chartRef}
          className="flex-1 bg-card border border-border rounded-2xl p-8 shadow-2xl relative overflow-hidden"
          style={{ minHeight: '500px' }}
        >
          {/* Watermark for export */}
          <div className="absolute bottom-4 right-6 opacity-20 font-display font-bold text-2xl pointer-events-none">
            AfriEnergy Tracker
          </div>
          
          <h2 className="text-2xl font-bold font-display text-center mb-8 capitalize">
            {metric === 'totalInvestmentUsdMn' ? 'Investment Volume' : 'Number of Projects'} by {grouping}
          </h2>

          {isLoading ? (
            <div className="w-full h-[400px] flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : (
            <div className="w-full h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'bar' ? (
                  <BarChart data={activeData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis 
                      dataKey={nameKey} 
                      stroke="hsl(var(--muted-foreground))" 
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      angle={grouping === 'country' ? -45 : 0}
                      textAnchor={grouping === 'country' ? 'end' : 'middle'}
                      height={60}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      tickFormatter={formatValue}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{fill: 'hsl(var(--muted)/0.3)'}} />
                    <Bar 
                      dataKey={metric} 
                      fill="hsl(var(--primary))" 
                      radius={[6, 6, 0, 0]}
                    >
                      {activeData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : chartType === 'line' ? (
                  <LineChart data={activeData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey={nameKey} stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={formatValue} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line 
                      type="monotone" 
                      dataKey={metric} 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={4} 
                      dot={{ r: 6, fill: "hsl(var(--background))", strokeWidth: 2 }}
                      activeDot={{ r: 8, stroke: "hsl(var(--accent))" }}
                    />
                  </LineChart>
                ) : (
                  <PieChart>
                    <Pie
                      data={activeData}
                      cx="50%"
                      cy="50%"
                      outerRadius={150}
                      innerRadius={chartType === 'pie' ? 0 : 100} // Option for donut
                      dataKey={metric}
                      nameKey={nameKey}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    >
                      {activeData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </PageTransition>
    </Layout>
  );
}
