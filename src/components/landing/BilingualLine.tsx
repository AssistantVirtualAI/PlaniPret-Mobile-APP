import { cn } from "@/lib/utils";

export function BilingualLine({
  primary,
  secondary,
  className,
  secondaryClassName,
}: {
  primary: string;
  secondary: string;
  className?: string;
  secondaryClassName?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <div>{primary}</div>
      <div className={cn("text-sm text-muted-foreground", secondaryClassName)}>
        {secondary}
      </div>
    </div>
  );
}
