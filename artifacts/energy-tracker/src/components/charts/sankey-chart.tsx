import { useMemo } from "react";
import { Sankey, Tooltip, ResponsiveContainer } from "recharts";
import { SECTOR_COLORS, REGION_COLORS, FINANCING_COLORS, getColor, formatVal, FALLBACK_COLORS } from "@/utils/chart-colors";

export type SankeyFrom = "region" | "financing";
export type SankeyThrough = "country" | "sector" | "none";
export type SankeyTo = "sector" | "status" | "country";
export type SankeyTopN = 10 | 20 | 50;

interface SankeyProject {
  country: string;
  region: string;
  technology: string;
  status: string;
  financingType?: string | null;
  dealSizeUsdMn?: number | null;
}

function getKey(p: SankeyProject, dim: "region" | "financing" | "country" | "sector" | "status"): string {
  if (dim === "region") return p.region || "Unknown";
  if (dim === "financing") return p.financingType || "Other";
  if (dim === "country") return p.country || "Unknown";
  if (dim === "sector") return p.technology || "Unknown";
  return p.status || "Unknown";
}

function dimColorMap(dim: string): Record<string, string> {
  if (dim === "sector") return SECTOR_COLORS;
  if (dim === "region") return REGION_COLORS;
  if (dim === "financing") return FINANCING_COLORS;
  return {};
}

function buildSankey(
  projects: SankeyProject[],
  from: SankeyFrom,
  through: SankeyThrough,
  to: SankeyTo,
  topN: SankeyTopN
): { nodes: { name: string; color: string }[]; links: { source: number; target: number; value: number }[] } {
  const hasThrough = through !== "none";

  type LinkKey = string;
  const flowMap = new Map<LinkKey, number>();

  for (const p of projects) {
    const v = p.dealSizeUsdMn ?? 0;
    if (v === 0) continue;
    const f = getKey(p, from as any);
    const t = getKey(p, to as any);
    if (hasThrough) {
      const m = getKey(p, through as any);
      flowMap.set(`${f}|||${m}`, (flowMap.get(`${f}|||${m}`) ?? 0) + v);
      flowMap.set(`${m}|||${t}`, (flowMap.get(`${m}|||${t}`) ?? 0) + v);
    } else {
      flowMap.set(`${f}|||${t}`, (flowMap.get(`${f}|||${t}`) ?? 0) + v);
    }
  }

  const sortedFlows = Array.from(flowMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  const nodeNames = new Map<string, number>();
  const nodeList: { name: string; color: string }[] = [];

  const ensureNode = (name: string, dim: string) => {
    if (!nodeNames.has(name)) {
      const idx = nodeList.length;
      nodeNames.set(name, idx);
      const cm = dimColorMap(dim);
      const color = getColor(name, cm, idx);
      nodeList.push({ name, color });
    }
    return nodeNames.get(name)!;
  };

  const links: { source: number; target: number; value: number }[] = [];

  for (const [key, value] of sortedFlows) {
    const [src, tgt] = key.split("|||");

    let srcDim = from as string;
    let tgtDim = to as string;
    if (hasThrough) {
      const flowsFromThrough = sortedFlows.some(([k]) => {
        const parts = k.split("|||");
        return parts[0] === src && parts[1] === tgt && flowMap.has(`${src}|||${tgt}`);
      });
      if (!flowsFromThrough) {
        srcDim = through as string;
        tgtDim = to as string;
      }
    }

    const srcIdx = ensureNode(src, srcDim);
    const tgtIdx = ensureNode(tgt, tgtDim);
    if (srcIdx !== tgtIdx) {
      links.push({ source: srcIdx, target: tgtIdx, value });
    }
  }

  return { nodes: nodeList, links };
}

interface SankeyNodeProps {
  x?: number; y?: number; width?: number; height?: number;
  index?: number;
  payload?: { name?: string; color?: string };
}

function SankeyNode({ x = 0, y = 0, width = 10, height = 0, payload }: SankeyNodeProps) {
  const color = payload?.color ?? "#475569";
  const name = payload?.name ?? "";
  const labelLeft = x > 200;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.9} rx={3} />
      <text
        x={labelLeft ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={labelLeft ? "end" : "start"}
        dominantBaseline="middle"
        fill="rgba(255,255,255,0.8)"
        fontSize={11}
        fontWeight={500}
      >
        {name.length > 18 ? name.slice(0, 16) + "…" : name}
      </text>
    </g>
  );
}

