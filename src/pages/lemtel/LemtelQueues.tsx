import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Headphones, Plus, Loader2, Pencil, Trash2, Users, RefreshCw, Shield, UserPlus, Activity,
  Download, Upload, AlertTriangle, CheckCircle2, Clock, Lock, Search, ArrowUpDown, ChevronLeft, ChevronRight,
  ArrowRight,
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';

// Extension display helper — pbx_extensions doesn't have a display_name column
const extName = (e: any) =>
  e?.effective_cid_name
  || [e?.directory_first_name, e?.directory_last_name].filter(Boolean).join(' ').trim()
  || e?.description
  || e?.extension
  || '';
const EXT_COLS = 'id, extension, effective_cid_name, directory_first_name, directory_last_name, description';
import { usePbxQueues, LEMTEL_ORG, usePbxSync, usePbxSyncJobs } from '@/hooks/usePbxData';
import { PbxRefreshButton } from '@/components/lemtel/PbxRefreshButton';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toast as sonner } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useCallCenterRole } from '@/hooks/useCallCenterRole';
import { formatDistanceToNow } from 'date-fns';
import { useLanguage } from '@/context/LanguageContext';
import { usePbxRealtime } from '@/hooks/usePbxRealtime';
import { FusionPbxPermissionsHelp } from '@/components/lemtel/FusionPbxPermissionsHelp';

const STRATEGIES = ['ring-all', 'longest-idle-agent', 'round-robin', 'top-down', 'agent-with-least-talk-time', 'agent-with-fewest-calls', 'sequentially-by-agent-order', 'random'];
const qCopy = {
  en: { title: 'Call Center · Queues', subtitle: 'Manage queues, agents, supervisors and live activity — synced with FusionPBX.', empty: 'No queues yet — create one to start routing calls.', select: 'Select a queue to manage agents and supervisors.', noSup: 'No supervisors assigned — add one to monitor and manage this queue.', noAgents: 'No agents assigned — add extensions that should answer this queue.', readonly: 'Read-only view', create: 'New Queue' },
  fr: { title: 'Centre d’appel · Files', subtitle: 'Gérer les files, agents, superviseurs et activité live — synchronisé avec FusionPBX.', empty: 'Aucune file — créez-en une pour commencer le routage.', select: 'Sélectionnez une file pour gérer les agents et superviseurs.', noSup: 'Aucun superviseur assigné — ajoutez-en un pour gérer cette file.', noAgents: 'Aucun agent assigné — ajoutez les extensions qui doivent répondre.', readonly: 'Vue lecture seule', create: 'Nouvelle file' },
};

type Perms = { canManage: boolean; canAssign: boolean; reason: string };

function usePerms(): Perms {
  const { isAdmin, isSupervisor, isSuperAdmin, isLemtelAdmin, isOrgAdmin, role, loading } = useCallCenterRole();
  if (loading) return { canManage: false, canAssign: false, reason: 'loading' };
  const reason = isSuperAdmin ? 'super_admin'
    : isLemtelAdmin ? 'lemtel_admin'
    : isOrgAdmin ? 'org_admin'
    : role === 'admin' ? 'cc_admin'
    : role === 'supervisor' ? 'supervisor'
    : role === 'agent' ? 'agent'
    : 'viewer';
  return {
    canManage: isAdmin,
    canAssign: isAdmin || isSupervisor,
    reason,
  };
}

