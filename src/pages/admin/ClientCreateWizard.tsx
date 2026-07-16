import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

type StepId = 'org' | 'admins' | 'pbx' | 'roles' | 'branding' | 'sync' | 'verify';
const STEPS: { id: StepId; label: string }[] = [
  { id: 'org', label: 'Organization' },
  { id: 'admins', label: 'Admins' },
  { id: 'pbx', label: 'PBX mapping' },
  { id: 'roles', label: 'Roles' },
  { id: 'branding', label: 'Branding' },
  { id: 'sync', label: 'First sync' },
  { id: 'verify', label: 'Isolation' },
];

export default function ClientCreateWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState('America/Montreal');
  const [locale, setLocale] = useState('en');
  const [adminEmails, setAdminEmails] = useState('');
  const [sipDomain, setSipDomain] = useState('');
  const [domainUuid, setDomainUuid] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0023e6');
  const [subdomain, setSubdomain] = useState('');
  const [triggerSync, setTriggerSync] = useState(true);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async () => {
    if (!name) { toast.error('Name required'); return; }
    setSubmitting(true);
    const admins = adminEmails.split(/[\s,;]+/).filter(Boolean).map((email) => ({ email }));
    const { data, error } = await supabase.functions.invoke('client-provision', {
      body: {
        name, slug: slug || undefined, timezone, locale,
        admins,
        pbx: { sip_domain: sipDomain || undefined, domain_uuid: domainUuid || undefined },
        branding: { primary_color: primaryColor, subdomain: subdomain || undefined },
        trigger_first_sync: triggerSync,
      },
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    setResult(data);
    setStep(STEPS.length - 1);
    toast.success('Client provisioned');
  };

  return (
    <div className="cockpit-scope min-h-screen p-6">
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title text-2xl font-semibold">New Client</h1>
        <p className="text-sm text-muted-foreground">Provision a new tenant in seven guided steps.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <button key={s.id} onClick={() => setStep(i)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${i === step ? 'border-cockpit-cyan/60 bg-cockpit-cyan/10 text-cockpit-cyan' : 'border-cockpit-border/40 text-muted-foreground'}`}>
            {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
            {s.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>{STEPS[step].label}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>Slug (optional)</Label><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto-generated" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Timezone</Label><Input value={timezone} onChange={(e) => setTimezone(e.target.value)} /></div>
                <div><Label>Locale</Label><Input value={locale} onChange={(e) => setLocale(e.target.value)} /></div>
              </div>
            </>
          )}
          {step === 1 && (
            <div>
              <Label>Admin emails (comma or newline separated)</Label>
              <Textarea rows={4} value={adminEmails} onChange={(e) => setAdminEmails(e.target.value)} placeholder="alice@example.com, bob@example.com" />
              <p className="mt-1 text-xs text-muted-foreground">Existing users are linked; new emails receive an invite.</p>
            </div>
          )}
          {step === 2 && (
            <>
              <div><Label>SIP domain</Label><Input value={sipDomain} onChange={(e) => setSipDomain(e.target.value)} placeholder="client.lemtel.tel" /></div>
              <div><Label>FusionPBX domain UUID</Label><Input value={domainUuid} onChange={(e) => setDomainUuid(e.target.value)} /></div>
            </>
          )}
          {step === 3 && (
            <p className="text-sm text-muted-foreground">Default roles (org_admin, manager, agent, viewer) will be seeded automatically after creation.</p>
          )}
          {step === 4 && (
            <>
              <div><Label>Primary color</Label><Input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10 w-24" /></div>
              <div><Label>Subdomain (optional)</Label><Input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} /></div>
            </>
          )}
          {step === 5 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={triggerSync} onChange={(e) => setTriggerSync(e.target.checked)} />
              Run first PBX sync after creation
            </label>
          )}
          {step === 6 && (
            result ? (
              <div className="space-y-3">
                <p className="text-sm text-cockpit-success">Organization {result.slug} created.</p>
                {result.invited?.length ? <p className="text-xs text-muted-foreground">Invited: {result.invited.join(', ')}</p> : null}
                <div className="rounded-lg border border-cockpit-border/40 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Tenant isolation</p>
                  <div className="max-h-64 overflow-auto text-xs font-mono space-y-0.5">
                    {result.isolation?.tables?.map((t: any) => (
                      <div key={t.table} className="flex justify-between">
                        <span>{t.table}</span><span className="text-muted-foreground">{t.rows} rows</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Button onClick={() => navigate('/clients')}>Done</Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Submit to provision and verify isolation.</p>
            )
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={prev} disabled={step === 0 || submitting}>Back</Button>
        {step < STEPS.length - 2 && <Button onClick={next}>Next</Button>}
        {step === STEPS.length - 2 && !result && (
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Provision client
          </Button>
        )}
      </div>
    </div>
    </div>
  );
}
