import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { SECTOR_COLORS, REGION_COLORS, STATUS_COLORS, FINANCING_COLORS, getColor, formatVal, FALLBACK_COLORS } from "@/utils/chart-colors";
import { useChartTheme } from "@/hooks/useChartTheme";

export type StackMetric = "totalInvestmentUsdMn" | "projectCount";
export type StackXAxis = "year" | "region" | "country";
export type StackBy = "sector" | "region" | "status" | "financing";
export type StackMode = "absolute" | "percentage";

interface StackProject {
  country: string;
  region: string;
  technology: string;
  status: string;
  dealSizeUsdMn?: number | null;
  announcedYear?: number | null;
  financingType?: string | null;
}

function getColorMap(stackBy: StackBy): Record<string, string> {
  if (stackBy === "sector") return SECTOR_COLORS;
  if (stackBy === "region") return REGION_COLORS;
  if (stackBy === "status") return STATUS_COLORS;
  if (stackBy === "financing") return FINANCING_COLORS;
  return {};
}

function pivotData(
  projects: StackProject[],
  metric: StackMetric,
  xAxis: StackXAxis,
  stackBy: StackBy,
  mode: StackMode
): { pivoted: Record<string, string | number>[]; keys: string[] } {
  const getX = (p: StackProject): string => {
    if (xAxis === "year") return p.announcedYear ? String(p.announcedYear) : "Unknown";
    if (xAxis === "region") return p.region || "Unknown";
    return p.country || "Unknown";
  };
  const getStack = (p: StackProject): string => {
    if (stackBy === "sector") return p.technology || "Other";
    if (stackBy === "region") return p.region || "Other";
    if (stackBy === "status") return p.status || "Other";
    return p.financingType || "Other";
  };
  const getValue = (p: StackProject): number =>
    metric === "totalInvestmentUsdMn" ? (p.dealSizeUsdMn ?? 0) : 1;

  const rowMap = new Map<string, Map<string, number>>();
  const allKeys = new Set<string>();

  for (const p of projects) {
    const x = getX(p);
    const s = getStack(p);
    const v = getValue(p);
    if (!rowMap.has(x)) rowMap.set(x, new Map());
    const row = rowMap.get(x)!;
    row.set(s, (row.get(s) ?? 0) + v);
    allKeys.add(s);
  }

  const colorMap = getColorMap(stackBy);
  const keys = Array.from(allKeys).sort((a, b) => {
    const sumA = Array.from(rowMap.values()).reduce((s, r) => s + (r.get(a) ?? 0), 0);
    const sumB = Array.from(rowMap.values()).reduce((s, r) => s + (r.get(b) ?? 0), 0);
    return sumB - sumA;
  });

  let sortedEntries = Array.from(rowMap.entries());
  if (xAxis === "year") {
    sortedEntries = sortedEntries.sort((a, b) => Number(a[0]) - Number(b[0]));
  } else {
    sortedEntries = sortedEntries.sort((a, b) => {
      const sumA = Array.from(a[1].values()).reduce((s, v) => s + v, 0);
      const sumB = Array.from(b[1].values()).reduce((s, v) => s + v, 0);
      return sumB - sumA;
    });
    if (xAxis === "country") sortedEntries = sortedEntries.slice(0, 20);
  }

  const pivoted = sortedEntries.map(([x, row]) => {
    const total = Array.from(row.values()).reduce((s, v) => s + v, 0);
    const obj: Record<string, string | number> = { x };
    for (const k of keys) {
      const raw = row.get(k) ?? 0;
      obj[k] = mode === "percentage" ? (total > 0 ? Math.round((raw / total) * 100) : 0) : raw;
    }
    obj["__total"] = total;
    return obj;
  });

  return { pivoted, keys };
}

interface StackTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  metric: StackMetric;
  mode: StackMode;
}

function StackTooltip({ active, payload, label, metric, mode }: StackTooltipProps) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  const isInvestment = metric === "totalInvestmentUsdMn";

  return (
    <div className="bg-[#0f1724] border border-white/15 rounded-xl p-3 shadow-xl text-sm min-w-[200px] max-h-64 overflow-y-auto">
      <p className="font-semibold text-white mb-2">{label}</p>
      {[...payload].reverse().map(p => (
        <div key={p.name} className="flex items-center justify-between gap-3 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
            <span className="text-slate-300 text-xs truncate max-w-[100px]">{p.name}</span>
          </div>
          <span className="text-white font-mono text-xs">
            {mode === "percentage"
              ? `${p.value}%`
              : formatVal(p.value ?? 0, isInvestment)}
          </span>
        </div>
      ))}
      <div className="border-t border-white/10 mt-2 pt-1.5 flex items-center justify-between">
        <span className="text-slate-400 text-xs font-semibold">Total</span>
        <span className="text-[#00e676] font-mono text-xs font-bold">
          {mode === "percentage" ? "100%" : formatVal(total, isInvestment)}
        </span>
      </div>
    </div>
  );
}

export function StackedBarChart({
  projects,
  metric,
  xAxis,
  stackBy,
  mode,
  height = 420,
}: {
  projects: StackProject[];
  metric: StackMetric;
  xAxis: StackXAxis;
  stackBy: StackBy;
  mode: StackMode;
  height?: number;
}) {
  const ct = useChartTheme();
  const { pivoted, keys } = useMemo(
    () => pivotData(projects, metric, xAxis, stackBy, mode),
    [projects, metric, xAxis, stackBy, mode]
  );

  const colorMap = getColorMap(stackBy);
  const isInvestment = metric === "totalInvestmentUsdMn";
  const rotateX = pivoted.length > 10;

  if (!pivoted.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        No data available for this configuration.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={pivoted} margin={{ top: 20, right: 30, left: 20, bottom: rotateX ? 90 : 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} vertical={false} />
        <XAxis
          dataKey="x"
          stroke="hsl(var(--muted-foreground))"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          angle={rotateX ? -35 : 0}
          textAnchor={rotateX ? "end" : "middle"}
          height={rotateX ? 90 : 40}
          interval={0}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          tickFormatter={v => mode === "percentage" ? `${v}%` : formatVal(v, isInvestment)}
          width={80}
          label={{
            value: mode === "percentage" ? "Share (%)" : isInvestment ? "Investment (USD)" : "Projects",
            angle: -90, position: "insideLeft",
            style: { textAnchor: "middle", fill: "hsl(var(--muted-foreground))", fontSize: 12 },
          }}
        />
        <Tooltip
          content={props => (
            <StackTooltip
              active={props.active}
              payload={props.payload as any}
              label={String(props.label)}
              metric={metric}
              mode={mode}
            />
          )}
          cursor={{ fill: ct.cursorFill }}
        />
        <Legend
          iconType="square"
          iconSize={10}
          wrapperStyle={{ fontSize: "11px", paddingTop: "16px" }}
          formatter={(value) => <span style={{ color: "hsl(var(--muted-foreground))" }}>{value}</span>}
        />
        {keys.map((k, i) => (
          <Bar key={k} dataKey={k} stackId="stack" fill={getColor(k, colorMap, i)} maxBarSize={60}>
            {i === keys.length - 1 && pivoted.length <= 8 && (
              <LabelList
                dataKey="__total"
                position="top"
                formatter={(v: number) => mode === "percentage" ? "100%" : formatVal(v, isInvestment)}
                style={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              />
            )}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
