import { useReports, useModerateMessage } from "@/hooks/useOrgChat";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, EyeOff, Check } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export function ReportsPanel() {
  const { query, resolve } = useReports();
  const { hide } = useModerateMessage();
  const reports = query.data?.reports ?? [];
  const open = reports.filter((r) => r.status === "open");
  if (query.isLoading) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Shield className="h-4 w-4" />
          {open.length > 0 && <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">{open.length}</Badge>}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[420px] sm:max-w-md">
        <SheetHeader><SheetTitle>Reported messages</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3 overflow-y-auto max-h-[80vh]">
          {reports.length === 0 && <div className="text-sm text-muted-foreground">No reports.</div>}
          {reports.map((r) => (
            <div key={r.id} className="border rounded p-2 text-xs space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={r.status === "open" ? "destructive" : "outline"}>{r.status}</Badge>
                <span className="text-muted-foreground">{format(new Date(r.created_at), "PPp")}</span>
              </div>
              <div className="text-foreground">{r.reason}</div>
              {r.status === "open" && (
                <div className="flex gap-1 pt-1">
                  <Button size="sm" variant="outline" onClick={async () => {
                    try { await hide.mutateAsync({ message_id: r.message_id, reason: r.reason }); await resolve.mutateAsync({ id: r.id, resolution: "hidden" }); toast.success("Message hidden"); }
                    catch (e: any) { toast.error(e?.message); }
                  }}><EyeOff className="h-3 w-3 mr-1" /> Hide</Button>
                  <Button size="sm" variant="ghost" onClick={() => resolve.mutate({ id: r.id, resolution: "dismissed" })}>
                    <Check className="h-3 w-3 mr-1" /> Dismiss
                  </Button>
                </div>
              )}
              {r.resolution && <div className="text-muted-foreground text-[10px]">Resolved: {r.resolution}</div>}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
