import { useMemo, useState } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Label,
} from "recharts";
import { useLocation } from "wouter";
import { SECTOR_COLORS, REGION_COLORS, STATUS_COLORS, getColor, formatVal, FALLBACK_COLORS } from "@/utils/chart-colors";
import { useChartTheme } from "@/hooks/useChartTheme";

export type ScatterXMetric = "capacityMw" | "dealSizeUsdMn" | "announcedYear" | "projectCount";
export type ScatterYMetric = "dealSizeUsdMn" | "capacityMw" | "announcedYear" | "projectCount";
export type ScatterColorBy = "sector" | "region" | "status";
export type ScatterSizeBy = "dealSizeUsdMn" | "capacityMw" | "none";
export type ScatterDataLevel = "project" | "country";

interface ScatterProject {
  id: string | number;
  projectName: string;
  country: string;
  region: string;
  technology: string;
  status: string;
  dealSizeUsdMn?: number | null;
  capacityMw?: number | null;
  announcedYear?: number | null;
}

interface DotData {
  x: number;
  y: number;
  z: number;
  name: string;
  id: string | number;
  colorGroup: string;
  extra: Record<string, string | number | null>;
}

function getColorMap(colorBy: ScatterColorBy): Record<string, string> {
  if (colorBy === "sector") return SECTOR_COLORS;
  if (colorBy === "region") return REGION_COLORS;
  return STATUS_COLORS;
}

function getFieldValue(p: ScatterProject, field: ScatterXMetric | ScatterYMetric): number | null {
  if (field === "capacityMw") return p.capacityMw ?? null;
  if (field === "dealSizeUsdMn") return p.dealSizeUsdMn ?? null;
  if (field === "announcedYear") return p.announcedYear ?? null;
  return null;
}

function formatAxisValue(val: number, field: string): string {
  if (field === "dealSizeUsdMn") return formatVal(val, true);
  if (field === "capacityMw") {
    if (val >= 1000) return `${(val / 1000).toFixed(1)} GW`;
    return `${val} MW`;
  }
  if (field === "announcedYear") return String(val);
  return String(val);
}

function axisLabel(field: string): string {
  if (field === "dealSizeUsdMn") return "Deal Size (USD)";
  if (field === "capacityMw") return "Capacity";
  if (field === "announcedYear") return "Year Announced";
  return "Project Count";
}

function buildProjectDots(
  projects: ScatterProject[],
  xField: ScatterXMetric,
  yField: ScatterYMetric,
  colorBy: ScatterColorBy,
  sizeBy: ScatterSizeBy
): Map<string, DotData[]> {
  const groups = new Map<string, DotData[]>();
  for (const p of projects) {
    const x = getFieldValue(p, xField);
    const y = getFieldValue(p, yField);
    if (x == null || y == null || x === 0 && xField !== "announcedYear") continue;
    const z = sizeBy !== "none" ? (getFieldValue(p, sizeBy as any) ?? 10) : 10;
    const cg = colorBy === "sector" ? p.technology : colorBy === "region" ? p.region : p.status;
    if (!groups.has(cg)) groups.set(cg, []);
    groups.get(cg)!.push({
      x, y, z: Math.max(z, 1),
      name: p.projectName,
      id: p.id,
      colorGroup: cg,
      extra: {
        country: p.country,
        sector: p.technology,
        status: p.status,
        dealSizeUsdMn: p.dealSizeUsdMn ?? null,
        capacityMw: p.capacityMw ?? null,
      },
    });
  }
  return groups;
}

function buildCountryDots(
  projects: ScatterProject[],
  xField: ScatterXMetric,
  yField: ScatterYMetric,
  colorBy: ScatterColorBy,
  sizeBy: ScatterSizeBy
): Map<string, DotData[]> {
  type CountryAgg = {
    country: string; region: string; topSector: string;
    dealSizeUsdMn: number; capacityMw: number;
    projectCount: number;
  };
  const aggMap = new Map<string, CountryAgg>();
  const sectorCount = new Map<string, Map<string, number>>();

  for (const p of projects) {
    const c = p.country;
    if (!aggMap.has(c)) {
      aggMap.set(c, { country: c, region: p.region, topSector: p.technology, dealSizeUsdMn: 0, capacityMw: 0, projectCount: 0 });
      sectorCount.set(c, new Map());
    }
    const agg = aggMap.get(c)!;
    agg.dealSizeUsdMn += p.dealSizeUsdMn ?? 0;
    agg.capacityMw += p.capacityMw ?? 0;
    agg.projectCount += 1;
    const sc = sectorCount.get(c)!;
    sc.set(p.technology, (sc.get(p.technology) ?? 0) + 1);
  }

  for (const [c, agg] of aggMap.entries()) {
    const sc = sectorCount.get(c)!;
    let maxSector = agg.topSector, maxCount = 0;
    for (const [s, n] of sc.entries()) {
      if (n > maxCount) { maxCount = n; maxSector = s; }
    }
    agg.topSector = maxSector;
  }

  const getAggVal = (agg: CountryAgg, field: string): number | null => {
    if (field === "dealSizeUsdMn") return agg.dealSizeUsdMn || null;
    if (field === "capacityMw") return agg.capacityMw || null;
    if (field === "projectCount") return agg.projectCount || null;
    return null;
  };

  const groups = new Map<string, DotData[]>();
  for (const agg of aggMap.values()) {
    const x = getAggVal(agg, xField);
    const y = getAggVal(agg, yField);
    if (x == null || y == null) continue;
    const z = sizeBy !== "none" ? (getAggVal(agg, sizeBy) ?? 10) : 10;
    const cg = colorBy === "sector" ? agg.topSector : colorBy === "region" ? agg.region : "Country";
    if (!groups.has(cg)) groups.set(cg, []);
    groups.get(cg)!.push({
      x, y, z: Math.max(z, 1),
      name: agg.country,
      id: agg.country,
      colorGroup: cg,
      extra: { region: agg.region, dealSizeUsdMn: agg.dealSizeUsdMn, projectCount: agg.projectCount },
    });
  }
  return groups;
}

