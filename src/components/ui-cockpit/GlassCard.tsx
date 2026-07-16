import * as React from "react";
import { cn } from "@/lib/utils";

type GlassCardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "strong" | "neon";
  glow?: "none" | "cyan" | "violet";
  scan?: boolean;
};

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = "default", glow = "none", scan = false, children, ...rest }, ref) => {
    const base =
      variant === "strong"
        ? "cockpit-glass-strong"
        : variant === "neon"
        ? "cockpit-glass cockpit-neon-border"
        : "cockpit-glass";

    return (
      <div
        ref={ref}
        className={cn(
          "relative overflow-hidden rounded-2xl text-foreground",
          base,
          glow === "cyan" && "shadow-cockpit-glow-cyan",
          glow === "violet" && "shadow-cockpit-glow-violet",
          scan && "cockpit-scan",
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
GlassCard.displayName = "GlassCard";

export default GlassCard;
