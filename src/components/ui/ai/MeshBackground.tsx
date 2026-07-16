import { cn } from "@/lib/utils";

export const MeshBackground = ({ className }: { className?: string }) => (
  <div
    aria-hidden
    className={cn(
      "pointer-events-none absolute inset-0 -z-10 ai-mesh-bg cyber-grid opacity-80",
      className
    )}
  />
);
