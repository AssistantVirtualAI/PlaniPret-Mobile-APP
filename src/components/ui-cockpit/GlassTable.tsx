import * as React from "react";
import { cn } from "@/lib/utils";

type RootProps = React.HTMLAttributes<HTMLDivElement>;

export function GlassTable({ className, children, ...rest }: RootProps) {
  return (
    <div
      className={cn(
        "cockpit-glass overflow-hidden rounded-2xl",
        className,
      )}
      {...rest}
    >
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-sm">
          {children}
        </table>
      </div>
    </div>
  );
}

export function GTHead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      {...props}
      className={cn(
        "sticky top-0 z-10 bg-cockpit-surface-strong/70 backdrop-blur supports-[backdrop-filter]:bg-cockpit-surface-strong/60",
        "border-b border-cockpit-border/60",
        props.className,
      )}
    />
  );
}

export function GTRow(props: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      {...props}
      className={cn(
        "border-b border-cockpit-border/30 transition-colors hover:bg-cockpit-surface/40",
        props.className,
      )}
    />
  );
}

export function GTHeadCell(props: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      className={cn(
        "px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
        props.className,
      )}
    />
  );
}

export function GTCell(props: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      {...props}
      className={cn("px-4 py-3 align-middle text-sm text-foreground/90", props.className)}
    />
  );
}

export default GlassTable;
