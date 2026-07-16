import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Save, Clock } from "lucide-react";
import { toast } from "sonner";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Slot { day: number; start: string; end: string; }

export default function BusinessHours() {
  const { slug } = useParams();
  const qc = useQueryClient();

  const { data: org } = useQuery({
    queryKey: ["org", slug],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("id,name").eq("slug", slug ?? "lemtel").maybeSingle();
      return data as any;
    },
  });

  const { data: row } = useQuery({
    queryKey: ["business-hours", org?.id],
    enabled: !!org?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("org_business_hours").select("*")
        .eq("organization_id", org.id).maybeSingle();
      return data;
    },
  });

  const [name, setName] = useState("Default");
  const [tz, setTz] = useState("America/Toronto");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [openDest, setOpenDest] = useState("");
  const [closedDest, setClosedDest] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) {
      setName(row.name || "Default");
      setTz(row.timezone || "America/Toronto");
      setSlots(Array.isArray(row.schedule) ? row.schedule : []);
      setOpenDest(row.open_destination || "");
      setClosedDest(row.closed_destination || "");
    }
  }, [row]);

  const updateSlot = (i: number, patch: Partial<Slot>) =>
    setSlots(s => s.map((x, k) => k === i ? { ...x, ...patch } : x));

  const save = async () => {
    if (!org?.id) return;
    setSaving(true);
    try {
      const { data: pbx, error: pbxErr } = await supabase.functions.invoke("fusionpbx-proxy", {
        body: {
          action: "upsert-time-condition",
          organization_id: org.id,
          params: {
            name, schedule: slots,
            open_destination: openDest, closed_destination: closedDest,
            dialplan_uuid: row?.fusionpbx_dialplan_uuid || undefined,
          },
        },
      });
      if (pbxErr) throw pbxErr;
      const dpUuid = (pbx as any)?.dialplan_uuid;

      const payload: any = {
        organization_id: org.id, name, timezone: tz,
        schedule: slots, open_destination: openDest, closed_destination: closedDest,
        fusionpbx_dialplan_uuid: dpUuid,
      };
      const { error } = row
        ? await (supabase as any).from("org_business_hours").update(payload).eq("id", row.id)
        : await (supabase as any).from("org_business_hours").insert(payload);
      if (error) throw error;
      toast.success("Business hours saved");
      qc.invalidateQueries({ queryKey: ["business-hours", org.id] });
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Clock className="h-7 w-7" />Business Hours</h1>
        <p className="text-muted-foreground">Define when calls route to your team vs. voicemail/IVR.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div><Label>Timezone</Label><Input value={tz} onChange={e => setTz(e.target.value)} placeholder="America/Toronto" /></div>
          </div>

          <div className="space-y-2">
            {slots.map((s, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>Day</Label>
                  <select className="w-full h-10 px-3 rounded-md border bg-background"
                    value={s.day} onChange={e => updateSlot(i, { day: Number(e.target.value) })}>
                    {DAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                  </select>
                </div>
                <div className="flex-1"><Label>Open</Label>
                  <Input type="time" value={s.start} onChange={e => updateSlot(i, { start: e.target.value })} /></div>
                <div className="flex-1"><Label>Close</Label>
                  <Input type="time" value={s.end} onChange={e => updateSlot(i, { end: e.target.value })} /></div>
                <Button size="icon" variant="ghost" onClick={() => setSlots(slots.filter((_, k) => k !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm"
              onClick={() => setSlots([...slots, { day: 1, start: "09:00", end: "17:00" }])}>
              <Plus className="h-4 w-4 mr-1" /> Add time slot
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div><Label>Open destination</Label>
              <Input value={openDest} onChange={e => setOpenDest(e.target.value)} placeholder="100" /></div>
            <div><Label>Closed destination</Label>
              <Input value={closedDest} onChange={e => setClosedDest(e.target.value)} placeholder="*99100" /></div>
          </div>

          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Save & deploy to PBX"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
