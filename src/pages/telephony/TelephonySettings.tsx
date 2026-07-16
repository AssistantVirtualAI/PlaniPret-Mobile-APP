import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, EyeOff, Loader2, FlaskConical, Activity, CheckCircle2, XCircle, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePbxIntegration, usePbxMockModeToggle, usePbxPing, usePbxSync, LEMTEL_ORG } from '@/hooks/usePbxData';
import { useTelephonyStatus, type ServiceStatus } from '@/hooks/useTelephonyStatus';
import { SyncDiagnosticsPanel } from '@/components/lemtel/SyncDiagnosticsPanel';

const FIELDS = [
  { key: 'FUSIONPBX_URL', label: 'Server URL', secret: false, section: 'fusionpbx' },
  { key: 'FUSIONPBX_USERNAME', label: 'Username', secret: false, section: 'fusionpbx' },
  { key: 'FUSIONPBX_API_KEY', label: 'API Key', secret: true, section: 'fusionpbx' },
  { key: 'FUSIONPBX_WSS_URL', label: 'WSS URL', secret: false, section: 'fusionpbx' },
  { key: 'FUSIONPBX_DOMAIN', label: 'SIP Domain', secret: false, section: 'fusionpbx' },
  { key: 'TELNYX_API_KEY', label: 'API Key', secret: true, section: 'telnyx' },
  { key: 'TELNYX_MESSAGING_PROFILE_ID', label: 'Messaging Profile ID', secret: false, section: 'telnyx' },
  { key: 'ELEVENLABS_API_KEY', label: 'API Key', secret: true, section: 'elevenlabs' },
  { key: 'ELEVENLABS_VOICE_ID_DEFAULT', label: 'Default Voice ID', secret: false, section: 'elevenlabs' },
  { key: 'ANTHROPIC_API_KEY', label: 'API Key', secret: true, section: 'ai' },
  { key: 'SYNC_CDR_INTERVAL', label: 'CDR sync interval (minutes)', secret: false, section: 'sync' },
  { key: 'SYNC_CONFIG_INTERVAL', label: 'Config sync interval (minutes)', secret: false, section: 'sync' },
  { key: 'AUTO_TRANSCRIBE', label: 'Auto-transcribe recordings', secret: false, section: 'sync' },
  { key: 'AUTO_ANALYZE', label: 'Auto-analyze after transcription', secret: false, section: 'sync' },
];

function pill(s?: ServiceStatus) {
  if (!s) return <Badge variant="outline">—</Badge>;
  return s.ok
    ? <Badge variant="default" className="gap-1"><CheckCircle2 className="w-3 h-3" />{s.latency_ms}ms</Badge>
    : <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />{s.error || 'failed'}</Badge>;
}

function TestAndSyncButtons() {
  const ping = usePbxPing();
  const sync = usePbxSync();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => ping.mutate()} disabled={ping.isPending}>
        {ping.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Activity className="w-3 h-3 mr-1" />}
        Test
      </Button>
      <Button size="sm" onClick={() => sync.mutate('all')} disabled={sync.isPending}>
        {sync.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
        Sync Now
      </Button>
    </>
  );
}


