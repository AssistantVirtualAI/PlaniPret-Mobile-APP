import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Loader2, FlaskConical, Activity, Plug, Mail, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePbxIntegration, usePbxMockModeToggle } from '@/hooks/usePbxData';

const FIELDS: { key: string; label: string; secret: boolean; section: string }[] = [
  { key: 'FUSIONPBX_URL', label: 'FusionPBX URL', secret: false, section: 'FusionPBX' },
  { key: 'FUSIONPBX_USERNAME', label: 'Username', secret: false, section: 'FusionPBX' },
  { key: 'FUSIONPBX_API_KEY', label: 'API Key', secret: true, section: 'FusionPBX' },
  { key: 'FUSIONPBX_WSS_URL', label: 'WSS URL', secret: false, section: 'FusionPBX' },
  { key: 'FUSIONPBX_DOMAIN', label: 'SIP Domain', secret: false, section: 'FusionPBX' },
  { key: 'TELNYX_API_KEY', label: 'Telnyx API Key', secret: true, section: 'Telnyx SMS' },
  { key: 'TELNYX_MESSAGING_PROFILE_ID', label: 'Messaging Profile ID', secret: false, section: 'Telnyx SMS' },
  { key: 'ELEVENLABS_VOICE_ID_DEFAULT', label: 'Default Voice ID', secret: false, section: 'ElevenLabs' },
  { key: 'ANTHROPIC_API_KEY', label: 'Claude API Key', secret: true, section: 'AI (Claude)' },
];

export default function LemtelSettings() {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: integration, isLoading: integLoading } = usePbxIntegration();
  const toggleMock = usePbxMockModeToggle();
  const mockEnabled = !!integration?.config?.mock_mode;

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
    setSaving(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Saved', description: 'Configuration updated' });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>;

  const sections = Array.from(new Set(FIELDS.map((f) => f.section)));

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Lemtel Settings</h1>
        <p className="text-muted-foreground">Configure telecom integrations</p>
      </div>

      <ResendDomainStatus />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plug className="w-5 h-5" /> Carrier Integrations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Connect your own Twilio, Telnyx, Skyetel or VoIP.ms credentials. Step-by-step guides included.
          </p>
          <Button asChild>
            <Link to="/lemtel/integrations/providers">Open Provider Credentials</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FlaskConical className="w-5 h-5" /> Data Source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="mock_mode" className="text-base">Use Mock Data (UI Testing Mode)</Label>
              <p className="text-sm text-muted-foreground">When enabled, edge functions return seeded mock responses instead of calling FusionPBX.</p>
            </div>
            <div className="flex items-center gap-3">
              {integLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Badge variant={mockEnabled ? 'secondary' : 'default'} className="gap-1">
                  <Activity className="w-3 h-3" />
                  {mockEnabled ? 'Mock' : 'Live'}
                </Badge>
              )}
              <Switch
                id="mock_mode"
                checked={mockEnabled}
                disabled={toggleMock.isPending || integLoading}
                onCheckedChange={(v) => toggleMock.mutate(v)}
              />
            </div>
          </div>
          {integration?.status && (
            <p className="text-xs text-muted-foreground">Integration status: <span className="font-mono">{integration.status}</span>{integration.last_sync_at ? ` · last sync ${new Date(integration.last_sync_at).toLocaleString()}` : ''}</p>
          )}
        </CardContent>
      </Card>

      {sections.map((sec) => (
        <Card key={sec}>
          <CardHeader>
            <CardTitle>{sec}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {FIELDS.filter((f) => f.section === sec).map((f) => (
              <div key={f.key} className="space-y-2">
                <Label htmlFor={f.key}>{f.label}</Label>
                <div className="flex gap-2">
                  <Input
                    id={f.key}
                    type={f.secret && !show[f.key] ? 'password' : 'text'}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  />
                  {f.secret && (
                    <Button variant="outline" size="icon" type="button" onClick={() => setShow({ ...show, [f.key]: !show[f.key] })}>
                      {show[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Button onClick={save} disabled={saving} size="lg">
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Save All
      </Button>
    </div>
  );
}

function ResendDomainStatus() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ name: string; status: string; verified: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: e } = await supabase.functions.invoke('resend-domain-status');
      if (e) throw e;
      if ((data as any)?.error) throw new Error((data as any).error);
      setStatus((data as any)?.target || null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load Resend status');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5" /> Email Sending (Resend)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Welcome emails and notifications are sent via Resend. The sender domain <code>ava-telecom.ca</code> must be verified in your Resend account for emails to deliver from your brand.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Checking status…</div>
        ) : error ? (
          <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-destructive" />
            <div><strong>Status check failed:</strong> {error}</div>
          </div>
        ) : status?.verified ? (
          <div className="flex items-center gap-2 p-3 rounded-md border border-green-500/30 bg-green-500/5">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <div className="text-sm"><strong>{status.name}</strong> is <strong>verified</strong>. Emails will deliver from this domain.</div>
          </div>
        ) : (
          <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/40 bg-amber-500/10">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div className="text-sm space-y-1">
              <div><strong>{status?.name || 'ava-telecom.ca'}</strong> is <strong>{status?.status || 'not configured'}</strong>.</div>
              <div className="text-muted-foreground">Add and verify the domain at resend.com/domains. Until verified, emails fall back to <code>noreply@assistantvirtualai.com</code>.</div>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>Re-check</Button>
          <Button variant="outline" size="sm" asChild>
            <a href="https://resend.com/domains" target="_blank" rel="noreferrer">Open Resend <ExternalLink className="w-3.5 h-3.5 ml-1" /></a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
