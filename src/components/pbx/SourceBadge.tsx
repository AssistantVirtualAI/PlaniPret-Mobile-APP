import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PbxSourceDescriptor, PbxSourceStatus } from "@/lib/pbx/sources";
import { Activity, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";

interface Props {
  source: PbxSourceDescriptor;
  status: PbxSourceStatus;
  syncedAt?: string | null;
  className?: string;
}

const STATUS_STYLE: Record<PbxSourceStatus, { label: string; cls: string; Icon: typeof Activity }> = {
  live:        { label: "Live",        cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",  Icon: Activity },
  synced:      { label: "Synced",      cls: "bg-sky-500/15 text-sky-300 border-sky-500/30",              Icon: CheckCircle2 },
  stale:       { label: "Stale",       cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",        Icon: AlertTriangle },
  unavailable: { label: "Unavailable", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30",           Icon: XCircle },
  unknown:     { label: "Unknown",     cls: "bg-muted text-muted-foreground border-border",              Icon: HelpCircle },
};

export function SourceBadge({ source, status, syncedAt, className }: Props) {
  const s = STATUS_STYLE[status];
  const ago = syncedAt ? new Date(syncedAt).toLocaleString() : "never";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("gap-1 font-normal border", s.cls, className)}>
            <s.Icon className="h-3 w-3" />
            <span className="text-[10px] uppercase tracking-wide">{source.label}</span>
            <span className="text-[10px] opacity-70">· {s.label}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          <div className="font-medium">{source.label}</div>
          <div className="text-muted-foreground">{source.description}</div>
          <div className="mt-1">Kind: <code>{source.kind}</code></div>
          {source.table && <div>Table: <code>{source.table}</code></div>}
          {source.edgeFunction && <div>Edge: <code>{source.edgeFunction}</code></div>}
          <div>Last sync: {ago}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
