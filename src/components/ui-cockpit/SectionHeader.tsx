import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function SectionHeader({ title, subtitle, icon, actions, className }: Props) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex items-start gap-3">
        {icon ? (
          <div className="rounded-xl border border-cockpit-border/60 bg-cockpit-surface/60 p-2 text-cockpit-cyan">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-xl font-semibold leading-tight tracking-tight text-foreground">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export default SectionHeader;
