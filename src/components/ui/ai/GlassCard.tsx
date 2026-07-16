import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
  gradientBorder?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, glow, gradientBorder, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative rounded-xl glass-card p-5 transition-all duration-200",
        gradientBorder && "ai-border",
        glow && "ai-glow",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
);
GlassCard.displayName = "GlassCard";
