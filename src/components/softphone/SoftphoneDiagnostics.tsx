import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, RefreshCw, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { sipProvider, SipEvent } from "@/lib/softphone/jssipProvider";
import { useSoftphone } from "@/hooks/useSoftphone";
import { cn } from "@/lib/utils";

function fmtTime(t: number) {
  const d = new Date(t);
  return d.toISOString().substring(11, 23);
}

function levelClass(l: SipEvent["level"]) {
  if (l === "error") return "text-rose-400";
  if (l === "warn") return "text-amber-400";
  if (l === "debug") return "text-slate-400";
  return "text-emerald-400";
}

export function SoftphoneDiagnostics() {
  const sp = useSoftphone();
  const [open, setOpen] = useState(false);
  const [probing, setProbing] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const snap = sp.snap;
  const cfg = sp.config;
  const wss = snap.wssReachable;

  const onDownload = () => {
    const report = sipProvider.buildDebugReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `softphone-debug-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onRestart = async () => {
    setRestarting(true);
    try { await sipProvider.restart(); } finally { setRestarting(false); }
  };

  const onProbe = async () => {
    if (!cfg) return;
    setProbing(true);
    try {
      const urls = Array.from(new Set([
        cfg.wssUrl, ...(cfg.wssUrls || []),
      ].filter(Boolean))) as string[];
      for (const u of urls) {
        await sipProvider.probeWss(u);
      }
    } finally { setProbing(false); }
  };

  const wssChip = wss === null ? (
    <Badge variant="outline" className="text-[10px]">WSS: unknown</Badge>
  ) : wss ? (
    <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" />WSS reachable</Badge>
  ) : (
    <Badge variant="destructive" className="text-[10px]"><AlertCircle className="w-3 h-3 mr-1" />WSS blocked</Badge>
  );

  return (
    <div className="border-t border-border bg-muted/20">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 flex items-center justify-between text-xs hover:bg-muted/40"
      >
        <span className="flex items-center gap-2">
          <span className="font-medium">Diagnostics</span>
          <Badge variant="outline" className="text-[10px]">SIP: {snap.status}</Badge>
          {wssChip}
          {snap.lastCallError && (
            <Badge variant="destructive" className="text-[10px]">last err: {snap.lastCallError}</Badge>
          )}
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRestart} disabled={restarting}>
              {restarting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Restart SIP
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onProbe} disabled={probing || !cfg}>
              {probing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
              Test WSS
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onDownload}>
              <Download className="w-3 h-3 mr-1" />
              Download report
            </Button>
          </div>

          {snap.errorCause && (
            <div className="text-[11px] rounded bg-destructive/10 border border-destructive/30 px-2 py-1 text-destructive-foreground">
              <span className="font-semibold">Error:</span> {snap.errorCause}
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Call lifecycle</div>
            <ScrollArea className="h-24 rounded border border-border bg-background/40">
              <div className="p-1.5 space-y-0.5 font-mono text-[10px]">
                {snap.callEvents.length === 0 ? (
                  <div className="text-muted-foreground/60 px-1">No call events yet</div>
                ) : snap.callEvents.map((e, i) => (
                  <div key={i} className={cn("flex gap-2", levelClass(e.level))}>
                    <span className="text-muted-foreground shrink-0">{fmtTime(e.at)}</span>
                    <span className="truncate">{e.message}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">SIP / WS / env events</div>
            <ScrollArea className="h-32 rounded border border-border bg-background/40">
              <div className="p-1.5 space-y-0.5 font-mono text-[10px]">
                {snap.events.length === 0 ? (
                  <div className="text-muted-foreground/60 px-1">No events yet</div>
                ) : snap.events.map((e, i) => (
                  <div key={i} className={cn("flex gap-2", levelClass(e.level))}>
                    <span className="text-muted-foreground shrink-0">{fmtTime(e.at)}</span>
                    <span className="text-muted-foreground shrink-0">[{e.category}]</span>
                    <span className="truncate">{e.message}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}
