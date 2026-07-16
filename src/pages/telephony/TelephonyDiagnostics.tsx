import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, AlertTriangle, CheckCircle2, Clock, Loader2, PhoneIncoming, Radio, RefreshCw, XCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTelephonyStatus } from '@/hooks/useTelephonyStatus';
import { useSoftphone } from '@/hooks/useSoftphone';
import { LEMTEL_ORG } from '@/hooks/usePbxData';
import { WssHealthMonitor } from '@/components/telephony/WssHealthMonitor';


type QaStatus = 'pending' | 'pass' | 'fail' | 'warn' | 'running';
type QaCheck = { id: string; group: string; label: string; status: QaStatus; detail: string; fix: string; at: number };

const statusVariant = (s: QaStatus) => s === 'pass' ? 'default' : s === 'fail' ? 'destructive' : 'outline';
const statusIcon = (s: QaStatus) => s === 'running' ? <Loader2 className="w-3 h-3 animate-spin" /> : s === 'pass' ? <CheckCircle2 className="w-3 h-3" /> : s === 'fail' ? <XCircle className="w-3 h-3" /> : s === 'warn' ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />;
const stamp = (n?: number | null) => n ? new Date(n).toLocaleTimeString() : '—';

export default function TelephonyDiagnostics() {
  const { data: providerStatus, refetch: refetchProvider } = useTelephonyStatus();
  const softphone = useSoftphone();
  
  const [running, setRunning] = useState(false);
  const [filterGroup, setFilterGroup] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [testNumber, setTestNumber] = useState('');
  const [outboundTarget, setOutboundTarget] = useState('');
  const [checks, setChecks] = useState<QaCheck[]>([]);


  const { data: syncJobs = [], refetch: refetchJobs } = useQuery({
    queryKey: ['telephony-qa-sync-jobs'],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data } = await (supabase as any).from('pbx_sync_jobs').select('*').eq('organization_id', LEMTEL_ORG).order('started_at', { ascending: false }).limit(20);
      return data || [];
    },
  });

  const sipStatus: QaCheck = useMemo(() => {
    const snap = softphone.snap;
    const pass = snap.status === 'registered';
    const fail = snap.status === 'error' || snap.status === 'disconnected';
    return {
      id: 'sip-live', group: 'sip', label: `SIP registration · ext ${softphone.config?.extension || '—'}`,
      status: pass ? 'pass' : fail ? 'fail' : 'pending',
      detail: pass ? `Registered at ${stamp(snap.lastRegistrationAt)}` : snap.errorCause || `Current state: ${snap.status}`,
      fix: pass ? 'No action required.' : 'Verify WSS URL, SIP password, extension enabled, and TLS certificate for port 7443.',
      at: Date.now(),
    };
  }, [softphone.snap.status, softphone.snap.errorCause, softphone.snap.lastRegistrationAt, softphone.config?.extension]);

  const runFullQa = async () => {
    setRunning(true);
    const startedAt = Date.now();
    const next: QaCheck[] = [];
    const add = (c: Omit<QaCheck, 'at'>) => { next.push({ ...c, at: Date.now() }); setChecks([...next]); };

    try {
      const ping = await supabase.functions.invoke('fusionpbx-proxy', { body: { organization_id: LEMTEL_ORG, action: 'ping' } });
      add({ id: 'pbx-ping', group: 'backend', label: 'FusionPBX API reachability', status: ping.error || (ping.data as any)?.error ? 'fail' : 'pass', detail: (ping.data as any)?.latency_ms ? `${(ping.data as any).latency_ms}ms` : ping.error?.message || (ping.data as any)?.message || 'OK', fix: 'Check FusionPBX URL, API key, IP allowlist, and backend secrets.' });

      // PBX web session health check — required for recording downloads
      const hc = await supabase.functions.invoke('fusionpbx-proxy', { body: { organization_id: LEMTEL_ORG, action: 'pbx-health-check' } });
      const hcData = (hc.data as any) || {};
      const missingSecrets = hcData.secrets ? Object.entries(hcData.secrets).filter(([, v]) => !v).map(([k]) => k) : [];
      add({
        id: 'pbx-session',
        group: 'backend',
        label: 'FusionPBX web session (recording downloads)',
        status: hc.error ? 'fail' : !hcData.session?.ok ? 'fail' : missingSecrets.length ? 'warn' : 'pass',
        detail: hc.error
          ? hc.error.message
          : !hcData.session?.ok
          ? `Login failed: ${hcData.session?.error || 'unknown error'} — check FUSIONPBX_PASSWORD in Vault`
          : missingSecrets.length
          ? `Missing Vault secrets: ${missingSecrets.join(', ')}`
          : `Session OK · API ${hcData.api?.ok ? 'OK' : 'FAIL'} (${hcData.api?.latency_ms ?? '?'}ms)`,
        fix: 'Set FUSIONPBX_PASSWORD (FusionPBX web UI password) in Supabase Vault. If it equals FUSIONPBX_API_KEY, the fallback will be used automatically.',
      });

      const creds = await supabase.functions.invoke('softphone-credentials');
      add({ id: 'softphone-creds', group: 'sip', label: 'Softphone credentials', status: creds.error || (creds.data as any)?.error ? 'fail' : 'pass', detail: (creds.data as any)?.extension ? `Extension ${(creds.data as any).extension}` : creds.error?.message || (creds.data as any)?.message || 'Credentials returned', fix: 'Link the portal user to a softphone user and verify PBX encryption key.' });

      const cdrEndpoint = await supabase.functions.invoke('fusionpbx-proxy', { body: { organization_id: LEMTEL_ORG, action: 'test-cdr-endpoint' } });
      add({ id: 'cdr-endpoint', group: 'cdr', label: 'CDR endpoint detection', status: (cdrEndpoint.data as any)?.ok ? 'pass' : 'fail', detail: (cdrEndpoint.data as any)?.endpoint || (cdrEndpoint.data as any)?.message || cdrEndpoint.error?.message || 'No endpoint confirmed', fix: 'Enable FusionPBX XML CDR API or update the CDR endpoint fallback list.' });

      const sync = await supabase.functions.invoke('fusionpbx-proxy', { body: { organization_id: LEMTEL_ORG, action: 'sync-cdrs', params: { limit: 100, extension: softphone.config?.extension } } });
      add({ id: 'cdr-sync-run', group: 'cdr', label: 'Manual CDR sync run', status: sync.error || (sync.data as any)?.error ? 'fail' : 'pass', detail: JSON.stringify((sync.data as any)?.stats || (sync.data as any) || {}).slice(0, 180), fix: 'Check CDR endpoint, PBX auth, and pbx_sync_jobs error column.' });

      const { data: lastSuccess } = await (supabase as any).from('pbx_sync_jobs').select('*').eq('organization_id', LEMTEL_ORG).in('status', ['success', 'completed']).order('completed_at', { ascending: false }).limit(1).maybeSingle();
      add({ id: 'cdr-last-success', group: 'cdr', label: 'Last successful CDR sync job', status: lastSuccess?.completed_at ? 'pass' : 'fail', detail: lastSuccess?.completed_at ? new Date(lastSuccess.completed_at).toLocaleString() : 'No successful sync job found', fix: 'Run CDR sync and inspect pbx_sync_jobs.error for the failure reason.' });

      let q = (supabase as any).from('pbx_call_records').select('id,start_at,direction,extension,caller_number,destination_number,call_status').eq('organization_id', LEMTEL_ORG).gte('start_at', new Date(startedAt - 10 * 60_000).toISOString()).order('start_at', { ascending: false }).limit(10);
      if (softphone.config?.extension) q = q.or(`extension.eq.${softphone.config.extension},caller_number.eq.${softphone.config.extension},destination_number.eq.${softphone.config.extension}`);
      const { data: cdrRows } = await q;
      const expected = (cdrRows || []).filter((r: any) => !testNumber || [r.caller_number, r.destination_number].some((v) => String(v || '').includes(testNumber)));
      add({ id: 'cdr-test-call', group: 'cdr', label: 'Test call produced CDR row', status: expected.length ? 'pass' : 'warn', detail: expected.length ? `${expected.length} matching CDR row(s)` : 'No matching CDR after this QA run yet', fix: 'Place a real inbound/outbound test call, wait 30–60 seconds, then Run full QA again.' });

      const inboundChecks = await Promise.all([
        (supabase as any).from('phone_numbers').select('id,status', { count: 'exact', head: true }).eq('organization_id', LEMTEL_ORG),
        (supabase as any).from('pbx_phone_number_assignments').select('id,destination_type,destination_id', { count: 'exact' }).eq('organization_id', LEMTEL_ORG),
        (supabase as any).from('pbx_ring_groups').select('id', { count: 'exact', head: true }).eq('organization_id', LEMTEL_ORG),
        (supabase as any).from('pbx_call_queues').select('id', { count: 'exact', head: true }).eq('organization_id', LEMTEL_ORG),
      ]);
      add({ id: 'inbound-dids', group: 'inbound', label: 'DIDs provisioned', status: inboundChecks[0].count ? 'pass' : 'fail', detail: `${inboundChecks[0].count || 0} DID(s)`, fix: 'Order or sync DIDs from Phone Numbers.' });
      add({ id: 'inbound-routing', group: 'inbound', label: 'DID routing configured', status: inboundChecks[1].count ? 'pass' : 'fail', detail: `${inboundChecks[1].count || 0} routing assignment(s)`, fix: 'Open Phone Numbers and set destination to extension, IVR, queue, or ring group.' });
      add({ id: 'inbound-targets', group: 'inbound', label: 'Inbound targets available', status: (inboundChecks[2].count || inboundChecks[3].count) ? 'pass' : 'warn', detail: `${inboundChecks[2].count || 0} ring groups · ${inboundChecks[3].count || 0} queues`, fix: 'Create at least one ring group or call queue for production routing.' });

      await Promise.all([refetchProvider(), refetchJobs()]);
    } finally {
      setRunning(false);
    }
  };

  const allChecks = [sipStatus, ...checks];
  const visible = allChecks.filter((c) => (filterGroup === 'all' || c.group === filterGroup) && (filterStatus === 'all' || c.status === filterStatus));
  const passCount = allChecks.filter((c) => c.status === 'pass').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Activity className="w-7 h-7" /> Telephony QA</h1>
          <p className="text-muted-foreground">Live SIP, inbound readiness, provider health, and CDR sync verification.</p>
        </div>
        <Button onClick={runFullQa} disabled={running}>{running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}Run full QA</Button>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <QaKpi label="Checks passed" value={`${passCount}/${allChecks.length}`} />
        <QaKpi label="SIP status" value={softphone.snap.status} />
        <QaKpi label="Last SIP registration" value={stamp(softphone.snap.lastRegistrationAt)} />
        <QaKpi label="WSS" value={softphone.snap.wssReachable === true ? 'reachable' : softphone.snap.wssReachable === false ? 'failed' : 'pending'} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Radio className="w-4 h-4" /> Live SIP registration events</CardTitle><CardDescription>Consumed from the webphone hook snapshot in real time.</CardDescription></CardHeader>
        <CardContent className="grid lg:grid-cols-2 gap-3">
          <StatusRow check={sipStatus} />
          <ScrollArea className="h-32 border rounded-md p-2">
            {softphone.snap.events.slice().reverse().map((e) => <div key={`${e.at}-${e.message}`} className="text-xs py-1 border-b last:border-0"><span className="text-muted-foreground">{stamp(e.at)}</span> <span className="font-medium">{e.category}</span> — {e.message}</div>)}
            {!softphone.snap.events.length && <p className="text-sm text-muted-foreground py-8 text-center">No SIP events yet.</p>}
          </ScrollArea>
        </CardContent>
        <CardContent className="border-t pt-4 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label>Outbound test number</Label>
            <Input value={outboundTarget} onChange={(e) => setOutboundTarget(e.target.value)} placeholder="e.g. *9196 echo test or a real number" />
          </div>
          <Button
            size="sm"
            disabled={!outboundTarget || softphone.snap.status !== 'registered'}
            onClick={() => softphone.call(outboundTarget)}
          >Place outbound test call</Button>
          <Button size="sm" variant="outline" disabled={softphone.snap.callState === 'idle'} onClick={() => softphone.hangup()}>Hang up</Button>
          <audio ref={(el) => softphone.setAudioEl(el)} autoPlay />
        </CardContent>
      </Card>



      <Card>
        <CardHeader><CardTitle className="text-base">QA filters</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-3">
          <div><Label>Group</Label><Select value={filterGroup} onValueChange={setFilterGroup}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="backend">Backend</SelectItem><SelectItem value="sip">SIP</SelectItem><SelectItem value="cdr">CDR</SelectItem><SelectItem value="inbound">Inbound</SelectItem></SelectContent></Select></div>
          <div><Label>Status</Label><Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="pass">Pass</SelectItem><SelectItem value="fail">Fail</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="pending">Pending</SelectItem></SelectContent></Select></div>
          <div className="md:col-span-2"><Label>Expected test call number</Label><Input value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder="Optional caller/destination number for CDR match" /></div>
        </CardContent>
      </Card>

      <WssHealthMonitor />



      <Card>
        <CardHeader><CardTitle className="text-base"><PhoneIncoming className="inline w-4 h-4 mr-2" />Inbound readiness checklist</CardTitle><CardDescription>Each item includes the recommended fix from backend signals.</CardDescription></CardHeader>
        <CardContent className="space-y-2">{visible.map((c) => <StatusRow key={c.id} check={c} />)}</CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Provider status</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-2">{[['FusionPBX', providerStatus?.services?.fusionpbx], ['Telnyx', providerStatus?.services?.telnyx], ['ElevenLabs', providerStatus?.services?.elevenlabs], ['AI Gateway', providerStatus?.services?.ai]].map(([name, s]: any) => <div key={name} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"><span>{name}</span><Badge variant={s?.ok ? 'default' : 'destructive'}>{s?.ok ? `${s.latency_ms ?? '?'}ms` : 'Not configured/down'}</Badge></div>)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Last sync jobs</CardTitle></CardHeader>
          <CardContent><ScrollArea className="h-48">{syncJobs.map((j: any) => <div key={j.id} className="flex items-center justify-between py-1.5 border-b last:border-0 text-xs"><div><div className="font-medium">{j.job_type}</div><div className="text-muted-foreground">{new Date(j.completed_at || j.started_at || j.created_at).toLocaleString()}</div>{j.error && <div className="text-destructive">{j.error}</div>}</div><Badge variant={j.status === 'success' || j.status === 'completed' ? 'default' : j.status === 'running' ? 'outline' : 'destructive'}>{j.status}</Badge></div>)}</ScrollArea></CardContent>
        </Card>
      </div>
    </div>
  );
}

function QaKpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-bold truncate">{value}</div></CardContent></Card>;
}

function StatusRow({ check }: { check: QaCheck }) {
  return (
    <div className="border rounded-lg p-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="font-medium text-sm">{check.label}</div>
        <div className="text-xs text-muted-foreground mt-1">{check.detail}</div>
        {check.status !== 'pass' && <div className="text-xs mt-1 text-amber-600">Fix: {check.fix}</div>}
      </div>
      <Badge variant={statusVariant(check.status)} className="gap-1 shrink-0">{statusIcon(check.status)}{check.status}</Badge>
    </div>
  );
}
