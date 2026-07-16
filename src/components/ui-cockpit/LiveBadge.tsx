import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  count?: number;
  label?: string;
  tone?: "cyan" | "danger" | "warning" | "success";
  className?: string;
};

const toneMap = {
  cyan:    "bg-cockpit-cyan/15 text-cockpit-cyan border-cockpit-cyan/40",
  danger:  "bg-cockpit-danger/15 text-cockpit-danger border-cockpit-danger/40",
  warning: "bg-cockpit-warning/15 text-cockpit-warning border-cockpit-warning/40",
  success: "bg-cockpit-success/15 text-cockpit-success border-cockpit-success/40",
};
const dotMap = {
  cyan:    "bg-cockpit-cyan",
  danger:  "bg-cockpit-danger",
  warning: "bg-cockpit-warning",
  success: "bg-cockpit-success",
};

export function LiveBadge({ count, label = "LIVE", tone = "cyan", className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest",
        toneMap[tone],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full animate-cockpit-pulse", dotMap[tone])} />
      <span>{label}</span>
      {typeof count === "number" && count > 0 ? <span className="ml-0.5">· {count}</span> : null}
    </span>
  );
}

export default LiveBadge;
