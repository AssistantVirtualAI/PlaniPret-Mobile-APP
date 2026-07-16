import { cn } from "@/lib/utils";

export type LoadingVariant = "infinity" | "spinner" | "dots" | "ring" | "ball" | "bars";
export type LoadingSize = "sm" | "md" | "lg";

interface LoadingIconProps {
  variant?: LoadingVariant;
  size?: LoadingSize;
  className?: string;
}

const sizeClasses: Record<LoadingSize, string> = {
  sm: "w-4 h-4",
  md: "w-8 h-8",
  lg: "w-12 h-12",
};

const dotSizeClasses: Record<LoadingSize, string> = {
  sm: "w-1.5 h-1.5",
  md: "w-2.5 h-2.5",
  lg: "w-3.5 h-3.5",
};

const barSizeClasses: Record<LoadingSize, { width: string; height: string }> = {
  sm: { width: "w-0.5", height: "h-4" },
  md: { width: "w-1", height: "h-8" },
  lg: { width: "w-1.5", height: "h-12" },
};

// Infinity loader (figure 8 path)
const InfinityLoader = ({ size, className }: { size: LoadingSize; className?: string }) => (
  <svg
    className={cn(sizeClasses[size], "text-primary animate-spin-slow", className)}
    viewBox="0 0 100 50"
    fill="none"
    stroke="currentColor"
    strokeWidth="6"
    strokeLinecap="round"
  >
    <path
      d="M25 25c0-13.8 11.2-20 25-20s25 6.2 25 20-11.2 20-25 20-25-6.2-25-20z"
      className="opacity-30"
    />
    <path
      d="M25 25c0-13.8 11.2-20 25-20s25 6.2 25 20"
      strokeDasharray="80"
      strokeDashoffset="0"
    >
      <animate
        attributeName="stroke-dashoffset"
        values="0;160"
        dur="2s"
        repeatCount="indefinite"
      />
    </path>
  </svg>
);

// Spinner loader
const SpinnerLoader = ({ size, className }: { size: LoadingSize; className?: string }) => (
  <div
    className={cn(
      sizeClasses[size],
      "border-2 border-muted border-t-primary rounded-full animate-spin",
      className
    )}
  />
);

// Dots loader
const DotsLoader = ({ size, className }: { size: LoadingSize; className?: string }) => (
  <div className={cn("flex items-center gap-1", className)}>
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        className={cn(dotSizeClasses[size], "bg-primary rounded-full animate-bounce-dots")}
        style={{ animationDelay: `${i * 0.16}s` }}
      />
    ))}
  </div>
);

// Ring loader (pulse outward)
const RingLoader = ({ size, className }: { size: LoadingSize; className?: string }) => (
  <div className={cn(sizeClasses[size], "relative", className)}>
    <div className="absolute inset-0 border-2 border-primary rounded-full animate-pulse-ring" />
    <div
      className="absolute inset-0 border-2 border-primary rounded-full animate-pulse-ring"
      style={{ animationDelay: "0.5s" }}
    />
    <div className="absolute inset-1/4 bg-primary rounded-full" />
  </div>
);

// Ball loader (bouncing)
const BallLoader = ({ size, className }: { size: LoadingSize; className?: string }) => (
  <div className={cn("flex items-end gap-1", className)}>
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        className={cn(dotSizeClasses[size], "bg-primary rounded-full animate-bounce-ball")}
        style={{ animationDelay: `${i * 0.15}s` }}
      />
    ))}
  </div>
);

// Bars loader (equalizer style)
const BarsLoader = ({ size, className }: { size: LoadingSize; className?: string }) => {
  const { width, height } = barSizeClasses[size];
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={cn(width, height, "bg-primary rounded-sm animate-scale-bars")}
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  );
};

export function LoadingIcon({
  variant = "spinner",
  size = "md",
  className,
}: LoadingIconProps) {
  const loaders: Record<LoadingVariant, JSX.Element> = {
    infinity: <InfinityLoader size={size} className={className} />,
    spinner: <SpinnerLoader size={size} className={className} />,
    dots: <DotsLoader size={size} className={className} />,
    ring: <RingLoader size={size} className={className} />,
    ball: <BallLoader size={size} className={className} />,
    bars: <BarsLoader size={size} className={className} />,
  };

  return loaders[variant];
}
