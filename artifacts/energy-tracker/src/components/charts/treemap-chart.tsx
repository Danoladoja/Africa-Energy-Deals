import { useState, useCallback } from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronRight, Home } from "lucide-react";
import { SECTOR_COLORS, REGION_COLORS, getColor, formatVal, FALLBACK_COLORS } from "@/utils/chart-colors";
import { useChartTheme } from "@/hooks/useChartTheme";

export type TreemapMetric = "totalInvestmentUsdMn" | "projectCount";
export type TreemapLevel1 = "region" | "sector" | "year";
export type TreemapLevel2 = "country" | "sector" | "status";
export type TreemapColorBy = "region" | "sector";

interface TreeProject {
  country: string;
  region: string;
  technology: string;
  status: string;
  dealSizeUsdMn?: number | null;
  announcedYear?: number | null;
  financingType?: string | null;
}

interface TreeNode {
  name: string;
  value?: number;
  children?: TreeNode[];
  colorKey?: string;
  meta?: { region?: string; sector?: string; count?: number };
}

function buildTree(
  projects: TreeProject[],
  metric: TreemapMetric,
  level1: TreemapLevel1,
  level2: TreemapLevel2,
  colorBy: TreemapColorBy,
  drillKey?: string
): TreeNode[] {
  const getKey1 = (p: TreeProject): string => {
    if (level1 === "region") return p.region || "Unknown";
    if (level1 === "sector") return p.technology || "Unknown";
    return String(p.announcedYear || "Unknown");
  };
  const getKey2 = (p: TreeProject): string => {
    if (level2 === "country") return p.country || "Unknown";
    if (level2 === "sector") return p.technology || "Unknown";
    return p.status || "Unknown";
  };
  const getValue = (p: TreeProject): number =>
    metric === "totalInvestmentUsdMn" ? (p.dealSizeUsdMn ?? 0) : 1;

  const filtered = drillKey ? projects.filter(p => getKey1(p) === drillKey) : projects;

  if (drillKey) {
    const map = new Map<string, { value: number; count: number; colorKey: string }>();
    for (const p of filtered) {
      const k = getKey2(p);
      const ex = map.get(k) ?? { value: 0, count: 0, colorKey: colorBy === "sector" ? p.technology : p.region };
      map.set(k, { value: ex.value + getValue(p), count: ex.count + 1, colorKey: ex.colorKey });
    }
    return Array.from(map.entries())
      .map(([name, d]) => ({ name, value: d.value, colorKey: d.colorKey, meta: { count: d.count } }))
      .filter(n => n.value > 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 15);
  }

  const map = new Map<string, { children: Map<string, { value: number; count: number }>; colorKey: string }>();
  for (const p of projects) {
    const k1 = getKey1(p);
    const k2 = getKey2(p);
    if (!map.has(k1)) {
      map.set(k1, { children: new Map(), colorKey: colorBy === "sector" ? p.technology : p.region });
    }
    const grp = map.get(k1)!;
    const ex = grp.children.get(k2) ?? { value: 0, count: 0 };
    grp.children.set(k2, { value: ex.value + getValue(p), count: ex.count + 1 });
  }

  return Array.from(map.entries()).map(([name, grp]) => ({
    name,
    colorKey: grp.colorKey,
    children: Array.from(grp.children.entries())
      .map(([cname, d]) => ({ name: cname, value: d.value, colorKey: grp.colorKey, meta: { count: d.count } }))
      .filter(n => n.value > 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 8),
  })).filter(n => n.children && n.children.length > 0);
}

function getNodeColor(colorKey: string | undefined, colorBy: TreemapColorBy, idx: number): string {
  if (!colorKey) return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
  if (colorBy === "sector") return getColor(colorKey, SECTOR_COLORS, idx);
  return getColor(colorKey, REGION_COLORS, idx);
}

interface CustomCellProps {
  x?: number; y?: number; width?: number; height?: number;
  name?: string; value?: number; depth?: number;
  colorBy: TreemapColorBy;
  colorKey?: string;
  nodeIndex?: number;
  isInvestment: boolean;
}

