import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

const sizeMap: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

const variantMap: Record<Variant, string> = {
  primary:
    "text-white cockpit-shine border border-cockpit-border/60 shadow-cockpit-glow-cyan",
  outline:
    "bg-cockpit-surface/40 text-foreground border border-cockpit-border hover:bg-cockpit-surface-strong/60 transition-colors",
  ghost:
    "bg-transparent text-foreground hover:bg-cockpit-surface/40 transition-colors",
  danger:
    "bg-cockpit-danger/15 text-cockpit-danger border border-cockpit-danger/40 hover:bg-cockpit-danger/25 transition-colors",
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
};

export const NeonButton = React.forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "primary", size = "md", asChild = false, ...rest }, ref) => {
    const Comp: any = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl font-medium",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-cockpit-cyan/50",
          "disabled:opacity-50 disabled:pointer-events-none",
          sizeMap[size],
          variantMap[variant],
          className,
        )}
        {...rest}
      />
    );
  },
);
NeonButton.displayName = "NeonButton";

export default NeonButton;
