/**
 * Shared chart language for the Commissions pages (admin + broker).
 * One palette, one tooltip, one axis style — so every tab looks like the same product.
 */
import type { ReactNode } from "react";

export const SERIES = {
  primary: "#5B8FF9",
  primaryDeep: "#2F5FBF",
  teal: "#14B8A6",
  amber: "#F5A524",
  violet: "#8B5CF6",
  green: "#3FB27F",
  pink: "#EC4899",
  muted: "#94A3B8",
} as const;

/** Ordered palette for categorical series (pies, lender bars, product mix). */
export const CHART_COLORS = [
  SERIES.primary, SERIES.teal, SERIES.amber, SERIES.violet,
  SERIES.green, SERIES.pink, "#F97362", "#6366F1",
];

export const gradId = (c: string) => `ppcg-${c.replace(/[^a-zA-Z0-9]/g, "")}`;
export const gradFill = (c: string) => `url(#${gradId(c)})`;
export const areaId = (c: string) => `${gradId(c)}-a`;
export const areaFill = (c: string) => `url(#${areaId(c)})`;

/** Vertical bar gradients + soft area gradients for the whole palette. */
export function CommissionsGradients({ colors = CHART_COLORS }: { colors?: string[] }) {
  return (
    <defs>
      {Array.from(new Set(colors)).map((c) => (
        <g key={c}>
          <linearGradient id={gradId(c)} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity={1} />
            <stop offset="100%" stopColor={c} stopOpacity={0.55} />
          </linearGradient>
          <linearGradient id={areaId(c)} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity={0.55} />
            <stop offset="100%" stopColor={c} stopOpacity={0.03} />
          </linearGradient>
        </g>
      ))}
    </defs>
  );
}

export const axisProps = {
  tick: { fontSize: 11, fill: "var(--pp-text-muted)" },
  tickLine: false,
  axisLine: { stroke: "var(--pp-bg-border)" },
} as const;

export const gridProps = {
  strokeDasharray: "2 6",
  stroke: "rgba(127,127,127,.22)",
  vertical: false,
} as const;

export const legendProps = {
  wrapperStyle: { fontSize: 11.5, paddingTop: 6 },
  iconType: "circle" as const,
  iconSize: 8,
};

export const tooltipCursor = { fill: "rgba(127,127,127,.10)" };

export const tooltipStyle = {
  background: "var(--pp-tooltip-bg, rgba(12,18,32,.94))",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 12,
  color: "#fff",
  fontSize: 12,
  padding: "8px 10px",
  boxShadow: "0 18px 40px -22px rgba(0,0,0,.9)",
  backdropFilter: "blur(10px)",
} as const;

/** Spread on every <Tooltip/> so hover feels identical across tabs. */
export const tipProps = {
  contentStyle: tooltipStyle,
  labelStyle: { color: "rgba(255,255,255,.72)", fontWeight: 700, marginBottom: 4, fontSize: 11.5 },
  itemStyle: { color: "#fff", fontSize: 12, padding: "1px 0" },
  cursor: tooltipCursor,
};

export function ChartLegendDot({ color, label }: { color: string; label: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontSize: 11.5, color: "var(--pp-text-secondary)" }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}
