import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { PhoneForwarded } from 'lucide-react';

export default function MyForwarding() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [ext, setExt] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [always, setAlways] = useState({ enabled: false, to: '' });
  const [busy, setBusy] = useState({ enabled: false, to: '' });
  const [noAnswer, setNoAnswer] = useState({ enabled: false, to: '', seconds: 20 });
  const [offline, setOffline] = useState({ enabled: false, to: '' });
  const [dnd, setDnd] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setLoading(false); return; }
      setUid(auth.user.id);
      const { data: spu } = await (supabase as any)
        .from('pbx_softphone_users')
        .select('extension, organization_id')
        .eq('portal_user_id', auth.user.id)
        .maybeSingle();
      if (!spu) { setLoading(false); return; }
      setExt(spu.extension);
      setOrgId(spu.organization_id);
      const { data: fwd } = await (supabase as any)
        .from('pbx_call_forwarding')
        .select('*')
        .eq('user_id', auth.user.id)
        .maybeSingle();
      if (fwd) {
        setAlways({ enabled: !!fwd.always_enabled, to: fwd.always_to ?? '' });
        setBusy({ enabled: !!fwd.busy_enabled, to: fwd.busy_to ?? '' });
        setNoAnswer({ enabled: !!fwd.no_answer_enabled, to: fwd.no_answer_to ?? '', seconds: fwd.no_answer_seconds ?? 20 });
        setOffline({ enabled: !!fwd.offline_enabled, to: fwd.offline_to ?? '' });
        setDnd(!!fwd.dnd_enabled);
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!uid || !orgId) return;
    setSaving(true);
    const { error } = await supabase.functions.invoke('me-update-forwarding', {
      body: {
        always_enabled: always.enabled, always_to: always.to || null,
        busy_enabled: busy.enabled, busy_to: busy.to || null,
        no_answer_enabled: noAnswer.enabled, no_answer_to: noAnswer.to || null, no_answer_seconds: noAnswer.seconds,
        offline_enabled: offline.enabled, offline_to: offline.to || null,
        dnd_enabled: dnd,
      },
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Forwarding updated');
  };

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!ext) return <div className="p-6 text-muted-foreground">No extension assigned.</div>;

  const Section = ({ title, enabled, onEnabled, to, onTo, extra }: any) => (
    <div className="rounded-lg border border-cockpit-border/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{title}</Label>
        <Switch checked={enabled} onCheckedChange={onEnabled} />
      </div>
      {enabled && (
        <>
          <Input value={to} onChange={(e) => onTo(e.target.value)} placeholder="+15145551234 or 102" />
          {extra}
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <PhoneForwarded className="h-6 w-6 text-cockpit-cyan" />
        <h1 className="page-title text-2xl font-semibold">Call Forwarding · Ext {ext}</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>Do Not Disturb</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label>Block all incoming calls</Label>
            <Switch checked={dnd} onCheckedChange={setDnd} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Forwarding rules</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Section title="Always forward" enabled={always.enabled}
            onEnabled={(v: boolean) => setAlways({ ...always, enabled: v })}
            to={always.to} onTo={(v: string) => setAlways({ ...always, to: v })} />
          <Section title="When busy" enabled={busy.enabled}
            onEnabled={(v: boolean) => setBusy({ ...busy, enabled: v })}
            to={busy.to} onTo={(v: string) => setBusy({ ...busy, to: v })} />
          <Section title="No answer" enabled={noAnswer.enabled}
            onEnabled={(v: boolean) => setNoAnswer({ ...noAnswer, enabled: v })}
            to={noAnswer.to} onTo={(v: string) => setNoAnswer({ ...noAnswer, to: v })}
            extra={
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Ring for</Label>
                <Input type="number" className="w-24" value={noAnswer.seconds}
                  onChange={(e) => setNoAnswer({ ...noAnswer, seconds: parseInt(e.target.value) || 20 })} />
                <Label className="text-xs text-muted-foreground">seconds</Label>
              </div>
            } />
          <Section title="When offline" enabled={offline.enabled}
            onEnabled={(v: boolean) => setOffline({ ...offline, enabled: v })}
            to={offline.to} onTo={(v: string) => setOffline({ ...offline, to: v })} />
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
    </div>
  );
}
