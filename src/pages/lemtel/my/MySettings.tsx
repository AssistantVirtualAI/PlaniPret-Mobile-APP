import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { AiGreetingGenerator } from "@/components/portal/AiGreetingGenerator";

function PasswordStrength({ value }: { value: string }) {
  const score = (() => {
    let s = 0;
    if (value.length >= 8) s++;
    if (value.length >= 12) s++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) s++;
    if (/\d/.test(value)) s++;
    if (/[^A-Za-z0-9]/.test(value)) s++;
    return Math.min(s, 5);
  })();
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong", "Excellent"];
  const colors = ["bg-rose-500", "bg-rose-400", "bg-amber-400", "bg-yellow-400", "bg-emerald-500", "bg-emerald-600"];
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[0,1,2,3,4].map(i => (
          <div key={i} className={`h-1.5 flex-1 rounded ${i < score ? colors[score] : "bg-muted"}`} />
        ))}
      </div>
      <div className="text-xs text-muted-foreground">{labels[score]}</div>
    </div>
  );
}

function SecurityTab() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const change = async () => {
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    if (pw !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    setPw(""); setConfirm("");
    toast.success("Password updated");
  };

  const signOutAll = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signOut({ scope: "others" });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Signed out of other sessions");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Change password</CardTitle>
          <CardDescription>Use at least 8 characters with a mix of cases, numbers, and symbols.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-w-md">
          <div>
            <Label>New password</Label>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
            {pw && <div className="mt-2"><PasswordStrength value={pw} /></div>}
          </div>
          <div>
            <Label>Confirm new password</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          <Button onClick={change} disabled={busy || !pw || !confirm}>Update password</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Active sessions</CardTitle>
          <CardDescription>Sign out from every other browser, desktop, and mobile session.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={signOutAll} disabled={busy}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out all other sessions
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileTab() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      setProfile(data);
    })();
  }, [user]);

  if (!profile) return <p className="text-muted-foreground">Loading…</p>;

  const save = async (patch: Record<string, any>) => {
    setBusy(true);
    const { error } = await (supabase.from("profiles") as any).update(patch).eq("id", profile.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Saved"); setProfile({ ...profile, ...patch }); }
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    const path = `avatars/${user.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("organization-assets").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data: pub } = supabase.storage.from("organization-assets").getPublicUrl(path);
    await save({ avatar_url: pub.publicUrl });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
      <CardContent className="space-y-4 max-w-lg">
        <div>
          <Label>Full name</Label>
          <Input defaultValue={profile.full_name ?? ""} onBlur={(e) => save({ full_name: e.target.value })} />
        </div>
        <div>
          <Label>Email</Label>
          <Input value={profile.email ?? ""} readOnly />
        </div>
        <div>
          <Label>Avatar</Label>
          <div className="flex items-center gap-3">
            {profile.avatar_url && <img src={profile.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />}
            <Input type="file" accept="image/*" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TelephonyTab() {
  const [spu, setSpu] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data } = await (supabase as any).from("pbx_softphone_users")
        .select("id,extension,display_name,sip_domain,wss_url,organization_id,status,desktop_access_enabled,mobile_access_enabled,app_access_enabled,portal_user_id,extension_id,last_seen_at,cc_role,active_platforms").eq("portal_user_id", auth.user?.id).maybeSingle();
      setSpu(data);
    })();
  }, []);

  if (!spu) return <p className="text-muted-foreground">No extension linked to your account.</p>;

  const save = async (patch: Record<string, any>) => {
    setBusy(true);
    const { error } = await (supabase as any).from("pbx_softphone_users").update(patch).eq("id", spu.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Saved"); setSpu({ ...spu, ...patch }); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Caller ID</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Display name</Label>
            <Input defaultValue={spu.display_name ?? ""} onBlur={(e) => save({ display_name: e.target.value })} />
          </div>
          <div><Label>Outbound number (set by admin)</Label>
            <Input value={spu.outbound_cid ?? ""} readOnly />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Call Forwarding</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Forward all → number</Label>
            <Input defaultValue={spu.forward_all ?? ""} onBlur={(e) => save({ forward_all: e.target.value || null })} /></div>
          <div><Label>Forward busy → number</Label>
            <Input defaultValue={spu.forward_busy ?? ""} onBlur={(e) => save({ forward_busy: e.target.value || null })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>No answer → number</Label>
              <Input defaultValue={spu.forward_no_answer ?? ""} onBlur={(e) => save({ forward_no_answer: e.target.value || null })} /></div>
            <div><Label>Ring time (s)</Label>
              <Input type="number" defaultValue={spu.no_answer_ring ?? 20} onBlur={(e) => save({ no_answer_ring: Number(e.target.value) })} /></div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Do Not Disturb</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between">
          <Label>DND</Label>
          <Switch checked={!!spu.dnd_enabled} onCheckedChange={(v) => save({ dnd_enabled: v })} disabled={busy} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Voicemail</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between"><Label>Email notifications</Label>
            <Switch checked={!!spu.vm_email_enabled} onCheckedChange={(v) => save({ vm_email_enabled: v })} /></div>
          <div className="flex items-center justify-between"><Label>Transcription</Label>
            <Switch checked={!!spu.vm_transcribe_enabled} onCheckedChange={(v) => save({ vm_transcribe_enabled: v })} /></div>
          <div><Label>Voicemail PIN</Label>
            <Input defaultValue={spu.vm_pin ?? ""} onBlur={(e) => save({ vm_pin: e.target.value })} /></div>
        </CardContent>
      </Card>
      <AiGreetingGenerator />
    </div>
  );
}

function NotificationsTab() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<any>(null);
  const [spu, setSpu] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from("user_notification_prefs").select("*").eq("user_id", user.id).maybeSingle(),
        (supabase as any).from("pbx_softphone_users").select("active_platforms,desktop_access_enabled,mobile_access_enabled,app_access_enabled,last_seen_at,extension").eq("portal_user_id", user.id).maybeSingle(),
      ]);
      setPrefs(p ?? { email_enabled: true, push_enabled: true });
      setSpu(s);
    })();
  }, [user]);

  const toggle = async (key: string, val: boolean) => {
    if (!user) return;
    const next = { ...(prefs || {}), [key]: val, user_id: user.id };
    setPrefs(next);
    const { error } = await (supabase as any).from("user_notification_prefs").upsert(next, { onConflict: "user_id" });
    if (error) toast.error(error.message);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div><Label>Email notifications</Label><div className="text-xs text-muted-foreground">Voicemail, missed calls, system events.</div></div>
            <Switch checked={!!prefs?.email_enabled} onCheckedChange={(v) => toggle("email_enabled", v)} />
          </div>
          <div className="flex items-center justify-between">
            <div><Label>Push / in-app notifications</Label></div>
            <Switch checked={!!prefs?.push_enabled} onCheckedChange={(v) => toggle("push_enabled", v)} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Linked devices</CardTitle><CardDescription>Managed by your administrator.</CardDescription></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!spu ? <p className="text-muted-foreground">No extension linked to your account.</p> : (
            <>
              <div>Extension: <span className="font-mono">{spu.extension}</span></div>
              <div>App access: <span className={spu.app_access_enabled ? "text-emerald-500" : "text-rose-500"}>{spu.app_access_enabled ? "enabled" : "disabled"}</span></div>
              <div>Desktop: <span className={spu.desktop_access_enabled ? "text-emerald-500" : "text-rose-500"}>{spu.desktop_access_enabled ? "enabled" : "disabled"}</span></div>
              <div>Mobile: <span className={spu.mobile_access_enabled ? "text-emerald-500" : "text-rose-500"}>{spu.mobile_access_enabled ? "enabled" : "disabled"}</span></div>
              <div>Active platforms: <span className="font-mono">{(spu.active_platforms ?? []).join(", ") || "—"}</span></div>
              <div>Last seen: {spu.last_seen_at ? new Date(spu.last_seen_at).toLocaleString() : "—"}</div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MySettings() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") ?? "profile";
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My Settings</h1>
      <Tabs value={tab} onValueChange={(v) => setSp({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="telephony">Telephony</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><ProfileTab /></TabsContent>
        <TabsContent value="security"><SecurityTab /></TabsContent>
        <TabsContent value="telephony"><TelephonyTab /></TabsContent>
        <TabsContent value="notifications"><NotificationsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
