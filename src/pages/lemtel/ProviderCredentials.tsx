import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle, BookOpen, ShieldCheck, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import ProviderInstructionsModal, { InstructionsGuide } from './ProviderInstructionsModal';
import ProviderAuditLog from './ProviderAuditLog';

type ProviderId = 'twilio' | 'telnyx' | 'skyetel' | 'voipms';
interface FieldDef { key: string; label: string; secret: boolean; placeholder?: string }
interface ProviderDef {
  id: ProviderId;
  name: string;
  emoji: string;
  description: string;
  fields: FieldDef[];
  guide: InstructionsGuide;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'twilio', name: 'Twilio', emoji: '☁️',
    description: 'Voice, SMS and programmable telephony.',
    fields: [
      { key: 'account_sid', label: 'Account SID', secret: false, placeholder: 'ACxxxxxxxx…' },
      { key: 'auth_token', label: 'Auth Token', secret: true },
      { key: 'api_key_sid', label: 'API Key SID (optional)', secret: false, placeholder: 'SKxxxxxxxx…' },
      { key: 'api_key_secret', label: 'API Key Secret (optional)', secret: true },
      { key: 'from_number', label: 'Default From Number', secret: false, placeholder: '+15551234567' },
    ],
    guide: {
      name: 'Twilio', emoji: '☁️', url: 'https://console.twilio.com/',
      intro: 'Twilio handles voice + SMS. You will need an Account SID and Auth Token (or an API Key pair for higher security).',
      callbackUrl: 'https://gejxisrqtvxavbrfcoxz.supabase.co/functions/v1/twilio-webhook',
      steps: [
        { title: 'Open the Twilio Console', body: 'Sign in at console.twilio.com and pick the project you want to connect.' },
        { title: 'Copy your Account SID + Auth Token', body: 'From the dashboard, under "Account Info", copy both values.' },
        { title: 'Create an API Key (recommended)', body: 'Account → API keys & tokens → Create API key. Save the SID and Secret immediately — the secret is shown only once.' },
        { title: 'Pick a Twilio phone number', body: 'Phone Numbers → Manage → Active numbers. Paste the number here in E.164 format (+15551234567).' },
        { title: 'Configure the webhook', body: 'On the number, set the Voice & SMS webhook to the callback URL above.' },
      ],
      notes: [
        'Auth tokens are encrypted at rest using AES-256-GCM before we store them.',
        'Rotate the token in Twilio if you ever suspect a leak — then re-save it here.',
      ],
    },
  },
  {
    id: 'telnyx', name: 'Telnyx', emoji: '📡',
    description: 'SIP trunking, numbers and messaging.',
    fields: [
      { key: 'api_key', label: 'API Key (v2)', secret: true, placeholder: 'KEY...' },
      { key: 'messaging_profile_id', label: 'Messaging Profile ID', secret: false },
      { key: 'connection_id', label: 'Connection ID', secret: false },
      { key: 'from_number', label: 'Default From Number', secret: false, placeholder: '+15551234567' },
    ],
    guide: {
      name: 'Telnyx', emoji: '📡', url: 'https://portal.telnyx.com/',
      intro: 'Telnyx provides SIP trunks, DIDs and messaging. You will need a v2 API key plus the connection and messaging profile IDs.',
      callbackUrl: 'https://gejxisrqtvxavbrfcoxz.supabase.co/functions/v1/telnyx-webhook',
      steps: [
        { title: 'Sign in to the Mission Control Portal', body: 'Open portal.telnyx.com and switch to the right account.' },
        { title: 'Generate a v2 API key', body: 'Account → API Keys → Create API Key. Copy the key (starts with KEY).' },
        { title: 'Grab your Messaging Profile ID', body: 'Messaging → Messaging Profiles. Open or create one and copy its UUID.' },
        { title: 'Grab your Connection ID', body: 'Voice → SIP Trunking → Connections. Open your trunk and copy the Connection ID.' },
        { title: 'Set the webhook URL on the connection', body: 'Use the callback URL above as the inbound webhook for both Voice and Messaging.' },
      ],
      notes: ['The API key is encrypted with AES-256-GCM before storage.', 'Use a separate key per environment (dev / prod).'],
    },
  },
  {
    id: 'skyetel', name: 'Skyetel', emoji: '🛰️',
    description: 'Wholesale SIP trunking and DIDs.',
    fields: [
      { key: 'sid', label: 'SID', secret: false },
      { key: 'secret', label: 'Secret', secret: true },
      { key: 'tenant_id', label: 'Tenant ID (optional)', secret: false },
      { key: 'endpoint_group_id', label: 'Outbound Endpoint Group ID', secret: false },
    ],
    guide: {
      name: 'Skyetel', emoji: '🛰️', url: 'https://my.skyetel.com/',
      intro: 'Skyetel uses SID + Secret API credentials, plus an outbound Endpoint Group for routing.',
      steps: [
        { title: 'Log in to my.skyetel.com', body: 'Use your master account.' },
        { title: 'Create an API credential', body: 'Settings → API → Create new credential. Copy the SID and Secret immediately.' },
        { title: 'Whitelist your server IP', body: 'Settings → API → IP Authentication. Add your edge IPs so the API will accept requests.' },
        { title: 'Find your Endpoint Group ID', body: 'SIP → Endpoint Groups. Open the group used for outbound calls and copy its numeric ID.' },
      ],
      notes: ['Secrets are encrypted at rest.', 'Use a dedicated API credential per integration — never reuse the master.'],
    },
  },
  {
    id: 'voipms', name: 'VoIP.ms', emoji: '☎️',
    description: 'Affordable SIP trunking and DIDs (Canada/US).',
    fields: [
      { key: 'api_username', label: 'API Username (email)', secret: false },
      { key: 'api_password', label: 'API Password', secret: true },
      { key: 'sub_account', label: 'Sub-account (optional)', secret: false },
      { key: 'pop', label: 'Preferred POP (e.g. montreal.voip.ms)', secret: false },
    ],
    guide: {
      name: 'VoIP.ms', emoji: '☎️', url: 'https://voip.ms/m/api.php',
      intro: 'VoIP.ms uses a dedicated API password (different from the portal password) plus IP whitelisting.',
      steps: [
        { title: 'Log in to voip.ms', body: 'Use your customer portal account.' },
        { title: 'Open the API page', body: 'Main Menu → SOAP and REST/JSON API.' },
        { title: 'Enable the API and set a strong password', body: 'This password is independent from your portal login. Treat it like a secret.' },
        { title: 'Whitelist your server IPs', body: 'Add your edge IPs in the "Enable IP Address" field, comma-separated.' },
        { title: 'Pick a POP', body: 'Use the geographically closest POP (e.g. montreal.voip.ms) for lowest latency.' },
      ],
      notes: ['API password is encrypted with AES-256-GCM at rest.', 'Rotate the API password if it ever leaves a trusted machine.'],
    },
  },
];

