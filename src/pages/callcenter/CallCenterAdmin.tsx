import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCallCenterRole } from "@/hooks/useCallCenterRole";
import { usePauseReasons } from "@/hooks/usePauseReasons";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Loader2 } from "lucide-react";

export default function CallCenterAdmin() {
  const { role, organization_id, loading } = useCallCenterRole();
  if (loading) return <div className="p-6"><Loader2 className="animate-spin" /></div>;
  if (role !== "admin") {
    return <div className="p-6"><Card><CardContent className="p-6">Admin access required.</CardContent></Card></div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <h1 className="text-3xl font-semibold">Call Center Administration</h1>
      <Tabs defaultValue="agents">
        <TabsList>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="reasons">Pause Reasons</TabsTrigger>
          <TabsTrigger value="reports">Report Schedules</TabsTrigger>
          <TabsTrigger value="queues">Queues (FusionPBX)</TabsTrigger>
        </TabsList>
        <TabsContent value="agents"><AgentsTab organizationId={organization_id!} /></TabsContent>
        <TabsContent value="reasons"><ReasonsTab organizationId={organization_id!} /></TabsContent>
        <TabsContent value="reports"><ReportsTab organizationId={organization_id!} /></TabsContent>
        <TabsContent value="queues"><QueuesTab organizationId={organization_id!} /></TabsContent>
      </Tabs>
    </div>
  );
}

function AgentsTab({ organizationId }: { organizationId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const { toast } = useToast();
  const load = async () => {
    const { data } = await supabase.from("pbx_softphone_users")
      .select("id, extension, display_name, cc_role, cc_queues, cc_skills")
      .eq("organization_id", organizationId).order("extension");
    setRows((data as any) || []);
  };
  useEffect(() => { load(); }, [organizationId]);

  const setRole = async (id: string, cc_role: string) => {
    await supabase.from("pbx_softphone_users").update({ cc_role }).eq("id", id);
    toast({ title: "Role updated" });
    load();
  };
  const setQueues = async (id: string, queuesStr: string) => {
    const arr = queuesStr.split(",").map((s) => s.trim()).filter(Boolean);
    await supabase.from("pbx_softphone_users").update({ cc_queues: arr }).eq("id", id);
    toast({ title: "Queues updated" });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Agent Roles & Queues</CardTitle><CardDescription>Assign roles, queues, and skills.</CardDescription></CardHeader>
      <CardContent>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-12 gap-2 items-center p-2 border rounded">
              <div className="col-span-3"><div className="font-medium">{r.display_name || r.extension}</div><div className="text-xs text-muted-foreground">Ext {r.extension}</div></div>
              <div className="col-span-2">
                <Select value={r.cc_role || "none"} onValueChange={(v) => setRole(r.id, v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-7">
                <Input defaultValue={(r.cc_queues || []).join(", ")} placeholder="queue1, queue2"
                  onBlur={(e) => setQueues(r.id, e.target.value)} />
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No softphone users yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ReasonsTab({ organizationId }: { organizationId: string }) {
  const reasons = usePauseReasons(organizationId);
  const [reason, setReason] = useState("");
  const [color, setColor] = useState("#666666");
  const { toast } = useToast();

  const add = async () => {
    if (!reason.trim()) return;
    await supabase.from("cc_pause_reasons").insert({ organization_id: organizationId, reason, color });
    setReason(""); toast({ title: "Added" });
  };
  const remove = async (id: string) => {
    await supabase.from("cc_pause_reasons").delete().eq("id", id);
    toast({ title: "Removed" });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Pause Reasons</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="Reason name" value={reason} onChange={(e) => setReason(e.target.value)} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-12 h-10 rounded border" />
          <Button onClick={add}><Plus className="w-4 h-4" /> Add</Button>
        </div>
        <div className="space-y-1">
          {reasons.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-2 border rounded">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: r.color }} />
                <span>{r.reason}</span>
                {r.is_productive && <Badge variant="secondary">productive</Badge>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(r.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ReportsTab({ organizationId }: { organizationId: string }) {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [form, setForm] = useState({ report_type: "daily-summary", cadence: "daily", recipients: "" });
  const { toast } = useToast();

  const load = async () => {
    const { data } = await supabase.from("cc_report_schedules").select("*").eq("organization_id", organizationId);
    setSchedules((data as any) || []);
  };
  useEffect(() => { load(); }, [organizationId]);

  const add = async () => {
    const recipients = form.recipients.split(",").map((s) => s.trim()).filter(Boolean);
    if (!recipients.length) { toast({ title: "Add at least one recipient", variant: "destructive" }); return; }
    await supabase.from("cc_report_schedules").insert({ organization_id: organizationId, ...form, recipients });
    setForm({ report_type: "daily-summary", cadence: "daily", recipients: "" });
    load();
  };
  const remove = async (id: string) => { await supabase.from("cc_report_schedules").delete().eq("id", id); load(); };

  return (
    <Card>
      <CardHeader><CardTitle>Report Schedules</CardTitle><CardDescription>Email reports automatically.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          <Select value={form.report_type} onValueChange={(v) => setForm({ ...form, report_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily-summary">Daily summary</SelectItem>
              <SelectItem value="agent-performance">Agent performance</SelectItem>
              <SelectItem value="queue-performance">Queue performance</SelectItem>
            </SelectContent>
          </Select>
          <Select value={form.cadence} onValueChange={(v) => setForm({ ...form, cadence: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
          <Input className="col-span-2" placeholder="emails, comma separated" value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} />
        </div>
        <Button onClick={add}><Plus className="w-4 h-4 mr-1" />Add schedule</Button>
        <div className="space-y-1">
          {schedules.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-2 border rounded">
              <div>
                <div className="text-sm font-medium">{s.report_type} · {s.cadence}</div>
                <div className="text-xs text-muted-foreground">{(s.recipients || []).join(", ")}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(s.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function QueuesTab({ organizationId }: { organizationId: string }) {
  const [stats, setStats] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("cc_queue_stats").select("*").eq("organization_id", organizationId).then(({ data }) => setStats((data as any) || []));
  }, [organizationId]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Queues</CardTitle>
        <CardDescription>Queue definitions live in FusionPBX. Use the PBX admin to create/edit them; stats sync here every minute.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {stats.map((q) => (
            <div key={q.id} className="grid grid-cols-6 gap-2 p-2 border rounded text-sm">
              <div className="font-medium">{q.queue_name}</div>
              <div>Waiting: {q.calls_waiting}</div>
              <div>Answered: {q.calls_answered_today}</div>
              <div>Abandoned: {q.calls_abandoned_today}</div>
              <div>SLA: {q.service_level_percent}%</div>
              <div>Agents: {q.agents_available}/{q.agents_total}</div>
            </div>
          ))}
          {stats.length === 0 && <p className="text-sm text-muted-foreground">No queues synced yet — check FusionPBX connectivity.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