interface SankeyLinkProps {
  sourceX?: number; sourceY?: number; sourceControlX?: number;
  targetX?: number; targetY?: number; targetControlX?: number;
  linkWidth?: number;
  payload?: { source?: { color?: string }; target?: { color?: string } };
}

function SankeyLink({ sourceX = 0, sourceY = 0, sourceControlX = 0, targetX = 0, targetY = 0, targetControlX = 0, linkWidth = 4, payload }: SankeyLinkProps) {
  const srcColor = payload?.source?.color ?? "#475569";
  const tgtColor = payload?.target?.color ?? "#475569";
  const id = `sl-${sourceX}-${targetX}-${sourceY}`;
  return (
    <path
      d={`M${sourceX},${sourceY + linkWidth / 2} C${sourceControlX},${sourceY + linkWidth / 2} ${targetControlX},${targetY + linkWidth / 2} ${targetX},${targetY + linkWidth / 2}
         L${targetX},${targetY - linkWidth / 2} C${targetControlX},${targetY - linkWidth / 2} ${sourceControlX},${sourceY - linkWidth / 2} ${sourceX},${sourceY - linkWidth / 2} Z`}
      fill={`url(#${id})`}
      fillOpacity={0.3}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={srcColor} />
          <stop offset="100%" stopColor={tgtColor} />
        </linearGradient>
      </defs>
    </path>
  );
}

function SankeyTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const isNode = d?.value != null && !d.source;
  if (isNode) {
    return (
      <div className="bg-[#0f1724] border border-white/15 rounded-xl p-3 shadow-xl text-sm">
        <p className="font-semibold text-white">{d.name}</p>
        <p className="text-[#00e676] font-bold mt-1">{formatVal(d.value, true)}</p>
      </div>
    );
  }
  return (
    <div className="bg-[#0f1724] border border-white/15 rounded-xl p-3 shadow-xl text-sm">
      <p className="font-semibold text-white">
        {d?.source?.name} → {d?.target?.name}
      </p>
      <p className="text-[#00e676] font-bold mt-1">{formatVal(d?.value ?? 0, true)}</p>
    </div>
  );
}

export function SankeyChart({
  projects,
  from,
  through,
  to,
  topN,
  height = 500,
}: {
  projects: SankeyProject[];
  from: SankeyFrom;
  through: SankeyThrough;
  to: SankeyTo;
  topN: SankeyTopN;
  height?: number;
}) {
  const sankeyData = useMemo(
    () => buildSankey(projects, from, through, to, topN),
    [projects, from, through, to, topN]
  );

  if (!sankeyData.links.length) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        No data available for this configuration. Try a different flow path.
      </div>
    );
  }

  return (
    <div>
      <div className="hidden md:block">
        <ResponsiveContainer width="100%" height={height}>
          <Sankey
            data={sankeyData}
            nodePadding={12}
            nodeWidth={14}
            margin={{ top: 10, right: 160, bottom: 10, left: 160 }}
            link={<SankeyLink />}
            node={<SankeyNode />}
          >
            <Tooltip content={<SankeyTooltip />} />
          </Sankey>
        </ResponsiveContainer>
      </div>
      <div className="md:hidden flex items-center justify-center h-40 rounded-xl bg-white/5 border border-white/10">
        <div className="text-center text-slate-500 text-sm px-4">
          <p className="font-medium">Best viewed on desktop</p>
          <p className="text-xs mt-1 text-slate-600">Sankey diagrams require more horizontal space</p>
        </div>
      </div>
    </div>
  );
}
