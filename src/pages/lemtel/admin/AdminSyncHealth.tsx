import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Activity, RefreshCw, Loader2, Play, Database } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminSkeletonRows } from '@/components/admin/AdminSkeletonRows';
import { StatusBadge } from '@/components/admin/StatusBadge';

const toneFor = (s?: string) => s === 'success' ? 'on' : s === 'failed' ? 'err' : s === 'running' ? 'info' : 'off';

type EntityDef = { key: string; label: string; action: string | null };

const ENTITIES: EntityDef[] = [
  { key: 'extensions',      label: 'Extensions',        action: 'sync-extensions' },
  { key: 'devices',         label: 'Devices',           action: 'sync-devices' },
  { key: 'ring-groups',     label: 'Ring Groups',       action: 'sync-ring-groups' },
  { key: 'call-queues',     label: 'Call Queues',       action: 'sync-call-queues' },
  { key: 'queue-agents',    label: 'Queue Agents',      action: 'sync-queue-agents' },
  { key: 'ivrs',            label: 'IVRs',              action: 'sync-ivrs' },
  { key: 'destinations',    label: 'Destinations',      action: 'sync-destinations' },
  { key: 'conferences',     label: 'Conferences',       action: 'sync-conferences' },
  { key: 'hold-music',      label: 'Hold Music',        action: 'sync-hold-music' },
  { key: 'gateways',        label: 'Gateways',          action: 'sync-gateways' },
  { key: 'voicemail',       label: 'Voicemail Boxes',   action: 'sync-voicemail' },
  { key: 'voicemail-msgs',  label: 'Voicemail Messages',action: 'sync-voicemail-messages' },
  { key: 'dialplans',       label: 'Dialplans',         action: 'sync-dialplans' },
  { key: 'recordings',      label: 'Recordings (meta)', action: 'sync-recording-meta' },
  { key: 'cdrs',            label: 'Call Records',      action: 'sync-cdrs' },
  { key: 'time-conditions', label: 'Time Conditions',   action: null },
  { key: 'fax',             label: 'Fax Server',        action: null },
  { key: 'email-queue',     label: 'Email Queue',       action: null },
  { key: 'event-guard',     label: 'Event Guard',       action: null },
];

