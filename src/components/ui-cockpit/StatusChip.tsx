import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "idle" | "cyan" | "violet";

const toneStyles: Record<StatusTone, string> = {
  success: "bg-cockpit-success/15 text-cockpit-success border-cockpit-success/40",
  warning: "bg-cockpit-warning/15 text-cockpit-warning border-cockpit-warning/40",
  danger:  "bg-cockpit-danger/15 text-cockpit-danger border-cockpit-danger/40",
  idle:    "bg-cockpit-idle/15 text-cockpit-idle border-cockpit-idle/40",
  cyan:    "bg-cockpit-cyan/15 text-cockpit-cyan border-cockpit-cyan/40",
  violet:  "bg-cockpit-violet/15 text-cockpit-violet border-cockpit-violet/40",
};

const dotStyles: Record<StatusTone, string> = {
  success: "bg-cockpit-success",
  warning: "bg-cockpit-warning",
  danger:  "bg-cockpit-danger",
  idle:    "bg-cockpit-idle",
  cyan:    "bg-cockpit-cyan",
  violet:  "bg-cockpit-violet",
};

type Props = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone;
  pulse?: boolean;
  children: React.ReactNode;
};

export function StatusChip({ tone = "idle", pulse = false, className, children, ...rest }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider",
        toneStyles[tone],
        className,
      )}
      {...rest}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotStyles[tone], pulse && "animate-cockpit-pulse")} />
      {children}
    </span>
  );
}

export default StatusChip;