function CustomCell(props: CustomCellProps) {
  const ct = useChartTheme();
  const { x = 0, y = 0, width = 0, height = 0, name, value, colorBy, colorKey, nodeIndex = 0, isInvestment } = props;
  const color = getNodeColor(colorKey, colorBy, nodeIndex);
  const showName = width > 45 && height > 28;
  const showValue = width > 55 && height > 48;
  const fmtVal = value ? formatVal(value, isInvestment) : "";

  return (
    <g>
      <rect
        x={x + 1} y={y + 1}
        width={Math.max(0, width - 2)} height={Math.max(0, height - 2)}
        fill={color}
        fillOpacity={0.85}
        stroke={ct.treemapStroke}
        strokeWidth={1}
        rx={3}
      />
      {showName && (
        <text
          x={x + width / 2} y={showValue ? y + height / 2 - 7 : y + height / 2}
          textAnchor="middle" dominantBaseline="middle"
          fill="white" fontSize={Math.min(13, width / 7)} fontWeight={600}
          style={{ pointerEvents: "none" }}
        >
          {name && name.length > 14 ? name.slice(0, 12) + "…" : name}
        </text>
      )}
      {showValue && (
        <text
          x={x + width / 2} y={y + height / 2 + 9}
          textAnchor="middle" dominantBaseline="middle"
          fill="rgba(255,255,255,0.75)" fontSize={Math.min(11, width / 9)}
          style={{ pointerEvents: "none" }}
        >
          {fmtVal}
        </text>
      )}
    </g>
  );
}

interface TooltipPayloadEntry {
  payload?: {
    name?: string;
    value?: number;
    colorKey?: string;
    meta?: { count?: number; region?: string };
  };
}

function TreeTooltip({ active, payload, isInvestment, colorBy }: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  isInvestment: boolean;
  colorBy: TreemapColorBy;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#0f1724] border border-white/15 rounded-xl p-3 shadow-xl text-sm max-w-[220px]">
      <p className="font-semibold text-white mb-1">{d.name}</p>
      {d.colorKey && d.colorKey !== d.name && (
        <p className="text-slate-400 text-xs mb-1">{colorBy === "region" ? "Region" : "Sector"}: {d.colorKey}</p>
      )}
      <p className="text-[#00e676] font-bold">{formatVal(d.value ?? 0, isInvestment)}</p>
      {d.meta?.count != null && (
        <p className="text-slate-400 text-xs mt-0.5">{d.meta.count} project{d.meta.count !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
}

export function TreemapChart({
  projects,
  metric,
  level1,
  level2,
  colorBy,
  height = 480,
  onDrillDown,
}: {
  projects: TreeProject[];
  metric: TreemapMetric;
  level1: TreemapLevel1;
  level2: TreemapLevel2;
  colorBy: TreemapColorBy;
  height?: number;
  onDrillDown?: (key: string) => void;
}) {
  const [drillKey, setDrillKey] = useState<string | undefined>(undefined);
  const isInvestment = metric === "totalInvestmentUsdMn";

  const data = buildTree(projects, metric, level1, level2, colorBy, drillKey);

  const handleClick = useCallback((node: { name?: string }) => {
    if (!drillKey && node.name) {
      setDrillKey(node.name);
      onDrillDown?.(node.name);
    }
  }, [drillKey, onDrillDown]);

  if (!projects.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        No data available for this configuration.
      </div>
    );
  }

  const level1Label = level1 === "region" ? "Region" : level1 === "sector" ? "Sector" : "Year";
  const level2Label = level2 === "country" ? "Country" : level2 === "sector" ? "Sector" : "Status";

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 mb-3 text-sm text-slate-400">
        <button
          onClick={() => setDrillKey(undefined)}
          className={`flex items-center gap-1 transition-colors ${drillKey ? "hover:text-white cursor-pointer" : "text-slate-600 cursor-default"}`}
        >
          <Home className="w-3.5 h-3.5" />
          All {level1Label}s
        </button>
        {drillKey && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-white font-medium">{drillKey}</span>
            <span className="text-slate-600 text-xs ml-1">({level2Label}s)</span>
          </>
        )}
        {!drillKey && (
          <span className="text-slate-600 text-xs ml-1">— click a rectangle to drill in</span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <Treemap
          data={data}
          dataKey="value"
          aspectRatio={4 / 3}
          stroke="transparent"
          onClick={handleClick}
          content={(props: any) => {
            const { x, y, width, height, name, value, colorKey, index } = props;
            return (
              <CustomCell
                x={x} y={y} width={width} height={height}
                name={name} value={value}
                colorBy={colorBy}
                colorKey={colorKey}
                nodeIndex={index ?? 0}
                isInvestment={isInvestment}
              />
            );
          }}
        >
          <Tooltip
            content={(p: any) => (
              <TreeTooltip active={p.active} payload={p.payload} isInvestment={isInvestment} colorBy={colorBy} />
            )}
          />
        </Treemap>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mt-4 justify-center">
        {(colorBy === "sector" ? Object.entries(SECTOR_COLORS) : Object.entries(REGION_COLORS)).map(([k, c]) => (
          <div key={k} className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: c }} />
            {k}
          </div>
        ))}
      </div>
    </div>
  );
}