interface ScatterTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: DotData }>;
  xField: string;
  yField: string;
  dataLevel: ScatterDataLevel;
}

function ScatterTooltip({ active, payload, xField, yField, dataLevel }: ScatterTooltipProps) {
  if (!active || !payload?.[0]?.payload) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#0f1724] border border-white/15 rounded-xl p-3 shadow-xl text-sm min-w-[180px]">
      <p className="font-semibold text-white mb-2">{d.name}</p>
      {dataLevel === "project" ? (
        <>
          <p className="text-slate-400 text-xs">Country: {d.extra.country}</p>
          <p className="text-slate-400 text-xs">Sector: {d.extra.sector}</p>
          <p className="text-slate-400 text-xs">Status: {d.extra.status}</p>
          <div className="mt-1.5 pt-1.5 border-t border-white/10">
            <p className="text-[#00e676] text-xs font-mono">{axisLabel(xField)}: {formatAxisValue(d.x, xField)}</p>
            <p className="text-[#00e676] text-xs font-mono">{axisLabel(yField)}: {formatAxisValue(d.y, yField)}</p>
          </div>
        </>
      ) : (
        <>
          <p className="text-slate-400 text-xs">Region: {d.extra.region}</p>
          <p className="text-slate-400 text-xs">Projects: {d.extra.projectCount}</p>
          <div className="mt-1.5 pt-1.5 border-t border-white/10">
            <p className="text-[#00e676] text-xs font-mono">{axisLabel(xField)}: {formatAxisValue(d.x, xField)}</p>
            <p className="text-[#00e676] text-xs font-mono">{axisLabel(yField)}: {formatAxisValue(d.y, yField)}</p>
          </div>
        </>
      )}
    </div>
  );
}

export function ScatterBubbleChart({
  projects,
  xField,
  yField,
  colorBy,
  sizeBy,
  dataLevel,
  showAverages,
  height = 460,
}: {
  projects: ScatterProject[];
  xField: ScatterXMetric;
  yField: ScatterYMetric;
  colorBy: ScatterColorBy;
  sizeBy: ScatterSizeBy;
  dataLevel: ScatterDataLevel;
  showAverages: boolean;
  height?: number;
}) {
  const ct = useChartTheme();
  const [, navigate] = useLocation();

  const groups = useMemo(() => {
    if (dataLevel === "country") return buildCountryDots(projects, xField, yField, colorBy, sizeBy);
    return buildProjectDots(projects, xField, yField, colorBy, sizeBy);
  }, [projects, xField, yField, colorBy, sizeBy, dataLevel]);

  const allDots = useMemo(() => Array.from(groups.values()).flat(), [groups]);
  const avgX = useMemo(() => allDots.length ? allDots.reduce((s, d) => s + d.x, 0) / allDots.length : 0, [allDots]);
  const avgY = useMemo(() => allDots.length ? allDots.reduce((s, d) => s + d.y, 0) / allDots.length : 0, [allDots]);

  const colorMap = getColorMap(colorBy);
  const allGroups = Array.from(groups.entries());

  const zRange: [number, number] = sizeBy !== "none" ? [40, 1600] : [100, 100];

  if (!allDots.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        No data available. Try a different axis metric — many projects may lack capacity data.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} />
        <XAxis
          type="number" dataKey="x" name={axisLabel(xField)}
          stroke="hsl(var(--muted-foreground))"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          tickFormatter={v => formatAxisValue(v, xField)}
          domain={["auto", "auto"]}
        >
          <Label value={axisLabel(xField)} position="insideBottom" offset={-10}
            style={{ textAnchor: "middle", fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
        </XAxis>
        <YAxis
          type="number" dataKey="y" name={axisLabel(yField)}
          stroke="hsl(var(--muted-foreground))"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          tickFormatter={v => formatAxisValue(v, yField)}
          width={80}
        >
          <Label value={axisLabel(yField)} angle={-90} position="insideLeft"
            style={{ textAnchor: "middle", fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
        </YAxis>
        <ZAxis type="number" dataKey="z" range={zRange} />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={props => (
            <ScatterTooltip
              active={props.active}
              payload={props.payload as any}
              xField={xField}
              yField={yField}
              dataLevel={dataLevel}
            />
          )}
        />
        <Legend
          iconType="circle"
          iconSize={10}
          wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
          formatter={v => <span style={{ color: "hsl(var(--muted-foreground))" }}>{v}</span>}
        />
        {showAverages && (
          <>
            <ReferenceLine x={avgX} stroke={ct.referenceStroke} strokeDasharray="4 4" />
            <ReferenceLine y={avgY} stroke={ct.referenceStroke} strokeDasharray="4 4" />
          </>
        )}
        {allGroups.map(([group, dots], idx) => (
          <Scatter
            key={group}
            name={group}
            data={dots}
            fill={getColor(group, colorMap, idx)}
            fillOpacity={0.75}
            stroke={ct.scatterDotStroke}
            strokeWidth={1}
            onClick={(dot: DotData) => {
              if (dataLevel === "project" && dot.id) {
                navigate(`/deals/${dot.id}`);
              }
            }}
            cursor={dataLevel === "project" ? "pointer" : "default"}
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