export default function AdminSyncHealth() {
  const jobs = useQuery({
    queryKey: ['pbx-sync-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pbx_sync_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 15000,
  });

  const resync = async (entity: EntityDef) => {
    if (!entity.action) { toast.info(`${entity.label}: not available on FusionPBX`); return; }
    toast.info(`Resyncing ${entity.label}…`);
    try {
      const { error } = await supabase.functions.invoke('fusionpbx-proxy', { body: { action: entity.action } });
      if (error) throw error;
      toast.success(`${entity.label} resync complete`);
      jobs.refetch();
    } catch (e: any) { toast.error(e?.message || 'Resync failed'); }
  };

  const resyncAll = async () => {
    toast.info('Running full sync…');
    try {
      const { error } = await supabase.functions.invoke('fusionpbx-proxy', { body: { action: 'sync-all' } });
      if (error) throw error;
      toast.success('Full sync triggered');
      jobs.refetch();
    } catch (e: any) { toast.error(e?.message || 'Sync failed'); }
  };

  const lastFor = (entity: EntityDef) => {
    if (!entity.action) return null;
    return jobs.data?.find((j: any) => j.job_type === entity.action) || null;
  };

  // ---- Backfill state ----
  const [backfillPages, setBackfillPages] = useState(50);
  const [backfillPageSize, setBackfillPageSize] = useState(500);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillResult, setBackfillResult] = useState<any>(null);

  const integration = useQuery({
    queryKey: ['pbx-integration-cursor'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pbx_integrations')
        .select('id, organization_id, config, last_sync_at')
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: backfillRunning ? 3000 : 30000,
  });

  const cursor = (integration.data as any)?.config?.sync_cursor ?? 0;
  const cursorAt = (integration.data as any)?.config?.sync_cursor_updated_at;

  const runBackfill = async (fromBeginning: boolean) => {
    setBackfillRunning(true);
    setBackfillResult(null);
    toast.info(fromBeginning ? 'Starting backfill from offset 0…' : 'Resuming backfill from cursor…');
    try {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: {
          action: 'backfill-cdrs',
          params: { page_size: backfillPageSize, max_pages: backfillPages, from_beginning: fromBeginning },
        },
      });
      if (error) throw error;
      setBackfillResult(data);
      toast.success(`Backfill complete: ${(data as any)?.stats?.cdrs ?? 0} upserted`);
      jobs.refetch();
      integration.refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Backfill failed');
    } finally {
      setBackfillRunning(false);
    }
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <AdminPageHeader
        icon={Activity}
        title="Sync Health"
        subtitle="Last sync per PBX entity, with per-row resync."
        actions={
          <>
            <Button variant="outline" onClick={() => jobs.refetch()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
            <Button onClick={resyncAll}><Play className="w-4 h-4 mr-2" /> Resync all</Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="w-4 h-4" /> CDR Backfill</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs">Page size</Label>
              <Input type="number" min={50} max={1000} value={backfillPageSize}
                onChange={(e) => setBackfillPageSize(Math.max(50, Math.min(1000, parseInt(e.target.value) || 500)))} />
            </div>
            <div>
              <Label className="text-xs">Max pages / run</Label>
              <Input type="number" min={1} max={500} value={backfillPages}
                onChange={(e) => setBackfillPages(Math.max(1, Math.min(500, parseInt(e.target.value) || 50)))} />
            </div>
            <div className="text-xs text-muted-foreground">
              <div>Current cursor: <span className="font-mono">{cursor}</span></div>
              <div>Updated: {cursorAt ? formatDistanceToNow(new Date(cursorAt), { addSuffix: true }) : '—'}</div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => runBackfill(false)} disabled={backfillRunning}>
                {backfillRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                Resume
              </Button>
              <Button onClick={() => runBackfill(true)} disabled={backfillRunning}>
                {backfillRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                From beginning
              </Button>
            </div>
          </div>
          {backfillResult && (
            <div className="text-xs font-mono bg-muted/40 rounded p-3 overflow-auto">
              upserted={backfillResult?.stats?.cdrs ?? 0} · fetched={backfillResult?.stats?.fetched ?? 0} · pages={backfillResult?.stats?.pages ?? 0}
              {backfillResult?.errors?.length ? <div className="text-destructive mt-1">{backfillResult.errors.join('; ')}</div> : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Entities</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Error</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ENTITIES.map(e => {
                const j: any = lastFor(e);
                const status = e.action ? (j?.status || 'pending') : 'n/a';
                return (
                  <TableRow key={e.key} className="hover:bg-muted/40">
                    <TableCell className="font-medium">{e.label}</TableCell>
                    <TableCell><StatusBadge tone={toneFor(j?.status) as any}>{status}</StatusBadge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {j?.completed_at ? formatDistanceToNow(new Date(j.completed_at), { addSuffix: true }) : '—'}
                      {j ? <span className="ml-2 opacity-70">· {j.upserted ?? 0}/{j.fetched ?? 0}</span> : null}
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-xs truncate">{j?.error || '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" disabled={!e.action} onClick={() => resync(e)}>
                        <RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent sync jobs</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead><TableHead>Status</TableHead>
                <TableHead>Started</TableHead><TableHead>Completed</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.isLoading ? <AdminSkeletonRows rows={5} cols={5} /> :
                (jobs.data || []).slice(0, 25).map((j: any) => (
                  <TableRow key={j.id} className="hover:bg-muted/40">
                    <TableCell className="font-mono text-xs">{j.job_type}</TableCell>
                    <TableCell><StatusBadge tone={toneFor(j.status) as any}>{j.status}</StatusBadge></TableCell>
                    <TableCell className="text-xs">{j.started_at ? new Date(j.started_at).toLocaleString() : '—'}</TableCell>
                    <TableCell className="text-xs">{j.completed_at ? new Date(j.completed_at).toLocaleString() : '—'}</TableCell>
                    <TableCell className="text-xs text-destructive max-w-xs truncate">{j.error || '—'}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
