import { useMemo } from "react";
import {
  useGetStatsByCountry,
  useGetStatsByTechnology,
  useGetStatsByRegion,
  useGetStatsByYear,
} from "@workspace/api-client-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import { ExternalLink } from "lucide-react";

const COLORS = [
  "#00e676", "#00bcd4", "#f59e0b", "#06b6d4", "#3b82f6",
  "#a855f7", "#f97316", "#22c55e", "#e91e63", "#14b8a6",
];

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

type ChartType = "bar" | "horizontal-bar" | "line" | "area" | "pie" | "donut";
type Metric = "totalInvestmentUsdMn" | "projectCount";
type Grouping = "country" | "technology" | "region" | "year";

function formatValue(value: number, metric: Metric) {
  if (metric === "projectCount") return value.toString();
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}B`;
  return `$${value.toFixed(0)}M`;
}

function CustomTooltip({ active, payload, label, metric }: { active?: boolean; payload?: any[]; label?: string; metric: Metric }) {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", padding: "10px 14px", borderRadius: "10px" }}>
        <p style={{ margin: "0 0 4px", fontSize: "12px", color: "#94a3b8" }}>{label ?? payload[0]?.name}</p>
        <p style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#00e676" }}>
          {formatValue(payload[0].value, metric)}
        </p>
      </div>
    );
  }
  return null;
}

function getCellColor(item: Record<string, unknown>, nameKey: string, index: number) {
  if (nameKey === "technology") {
    const name = item[nameKey] as string;
    if (name && SECTOR_COLORS[name]) return SECTOR_COLORS[name];
  }
  return COLORS[index % COLORS.length];
}

const MF = "#334155";
const MUTED = "#64748b";

function ChartRenderer({ chartType, data, nameKey, metric }: {
  chartType: ChartType;
  data: Record<string, unknown>[];
  nameKey: string;
  metric: Metric;
}) {
  const tooltip = <CustomTooltip metric={metric} />;
  const cells = data.map((entry, i) => <Cell key={i} fill={getCellColor(entry, nameKey, i)} />);

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chartType === "bar" ? (
        <BarChart data={data} margin={{ top: 16, right: 20, left: 10, bottom: 70 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={MF} vertical={false} />
          <XAxis dataKey={nameKey} stroke={MUTED} tick={{ fill: MUTED, fontSize: 10 }} angle={-35} textAnchor="end" height={70} interval={0} />
          <YAxis stroke={MUTED} tick={{ fill: MUTED, fontSize: 10 }} tickFormatter={(v) => formatValue(v, metric)} width={70} />
          <Tooltip content={tooltip} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
          <Bar dataKey={metric} radius={[5, 5, 0, 0]}>{cells}</Bar>
        </BarChart>
      ) : chartType === "horizontal-bar" ? (
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 60, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={MF} horizontal={false} />
          <XAxis type="number" stroke={MUTED} fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => formatValue(v, metric)} />
          <YAxis type="category" dataKey={nameKey} stroke={MUTED} tick={{ fill: MUTED, fontSize: 10 }} width={130} tickLine={false} axisLine={false} />
          <Tooltip content={tooltip} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
          <Bar dataKey={metric} radius={[0, 5, 5, 0]} maxBarSize={24}>{cells}</Bar>
        </BarChart>
      ) : chartType === "line" ? (
        <LineChart data={data} margin={{ top: 16, right: 20, left: 10, bottom: 70 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={MF} />
          <XAxis dataKey={nameKey} stroke={MUTED} tick={{ fill: MUTED, fontSize: 10 }} angle={-35} textAnchor="end" height={70} interval={0} />
          <YAxis stroke={MUTED} tick={{ fill: MUTED, fontSize: 10 }} tickFormatter={(v) => formatValue(v, metric)} width={70} />
          <Tooltip content={tooltip} />
          <Line type="monotone" dataKey={metric} stroke="#00e676" strokeWidth={2} dot={{ r: 4, fill: "#0b0f1a", strokeWidth: 2, stroke: "#00e676" }} />
        </LineChart>
      ) : chartType === "area" ? (
        <AreaChart data={data} margin={{ top: 16, right: 20, left: 10, bottom: 70 }}>
          <defs>
            <linearGradient id="aG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00e676" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#00e676" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={MF} />
          <XAxis dataKey={nameKey} stroke={MUTED} tick={{ fill: MUTED, fontSize: 10 }} angle={-35} textAnchor="end" height={70} interval={0} />
          <YAxis stroke={MUTED} tick={{ fill: MUTED, fontSize: 10 }} tickFormatter={(v) => formatValue(v, metric)} width={70} />
          <Tooltip content={tooltip} />
          <Area type="monotone" dataKey={metric} stroke="#00e676" strokeWidth={2} fill="url(#aG)" />
        </AreaChart>
      ) : (
        <PieChart>
          <Pie
            data={data} cx="50%" cy="44%"
            outerRadius="40%" innerRadius={chartType === "donut" ? "22%" : 0}
            dataKey={metric} nameKey={nameKey} paddingAngle={3}
            stroke="#0b0f1a" strokeWidth={2}
          >
            {cells}
          </Pie>
          <Tooltip content={tooltip} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "10px", paddingTop: "6px", color: MUTED }} />
        </PieChart>
      )}
    </ResponsiveContainer>
  );
}

export default function EmbedChart() {
  const params = new URLSearchParams(window.location.search);
  const chartType = (params.get("type") ?? "bar") as ChartType;
  const groupBy = (params.get("groupBy") ?? "technology") as Grouping;
  const metric = (params.get("metric") === "count" ? "projectCount" : "totalInvestmentUsdMn") as Metric;
  const title = params.get("title") ?? undefined;

  const { data: byCountry, isLoading: lC } = useGetStatsByCountry();
  const { data: byTech, isLoading: lT } = useGetStatsByTechnology();
  const { data: byRegion, isLoading: lR } = useGetStatsByRegion();
  const { data: byYear, isLoading: lY } = useGetStatsByYear();

  const isLoading = lC || lT || lR || lY;

  const { data, nameKey } = useMemo(() => {
    let raw: Record<string, unknown>[] = [];
    let key = "name";
    if (groupBy === "country") { raw = (byCountry as Record<string, unknown>[] | undefined) ?? []; key = "country"; }
    else if (groupBy === "technology") { raw = (byTech as Record<string, unknown>[] | undefined) ?? []; key = "technology"; }
    else if (groupBy === "region") { raw = (byRegion as Record<string, unknown>[] | undefined) ?? []; key = "region"; }
    else if (groupBy === "year") { raw = (byYear as Record<string, unknown>[] | undefined) ?? []; key = "year"; }

    if (chartType !== "line" && chartType !== "area" && groupBy !== "year") {
      raw = [...raw].sort((a, b) => (b[metric] as number) - (a[metric] as number)).slice(0, 12);
    }
    return { data: raw, nameKey: key };
  }, [groupBy, byCountry, byTech, byRegion, byYear, chartType, metric]);

  const metricLabel = metric === "projectCount" ? "Number of Projects" : "Investment Volume (USD)";
  const groupLabel = groupBy.charAt(0).toUpperCase() + groupBy.slice(1);
  const defaultTitle = `${metricLabel} by ${groupLabel}`;
  const displayTitle = title ?? defaultTitle;

  return (
    <div style={{
      backgroundColor: "#0b0f1a",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: "16px",
      boxSizing: "border-box",
    }}>
      <div style={{ marginBottom: "12px" }}>
        <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#f1f5f9" }}>{displayTitle}</h2>
        <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#64748b" }}>Africa Energy Investment Tracker</p>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#475569", fontSize: "13px" }}>
            Loading chart data…
          </div>
        ) : data.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#475569", fontSize: "13px" }}>
            No data available
          </div>
        ) : (
          <ChartRenderer chartType={chartType} data={data} nameKey={nameKey} metric={metric} />
        )}
      </div>

      <div style={{ marginTop: "10px", display: "flex", justifyContent: "flex-end" }}>
        <a
          href="https://afrienergytracker.io"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "#475569", textDecoration: "none" }}
        >
          Powered by AfriEnergy Tracker
          <ExternalLink size={9} />
        </a>
      </div>
    </div>
  );
}
