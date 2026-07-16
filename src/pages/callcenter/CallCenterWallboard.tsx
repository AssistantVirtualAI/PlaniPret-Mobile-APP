import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCallCenterRole } from "@/hooks/useCallCenterRole";
import { useWallboard, type CcAgent } from "@/hooks/useWallboard";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Headphones, MessageCircle, Volume2, Loader2 } from "lucide-react";

export default function CallCenterWallboard() {
  const { role, extension, organization_id, loading } = useCallCenterRole();
  const { queues, agents, refresh } = useWallboard(organization_id);
  const { toast } = useToast();
  const [selectedQueue, setSelectedQueue] = useState<string>("all");

  const filteredAgents = useMemo(() => {
    if (selectedQueue === "all") return agents;
    return agents.filter((a) => (a.cc_queues || []).includes(selectedQueue));
  }, [agents, selectedQueue]);

  const totals = useMemo(() => queues.reduce((acc, q) => ({
    waiting: acc.waiting + q.calls_waiting,
    answered: acc.answered + q.calls_answered_today,
    abandoned: acc.abandoned + q.calls_abandoned_today,
    longest: Math.max(acc.longest, q.longest_wait_seconds),
    sla: q.service_level_percent || acc.sla,
  }), { waiting: 0, answered: 0, abandoned: 0, longest: 0, sla: 0 }), [queues]);

  const monitor = async (agent: CcAgent, type: "listen" | "whisper" | "barge") => {
    const { error } = await supabase.functions.invoke("call-center-sync", {
      body: {
        action: "monitor-start",
        monitor_type: type,
        organization_id,
        supervisor_extension: extension,
        agent_extension: agent.extension,
        call_uuid: "auto",
      },
    });
    if (error) toast({ title: "Monitor failed", description: error.message, variant: "destructive" });
    else toast({ title: `${type === "listen" ? "Listening to" : type === "whisper" ? "Coaching" : "Barged into"} Ext ${agent.extension}` });
  };

  if (loading) return <div className="p-6"><Loader2 className="animate-spin" /></div>;
  if (role !== "supervisor" && role !== "admin") {
    return <div className="p-6"><Card><CardContent className="p-6">Supervisor access required.</CardContent></Card></div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Supervisor Wallboard</h1>
        <Button variant="outline" onClick={refresh}>Refresh</Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Calls waiting" value={totals.waiting} accent={totals.waiting > 5 ? "destructive" : "default"} sub={`Longest ${fmtSec(totals.longest)}`} />
        <Kpi label="Answered today" value={totals.answered} />
        <Kpi label="Abandoned" value={totals.abandoned} accent={totals.abandoned > 5 ? "destructive" : "default"} />
        <Kpi label="Service level" value={`${totals.sla}%`} accent={totals.sla < 80 ? "destructive" : "default"} />
        <Kpi label="Agents online" value={agents.filter((a) => a.cc_status !== "offline").length} sub={`${agents.length} total`} />
      </div>

      {/* Queue tabs */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={selectedQueue === "all" ? "default" : "outline"} onClick={() => setSelectedQueue("all")}>All</Button>
        {queues.map((q) => (
          <Button key={q.id} size="sm" variant={selectedQueue === q.queue_name ? "default" : "outline"} onClick={() => setSelectedQueue(q.queue_name)}>
            {q.queue_name} {q.calls_waiting > 0 && <Badge variant="destructive" className="ml-2">{q.calls_waiting}</Badge>}
          </Button>
        ))}
      </div>

      {/* Agent grid */}
      <Card>
        <CardHeader><CardTitle>Agents ({filteredAgents.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredAgents.map((a) => (
              <AgentCard key={a.extension} agent={a} onMonitor={monitor} canMonitor={role === "supervisor" || role === "admin"} />
            ))}
            {filteredAgents.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full">No agents in this queue.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub, accent = "default" }: any) {
  return (
    <Card className={accent === "destructive" ? "border-destructive" : ""}>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${accent === "destructive" ? "text-destructive" : ""}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function AgentCard({ agent, onMonitor, canMonitor }: { agent: CcAgent; onMonitor: (a: CcAgent, t: any) => void; canMonitor: boolean }) {
  const border = {
    available: "border-green-500", on_call: "border-red-500", paused: "border-amber-500", offline: "border-slate-500",
  }[agent.cc_status] || "border-slate-500";
  const dot = {
    available: "bg-green-500", on_call: "bg-red-500 animate-pulse", paused: "bg-amber-500", offline: "bg-slate-500",
  }[agent.cc_status] || "bg-slate-500";

  return (
    <div className={`border-2 ${border} rounded-lg p-3 bg-card`}>
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${dot}`} />
        <div className="font-medium truncate flex-1">{agent.display_name || agent.extension}</div>
        <Badge variant="outline" className="text-xs">{agent.extension}</Badge>
      </div>
      <div className="text-xs text-muted-foreground mt-2 capitalize">
        {agent.cc_status.replace("_", " ")}
        {agent.cc_pause_reason && ` · ${agent.cc_pause_reason}`}
      </div>
      {agent.cc_status === "on_call" && canMonitor && (
        <div className="flex gap-1 mt-3">
          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => onMonitor(agent, "listen")}>
            <Headphones className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => onMonitor(agent, "whisper")}>
            <MessageCircle className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => onMonitor(agent, "barge")}>
            <Volume2 className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

function fmtSec(s: number) {
  if (!s) return "0s";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
