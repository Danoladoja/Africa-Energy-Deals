import { useTheme } from "@/contexts/theme";

export function useChartTheme() {
  const { theme } = useTheme();
  const isLight = theme === "light";

  return {
    gridStroke:       isLight ? "rgba(0,0,0,0.07)"  : "rgba(255,255,255,0.06)",
    cursorFill:       isLight ? "rgba(0,0,0,0.05)"  : "rgba(255,255,255,0.04)",
    tickColor:        isLight ? "#475569"            : "#64748b",
    tickColorAlt:     isLight ? "#64748b"            : "#94a3b8",
    legendColor:      isLight ? "#475569"            : "#94a3b8",
    loserColor:       isLight ? "#6b7280"            : "#cbd5e1",
    referenceStroke:  isLight ? "rgba(0,0,0,0.15)"  : "rgba(255,255,255,0.2)",
    scatterDotStroke: isLight ? "rgba(0,0,0,0.15)"  : "rgba(255,255,255,0.3)",
    treemapStroke:    isLight ? "rgba(0,0,0,0.1)"   : "rgba(255,255,255,0.15)",
    sankeyLabelFill:  isLight ? "rgba(0,0,0,0.75)"  : "rgba(255,255,255,0.8)",
    emptyFill:        isLight ? "rgba(0,0,0,0.02)"  : "rgba(255,255,255,0.02)",
    tooltipBg:        isLight ? "#ffffff"            : "#0f172a",
    tooltipBorder:    isLight ? "rgba(0,0,0,0.12)"  : "rgba(255,255,255,0.1)",
    tooltipText:      isLight ? "#374151"            : "#94a3b8",
    matrixAxisText:   isLight ? "#374151"            : "#94a3b8",
    matrixLabelText:  isLight ? "#475569"            : "#cbd5e1",
    matrixGridStroke: isLight ? "rgba(0,0,0,0.06)"  : "rgba(255,255,255,0.04)",
  };
}
