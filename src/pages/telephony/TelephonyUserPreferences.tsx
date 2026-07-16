import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCallForwarding } from "@/hooks/useCallForwarding";
import { useRecordingRules } from "@/hooks/useRecordingRules";
import { useVoicemailSettings } from "@/hooks/useVoicemailSettings";
import { useQueueAgent } from "@/hooks/useQueueAgent";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PhoneForwarded, Disc, Voicemail, Users, Smartphone, Loader2 } from "lucide-react";

export default function TelephonyUserPreferences() {
  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Telephony Preferences</h1>
        <p className="text-muted-foreground text-sm">Manage your call routing, recording, voicemail and queue membership.</p>
      </div>

      <Tabs defaultValue="forwarding" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="forwarding"><PhoneForwarded className="w-4 h-4 mr-1" />Forwarding</TabsTrigger>
          <TabsTrigger value="recording"><Disc className="w-4 h-4 mr-1" />Recording</TabsTrigger>
          <TabsTrigger value="voicemail"><Voicemail className="w-4 h-4 mr-1" />Voicemail</TabsTrigger>
          <TabsTrigger value="queues"><Users className="w-4 h-4 mr-1" />Queues</TabsTrigger>
          <TabsTrigger value="devices"><Smartphone className="w-4 h-4 mr-1" />Devices</TabsTrigger>
        </TabsList>

        <TabsContent value="forwarding"><ForwardingSection /></TabsContent>
        <TabsContent value="recording"><RecordingSection /></TabsContent>
        <TabsContent value="voicemail"><VoicemailSection /></TabsContent>
        <TabsContent value="queues"><QueueSection /></TabsContent>
        <TabsContent value="devices"><DevicesSection /></TabsContent>
      </Tabs>
    </div>
  );
}

function ForwardingSection() {
  const { data, loading, save } = useCallForwarding();
  const { toast } = useToast();
  const [local, setLocal] = useState<any>(null);
  const v = local ?? data ?? {};

  if (loading) return <Loader2 className="w-5 h-5 animate-spin" />;

  const set = (patch: any) => setLocal({ ...v, ...patch });
  const commit = async () => {
    await save(local || {});
    setLocal(null);
    toast({ title: "Saved", description: "Forwarding rules updated." });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Call Forwarding</CardTitle>
        <CardDescription>Route calls when you're busy, away, or off duty.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {[
          { key: "always", label: "Always forward" },
          { key: "busy", label: "When busy" },
          { key: "no_answer", label: "On no answer" },
          { key: "offline", label: "When offline" },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center gap-3">
            <Switch
              checked={!!v[`${key}_enabled`]}
              onCheckedChange={(c) => set({ [`${key}_enabled`]: c })}
            />
            <Label className="w-40">{label}</Label>
            <Input
              placeholder="Destination number or extension"
              value={v[`${key}_to`] || ""}
              onChange={(e) => set({ [`${key}_to`]: e.target.value })}
              disabled={!v[`${key}_enabled`]}
            />
          </div>
        ))}
        <div className="flex items-center gap-3">
          <Label className="w-40">No-answer timeout</Label>
          <Input
            type="number" min={5} max={60}
            value={v.no_answer_seconds || 20}
            onChange={(e) => set({ no_answer_seconds: parseInt(e.target.value) || 20 })}
            className="w-32"
          />
          <span className="text-sm text-muted-foreground">seconds</span>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={!!v.dnd_enabled} onCheckedChange={(c) => set({ dnd_enabled: c })} />
          <Label>Do Not Disturb</Label>
        </div>
        <Button onClick={commit} disabled={!local}>Save</Button>
      </CardContent>
    </Card>
  );
}

function RecordingSection() {
  const { data, loading, save } = useRecordingRules();
  const { toast } = useToast();
  if (loading) return <Loader2 className="w-5 h-5 animate-spin" />;
  const v = data || {};
  return (
    <Card>
      <CardHeader>
        <CardTitle>Call Recording</CardTitle>
        <CardDescription>Choose which calls to record and how callers are notified.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch checked={!!v.record_inbound} onCheckedChange={(c) => save({ record_inbound: c }).then(() => toast({ title: "Saved" }))} />
          <Label>Record inbound calls</Label>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={!!v.record_outbound} onCheckedChange={(c) => save({ record_outbound: c }).then(() => toast({ title: "Saved" }))} />
          <Label>Record outbound calls</Label>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={!!v.announce_recording} onCheckedChange={(c) => save({ announce_recording: c })} />
          <Label>Play recording announcement</Label>
        </div>
      </CardContent>
    </Card>
  );
}

function VoicemailSection() {
  const { data, loading, save } = useVoicemailSettings();
  const { toast } = useToast();
  if (loading) return <Loader2 className="w-5 h-5 animate-spin" />;
  const v = data || {};
  return (
    <Card>
      <CardHeader>
        <CardTitle>Voicemail</CardTitle>
        <CardDescription>Notifications, PIN and transcription settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Label className="w-40">Voicemail PIN</Label>
          <Input
            type="password" maxLength={8}
            defaultValue={v.pin || ""}
            onBlur={(e) => save({ pin: e.target.value }).then(() => toast({ title: "Saved" }))}
            className="w-32"
          />
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={!!v.notify_email} onCheckedChange={(c) => save({ notify_email: c })} />
          <Label>Email notifications</Label>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={!!v.notify_sms} onCheckedChange={(c) => save({ notify_sms: c })} />
          <Label>SMS notifications</Label>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={!!v.notify_push} onCheckedChange={(c) => save({ notify_push: c })} />
          <Label>Push notifications</Label>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={!!v.transcribe} onCheckedChange={(c) => save({ transcribe: c })} />
          <Label>Auto-transcribe voicemails</Label>
        </div>
      </CardContent>
    </Card>
  );
}

function QueueSection() {
  const { queues, stats, togglePause } = useQueueAgent();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Queue Membership</CardTitle>
        <CardDescription>Pause or resume calls from each queue you belong to.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {queues.length === 0 && (
          <p className="text-sm text-muted-foreground">You are not assigned to any queues.</p>
        )}
        {queues.map((q) => {
          const s = stats[q.queue_id] || {};
          return (
            <div key={q.queue_id} className="flex items-center justify-between p-3 rounded-md border">
              <div>
                <div className="font-medium">{q.queue_name || q.queue_id}</div>
                <div className="text-xs text-muted-foreground">
                  Waiting: {s.waiting ?? 0} · Agents: {s.agents ?? 0}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={q.paused ? "destructive" : "default"}>
                  {q.paused ? "Paused" : "Active"}
                </Badge>
                <Switch checked={!q.paused} onCheckedChange={(c) => togglePause(q.queue_id, !c)} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DevicesSection() {
  const { user } = useAuth();
  const [status, setStatus] = useState("online");
  const [message, setMessage] = useState("");

  const updatePresence = async () => {
    await (supabase.rpc as any)("upsert_user_presence", {
      _status: status,
      _message: message || null,
      _emoji: null,
      _call_state: "idle",
      _platform: "web",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Devices & Presence</CardTitle>
        <CardDescription>Manually set your availability across all registered devices.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Label className="w-32">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="busy">Busy</SelectItem>
              <SelectItem value="away">Away</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <Label className="w-32">Message</Label>
          <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional status message" />
        </div>
        <Button onClick={updatePresence}>Update presence</Button>
        <p className="text-xs text-muted-foreground pt-4">
          Signed in as <code>{user?.email}</code>
        </p>
      </CardContent>
    </Card>
  );
}
