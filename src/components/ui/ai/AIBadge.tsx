import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label?: string;
  className?: string;
}

export const AIBadge = ({ label = "AI", className }: Props) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
      "bg-gradient-to-r from-primary/20 via-cyber-cyan/20 to-secondary/20",
      "border border-primary/30 text-foreground",
      className
    )}
  >
    <span className="relative h-1.5 w-1.5">
      <span className="absolute inset-0 rounded-full bg-cyber-cyan ai-pulse-dot" />
    </span>
    <Sparkles className="h-3 w-3" />
    {label}
  </span>
);
