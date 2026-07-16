import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { LEMTEL_ORG } from '@/hooks/usePbxData';

type Diag = {
  ok: boolean;
  organization_id: string;
  resolved_domain: { domain: string; source: string; org_id: string | null };
  extensions_pbx: number | { error: string };
  devices_pbx: number | { error: string };
  destinations_pbx: number | { error: string };
  registrations_pbx: number | { error: string };
  pbx_extensions_ava: number | { error: string };
  pbx_softphone_users_ava: number | { error: string };
  pbx_devices_ava: number | { error: string };
  pbx_destinations_ava: number | { error: string };
  phone_numbers_ava: number | { error: string };
  recent_sync_jobs: any[];
};

const num = (v: any) => (typeof v === 'number' ? v : null);
const err = (v: any) => (typeof v === 'object' && v?.error ? v.error : null);

function DeltaRow({ label, pbx, ava, table }: { label: string; pbx: any; ava: any; table: string }) {
  const p = num(pbx);
  const a = num(ava);
  const inSync = p !== null && a !== null && p === a;
  const drift = p !== null && a !== null && p !== a;
  const errMsg = err(pbx) || err(ava);
  return (
    <div className="grid grid-cols-12 gap-2 items-center py-2 border-b last:border-0">
      <div className="col-span-3 font-medium">{label}</div>
      <div className="col-span-3 text-xs text-muted-foreground">{table}</div>
      <div className="col-span-2 text-right tabular-nums">
        PBX: <span className="font-mono">{p ?? '—'}</span>
      </div>
      <div className="col-span-2 text-right tabular-nums">
        AVA: <span className="font-mono">{a ?? '—'}</span>
      </div>
      <div className="col-span-2 text-right">
        {errMsg ? (
          <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" />error</Badge>
        ) : inSync ? (
          <Badge className="gap-1"><CheckCircle2 className="w-3 h-3" />in sync</Badge>
        ) : drift ? (
          <Badge variant="outline" className="gap-1"><AlertTriangle className="w-3 h-3" />drift Δ{Math.abs((p ?? 0) - (a ?? 0))}</Badge>
        ) : (
          <Badge variant="outline">pending</Badge>
        )}
      </div>
    </div>
  );
}

export default function TelephonySourceAudit() {
  const [orgId] = useState(LEMTEL_ORG);

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ['telephony-source-audit', orgId],
    queryFn: async (): Promise<Diag> => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { organization_id: orgId, action: 'diagnostics' },
      });
      if (error) throw error;
      return data as Diag;
    },
  });

  const backfill = useMutation({
    mutationFn: async (action: string) => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { organization_id: orgId, action },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any, action) => {
      toast.success(`${action}: ${JSON.stringify(d?.stats ?? d).slice(0, 120)}`);
      refetch();
    },
    onError: (e: any) => toast.error(`Backfill failed: ${e?.message || e}`),
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Source of Truth Audit</h1>
          <p className="text-sm text-muted-foreground">
            Per-inventory PBX vs AVA delta for the resolved domain. Read-only.
          </p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} variant="outline" className="gap-2">
          {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Download className="w-4 h-4" />Backfill from FusionPBX</CardTitle>
          <CardDescription>Idempotent upserts stamped source='fusionpbx'. Orphans flagged, never deleted.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {['sync-extensions','sync-devices','sync-destinations','sync-ring-groups','sync-call-queues','sync-ivrs','sync-all'].map((a) => (
            <Button key={a} size="sm" variant="outline" onClick={() => backfill.mutate(a)} disabled={backfill.isPending}>
              {backfill.isPending && backfill.variables === a && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              {a}
            </Button>
          ))}
        </CardContent>
      </Card>


      {data?.resolved_domain && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resolved domain</CardTitle>
            <CardDescription>How the proxy routed this audit request</CardDescription>
          </CardHeader>
          <CardContent className="text-sm font-mono space-y-1">
            <div>domain_uuid: <span className="text-primary">{data.resolved_domain.domain}</span></div>
            <div>source: <Badge variant={data.resolved_domain.source === 'organization' ? 'default' : 'outline'}>{data.resolved_domain.source}</Badge></div>
            <div>organization_id: {data.resolved_domain.org_id || '—'}</div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Inventory delta</CardTitle>
          <CardDescription>Live FusionPBX counts vs. AVA Supabase counts</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <div className="text-destructive text-sm mb-2">{(error as Error).message}</div>}
          {data ? (
            <div>
              <DeltaRow label="Extensions (SIP)" table="pbx_extensions" pbx={data.extensions_pbx} ava={data.pbx_extensions_ava} />
              <DeltaRow label="Devices" table="pbx_devices" pbx={data.devices_pbx} ava={data.pbx_devices_ava} />
              <DeltaRow label="Destinations / Inbound" table="pbx_destinations" pbx={data.destinations_pbx} ava={data.pbx_destinations_ava} />
              <DeltaRow label="Registrations (live)" table="(live)" pbx={data.registrations_pbx} ava={'—' as any} />
              <DeltaRow label="App / Softphone Users" table="pbx_softphone_users" pbx={'—' as any} ava={data.pbx_softphone_users_ava} />
              <DeltaRow label="Phone Numbers / DIDs" table="phone_numbers" pbx={'—' as any} ava={data.phone_numbers_ava} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Loading…</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent sync jobs</CardTitle>
          <CardDescription>Last 10 entries from pbx_sync_jobs for this org</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-xs font-mono">
            {(data?.recent_sync_jobs || []).map((j: any) => (
              <div key={j.id} className="flex gap-2 items-center">
                <Badge variant={j.status === 'completed' || j.status === 'success' ? 'default' : j.status === 'failed' ? 'destructive' : 'outline'}>
                  {j.status}
                </Badge>
                <span className="text-muted-foreground">{j.job_type}</span>
                <span className="text-muted-foreground">{j.started_at}</span>
                {j.error_message && <span className="text-destructive truncate">{j.error_message}</span>}
              </div>
            ))}
            {!(data?.recent_sync_jobs?.length) && <div className="text-muted-foreground">No sync jobs recorded yet.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