export default function TelephonySettings() {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { data: integration, refetch: refetchIntegration } = usePbxIntegration();
  const toggleMock = usePbxMockModeToggle();
  const { data: status, refetch: refetchStatus, isFetching } = useTelephonyStatus();
  const mockEnabled = !!integration?.config?.mock_mode;
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telnyx-inbound-sms`;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('lemtel_config').select('key, value');
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => (map[r.key] = r.value ?? ''));
      setValues(map);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const rows = FIELDS.map((f) => ({ key: f.key, value: values[f.key] ?? '', is_secret: f.secret }));
    const { error } = await supabase.from('lemtel_config').upsert(rows, { onConflict: 'key' });
    // Also persist URL/domain on pbx_integrations row
    if (!error && values.FUSIONPBX_URL) {
      await supabase.from('pbx_integrations' as any).upsert({
        organization_id: LEMTEL_ORG, provider: 'fusionpbx',
        base_url: values.FUSIONPBX_URL, domain: values.FUSIONPBX_DOMAIN,
        status: 'configured',
        config: { ...(integration?.config || {}), username: values.FUSIONPBX_USERNAME, wss_url: values.FUSIONPBX_WSS_URL },
      }, { onConflict: 'organization_id' });
      refetchIntegration();
    }
    setSaving(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Saved', description: 'Configuration updated' }); refetchStatus(); }
  };

  const fieldsOf = (sec: string) => FIELDS.filter(f => f.section === sec);

  const renderField = (f: typeof FIELDS[number]) => (
    <div key={f.key} className="space-y-2">
      <Label htmlFor={f.key}>{f.label}</Label>
      <div className="flex gap-2">
        <Input id={f.key} type={f.secret && !show[f.key] ? 'password' : 'text'}
          value={values[f.key] ?? ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })} />
        {f.secret && (
          <Button variant="outline" size="icon" type="button" onClick={() => setShow({ ...show, [f.key]: !show[f.key] })}>
            {show[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        )}
      </div>
    </div>
  );

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">PBX Settings</h1>
          <p className="text-muted-foreground">Telephony integrations and sync schedule</p>
        </div>
        <Button variant="outline" onClick={() => refetchStatus()} disabled={isFetching}>
          <Activity className={`w-4 h-4 mr-2 ${isFetching ? 'animate-pulse' : ''}`} /> Test All
        </Button>
      </div>

      {/* Mock Data */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="w-5 h-5" /> Mock Data Mode</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="mock_mode" className="text-base">Use Mock Data (UI Testing Mode)</Label>
              <p className="text-sm text-muted-foreground">Edge functions return seeded mock responses. <strong>Turn off before going live.</strong></p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={mockEnabled ? 'secondary' : 'default'}>{mockEnabled ? 'Mock' : 'Live'}</Badge>
              <Switch id="mock_mode" checked={mockEnabled} disabled={toggleMock.isPending} onCheckedChange={(v) => toggleMock.mutate(v)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FusionPBX */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>FusionPBX Connection</CardTitle>
            <div className="flex items-center gap-2">
              {pill(status?.services.fusionpbx)}
              <TestAndSyncButtons />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">{fieldsOf('fusionpbx').map(renderField)}</CardContent>
      </Card>

      <SyncDiagnosticsPanel />

      {/* Telnyx */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Telnyx SMS</CardTitle>
            {pill(status?.services.telnyx)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {fieldsOf('telnyx').map(renderField)}
          <div className="space-y-2">
            <Label>Inbound Webhook URL</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast({ title: 'Copied' }); }}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Paste this into Telnyx Messaging Profile webhooks.</p>
          </div>
        </CardContent>
      </Card>

      {/* ElevenLabs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>ElevenLabs</CardTitle>
            {pill(status?.services.elevenlabs)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">{fieldsOf('elevenlabs').map(renderField)}</CardContent>
      </Card>

      {/* AI */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Claude AI</CardTitle>
            {pill(status?.services.ai)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {fieldsOf('ai').map(renderField)}
          <div>
            <Label>Model</Label>
            <Input value="claude-sonnet-4-20250514" readOnly className="font-mono text-xs" />
          </div>
        </CardContent>
      </Card>

      {/* Sync schedule */}
      <Card>
        <CardHeader><CardTitle>Sync Schedule</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>CDR sync interval</Label>
            <Select value={values.SYNC_CDR_INTERVAL || '5'} onValueChange={v => setValues({ ...values, SYNC_CDR_INTERVAL: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 minute</SelectItem>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Config sync interval</Label>
            <Select value={values.SYNC_CONFIG_INTERVAL || '30'} onValueChange={v => setValues({ ...values, SYNC_CONFIG_INTERVAL: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">60 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label>Auto-transcribe recordings</Label>
            <Switch checked={values.AUTO_TRANSCRIBE === 'true'} onCheckedChange={v => setValues({ ...values, AUTO_TRANSCRIBE: v ? 'true' : 'false' })} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Auto-analyze after transcription</Label>
            <Switch checked={values.AUTO_ANALYZE === 'true'} onCheckedChange={v => setValues({ ...values, AUTO_ANALYZE: v ? 'true' : 'false' })} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving} size="lg">
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Save All Settings
      </Button>
    </div>
  );
}
