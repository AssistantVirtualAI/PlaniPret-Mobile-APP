import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCallCenterRole } from "@/hooks/useCallCenterRole";
import { usePauseReasons } from "@/hooks/usePauseReasons";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Phone, Pause, Play, Power, Loader2 } from "lucide-react";

export default function CallCenterAgent() {
  const { role, queues, extension, organization_id, loading } = useCallCenterRole();
  const pauseReasons = usePauseReasons(organization_id);
  const { toast } = useToast();
  const [status, setStatus] = useState<"offline" | "available" | "paused" | "on_call">("offline");
  const [pauseReason, setPauseReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState({ calls: 0, avgHandle: 0, sla: 0 });

  useEffect(() => {
    if (!extension || !organization_id) return;
    supabase.from("pbx_softphone_users").select("cc_status, cc_pause_reason, cc_calls_today, cc_avg_handle_time")
      .eq("extension", extension).eq("organization_id", organization_id).maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setStatus(data.cc_status || "offline");
          setPauseReason(data.cc_pause_reason);
          setStats({ calls: data.cc_calls_today || 0, avgHandle: data.cc_avg_handle_time || 0, sla: 0 });
        }
      });
  }, [extension, organization_id]);

  const call = async (action: string, extra: Record<string, any> = {}) => {
    if (!extension || !organization_id) return;
    setBusy(true);
    const { error } = await supabase.functions.invoke("call-center-sync", {
      body: { action, extension, organization_id, queue: queues[0], ...extra },
    });
    setBusy(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
  };

  const goAvailable = async () => { await call("agent-unpause"); setStatus("available"); setPauseReason(null); };
  const goPaused = async (reason: string) => { await call("agent-pause", { reason }); setStatus("paused"); setPauseReason(reason); };
  const logIn = async () => { await call("agent-login"); setStatus("available"); };
  const logOut = async () => { await call("agent-logout"); setStatus("offline"); };

  if (loading) return <div className="p-6"><Loader2 className="animate-spin" /></div>;
  if (role === "none") {
    return <div className="p-6"><Card><CardContent className="p-6">You are not assigned a call center role.</CardContent></Card></div>;
  }

  const statusColor = { available: "bg-green-500", paused: "bg-amber-500", on_call: "bg-red-500", offline: "bg-slate-500" }[status];
  const statusLabel = { available: "Available", paused: `Paused${pauseReason ? ` · ${pauseReason}` : ""}`, on_call: "On Call", offline: "Offline" }[status];

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Agent Console</h1>
          <p className="text-sm text-muted-foreground">Ext {extension} · {role}</p>
        </div>
      </div>

      {/* Status bar */}
      <Card>
        <CardContent className="p-6 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full ${statusColor} animate-pulse`} />
            <div>
              <div className="text-xs text-muted-foreground uppercase">Status</div>
              <div className="font-semibold text-lg">{statusLabel}</div>
            </div>
          </div>

          <div className="flex gap-2 ml-auto">
            {status === "offline" && (
              <Button onClick={logIn} disabled={busy} className="bg-green-600 hover:bg-green-700">
                <Power className="w-4 h-4 mr-1" /> Log in
              </Button>
            )}
            {status === "paused" && (
              <Button onClick={goAvailable} disabled={busy} className="bg-green-600 hover:bg-green-700">
                <Play className="w-4 h-4 mr-1" /> Resume
              </Button>
            )}
            {status === "available" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" disabled={busy}><Pause className="w-4 h-4 mr-1" /> Pause</Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2">
                  <div className="text-xs text-muted-foreground px-2 py-1">Pause reason</div>
                  {pauseReasons.map((r) => (
                    <button key={r.id} className="w-full text-left px-2 py-2 hover:bg-muted rounded text-sm flex items-center gap-2"
                      onClick={() => goPaused(r.reason)}>
                      <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                      {r.reason}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )}
            {status !== "offline" && (
              <Button variant="ghost" onClick={logOut} disabled={busy}>Log out</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* My queues */}
      <Card>
        <CardHeader><CardTitle>My queues</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {queues.length === 0 && <p className="text-sm text-muted-foreground">No queues assigned.</p>}
          {queues.map((q) => (
            <Badge key={q} variant="secondary" className="text-sm py-1 px-3">
              <Phone className="w-3 h-3 mr-1" /> {q}
            </Badge>
          ))}
        </CardContent>
      </Card>

      {/* Today stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Calls handled" value={stats.calls} />
        <StatCard label="Avg handle time" value={`${Math.floor(stats.avgHandle / 60)}:${String(stats.avgHandle % 60).padStart(2, "0")}`} />
        <StatCard label="Service level" value={`${stats.sla}%`} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: any }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