const KEEP_TOKEN = '__KEEP__';

export default function ProviderCredentials() {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ProviderId | null>(null);
  const [testing, setTesting] = useState<ProviderId | null>(null);
  const [revealing, setRevealing] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<ProviderId, { ok: boolean; msg: string; at: string } | null>>({
    twilio: null, telnyx: null, skyetel: null, voipms: null,
  });
  const [guideOpen, setGuideOpen] = useState<InstructionsGuide | null>(null);

  const keyFor = (p: ProviderId, f: string) => `PROVIDER_${p.toUpperCase()}_${f.toUpperCase()}`;

  useEffect(() => {
    (async () => {
      const results = await Promise.all(PROVIDERS.map(async (p) => {
        const { data } = await supabase.functions.invoke('provider-credentials-vault', {
          body: { action: 'get', provider: p.id, fields: p.fields.map((f) => ({ key: f.key, secret: f.secret })) },
        });
        return { p, values: (data as any)?.values || {} };
      }));
      const map: Record<string, string> = {};
      for (const { p, values: vals } of results) {
        for (const f of p.fields) map[keyFor(p.id, f.key)] = vals[f.key] ?? '';
      }
      setValues(map);
      setLoading(false);
    })();
  }, []);

  const revealField = async (p: ProviderDef, f: FieldDef) => {
    const k = keyFor(p.id, f.key);
    setRevealing(k);
    try {
      const { data } = await supabase.functions.invoke('provider-credentials-vault', {
        body: { action: 'get', provider: p.id, fields: [{ key: f.key, secret: f.secret }], reveal: true },
      });
      const v = (data as any)?.values?.[f.key] ?? '';
      setRevealed((r) => ({ ...r, [k]: v }));
      setShow((s) => ({ ...s, [k]: true }));
      // Auto re-hide after 30s for safety
      setTimeout(() => {
        setShow((s) => ({ ...s, [k]: false }));
        setRevealed((r) => { const n = { ...r }; delete n[k]; return n; });
      }, 30_000);
    } catch (e: any) {
      toast({ title: 'Reveal failed', description: e.message, variant: 'destructive' });
    } finally {
      setRevealing(null);
    }
  };

  const saveProvider = async (p: ProviderDef) => {
    setSaving(p.id);
    const fieldsToSend = p.fields.map((f) => {
      const k = keyFor(p.id, f.key);
      let v = values[k] ?? '';
      if (f.secret && !dirty[k]) v = KEEP_TOKEN;
      return { key: f.key, secret: f.secret, value: v };
    });
    try {
      const { error } = await supabase.functions.invoke('provider-credentials-vault', {
        body: {
          action: 'set', provider: p.id,
          fields: fieldsToSend.map(({ key, secret }) => ({ key, secret })),
          values: Object.fromEntries(fieldsToSend.map((x) => [x.key, x.value])),
        },
      });
      if (error) throw error;
      const cleared: Record<string, boolean> = { ...dirty };
      p.fields.forEach((f) => { delete cleared[keyFor(p.id, f.key)]; });
      setDirty(cleared);
      toast({ title: 'Saved', description: `${p.name} credentials encrypted and stored.` });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const testProvider = async (p: ProviderDef) => {
    setTesting(p.id);
    try {
      const { data: vault } = await supabase.functions.invoke('provider-credentials-vault', {
        body: { action: 'get', provider: p.id, fields: p.fields.map((f) => ({ key: f.key, secret: f.secret })), reveal: true },
      });
      const credentials = (vault as any)?.values || {};
      const { data, error } = await supabase.functions.invoke('provider-credentials-test', {
        body: { provider: p.id, credentials },
      });
      if (error) throw error;
      const ok = !!(data as any)?.ok;
      const msg = ok ? 'Verified' : ((data as any)?.error || 'Failed');
      setStatus((s) => ({ ...s, [p.id]: { ok, msg, at: new Date().toISOString() } }));
      await supabase.functions.invoke('provider-credentials-vault', {
        body: { action: 'audit', provider: p.id, event: 'test', metadata: { ok, msg } },
      });
      toast({ title: ok ? 'Verified' : 'Test failed', description: ok ? `${p.name} credentials are valid` : msg, variant: ok ? 'default' : 'destructive' });
    } catch (e: any) {
      setStatus((s) => ({ ...s, [p.id]: { ok: false, msg: e.message, at: new Date().toISOString() } }));
      toast({ title: 'Test failed', description: e.message, variant: 'destructive' });
    } finally {
      setTesting(null);
    }
  };

  const isConfigured = (p: ProviderDef) =>
    p.fields.filter((f) => !f.label.includes('optional')).every((f) => !!values[keyFor(p.id, f.key)]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Lock className="w-7 h-7 text-primary" /> Provider Credentials
          </h1>
          <p className="text-muted-foreground">
            Bring your own carrier credentials. Secrets are encrypted at rest (AES-256-GCM) and every change is audited.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Field-level encryption</Badge>
      </div>

      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-6 mt-4">
          {PROVIDERS.map((p) => {
            const st = status[p.id];
            const configured = isConfigured(p);
            return (
              <Card key={p.id} className="glass-card">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{p.emoji}</span>
                      <div>
                        <CardTitle className="flex items-center gap-2 flex-wrap">
                          {p.name}
                          {st?.ok ? (
                            <Badge className="gap-1 bg-emerald-600/20 text-emerald-400 border-emerald-600/40"><CheckCircle2 className="w-3 h-3" /> Verified</Badge>
                          ) : configured ? (
                            <Badge variant="secondary">Configured</Badge>
                          ) : (
                            <Badge variant="outline">Not configured</Badge>
                          )}
                          {st && !st.ok && <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Error</Badge>}
                        </CardTitle>
                        <CardDescription>{p.description}</CardDescription>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setGuideOpen(p.guide)}>
                      <BookOpen className="w-4 h-4" /> View instructions
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    {p.fields.map((f) => {
                      const k = keyFor(p.id, f.key);
                      const isShowing = show[k] && (f.secret ? !!revealed[k] : true);
                      const displayValue = f.secret
                        ? (isShowing ? (revealed[k] ?? '') : (values[k] ?? ''))
                        : (values[k] ?? '');
                      return (
                        <div key={f.key} className="space-y-1.5">
                          <Label htmlFor={k} className="flex items-center gap-1.5">
                            {f.label}
                            {f.secret && <Lock className="w-3 h-3 text-muted-foreground" />}
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id={k}
                              type={f.secret && !isShowing ? 'password' : 'text'}
                              value={displayValue}
                              placeholder={f.placeholder}
                              onChange={(e) => {
                                setValues({ ...values, [k]: e.target.value });
                                setDirty({ ...dirty, [k]: true });
                                if (f.secret) setRevealed({ ...revealed, [k]: e.target.value });
                              }}
                              autoComplete="off"
                            />
                            {f.secret && (
                              <Button
                                type="button" variant="outline" size="icon"
                                disabled={revealing === k}
                                onClick={async () => {
                                  if (isShowing) {
                                    setShow((s) => ({ ...s, [k]: false }));
                                    setRevealed((r) => { const n = { ...r }; delete n[k]; return n; });
                                  } else if (dirty[k]) {
                                    setShow((s) => ({ ...s, [k]: true }));
                                  } else {
                                    await revealField(p, f);
                                  }
                                }}
                              >
                                {revealing === k ? <Loader2 className="w-4 h-4 animate-spin" /> : isShowing ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </Button>
                            )}
                          </div>
                          {f.secret && !dirty[k] && values[k] && (
                            <p className="text-[10px] text-muted-foreground">Stored encrypted · reveal auto-hides after 30s.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button onClick={() => saveProvider(p)} disabled={saving === p.id}>
                      {saving === p.id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Save
                    </Button>
                    <Button variant="outline" onClick={() => testProvider(p)} disabled={testing === p.id || !configured}>
                      {testing === p.id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Test connection
                    </Button>
                    {st && (
                      <span className={`text-xs ${st.ok ? 'text-emerald-500' : 'text-red-500'}`}>
                        {st.ok ? '✓ ' : '✗ '}{st.msg} · {new Date(st.at).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <ProviderAuditLog />
        </TabsContent>
      </Tabs>

      <ProviderInstructionsModal open={!!guideOpen} onOpenChange={(v) => !v && setGuideOpen(null)} guide={guideOpen} />
    </div>
  );
}