export default function LemtelQueues() {
  const { data: queues = [], isLoading } = usePbxQueues();
  usePbxRealtime(['pbx_call_queues', 'pbx_queue_agents', 'pbx_queue_agent_state']);
  const { language } = useLanguage();
  const txt = qCopy[language];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'queues' | 'agents' | 'live'>('queues');
  const perms = usePerms();
  const selected = (queues as any[]).find((q) => q.id === selectedId) || null;
  const openAgents = (id: string) => { setSelectedId(id); setTab('agents'); };
  const [permNoticeDismissed, setPermNoticeDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem('lemtel:queue-perm-notice-dismissed') === '1'; } catch { return false; }
  });
  const [permNoticeVisible, setPermNoticeVisible] = useState(false);
  useEffect(() => {
    const onErr = (e: any) => {
      const msg = String(e?.detail?.message || '');
      if (/call_center_tier_add|permission missing/i.test(msg)) setPermNoticeVisible(true);
    };
    window.addEventListener('lemtel:queue-perm-error', onErr as any);
    return () => window.removeEventListener('lemtel:queue-perm-error', onErr as any);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Headphones className="w-7 h-7" /> {txt.title}</h1>
          <p className="text-muted-foreground">{txt.subtitle}</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Badge variant="outline" className="capitalize">Role: {perms.reason.replace('_', ' ')}</Badge>
          <SyncStatusChip />
          <PbxRefreshButton kind="ivr-queues" />
          <CsvIO queues={queues as any[]} disabled={!perms.canManage} />
          {perms.canManage && <QueueDialog mode="create" trigger={<Button><Plus className="w-4 h-4 mr-2" /> {txt.create}</Button>} />}
        </div>
      </div>

      {!permNoticeDismissed && permNoticeVisible && (perms.canManage || perms.canAssign) && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertTitle>FusionPBX permission missing: <code>call_center_tier_add</code></AlertTitle>
          <AlertDescription className="space-y-2">
            <p>The API user (<code>mhassoun</code>) cannot add queue members via REST. Ask the FusionPBX admin to open <b>Advanced → Group Manager</b> and add these permissions to the API user's group, then click <b>Refresh</b>:</p>
            <ul className="text-xs list-disc pl-5">
              <li><code>call_center_tier_add</code>, <code>call_center_tier_update</code>, <code>call_center_tier_delete</code></li>
              <li><code>call_center_agent_add</code>, <code>call_center_agent_update</code>, <code>call_center_agent_delete</code>, <code>call_center_queue_view</code></li>
              <li><code>gateway_view</code>, <code>gateway_all</code>, <code>command_add</code>, <code>command_edit</code> (for gateways &amp; fs_cli fallback)</li>
            </ul>
            <Button size="sm" variant="outline" onClick={() => { try { localStorage.setItem('lemtel:queue-perm-notice-dismissed', '1'); } catch {} setPermNoticeDismissed(true); }}>Dismiss</Button>
          </AlertDescription>
        </Alert>
      )}

      {!perms.canManage && (
        <Alert>
          <Lock className="w-4 h-4" />
          <AlertTitle>{txt.readonly} ({perms.reason})</AlertTitle>
          <AlertDescription>Only call-center admins can create or edit queues. Supervisors can assign agents.</AlertDescription>
        </Alert>
      )}

      <FusionPbxPermissionsHelp area="queues" />



      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
        <TabsList>
          <TabsTrigger value="queues"><Headphones className="w-4 h-4 mr-1" /> Queues</TabsTrigger>
          <TabsTrigger value="agents" disabled={!selected}><Users className="w-4 h-4 mr-1" /> Agents & Supervisors</TabsTrigger>
          <TabsTrigger value="live"><Activity className="w-4 h-4 mr-1" /> Live Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="queues">
          <Card>
            <CardHeader><CardTitle>{queues.length} queues</CardTitle><CardDescription>Click a row to manage its agents</CardDescription></CardHeader>
            <CardContent>
              {isLoading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead><TableHead>Ext</TableHead><TableHead>Strategy</TableHead>
                    <TableHead>Max Wait</TableHead><TableHead>Recording</TableHead><TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(queues as any[]).map((q: any) => (
                      <TableRow key={q.id} className={selectedId === q.id ? 'bg-muted/50' : 'cursor-pointer'} onClick={() => openAgents(q.id)}>
                        <TableCell className="font-medium">{q.name}</TableCell>
                        <TableCell className="font-mono">{q.extension || '-'}</TableCell>
                        <TableCell><Badge variant="outline">{q.strategy}</Badge></TableCell>
                        <TableCell>{q.max_wait_time}s</TableCell>
                        <TableCell>{q.record_enabled ? <Badge>On</Badge> : <Badge variant="outline">Off</Badge>}</TableCell>
                        <TableCell>{q.enabled ? <Badge>Enabled</Badge> : <Badge variant="outline">Disabled</Badge>}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1.5 justify-end flex-wrap">
                            <Button size="sm" variant="outline" onClick={() => openAgents(q.id)} title="Manage agents">
                              <Users className="w-3.5 h-3.5 mr-1" /> Agents
                            </Button>
                            {perms.canManage && <QueueDialog mode="edit" queue={q} trigger={
                              <Button size="sm" variant="outline" title="Edit queue settings">
                                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                              </Button>
                            } />}
                            {perms.canManage && <DeleteQueueBtn queue={q} />}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {queues.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">{txt.empty}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agents">
          {selected ? <QueueAgentsPanel queue={selected} perms={perms} txt={txt} /> : <Card><CardContent className="p-6 text-muted-foreground">{txt.select}</CardContent></Card>}
        </TabsContent>

        <TabsContent value="live"><LiveStatsPanel queues={queues as any[]} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Sync status chip ----------
function SyncStatusChip() {
  const { data: jobs = [] } = usePbxSyncJobs(5);
  const latest = jobs[0];
  if (!latest) return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" /> No sync yet</Badge>;
  const when = latest.completed_at || latest.finished_at || latest.started_at;
  const ago = when ? formatDistanceToNow(new Date(when), { addSuffix: true }) : '';
  if (latest.status === 'error') {
    return (
      <Badge variant="destructive" title={latest.error || 'Sync failed'}>
        <AlertTriangle className="w-3 h-3 mr-1" /> Sync failed {ago}
      </Badge>
    );
  }
  if (latest.status === 'running') {
    return <Badge><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Syncing…</Badge>;
  }
  return <Badge variant="outline"><CheckCircle2 className="w-3 h-3 mr-1 text-green-600" /> Synced {ago}</Badge>;
}

// ---------- CSV import/export ----------
function CsvIO({ queues, disabled }: { queues: any[]; disabled: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const exportCsv = async () => {
    const { data: tiers = [] } = await supabase
      .from('pbx_queue_agents').select('queue_id, agent_id, agent_name, tier_level, tier_position')
      .in('queue_id', queues.map((q) => q.id));
    const rows: string[] = ['name,extension,strategy,max_wait_time,record_enabled,enabled,agents'];
    for (const q of queues) {
      const a = (tiers as any[]).filter((t) => t.queue_id === q.id)
        .map((t) => `${t.agent_id}:${t.tier_level === 1 ? 'sup' : 'agent'}:${t.tier_position}`).join('|');
      rows.push([q.name, q.extension || '', q.strategy, q.max_wait_time, q.record_enabled, q.enabled, a]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `queues-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const header = lines.shift()?.split(',').map((h) => h.replace(/"/g, '').trim()) || [];
      let created = 0, updated = 0, failed = 0;
      for (const line of lines) {
        const parts = line.match(/("([^"]|"")*"|[^,]+)/g)?.map((p) => p.replace(/^"|"$/g, '').replace(/""/g, '"')) || [];
        const row: any = {}; header.forEach((h, i) => { row[h] = parts[i]; });
        if (!row.name) continue;
        const existing = queues.find((q) => q.name === row.name);
        const action = existing ? 'update-queue' : 'create-queue';
        const params: any = {
          queue_name: row.name,
          queue_extension: row.extension || '',
          queue_strategy: row.strategy || 'ring-all',
          queue_max_wait_time: String(row.max_wait_time || 60),
          queue_enabled: row.enabled === 'true' || row.enabled === true ? 'true' : 'false',
          queue_record_template: row.record_enabled === 'true' ? '${strftime(%Y)}/${strftime(%b)}/${strftime(%d)}/${uuid}.${record_ext}' : '',
        };
        if (existing) params.call_center_queue_uuid = existing.pbx_uuid;
        try {
          const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
            body: { organization_id: LEMTEL_ORG, action, params },
          });
          if (error || data?.ok === false) throw new Error(data?.message || error?.message || 'failed');
          existing ? updated++ : created++;
        } catch { failed++; }
      }
      await supabase.functions.invoke('fusionpbx-proxy', { body: { organization_id: LEMTEL_ORG, action: 'sync-all', params: { resources: ['queues'] } } });
      qc.invalidateQueries({ queryKey: ['pbx'] });
      toast({ title: 'Import done', description: `${created} created · ${updated} updated · ${failed} failed` });
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1" /> Export CSV</Button>
      <Button variant="outline" size="sm" disabled={disabled || busy} onClick={() => fileRef.current?.click()}>
        {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />} Import CSV
      </Button>
      <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
    </>
  );
}

// ---------- Queue create/edit dialog ----------
function QueueDialog({ mode, queue, trigger }: { mode: 'create' | 'edit'; queue?: any; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'settings' | 'agents'>('settings');
  const { toast } = useToast();
  const qc = useQueryClient();
  const perms = usePerms();
  const { language } = useLanguage();
  const txt = qCopy[language];
  const raw = (queue?.raw_data || {}) as any;
  const [moh, setMoh] = useState<Array<{ name: string; path: string | null }>>([]);
  const [mohLoading, setMohLoading] = useState(false);
  const [recRule, setRecRule] = useState<{ enabled: boolean; mode: 'all' | 'inbound' | 'outbound'; announce: boolean; retention_days: number }>({
    enabled: !!queue?.record_enabled, mode: 'all', announce: true, retention_days: 90,
  });

  useEffect(() => {
    if (!open) return;
    (async () => {
      setMohLoading(true);
      const { data } = await supabase.from('pbx_hold_music').select('name, path').eq('organization_id', LEMTEL_ORG).order('name');
      setMoh((data || []) as any);
      setMohLoading(false);
      if (queue?.id) {
        const { data: rr } = await supabase.from('pbx_queue_recording_rules' as any).select('*').eq('queue_id', queue.id).maybeSingle();
        if (rr) setRecRule({ enabled: (rr as any).enabled, mode: (rr as any).mode, announce: (rr as any).announce, retention_days: (rr as any).retention_days });
      }
    })();
  }, [open, queue?.id]);

  const syncMoh = async () => {
    setMohLoading(true);
    try {
      await supabase.functions.invoke('fusionpbx-proxy', { body: { organization_id: LEMTEL_ORG, action: 'sync-hold-music' } });
      const { data } = await supabase.from('pbx_hold_music').select('name, path').eq('organization_id', LEMTEL_ORG).order('name');
      setMoh((data || []) as any);
    } catch (e: any) { toast({ title: 'MOH sync failed', description: e.message, variant: 'destructive' }); }
    finally { setMohLoading(false); }
  };

  const [form, setForm] = useState({
    queue_name: queue?.name || '',
    queue_extension: queue?.extension || '',
    queue_strategy: queue?.strategy || 'ring-all',
    queue_max_wait_time: String(queue?.max_wait_time ?? 60),
    queue_record_template: queue?.record_enabled ? '${strftime(%Y)}/${strftime(%b)}/${strftime(%d)}/${uuid}.${record_ext}' : '',
    queue_description: queue?.description || '',
    queue_moh_sound: queue?.music_on_hold || '$${hold_music}',
    queue_enabled: queue?.enabled ?? true,
    queue_announce_sound: raw.queue_announce_sound || '',
    queue_announce_frequency: String(raw.queue_announce_frequency ?? ''),
    queue_wrap_up_time: String(raw.queue_wrap_up_time ?? 10),
    queue_agent_no_answer_delay_time: String(raw.queue_agent_no_answer_delay_time ?? 5),
    queue_max_wait_time_with_no_agent: String(raw.queue_max_wait_time_with_no_agent ?? 30),
    queue_max_wait_time_with_no_agent_time_reached: String(raw.queue_max_wait_time_with_no_agent_time_reached ?? 5),
    queue_tier_rules_apply: raw.queue_tier_rules_apply === 'true' || raw.queue_tier_rules_apply === true,
    queue_tier_rule_wait_second: String(raw.queue_tier_rule_wait_second ?? 30),
    queue_tier_rule_wait_multiply_level: raw.queue_tier_rule_wait_multiply_level === 'true' || raw.queue_tier_rule_wait_multiply_level === true,
    queue_tier_rule_no_agent_no_wait: raw.queue_tier_rule_no_agent_no_wait === 'true' || raw.queue_tier_rule_no_agent_no_wait === true,
    queue_discard_abandoned_after: String(raw.queue_discard_abandoned_after ?? 60),
    queue_abandoned_resume_allowed: raw.queue_abandoned_resume_allowed === 'true' || raw.queue_abandoned_resume_allowed === true,
    queue_cid_prefix: raw.queue_cid_prefix || '',
    queue_timeout_action: raw.queue_timeout_action || '',
  });

  const submit = async () => {
    setBusy(true);
    try {
      const action = mode === 'create' ? 'create-queue' : 'update-queue';
      const boolStr = (v: any) => (v === true ? 'true' : 'false');
      const params: any = {
        ...form,
        queue_enabled: boolStr(form.queue_enabled),
        queue_tier_rules_apply: boolStr(form.queue_tier_rules_apply),
        queue_tier_rule_wait_multiply_level: boolStr(form.queue_tier_rule_wait_multiply_level),
        queue_tier_rule_no_agent_no_wait: boolStr(form.queue_tier_rule_no_agent_no_wait),
        queue_abandoned_resume_allowed: boolStr(form.queue_abandoned_resume_allowed),
      };
      if (mode === 'edit') params.call_center_queue_uuid = queue.pbx_uuid;
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { organization_id: LEMTEL_ORG, action, params },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.message || 'FusionPBX error');
      // Persist queue-level recording rule (works for both create + edit)
      try {
        let qid = queue?.id;
        if (!qid && form.queue_name) {
          const { data: qrow } = await supabase.from('pbx_call_queues').select('id').eq('organization_id', LEMTEL_ORG).eq('name', form.queue_name).maybeSingle();
          qid = qrow?.id;
        }
        if (qid) {
          await supabase.from('pbx_queue_recording_rules' as any).upsert({
            organization_id: LEMTEL_ORG, queue_id: qid,
            enabled: recRule.enabled, mode: recRule.mode, announce: recRule.announce, retention_days: recRule.retention_days,
          }, { onConflict: 'queue_id' });
        }
      } catch (rrErr) { console.warn('recording rule save failed', rrErr); }
      toast({ title: mode === 'create' ? 'Queue created' : 'Queue updated' });
      await supabase.functions.invoke('fusionpbx-proxy', { body: { organization_id: LEMTEL_ORG, action: 'sync-all', params: { resources: ['queues'] } } });
      qc.invalidateQueries({ queryKey: ['pbx'] });
      setOpen(false);
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create Queue' : `Edit ${queue?.name}`}</DialogTitle>
          <DialogDescription>Settings push directly to FusionPBX call center module.</DialogDescription>
        </DialogHeader>
        {mode === 'edit' ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="settings"><Pencil className="w-4 h-4 mr-1" /> Settings</TabsTrigger>
              <TabsTrigger value="agents"><Users className="w-4 h-4 mr-1" /> Agents & Supervisors</TabsTrigger>
            </TabsList>
            <TabsContent value="settings">
              <div className="space-y-4">
                <QueueSettingsForm form={form} setForm={setForm} moh={moh} mohLoading={mohLoading} syncMoh={syncMoh} recRule={recRule} setRecRule={setRecRule} />
              </div>
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit} disabled={busy || !form.queue_name}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save</Button>
              </DialogFooter>
            </TabsContent>
            <TabsContent value="agents">
              <QueueAgentsPanel queue={queue} perms={perms} txt={txt} />
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        ) : (
          <>
            <div className="space-y-4">
              <QueueSettingsForm form={form} setForm={setForm} moh={moh} mohLoading={mohLoading} syncMoh={syncMoh} recRule={recRule} setRecRule={setRecRule} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={busy || !form.queue_name}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function QueueSettingsForm({ form, setForm, moh, mohLoading, syncMoh, recRule, setRecRule }: any) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label>Name</Label><Input value={form.queue_name} onChange={(e) => setForm({ ...form, queue_name: e.target.value })} /></div>
        <div><Label>Extension</Label><Input value={form.queue_extension} onChange={(e) => setForm({ ...form, queue_extension: e.target.value })} placeholder="e.g. 5000" /></div>
        <div><Label>Strategy</Label>
          <Select value={form.queue_strategy} onValueChange={(v) => setForm({ ...form, queue_strategy: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STRATEGIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Caller ID prefix</Label><Input value={form.queue_cid_prefix} onChange={(e) => setForm({ ...form, queue_cid_prefix: e.target.value })} placeholder="e.g. [Sales]" /></div>
        <div>
          <div className="flex items-center justify-between"><Label>Music on hold</Label>
            <button type="button" className="text-[10px] underline text-muted-foreground" onClick={syncMoh} disabled={mohLoading}>{mohLoading ? 'Syncing…' : 'Sync from PBX'}</button>
          </div>
          <Select value={form.queue_moh_sound} onValueChange={(v: any) => setForm({ ...form, queue_moh_sound: v })}>
            <SelectTrigger><SelectValue placeholder="Choose music on hold" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="$${hold_music}">Default ($${'{'}hold_music{'}'})</SelectItem>
              <SelectItem value="local_stream://default">Local stream (default)</SelectItem>
              {moh.map((m: any) => <SelectItem key={m.name} value={m.path || m.name}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2"><Label>Description</Label><Textarea value={form.queue_description} onChange={(e) => setForm({ ...form, queue_description: e.target.value })} rows={2} /></div>
      </div>

      <div className="border-t pt-3">
        <div className="font-medium text-sm mb-2">Routing & Timing</div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Max wait (sec)</Label><Input type="number" value={form.queue_max_wait_time} onChange={(e) => setForm({ ...form, queue_max_wait_time: e.target.value })} /></div>
          <div><Label>Wrap-up time (sec)</Label><Input type="number" value={form.queue_wrap_up_time} onChange={(e) => setForm({ ...form, queue_wrap_up_time: e.target.value })} /></div>
          <div><Label>Agent no-answer delay (sec)</Label><Input type="number" value={form.queue_agent_no_answer_delay_time} onChange={(e) => setForm({ ...form, queue_agent_no_answer_delay_time: e.target.value })} /></div>
          <div><Label>Max wait with no agents (sec)</Label><Input type="number" value={form.queue_max_wait_time_with_no_agent} onChange={(e) => setForm({ ...form, queue_max_wait_time_with_no_agent: e.target.value })} /></div>
          <div><Label>No-agent time reached (sec)</Label><Input type="number" value={form.queue_max_wait_time_with_no_agent_time_reached} onChange={(e) => setForm({ ...form, queue_max_wait_time_with_no_agent_time_reached: e.target.value })} /></div>
          <div><Label>Discard abandoned after (sec)</Label><Input type="number" value={form.queue_discard_abandoned_after} onChange={(e) => setForm({ ...form, queue_discard_abandoned_after: e.target.value })} /></div>
          <div className="col-span-2"><Label>Timeout action</Label><Input value={form.queue_timeout_action} onChange={(e) => setForm({ ...form, queue_timeout_action: e.target.value })} placeholder="e.g. transfer:200 XML default" /></div>
        </div>
      </div>

      <div className="border-t pt-3">
        <div className="font-medium text-sm mb-2">Tier Rules</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2"><Switch checked={form.queue_tier_rules_apply} onCheckedChange={(v) => setForm({ ...form, queue_tier_rules_apply: v })} /><Label>Apply tier rules</Label></div>
          <div><Label>Tier rule wait (sec)</Label><Input type="number" value={form.queue_tier_rule_wait_second} onChange={(e) => setForm({ ...form, queue_tier_rule_wait_second: e.target.value })} /></div>
          <div className="flex items-center gap-2"><Switch checked={form.queue_tier_rule_wait_multiply_level} onCheckedChange={(v) => setForm({ ...form, queue_tier_rule_wait_multiply_level: v })} /><Label>Multiply by tier level</Label></div>
          <div className="flex items-center gap-2"><Switch checked={form.queue_tier_rule_no_agent_no_wait} onCheckedChange={(v) => setForm({ ...form, queue_tier_rule_no_agent_no_wait: v })} /><Label>No agent → no wait</Label></div>
        </div>
      </div>

      <div className="border-t pt-3">
        <div className="font-medium text-sm mb-2">Announcements & Recording</div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Announce sound</Label><Input value={form.queue_announce_sound} onChange={(e) => setForm({ ...form, queue_announce_sound: e.target.value })} placeholder="path/to/sound.wav" /></div>
          <div><Label>Announce frequency (sec)</Label><Input type="number" value={form.queue_announce_frequency} onChange={(e) => setForm({ ...form, queue_announce_frequency: e.target.value })} /></div>
          <div className="flex items-center gap-2"><Switch checked={!!form.queue_record_template} onCheckedChange={(v) => setForm({ ...form, queue_record_template: v ? '${strftime(%Y)}/${strftime(%b)}/${strftime(%d)}/${uuid}.${record_ext}' : '' })} /><Label>Record calls on PBX</Label></div>
          <div className="flex items-center gap-2"><Switch checked={form.queue_abandoned_resume_allowed} onCheckedChange={(v) => setForm({ ...form, queue_abandoned_resume_allowed: v })} /><Label>Allow resume after abandon</Label></div>
          <div className="flex items-center gap-2"><Switch checked={form.queue_enabled} onCheckedChange={(v) => setForm({ ...form, queue_enabled: v })} /><Label>Queue enabled</Label></div>
        </div>

        <div className="mt-4 p-3 rounded-md border bg-muted/30">
          <div className="text-xs font-semibold mb-2">Queue recording rule</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2"><Switch checked={recRule.enabled} onCheckedChange={(v: boolean) => setRecRule({ ...recRule, enabled: v })} /><Label>Enable recording for this queue</Label></div>
            <div>
              <Label>Mode</Label>
              <Select value={recRule.mode} onValueChange={(v: any) => setRecRule({ ...recRule, mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All calls</SelectItem>
                  <SelectItem value="inbound">Inbound only</SelectItem>
                  <SelectItem value="outbound">Outbound only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2"><Switch checked={recRule.announce} onCheckedChange={(v: boolean) => setRecRule({ ...recRule, announce: v })} /><Label>Announce recording</Label></div>
            <div><Label>Retention (days)</Label><Input type="number" value={recRule.retention_days} onChange={(e) => setRecRule({ ...recRule, retention_days: Number(e.target.value) || 90 })} /></div>
          </div>
        </div>
      </div>
    </>
  );
}

function DeleteQueueBtn({ queue }: { queue: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (!confirm(`Delete queue "${queue.name}"? This removes it from FusionPBX.`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { organization_id: LEMTEL_ORG, action: 'delete-queue', params: { call_center_queue_uuid: queue.pbx_uuid } },
      });
      if (error || data?.ok === false) throw new Error(data?.message || error?.message || 'Failed');
      await supabase.from('pbx_call_queues').delete().eq('id', queue.id);
      toast({ title: 'Queue deleted' });
      qc.invalidateQueries({ queryKey: ['pbx'] });
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };
  return <Button size="sm" variant="outline" onClick={onClick} disabled={busy} title="Delete queue">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Trash2 className="w-3.5 h-3.5 mr-1 text-destructive" /> Delete</>}</Button>;
}

// ---------- Agents per queue ----------
type ResyncStep = 'agents' | 'tiers' | 'upsert';
type ResyncStatus = {
  state: 'idle' | 'running' | 'success' | 'partial' | 'error';
  step?: ResyncStep;
  message?: string;
  details?: string;
  pulled?: number;
  upserted?: number;
  failed?: number;
  attempts?: number;
  at?: string;
};

async function invokeWithRetry(action: string, body: any, maxAttempts = 3): Promise<{ data: any; attempts: number }> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', { body });
      if (error) throw new Error(error.message || `Edge function error (${action})`);
      if ((data as any)?.ok === false) throw new Error((data as any)?.message || (data as any)?.error || `${action} failed on PBX`);
      return { data, attempts: attempt };
    } catch (e: any) {
      lastErr = e;
      if (attempt < maxAttempts) {
        const delay = 400 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

function QueueAgentsPanel({ queue, perms, txt }: { queue: any; perms: Perms; txt: typeof qCopy.en }) {
  const [agents, setAgents] = useState<any[]>([]);
  const [extensions, setExtensions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ResyncStatus>({ state: 'idle' });
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const [agentsRes, extRes] = await Promise.all([
      supabase.from('pbx_queue_agents').select('*').eq('queue_id', queue.id),
      supabase.from('pbx_extensions').select(EXT_COLS).eq('organization_id', LEMTEL_ORG).order('extension'),
    ]);
    if (extRes.error) {
      toast({ title: 'Failed to load extensions', description: extRes.error.message, variant: 'destructive' });
    }
    let exts = extRes.data || [];
    // Auto-sync from PBX if local table is empty so the picker is never blank
    if (exts.length === 0) {
      try {
        await supabase.functions.invoke('sync-pbx-extensions', { body: { organization_id: LEMTEL_ORG } });
        const retry = await supabase.from('pbx_extensions').select(EXT_COLS).eq('organization_id', LEMTEL_ORG).order('extension');
        exts = retry.data || [];
        if (exts.length > 0) toast({ title: 'Extensions synced', description: `Loaded ${exts.length} extension${exts.length === 1 ? '' : 's'} from PBX.` });
      } catch (e: any) {
        toast({ title: 'Extension sync failed', description: e?.message || String(e), variant: 'destructive' });
      }
    }
    setAgents(agentsRes.data || []); setExtensions(exts); setLoading(false);
    return (agentsRes.data || []).length;
  };

  const resyncTiers = async () => {
    if (!queue.pbx_uuid) {
      setStatus({ state: 'error', message: 'Queue has no PBX UUID — cannot sync', at: new Date().toISOString() });
      return;
    }
    setStatus({ state: 'running', step: 'agents', message: 'Syncing agent registry from FusionPBX…' });
    let totalAttempts = 0;
    try {
      // Step 1: refresh agent registry
      const r1 = await invokeWithRetry('sync-queue-agents', { organization_id: LEMTEL_ORG, action: 'sync-queue-agents' });
      totalAttempts += r1.attempts;

      // Step 2: fetch tier links
      setStatus({ state: 'running', step: 'tiers', message: 'Fetching tier links…', attempts: totalAttempts });
      const r2 = await invokeWithRetry('list-queue-tiers', { organization_id: LEMTEL_ORG, action: 'list-queue-tiers' });
      totalAttempts += r2.attempts;
      const tiers: any[] = (r2.data as any)?.data || [];
      const mine = tiers.filter((t) => t.call_center_queue_uuid === queue.pbx_uuid);

      // Step 3: upsert local rows
      setStatus({ state: 'running', step: 'upsert', message: `Upserting ${mine.length} tier${mine.length === 1 ? '' : 's'}…`, pulled: mine.length, attempts: totalAttempts });
      const { data: extFresh = [] } = await supabase.from('pbx_extensions')
        .select(EXT_COLS).eq('organization_id', LEMTEL_ORG);

      let upserted = 0;
      const upsertErrors: string[] = [];
      for (const t of mine) {
        const agentExt = (t.tier_agent || '').toString().split('@')[0];
        const ext = (extFresh as any[]).find((x) => x.extension === agentExt);
        const { error } = await supabase.from('pbx_queue_agents').upsert({
          organization_id: LEMTEL_ORG,
          queue_id: queue.id,
          extension_id: ext?.id || null,
          agent_id: agentExt,
          agent_name: extName(ext) || agentExt,
          tier_level: parseInt(t.tier_level) || 2,
          tier_position: parseInt(t.tier_position) || 1,
          pbx_uuid: t.call_center_tier_uuid,
          raw_data: t,
        } as any, { onConflict: 'pbx_uuid' });
        if (error) upsertErrors.push(`${agentExt}: ${error.message}`);
        else upserted++;
      }
      await load();

      if (upsertErrors.length === 0) {
        setStatus({
          state: 'success',
          message: mine.length === 0 ? 'PBX has no tiers for this queue' : `${upserted} tier${upserted === 1 ? '' : 's'} synced`,
          pulled: mine.length, upserted, failed: 0, attempts: totalAttempts,
          at: new Date().toISOString(),
        });
      } else {
        setStatus({
          state: 'partial',
          message: `${upserted}/${mine.length} tiers synced — ${upsertErrors.length} failed`,
          details: upsertErrors.slice(0, 3).join(' · ') + (upsertErrors.length > 3 ? ` (+${upsertErrors.length - 3} more)` : ''),
          pulled: mine.length, upserted, failed: upsertErrors.length, attempts: totalAttempts,
          at: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      const step = (status.step) || 'agents';
      const msg = e?.message || 'Unknown error';
      setStatus({
        state: 'error',
        step,
        message: `Resync failed at "${step}" step`,
        details: msg,
        attempts: totalAttempts || 1,
        at: new Date().toISOString(),
      });
      toast({ title: 'Resync failed', description: msg, variant: 'destructive' });
    }
  };

  useEffect(() => {
    (async () => {
      const count = await load();
      if (count === 0 && queue.pbx_uuid) resyncTiers();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.id]);


  const addAgent = async (extensionId: string, role: 'agent' | 'supervisor') => {
    if (!perms.canAssign) { toast({ title: 'Forbidden', description: 'Supervisor or admin required', variant: 'destructive' }); return; }
    const ext = extensions.find((x) => x.id === extensionId);
    if (!ext) return;
    const tier_level = role === 'supervisor' ? 1 : 2;
    const tier_position = (agents.filter((a) => a.tier_level === tier_level).length) + 1;
    try {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { organization_id: LEMTEL_ORG, action: 'add-queue-tier', params: {
          call_center_queue_uuid: queue.pbx_uuid,
          tier_agent: ext.extension,
          tier_level, tier_position,
        }},
      });
      if (error || (data as any)?.ok === false || (data as any)?.error) {
        throw new Error((data as any)?.error || (data as any)?.message || error?.message || 'Failed');
      }
      const tierUuid = (data as any)?.data?.call_center_tier_uuid || (data as any)?.call_center_tier_uuid || null;
      await supabase.from('pbx_queue_agents').insert({
        queue_id: queue.id, extension_id: ext.id, agent_id: ext.extension,
        agent_name: extName(ext) || ext.extension, tier_level, tier_position,
        pbx_uuid: tierUuid, raw_data: tierUuid ? { call_center_tier_uuid: tierUuid } : null,
      } as any);
      toast({ title: `${role === 'supervisor' ? 'Supervisor' : 'Agent'} added` });
      load();
    } catch (e: any) {
      const msg = e?.message || 'Failed';
      if (/call_center_tier_add|permission missing/i.test(msg)) {
        window.dispatchEvent(new CustomEvent('lemtel:queue-perm-error', { detail: { message: msg } }));
      }
      toast({ title: 'Failed to add member', description: msg, variant: 'destructive' });
    }
  };

  const removeAgent = async (a: any) => {
    if (!perms.canAssign) { toast({ title: 'Forbidden', variant: 'destructive' }); return; }
    if (!confirm(`Remove ${a.agent_name} from ${queue.name}?`)) return;
    try {
      if (a.raw_data?.call_center_tier_uuid) {
        await supabase.functions.invoke('fusionpbx-proxy', { body: { organization_id: LEMTEL_ORG, action: 'remove-queue-tier', params: { call_center_tier_uuid: a.raw_data.call_center_tier_uuid }}});
      }
      await supabase.from('pbx_queue_agents').delete().eq('id', a.id);
      toast({ title: 'Removed' });
      load();
    } catch (e: any) { toast({ title: 'Failed', description: e.message, variant: 'destructive' }); }
  };

  const updateAgent = async (a: any, next: { role: 'agent' | 'supervisor'; tier_position: number }) => {
    if (!perms.canAssign) { toast({ title: 'Forbidden', variant: 'destructive' }); return; }
    const tier_level = next.role === 'supervisor' ? 1 : 2;
    const tier_position = Math.max(1, Math.floor(next.tier_position) || 1);
    const tierUuid = a.pbx_uuid || a.raw_data?.call_center_tier_uuid;
    try {
      if (tierUuid) {
        const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
          body: { organization_id: LEMTEL_ORG, action: 'update-queue-tier', params: {
            call_center_tier_uuid: tierUuid,
            tier_level, tier_position,
          }},
        });
        if (error || data?.ok === false) throw new Error(data?.message || error?.message || 'Failed');
      }
      await supabase.from('pbx_queue_agents').update({ tier_level, tier_position }).eq('id', a.id);
      toast({ title: 'Updated' });
      load();
    } catch (e: any) { toast({ title: 'Failed', description: e.message, variant: 'destructive' }); }
  };

  // returns array of newly inserted rows so caller can offer undo
  const bulkAddRaw = async (extensionIds: string[], role: 'agent' | 'supervisor') => {
    if (!perms.canAssign) { toast({ title: 'Forbidden', variant: 'destructive' }); return [] as any[]; }
    const tier_level = role === 'supervisor' ? 1 : 2;
    let basePos = agents.filter((a) => a.tier_level === tier_level).length;
    const added: any[] = [];
    let ok = 0, fail = 0;
    for (const id of extensionIds) {
      const ext = extensions.find((x) => x.id === id);
      if (!ext) { fail++; continue; }
      basePos += 1;
      try {
        const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
          body: { organization_id: LEMTEL_ORG, action: 'add-queue-tier', params: {
            call_center_queue_uuid: queue.pbx_uuid, tier_agent: ext.extension,
            tier_level, tier_position: basePos,
          }},
        });
        if (error || data?.ok === false) throw new Error(data?.message || error?.message || 'Failed');
        const tierUuid = (data as any)?.data?.call_center_tier_uuid || (data as any)?.call_center_tier_uuid || null;
        const { data: inserted } = await supabase.from('pbx_queue_agents').insert({
          queue_id: queue.id, extension_id: ext.id, agent_id: ext.extension,
          agent_name: extName(ext) || ext.extension, tier_level, tier_position: basePos,
          pbx_uuid: tierUuid, raw_data: tierUuid ? { call_center_tier_uuid: tierUuid } : null,
        } as any).select().maybeSingle();
        if (inserted) added.push(inserted);
        ok++;
      } catch { fail++; }
    }
    await load();
    return { added, ok, fail };
  };

  const bulkRemoveRaw = async (rows: any[]) => {
    if (!perms.canAssign) { toast({ title: 'Forbidden', variant: 'destructive' }); return { removed: [], ok: 0, fail: 0 }; }
    const removed: any[] = [];
    let ok = 0, fail = 0;
    for (const a of rows) {
      try {
        if (a.raw_data?.call_center_tier_uuid) {
          await supabase.functions.invoke('fusionpbx-proxy', { body: { organization_id: LEMTEL_ORG, action: 'remove-queue-tier', params: { call_center_tier_uuid: a.raw_data.call_center_tier_uuid }}});
        }
        await supabase.from('pbx_queue_agents').delete().eq('id', a.id);
        removed.push(a);
        ok++;
      } catch { fail++; }
    }
    await load();
    return { removed, ok, fail };
  };

  // Confirmed bulk add (called from preview dialog) + undo toast
  const bulkAdd = async (extensionIds: string[], role: 'agent' | 'supervisor') => {
    const res: any = await bulkAddRaw(extensionIds, role);
    if (!res) return;
    sonner.success(`Added ${res.ok} member${res.ok === 1 ? '' : 's'}${res.fail ? ` · ${res.fail} failed` : ''}`, {
      action: res.added.length ? {
        label: 'Undo',
        onClick: async () => {
          const r2 = await bulkRemoveRaw(res.added);
          sonner.info(`Undo: removed ${r2.ok}${r2.fail ? ` · ${r2.fail} failed` : ''}`);
        },
      } : undefined,
      duration: 8000,
    });
  };

  // Confirmed bulk remove (called from preview dialog) + undo toast
  const bulkRemove = async (rows: any[]) => {
    const res = await bulkRemoveRaw(rows);
    sonner.success(`Removed ${res.ok} member${res.ok === 1 ? '' : 's'}${res.fail ? ` · ${res.fail} failed` : ''}`, {
      action: res.removed.length ? {
        label: 'Undo',
        onClick: async () => {
          // group by tier_level then re-add
          const groups = { 1: [] as string[], 2: [] as string[] } as Record<number, string[]>;
          for (const r of res.removed) {
            const lvl = r.tier_level === 1 ? 1 : 2;
            if (r.extension_id) groups[lvl].push(r.extension_id);
          }
          let ok = 0;
          if (groups[1].length) { const r1: any = await bulkAddRaw(groups[1], 'supervisor'); ok += r1?.ok || 0; }
          if (groups[2].length) { const r2: any = await bulkAddRaw(groups[2], 'agent'); ok += r2?.ok || 0; }
          sonner.info(`Undo: restored ${ok} member${ok === 1 ? '' : 's'}`);
        },
      } : undefined,
      duration: 10000,
    });
  };

  const supervisors = agents.filter((a) => a.tier_level === 1);
  const regularAgents = agents.filter((a) => a.tier_level !== 1);
  const availableExt = extensions.filter((e) => !agents.some((a) => a.extension_id === e.id));

  const syncing = status.state === 'running';
  const statusTone =
    status.state === 'success' ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400'
    : status.state === 'partial' ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
    : status.state === 'error' ? 'border-destructive/40 bg-destructive/10 text-destructive'
    : status.state === 'running' ? 'border-primary/40 bg-primary/10 text-primary'
    : 'border-border bg-muted/40 text-muted-foreground';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          Queue <span className="font-medium text-foreground">{queue.name}</span> · {agents.length} member{agents.length === 1 ? '' : 's'} · {extensions.length} extension{extensions.length === 1 ? '' : 's'} available ({availableExt.length} unassigned)
        </div>
        <div className="flex gap-2">
          {perms.canAssign && (
            <>
              <QuickAddBtn queueName={queue.name} extensions={availableExt} onAdd={addAgent} />
              <BulkAddBtn queueId={queue.id} queueName={queue.name} extensions={availableExt} supCount={supervisors.length} agCount={regularAgents.length} onAdd={bulkAdd} />
            </>
          )}
          <Button size="sm" variant="outline" onClick={resyncTiers} disabled={syncing}>
            {syncing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />} Resync from PBX
          </Button>
        </div>
      </div>

      {status.state !== 'idle' && (
        <div className={`rounded-md border px-3 py-2 text-xs flex items-start gap-2 ${statusTone}`}>
          {status.state === 'running' && <Loader2 className="w-4 h-4 mt-0.5 animate-spin shrink-0" />}
          {status.state === 'success' && <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
          {status.state === 'partial' && <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          {status.state === 'error' && <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="font-medium">{status.message}</div>
            {status.details && <div className="font-mono opacity-80 break-all mt-0.5">{status.details}</div>}
            {(status.state === 'error' || status.state === 'partial') && (
              <Button size="sm" variant="outline" className="mt-2 h-7" onClick={resyncTiers} disabled={syncing}>
                <RefreshCw className="w-3 h-3 mr-1" /> Retry
              </Button>
            )}
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> : (
        <MembersTable
          queueId={queue.id}
          queueName={queue.name}
          supervisors={supervisors}
          agents={regularAgents}
          canAssign={perms.canAssign}
          onRemoveOne={removeAgent}
          onBulkRemove={bulkRemove}
          onEditOne={updateAgent}
          txt={txt}
        />
      )}
    </div>
  );
}

// localStorage-backed state hook
function usePersistedState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : initial; }
    catch { return initial; }
  });
  const set = (v: T) => { setVal(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch {} };
  return [val, set];
}

type SortKey = 'name' | 'extension' | 'role' | 'tier';
type SortDir = 'asc' | 'desc';

function MembersTable({ queueId, queueName, supervisors, agents, canAssign, onRemoveOne, onBulkRemove, onEditOne, txt }: any) {
  const baseKey = `qa:${queueId}`;
  const [query, setQuery] = usePersistedState<string>(`${baseKey}:q`, '');
  const [roleFilter, setRoleFilter] = usePersistedState<'all' | 'supervisor' | 'agent'>(`${baseKey}:role`, 'all');
  const [sortKey, setSortKey] = usePersistedState<SortKey>(`${baseKey}:sk`, 'name');
  const [sortDir, setSortDir] = usePersistedState<SortDir>(`${baseKey}:sd`, 'asc');
  const [page, setPage] = usePersistedState<number>(`${baseKey}:pg`, 0);
  const [pageSize, setPageSize] = usePersistedState<number>(`${baseKey}:ps`, 25);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const all = useMemo(() => {
    const sup = supervisors.map((a: any) => ({ ...a, _role: 'supervisor' }));
    const ag = agents.map((a: any) => ({ ...a, _role: 'agent' }));
    return [...sup, ...ag];
  }, [supervisors, agents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = all.filter((a) => {
      if (roleFilter !== 'all' && a._role !== roleFilter) return false;
      if (!q) return true;
      return (a.agent_name || '').toLowerCase().includes(q)
        || (a.agent_id || '').toString().toLowerCase().includes(q);
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    out.sort((a: any, b: any) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'extension': av = a.agent_id || ''; bv = b.agent_id || ''; break;
        case 'role': av = a._role; bv = b._role; break;
        case 'tier': av = (a.tier_level || 0) * 1000 + (a.tier_position || 0); bv = (b.tier_level || 0) * 1000 + (b.tier_position || 0); break;
        default: av = (a.agent_name || '').toLowerCase(); bv = (b.agent_name || '').toLowerCase();
      }
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return out;
  }, [all, query, roleFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const curPage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(curPage * pageSize, (curPage + 1) * pageSize);

  const allSelected = paged.length > 0 && paged.every((a) => selected[a.id]);
  const selectedRows = filtered.filter((a) => selected[a.id]);

  const toggleAll = () => {
    const next = { ...selected };
    if (allSelected) paged.forEach((a) => delete next[a.id]);
    else paged.forEach((a) => { next[a.id] = true; });
    setSelected(next);
  };

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  };

  const sortIcon = (k: SortKey) => sortKey === k
    ? <ArrowUpDown className={`w-3 h-3 ml-1 inline ${sortDir === 'desc' ? 'rotate-180' : ''} transition-transform`} />
    : <ArrowUpDown className="w-3 h-3 ml-1 inline opacity-30" />;

  const supCount = selectedRows.filter((r) => r._role === 'supervisor').length;
  const agCount = selectedRows.length - supCount;

  const resetFilters = () => { setQuery(''); setRoleFilter('all'); setSortKey('name'); setSortDir('asc'); setPage(0); };

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by name or extension…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} className="pl-8 h-9" />
            </div>
            <Select value={roleFilter} onValueChange={(v: any) => { setRoleFilter(v); setPage(0); }}>
              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All members</SelectItem>
                <SelectItem value="supervisor">Supervisors</SelectItem>
                <SelectItem value="agent">Agents</SelectItem>
              </SelectContent>
            </Select>
            {(query || roleFilter !== 'all' || sortKey !== 'name' || sortDir !== 'asc') && (
              <Button size="sm" variant="ghost" className="h-9" onClick={resetFilters}>Reset</Button>
            )}
          </div>
          {canAssign && selectedRows.length > 0 && (
            <Button size="sm" variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="w-4 h-4 mr-1" /> Remove {selectedRows.length}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {all.length === 0 ? `${txt.noAgents}` : 'No members match your filter.'}
          </p>
        ) : (
          <>
            <VirtualMembersTable
              rows={paged}
              canAssign={canAssign}
              selected={selected}
              setSelected={setSelected}
              onRemoveOne={onRemoveOne}
              onEditOne={onEditOne}
              supCount={supervisors.length}
              agCount={agents.length}
              allSelected={allSelected}
              toggleAll={toggleAll}
              sortKey={sortKey}
              sortDir={sortDir}
              toggleSort={toggleSort}
              sortIcon={sortIcon}
            />
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground flex-wrap gap-2">
              <div>{filtered.length} member{filtered.length === 1 ? '' : 's'} · page {curPage + 1}/{totalPages} <span className="opacity-60">(virtualized)</span></div>
              <div className="flex items-center gap-2">
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
                  <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100, 250, 500].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-8" disabled={curPage === 0} onClick={() => setPage(curPage - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                <Button size="sm" variant="outline" className="h-8" disabled={curPage >= totalPages - 1} onClick={() => setPage(curPage + 1)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      {/* Bulk remove preview + confirm */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selectedRows.length} member{selectedRows.length === 1 ? '' : 's'} from {queueName}?</AlertDialogTitle>
            <AlertDialogDescription>
              {supCount > 0 && <span><b>{supCount}</b> supervisor{supCount === 1 ? '' : 's'}</span>}
              {supCount > 0 && agCount > 0 && ' · '}
              {agCount > 0 && <span><b>{agCount}</b> agent{agCount === 1 ? '' : 's'}</span>}
              {' '}will be unassigned on FusionPBX. You can undo from the toast.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="border rounded max-h-64 overflow-y-auto text-sm divide-y">
            <div className="px-3 py-1.5 grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40 sticky top-0">
              <span className="col-span-5">Name</span>
              <span className="col-span-3">Role</span>
              <span className="col-span-2">Tier</span>
              <span className="col-span-2 text-right">Pos</span>
            </div>
            {selectedRows.slice(0, 100).map((r: any) => (
              <div key={r.id} className="px-3 py-1.5 grid grid-cols-12 gap-2 items-center">
                <span className="col-span-5 truncate">{r.agent_name} <span className="font-mono text-[10px] text-muted-foreground">· {r.agent_id}</span></span>
                <span className="col-span-3"><Badge variant={r._role === 'supervisor' ? 'default' : 'secondary'} className="text-[10px]">
                  {r._role === 'supervisor' ? <Shield className="w-3 h-3 mr-1" /> : <Users className="w-3 h-3 mr-1" />}{r._role}
                </Badge></span>
                <span className="col-span-2 text-xs text-muted-foreground">T{r.tier_level}</span>
                <span className="col-span-2 text-xs font-mono text-right text-muted-foreground">#{r.tier_position}</span>
              </div>
            ))}
            {selectedRows.length > 100 && <div className="px-3 py-1.5 text-xs text-muted-foreground">…and {selectedRows.length - 100} more</div>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onBulkRemove(selectedRows); setSelected({}); setConfirmOpen(false); }}>
              Remove {selectedRows.length}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function VirtualMembersTable({ rows, canAssign, selected, setSelected, onRemoveOne, onEditOne, supCount, agCount, allSelected, toggleAll, sortKey, sortDir, toggleSort, sortIcon }: any) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 8,
  });
  const items = virtualizer.getVirtualItems();
  const total = virtualizer.getTotalSize();

  return (
    <div className="border rounded-md">
      <div className="grid grid-cols-[2rem_2fr_1fr_1fr_1fr_5rem] gap-2 px-3 py-2 text-xs font-medium border-b bg-muted/40 select-none">
        {canAssign ? <Checkbox checked={allSelected} onCheckedChange={toggleAll} /> : <span />}
        <span className="cursor-pointer" onClick={() => toggleSort('name')}>Name{sortIcon('name')}</span>
        <span className="cursor-pointer" onClick={() => toggleSort('extension')}>Extension{sortIcon('extension')}</span>
        <span className="cursor-pointer" onClick={() => toggleSort('role')}>Role{sortIcon('role')}</span>
        <span className="cursor-pointer" onClick={() => toggleSort('tier')}>Tier / Pos{sortIcon('tier')}</span>
        <span />
      </div>
      <div ref={parentRef} className="overflow-auto" style={{ maxHeight: 480 }}>
        <div style={{ height: total, position: 'relative', width: '100%' }}>
          {items.map((vi) => {
            const a = rows[vi.index];
            if (!a) return null;
            return (
              <div
                key={a.id}
                data-state={selected[a.id] ? 'selected' : undefined}
                className="grid grid-cols-[2rem_2fr_1fr_1fr_1fr_5rem] gap-2 px-3 items-center border-b text-sm data-[state=selected]:bg-muted/50 hover:bg-muted/30"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: vi.size, transform: `translateY(${vi.start}px)` }}
              >
                {canAssign ? (
                  <Checkbox checked={!!selected[a.id]} onCheckedChange={(v) => setSelected({ ...selected, [a.id]: !!v })} />
                ) : <span />}
                <span className="font-medium truncate">{a.agent_name}</span>
                <span className="font-mono text-xs">{a.agent_id}</span>
                <span>
                  <Badge variant={a._role === 'supervisor' ? 'default' : 'secondary'} className="text-[10px]">
                    {a._role === 'supervisor' ? <Shield className="w-3 h-3 mr-1" /> : <Users className="w-3 h-3 mr-1" />}
                    {a._role}
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground">T{a.tier_level} · #{a.tier_position}</span>
                {canAssign ? (
                  <div className="flex gap-0.5 justify-end">
                    {onEditOne && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(a)} title="Edit role / position">
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onRemoveOne(a)} title="Remove">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ) : <span />}
              </div>
            );
          })}
        </div>
      </div>

      {onEditOne && (
        <EditAgentDialog
          member={editing}
          onClose={() => setEditing(null)}
          supCount={supCount || 0}
          agCount={agCount || 0}
          onSave={async (next) => { await onEditOne(editing, next); setEditing(null); }}
        />
      )}
    </div>
  );
}

function EditAgentDialog({ member, onClose, onSave, supCount, agCount }: {
  member: any | null;
  onClose: () => void;
  onSave: (next: { role: 'agent' | 'supervisor'; tier_position: number }) => void | Promise<void>;
  supCount: number;
  agCount: number;
}) {
  const [role, setRole] = useState<'agent' | 'supervisor'>('agent');
  const [pos, setPos] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) {
      setRole(member._role === 'supervisor' || member.tier_level === 1 ? 'supervisor' : 'agent');
      setPos(member.tier_position || 1);
    }
  }, [member?.id]);

  const open = !!member;
  const origRole: 'agent' | 'supervisor' = member?._role === 'supervisor' || member?.tier_level === 1 ? 'supervisor' : 'agent';
  const origPos = member?.tier_position || 1;
  const dirty = role !== origRole || pos !== origPos;
  const maxPos = role === 'supervisor'
    ? Math.max(1, supCount + (origRole === 'supervisor' ? 0 : 1))
    : Math.max(1, agCount + (origRole === 'agent' ? 0 : 1));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit member</DialogTitle>
          <DialogDescription>
            {member?.agent_name} <span className="font-mono text-xs opacity-70">· ext {member?.agent_id}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Agent (tier 2)</SelectItem>
                <SelectItem value="supervisor">Supervisor (tier 1)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tier position</Label>
            <Input
              type="number"
              min={1}
              max={maxPos}
              value={pos}
              onChange={(e) => setPos(Math.max(1, parseInt(e.target.value) || 1))}
            />
            <p className="text-xs text-muted-foreground">
              Lower numbers are tried first. Range 1–{maxPos}.
            </p>
          </div>

          {dirty && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-1">
              <div className="font-medium">Preview</div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">T{origRole === 'supervisor' ? 1 : 2} · #{origPos}</Badge>
                <ArrowRight className="w-3 h-3" />
                <Badge className="text-[10px]">T{role === 'supervisor' ? 1 : 2} · #{pos}</Badge>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            disabled={!dirty || saving}
            onClick={async () => { setSaving(true); try { await onSave({ role, tier_position: pos }); } finally { setSaving(false); } }}
          >
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function BulkAddBtn({ queueId, queueName, extensions, supCount, agCount, onAdd }: { queueId: string; queueName: string; extensions: any[]; supCount: number; agCount: number; onAdd: (ids: string[], role: 'agent' | 'supervisor') => void }) {
  const baseKey = `qa:${queueId}:add`;
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [role, setRole] = usePersistedState<'agent' | 'supervisor'>(`${baseKey}:role`, 'agent');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return extensions;
    return extensions.filter((e) =>
      (e.extension || '').toLowerCase().includes(q)
      || extName(e).toLowerCase().includes(q));
  }, [extensions, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const curPage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(curPage * PAGE, (curPage + 1) * PAGE);

  const selectedIds = Object.keys(sel).filter((k) => sel[k]);
  const selectedExts = extensions.filter((e) => sel[e.id]);
  const allSelected = paged.length > 0 && paged.every((e) => sel[e.id]);
  const toggleAll = () => {
    const next = { ...sel };
    if (allSelected) paged.forEach((e) => delete next[e.id]);
    else paged.forEach((e) => { next[e.id] = true; });
    setSel(next);
  };

  const reset = () => { setSel({}); setQuery(''); setPage(0); };
  const handleClose = (v: boolean) => { setOpen(v); if (!v) reset(); };

  const doSubmit = () => {
    onAdd(selectedIds, role);
    setConfirmOpen(false); setOpen(false); reset();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogTrigger asChild><Button size="sm"><UserPlus className="w-4 h-4 mr-1" /> Add members</Button></DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add members to queue</DialogTitle>
            <DialogDescription>Select one or many extensions. Choose whether to add them as agents or supervisors.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Select value={role} onValueChange={(v: any) => setRole(v)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Add as Agent (T2)</SelectItem>
                  <SelectItem value="supervisor">Add as Supervisor (T1)</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search extension or name…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} className="pl-8" />
              </div>
            </div>
            <div className="border rounded-md max-h-[360px] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No available extensions match.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>
                      <TableHead>Extension</TableHead>
                      <TableHead>Display name</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((e) => (
                      <TableRow key={e.id} data-state={sel[e.id] ? 'selected' : undefined} className="cursor-pointer" onClick={() => setSel({ ...sel, [e.id]: !sel[e.id] })}>
                        <TableCell><Checkbox checked={!!sel[e.id]} onCheckedChange={(v) => setSel({ ...sel, [e.id]: !!v })} /></TableCell>
                        <TableCell className="font-mono">{e.extension}</TableCell>
                        <TableCell>{extName(e) || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <div>{filtered.length} extensions · page {curPage + 1}/{totalPages}</div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7" disabled={curPage === 0} onClick={() => setPage(curPage - 1)}><ChevronLeft className="w-3 h-3" /></Button>
                  <Button size="sm" variant="outline" className="h-7" disabled={curPage >= totalPages - 1} onClick={() => setPage(curPage + 1)}><ChevronRight className="w-3 h-3" /></Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <div className="text-xs text-muted-foreground mr-auto self-center">{selectedIds.length} selected</div>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={selectedIds.length === 0} onClick={() => setConfirmOpen(true)}>
              <UserPlus className="w-4 h-4 mr-1" /> Review & add {selectedIds.length || ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk add preview + confirm */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Add {selectedIds.length} {role === 'supervisor' ? 'supervisor' : 'agent'}{selectedIds.length === 1 ? '' : 's'} to {queueName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Will be assigned as <b>{role === 'supervisor' ? 'Supervisor (T1)' : 'Agent (T2)'}</b>, starting at position <b>#{(role === 'supervisor' ? supCount : agCount) + 1}</b>. Undo available from the toast.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="border rounded max-h-64 overflow-y-auto text-sm divide-y">
            <div className="px-3 py-1.5 grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40 sticky top-0">
              <span className="col-span-5">Name</span>
              <span className="col-span-3">Extension</span>
              <span className="col-span-2">Role</span>
              <span className="col-span-2 text-right">→ Pos</span>
            </div>
            {selectedExts.slice(0, 100).map((e: any, i: number) => {
              const pos = (role === 'supervisor' ? supCount : agCount) + i + 1;
              return (
                <div key={e.id} className="px-3 py-1.5 grid grid-cols-12 gap-2 items-center">
                  <span className="col-span-5 truncate">{extName(e) || "—"}</span>
                  <span className="col-span-3 font-mono text-xs text-muted-foreground">{e.extension}</span>
                  <span className="col-span-2"><Badge variant={role === 'supervisor' ? 'default' : 'secondary'} className="text-[10px]">
                    {role === 'supervisor' ? <Shield className="w-3 h-3 mr-1" /> : <Users className="w-3 h-3 mr-1" />}{role}
                  </Badge></span>
                  <span className="col-span-2 text-xs font-mono text-right flex items-center justify-end gap-1 text-muted-foreground">
                    <ArrowRight className="w-3 h-3" />#{pos}
                  </span>
                </div>
              );
            })}
            {selectedExts.length > 100 && <div className="px-3 py-1.5 text-xs text-muted-foreground">…and {selectedExts.length - 100} more</div>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={doSubmit}>
              Confirm add
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function QuickAddBtn({ queueName, extensions, onAdd }: { queueName: string; extensions: any[]; onAdd: (id: string, role: 'agent' | 'supervisor') => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<'agent' | 'supervisor'>('agent');
  const [selId, setSelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return extensions;
    return extensions.filter((e) =>
      (e.extension || '').toLowerCase().includes(q)
      || extName(e).toLowerCase().includes(q));
  }, [extensions, query]);

  const reset = () => { setQuery(''); setRole('agent'); setSelId(null); setSaving(false); };
  const handleClose = (v: boolean) => { setOpen(v); if (!v) reset(); };

  const doAdd = async () => {
    if (!selId) return;
    setSaving(true);
    try { await onAdd(selId, role); } finally { setSaving(false); }
    setOpen(false);
    reset();
  };

  const selectedExt = extensions.find((e) => e.id === selId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="w-4 h-4 mr-1" /> Quick add</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Quick add to {queueName}</DialogTitle>
          <DialogDescription>Select one extension and a role to add instantly.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={role} onValueChange={(v: any) => setRole(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">Agent (tier 2)</SelectItem>
              <SelectItem value="supervisor">Supervisor (tier 1)</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search extension or name…" value={query} onChange={(e) => { setQuery(e.target.value); setSelId(null); }} className="pl-8" />
          </div>
          <div className="border rounded-md max-h-[240px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No available extensions.</p>
            ) : (
              <div className="divide-y">
                {filtered.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSelId(e.id)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-muted/50 focus:outline-none focus:bg-muted/50 ${selId === e.id ? 'bg-muted' : ''}`}
                  >
                    <span>
                      <span className="font-mono text-xs text-muted-foreground mr-2">{e.extension}</span>
                      {extName(e) || '—'}
                    </span>
                    {selId === e.id && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedExt && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs flex items-center gap-2">
              <span className="font-medium">Adding:</span>
              <span>{extName(selectedExt)} <span className="font-mono text-muted-foreground">· {selectedExt.extension}</span></span>
              <Badge variant={role === 'supervisor' ? 'default' : 'secondary'} className="text-[10px] ml-auto">
                {role === 'supervisor' ? <Shield className="w-3 h-3 mr-1" /> : <Users className="w-3 h-3 mr-1" />}{role}
              </Badge>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button disabled={!selId || saving} onClick={doAdd}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Live stats ----------
function LiveStatsPanel({ queues }: { queues: any[] }) {
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const sync = usePbxSync();
  const PAGE_SIZE = 15;

  const load = async () => {
    setLoading(true); setError(null);
    const { data, error } = await supabase.from('cc_queue_stats' as any).select('*').eq('organization_id', LEMTEL_ORG);
    if (error) setError(error.message);
    setStats((data as any[]) || []); setLoading(false);
  };
  useEffect(() => { load(); const i = setInterval(load, 30_000); return () => clearInterval(i); }, []);

  const filtered = useMemo(
    () => stats.filter((s) => !filter || (s.queue_name || '').toLowerCase().includes(filter.toLowerCase())),
    [stats, filter],
  );
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Aggregate KPIs
  const totals = useMemo(() => filtered.reduce((acc, s) => ({
    waiting: acc.waiting + (s.calls_waiting || 0),
    answered: acc.answered + (s.calls_answered_today || 0),
    abandoned: acc.abandoned + (s.calls_abandoned_today || 0),
    agents: acc.agents + (s.agents_total || 0),
    available: acc.available + (s.agents_available || 0),
    longest: Math.max(acc.longest, s.longest_wait_seconds || 0),
  }), { waiting: 0, answered: 0, abandoned: 0, agents: 0, available: 0, longest: 0 }), [filtered]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Waiting" value={totals.waiting} highlight={totals.waiting > 0} />
        <Kpi label="Answered today" value={totals.answered} />
        <Kpi label="Abandoned" value={totals.abandoned} highlight={totals.abandoned > 0} />
        <Kpi label="Agents avail." value={`${totals.available}/${totals.agents}`} />
        <Kpi label="Longest wait" value={`${totals.longest}s`} />
        <Kpi label="Abandon rate" value={totals.answered + totals.abandoned > 0 ? `${Math.round((totals.abandoned / (totals.answered + totals.abandoned)) * 100)}%` : '—'} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div><CardTitle>Live Queue Stats</CardTitle><CardDescription>Refreshes every 30s · synced from FusionPBX</CardDescription></div>
          <div className="flex gap-2 items-center">
            <Input placeholder="Filter queue…" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }} className="w-48" />
            <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
            <Button size="sm" onClick={() => sync.mutate({ kind: 'all', resources: ['queues', 'queue-agents'] })} disabled={sync.isPending}>
              {sync.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />} Full sync
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-3">
              <AlertTriangle className="w-4 h-4" />
              <AlertTitle>Sync error</AlertTitle>
              <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
            </Alert>
          )}
          {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> :
            paged.length === 0 ? <p className="text-sm text-muted-foreground">No live stats yet — run a sync.</p> : (
            <>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Queue</TableHead><TableHead>Waiting</TableHead><TableHead>Longest wait</TableHead>
                  <TableHead>Answered</TableHead><TableHead>Abandoned</TableHead><TableHead>Avg handle</TableHead>
                  <TableHead>SLA</TableHead><TableHead>Agents avail/total</TableHead><TableHead>On call</TableHead><TableHead>Paused</TableHead>
                </TableRow></TableHeader>
                <TableBody>{paged.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">{q.queue_name}</TableCell>
                    <TableCell><Badge variant={q.calls_waiting > 0 ? 'destructive' : 'outline'}>{q.calls_waiting}</Badge></TableCell>
                    <TableCell>{q.longest_wait_seconds || 0}s</TableCell>
                    <TableCell>{q.calls_answered_today}</TableCell>
                    <TableCell>{q.calls_abandoned_today}</TableCell>
                    <TableCell>{q.avg_handle_time_seconds || 0}s</TableCell>
                    <TableCell>{q.service_level_percent}%</TableCell>
                    <TableCell>{q.agents_available}/{q.agents_total}</TableCell>
                    <TableCell>{q.agents_on_call || 0}</TableCell>
                    <TableCell>{q.agents_paused || 0}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex justify-between items-center mt-3 text-sm">
                  <span className="text-muted-foreground">Page {page + 1} of {totalPages} · {filtered.length} queues</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
                    <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold ${highlight ? 'text-destructive' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
