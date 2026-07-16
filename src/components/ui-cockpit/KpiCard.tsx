import * as React from "react";
import { cn } from "@/lib/utils";
import { GlassCard } from "./GlassCard";
import { LiveBadge } from "./LiveBadge";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

type Trend = { value: number; label?: string; direction?: "up" | "down" };

type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  trend?: Trend;
  live?: boolean;
  accent?: "cyan" | "violet" | "success" | "warning" | "danger" | "default";
  className?: string;
};

const accentMap: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  default: "text-foreground",
  cyan: "text-cockpit-cyan",
  violet: "text-cockpit-violet",
  success: "text-cockpit-success",
  warning: "text-cockpit-warning",
  danger: "text-cockpit-danger",
};

export function KpiCard({ label, value, hint, icon, trend, live, accent = "default", className }: KpiCardProps) {
  const dir = trend?.direction ?? (trend && trend.value < 0 ? "down" : "up");
  const trendColor = dir === "up" ? "text-cockpit-success" : "text-cockpit-danger";
  const TrendIcon = dir === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <GlassCard className={cn("p-5", className)} glow={accent === "cyan" ? "cyan" : accent === "violet" ? "violet" : "none"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <span className="truncate">{label}</span>
            {live ? <LiveBadge /> : null}
          </div>
          <div className={cn("mt-2 text-3xl font-semibold leading-none", accentMap[accent])}>{value}</div>
          {hint ? <div className="mt-2 text-xs text-muted-foreground">{hint}</div> : null}
        </div>
        {icon ? (
          <div className="rounded-xl border border-cockpit-border/60 bg-cockpit-surface/60 p-2 text-cockpit-cyan">
            {icon}
          </div>
        ) : null}
      </div>
      {trend ? (
        <div className={cn("mt-3 inline-flex items-center gap-1 text-xs", trendColor)}>
          <TrendIcon className="h-3.5 w-3.5" />
          <span>{Math.abs(trend.value)}%</span>
          {trend.label ? <span className="text-muted-foreground">· {trend.label}</span> : null}
        </div>
      ) : null}
    </GlassCard>
  );
}

export default KpiCard;
