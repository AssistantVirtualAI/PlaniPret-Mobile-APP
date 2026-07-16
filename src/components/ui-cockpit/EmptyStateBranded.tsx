import * as React from "react";
import { cn } from "@/lib/utils";
import { GlassCard } from "./GlassCard";

type Props = {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyStateBranded({ icon, title, description, action, className }: Props) {
  return (
    <GlassCard className={cn("flex flex-col items-center justify-center gap-3 p-10 text-center", className)}>
      {icon ? (
        <div className="rounded-2xl border border-cockpit-border/60 bg-cockpit-surface/60 p-3 text-cockpit-cyan">
          {icon}
        </div>
      ) : null}
      <div className="text-lg font-semibold">{title}</div>
      {description ? (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </GlassCard>
  );
}

export default EmptyStateBranded;
