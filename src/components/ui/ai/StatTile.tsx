import { LucideIcon } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  accent?: "primary" | "cyan" | "purple" | "pink";
  className?: string;
}

const accentMap = {
  primary: "text-primary bg-primary/10",
  cyan: "text-[hsl(var(--cyber-cyan))] bg-[hsl(var(--cyber-cyan)/0.12)]",
  purple: "text-[hsl(var(--vivid-purple))] bg-[hsl(var(--vivid-purple)/0.12)]",
  pink: "text-[hsl(var(--hot-pink))] bg-[hsl(var(--hot-pink)/0.12)]",
};

export const StatTile = ({ label, value, icon: Icon, hint, accent = "primary", className }: Props) => (
  <GlassCard gradientBorder className={cn("flex flex-col gap-3", className)}>
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("rounded-lg p-1.5", accentMap[accent])}>
        <Icon className="h-4 w-4" />
      </span>
    </div>
    <div className="text-3xl font-bold tracking-tight ai-text-gradient">{value}</div>
    {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
  </GlassCard>
);
