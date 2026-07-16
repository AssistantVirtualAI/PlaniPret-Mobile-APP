import { useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X } from 'lucide-react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Globe, Loader2, RefreshCw, LogIn, Link2, Trash2, Power, Mail, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { RecordingWavePlayer } from '@/components/portal/RecordingWavePlayer';
import { formatDistanceToNow } from 'date-fns';
import { loadPbxRecordingAudio } from '@/lib/pbxRecordingAudio';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { IvrCreateDialog } from '@/components/lemtel/IvrCreateDialog';
import { RingGroupCreateDialog } from '@/components/lemtel/RingGroupCreateDialog';
import { QueueCreateDialog } from '@/components/lemtel/QueueCreateDialog';
import { PhoneNumbersTab } from '@/components/lemtel/PhoneNumbersTab';
import { IvrOptionsDialog } from '@/components/lemtel/IvrOptionsDialog';
import { ExtensionsPanel, type LiveState } from '@/components/lemtel/ExtensionsPanel';
import { PbxRowEditDialog } from '@/components/lemtel/PbxRowEditDialog';
import { DeviceCreateDialog } from '@/components/lemtel/DeviceCreateDialog';
import { LEMTEL_ORG_ID } from '@/hooks/useLemtelAccess';

async function pbxList(action: string, domain_uuid: string) {
  const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
    body: { action, domain_uuid },
  });
  if (error) throw error;
  return data?.data || data?.[Object.keys(data || {})[0]] || [];
}



export default function CustomerDetail() {
  const { domainUuid = '' } = useParams();
  const qc = useQueryClient();
  const impersonation = useImpersonation();
  const [tab, setTab] = useState('extensions');
  const [recUrls, setRecUrls] = useState<Record<string, string>>({});
  const [recLoading, setRecLoading] = useState<string | null>(null);
  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  const [ivrOpen, setIvrOpen] = useState(false);
  const [manageIvr, setManageIvr] = useState<any | null>(null);
  const [rgOpen, setRgOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deviceCreateOpen, setDeviceCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<{ kind: 'queue' | 'ringgroup' | 'device' | 'destination'; row: any } | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'org_admin' | 'manager'>('org_admin');

  const { data: domain } = useQuery({
    queryKey: ['fpbx', 'domain', domainUuid],
    queryFn: async () => {
      const list = await pbxList('list-domains', domainUuid);
      return (list as any[]).find(d => d.domain_uuid === domainUuid) || null;
    },
  });

  const { data: org } = useQuery({
    queryKey: ['org', 'by-domain', domainUuid],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc('get_org_by_fusionpbx_domain', { _domain_uuid: domainUuid });
      return Array.isArray(data) ? data[0] : data;
    },
  });

  const orgId = org?.id || LEMTEL_ORG_ID;

  // Live PBX data per tab
  const { data: extensions = [], refetch: refetchExt, isLoading: loadingExt } = useQuery({
    queryKey: ['fpbx', 'extensions', domainUuid],
    queryFn: () => pbxList('list-extensions', domainUuid),
    enabled: !!domain,
  });
  const liveExtState: LiveState = { exts: (extensions as any[]) || [] };

  const { data: ivrs = [], refetch: refetchIvrs } = useQuery({
    queryKey: ['fpbx', 'ivrs', domainUuid],
    queryFn: () => pbxList('list-ivrs', domainUuid),
    enabled: tab === 'ivr' && !!domain,
  });
  const { data: queues = [], refetch: refetchQueues } = useQuery({
    queryKey: ['fpbx', 'queues', domainUuid],
    queryFn: () => pbxList('list-queues', domainUuid),
    enabled: (tab === 'queues' || tab === 'ivr' || tab === 'numbers') && !!domain,
  });
  const { data: ringGroups = [], refetch: refetchRG } = useQuery({
    queryKey: ['fpbx', 'rg', domainUuid],
    queryFn: () => pbxList('list-ring-groups', domainUuid),
    enabled: (tab === 'ringgroups' || tab === 'ivr' || tab === 'numbers') && !!domain,
  });
  const { data: devices = [], refetch: refetchDevices } = useQuery({
    queryKey: ['fpbx', 'devices', domainUuid],
    queryFn: () => pbxList('list-devices', domainUuid),
    enabled: tab === 'devices' && !!domain,
  });
  const { data: destinations = [], refetch: refetchDest } = useQuery({
    queryKey: ['fpbx', 'destinations', domainUuid],
    queryFn: () => pbxList('list-destinations', domainUuid),
    enabled: tab === 'destinations' && !!domain,
  });
  const { data: moh = [] } = useQuery({
    queryKey: ['fpbx', 'moh', domainUuid],
    queryFn: () => pbxList('list-moh', domainUuid),
    enabled: tab === 'moh' && !!domain,
  });

  const { data: recordings = [] } = useQuery({
    queryKey: ['cdr', 'recordings', domainUuid],
    queryFn: async () => {
      const { data } = await (supabase as any).from('pbx_call_records')
        .select('id,start_at,duration_seconds,caller_number,destination_number,extension,recording_path,recording_name,pbx_uuid,domain_uuid,domain_name')
        .eq('domain_uuid', domainUuid)
        .eq('has_recording', true)
        .order('start_at', { ascending: false })
        .limit(200);
      return data || [];
    },
    enabled: tab === 'recordings' && !!domainUuid,
  });

  const { data: callHistory = [] } = useQuery({
    queryKey: ['cdr', 'history', domainUuid],
    queryFn: async () => {
      const { data } = await (supabase as any).from('pbx_call_records')
        .select('id,start_at,duration_seconds,caller_number,destination_number,extension,hangup_cause,direction')
        .eq('domain_uuid', domainUuid)
        .order('start_at', { ascending: false })
        .limit(200);
      return data || [];
    },
    enabled: tab === 'history' && !!domainUuid,
  });

  // Per-tenant sync status: latest pbx_sync_jobs per job_type for this org.
  const { data: syncStatus = [] } = useQuery({
    queryKey: ['pbx-sync-jobs', orgId, domainUuid],
    queryFn: async () => {
      const { data } = await (supabase as any).from('pbx_sync_jobs')
        .select('job_type,status,completed_at,started_at,error,stats')
        .eq('organization_id', orgId)
        .order('started_at', { ascending: false })
        .limit(80);
      return data || [];
    },
    enabled: !!orgId,
    refetchInterval: syncing ? 3000 : false,
  });
  const latestPerResource = useMemo(() => {
    const out: Record<string, any> = {};
    for (const j of syncStatus as any[]) if (!out[j.job_type]) out[j.job_type] = j;
    return out;
  }, [syncStatus]);



  // Search / filter state for Call History & Recordings
  const [histQ, setHistQ] = useState('');
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');
  const [histExt, setHistExt] = useState('all');
  const [recQ, setRecQ] = useState('');
  const [recFrom, setRecFrom] = useState('');
  const [recTo, setRecTo] = useState('');
  const [recExt, setRecExt] = useState('all');

  const applyFilters = (rows: any[], q: string, from: string, to: string, ext: string) => {
    const needle = q.trim().toLowerCase();
    const fromTs = from ? new Date(from).getTime() : null;
    const toTs = to ? new Date(to).getTime() + 86_400_000 : null;
    return rows.filter((r: any) => {
      if (ext !== 'all' && String(r.extension ?? '') !== ext) return false;
      if (fromTs && new Date(r.start_at).getTime() < fromTs) return false;
      if (toTs && new Date(r.start_at).getTime() > toTs) return false;
      if (needle) {
        const hay = `${r.caller_number ?? ''} ${r.destination_number ?? ''} ${r.extension ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  };

  const extOptions = useMemo(() => {
    const list = (extensions as any[]).map((e: any) => String(e.extension)).filter(Boolean);
    return Array.from(new Set(list)).sort();
  }, [extensions]);

  const filteredHistory = useMemo(
    () => applyFilters(callHistory as any[], histQ, histFrom, histTo, histExt),
    [callHistory, histQ, histFrom, histTo, histExt],
  );
  const filteredRecordings = useMemo(
    () => applyFilters(recordings as any[], recQ, recFrom, recTo, recExt),
    [recordings, recQ, recFrom, recTo, recExt],
  );


  const syncAll = async () => {
    setSyncing(true);
    toast.loading('Syncing all resources from PBX…', { id: 'sync' });
    try {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: {
          action: 'sync-all',
          resources: ['extensions', 'devices', 'ivrs', 'queues', 'ring_groups', 'gateways', 'destinations', 'users', 'cdrs'],
          organization_id: orgId,
          domain_uuid: domainUuid,
        },
      });
      if (error) throw error;
      // Best-effort additional syncs
      await Promise.allSettled([
        supabase.functions.invoke('fusionpbx-proxy', { body: { action: 'sync-ivr-options', organization_id: orgId, domain_uuid: domainUuid } }),
        supabase.functions.invoke('fusionpbx-proxy', { body: { action: 'sync-voicemail-messages', organization_id: orgId, domain_uuid: domainUuid } }),
      ]);
      const stats = (data as any)?.stats || {};
      const parts = Object.entries(stats).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${v} ${k}`);
      toast.success(parts.length ? `Synced: ${parts.join(', ')}` : 'Sync complete', { id: 'sync' });
      qc.invalidateQueries({ queryKey: ['fpbx'] });
      qc.invalidateQueries({ queryKey: ['cdr'] });
    } catch (e: any) {
      toast.error(e?.message || 'Sync failed', { id: 'sync' });
    } finally {
      setSyncing(false);
    }
  };

  const auditTenant = async (action: 'lemtel.open_tenant_portal' | 'lemtel.impersonate_tenant', metadata: Record<string, any>) => {
    try {
      await supabase.functions.invoke('audit-log', {
        body: { action, resource_id: domainUuid, metadata },
      });
    } catch { /* non-blocking */ }
  };

  const openTenantPortal = async () => {
    if (!domain) { toast.error('Domain not loaded'); return; }
    sessionStorage.setItem('lemtel.activeDomain', JSON.stringify({
      uuid: domainUuid, name: domain.domain_name, org_id: org?.id || null,
    }));
    await auditTenant('lemtel.open_tenant_portal', {
      domain_uuid: domainUuid, domain_name: domain.domain_name, target_org_id: org?.id || null,
    });
    if (org) {
      await auditTenant('lemtel.impersonate_tenant', { domain_uuid: domainUuid, target_org_id: org.id });
      await impersonation.enter(org.id, org.name);
      toast.success(`Now managing ${domain.domain_name}`);
      window.location.href = org.slug ? `/domain/${org.slug}/admin/dashboard` : '/console';
    } else {
      window.open(`/c/${encodeURIComponent(domain.domain_name)}`, '_blank', 'noopener');
    }
  };






  const copyPortalLink = () => {
    if (!domain) return;
    const url = `${window.location.origin}/c/${encodeURIComponent(domain.domain_name)}`;
    navigator.clipboard.writeText(url);
    toast.success('Portal link copied');
  };

  const handleInvite = async () => {
    if (!org || !inviteEmail) { toast.error('Email + linked tenant required'); return; }
    const { error } = await supabase.functions.invoke('customer-invite-admin', {
      body: { organizationId: org.id, email: inviteEmail, role: inviteRole },
    });
    if (error) return toast.error(error.message);
    toast.success(`Invite sent · ${inviteRole}`);
    setInviteOpen(false);
    setInviteEmail('');
  };

  // Generic per-row PBX write
  const pbxWrite = async (action: string, params: any, label: string) => {
    try {
      const { error } = await supabase.functions.invoke('pbx-write', {
        body: { organizationId: orgId, action, params: { domain_uuid: domainUuid, ...params } },
      });
      if (error) throw error;
      toast.success(label);
      return true;
    } catch (e: any) {
      toast.error(e?.message || 'Action failed');
      return false;
    }
  };

  const fetchRecording = async (r: any) => {
    if (recUrls[r.id]) return recUrls[r.id];
    if (!r.pbx_uuid && !(r.recording_path && r.recording_name)) { toast.error('Missing recording metadata'); return; }
    setRecLoading(r.id);
    try {
      const url = await loadPbxRecordingAudio(r, orgId);
      setRecUrls(s => ({ ...s, [r.id]: url }));
      return url;
    } catch (e: any) {
      toast.error('Recording load failed: ' + (e?.message || ''));
    } finally { setRecLoading(null); }
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/org/lemtel/admin/customers" className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1 mb-1">
            <ArrowLeft className="w-3 h-3" /> All customers
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="w-6 h-6" /> {domain?.domain_name || domainUuid}
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-[10px]">Domain · {domain?.domain_name || domainUuid}</Badge>
            {org && <Badge variant="default" className="text-[10px]">Ava org · {org.name}</Badge>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={copyPortalLink}><Link2 className="w-4 h-4 mr-2" /> Portal link</Button>
          <Button variant="outline" size="sm" onClick={syncAll} disabled={syncing}>
            {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Full sync from PBX
          </Button>
          {org && (
            <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}><Mail className="w-4 h-4 mr-2" /> Invite admin</Button>
          )}
          <Button size="sm" onClick={openTenantPortal}>
            <LogIn className="w-4 h-4 mr-2" /> Open tenant portal
          </Button>
        </div>
      </div>

      {/* Per-tenant sync status strip */}
      {Object.keys(latestPerResource).length > 0 && (
        <div className="flex items-center flex-wrap gap-1.5 text-[10px]">
          <span className="text-muted-foreground mr-1">Sync status:</span>
          {['extensions', 'devices', 'ivrs', 'queues', 'ring_groups', 'destinations', 'cdrs', 'recordings', 'moh'].map((r) => {
            const j = latestPerResource[r];
            const ok = j?.status === 'completed' || j?.status === 'success';
            const fail = j?.status === 'error' || j?.status === 'failed';
            return (
              <Badge
                key={r}
                variant={ok ? 'default' : fail ? 'destructive' : 'secondary'}
                title={j ? `${j.status}${j.error ? ' · ' + j.error : ''} · ${j.completed_at || j.started_at}` : 'never synced'}
              >
                {r}: {j ? j.status : '—'}
              </Badge>
            );
          })}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>

        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="inline-flex w-max min-w-full whitespace-nowrap">
            <TabsTrigger value="extensions">Extensions ({(extensions as any[]).length})</TabsTrigger>
            <TabsTrigger value="ivr">IVR ({(ivrs as any[]).length})</TabsTrigger>
            <TabsTrigger value="queues">Queues ({(queues as any[]).length})</TabsTrigger>
            <TabsTrigger value="ringgroups">Ring Groups ({(ringGroups as any[]).length})</TabsTrigger>
            <TabsTrigger value="devices">Devices ({(devices as any[]).length})</TabsTrigger>
            <TabsTrigger value="destinations">Destinations ({(destinations as any[]).length})</TabsTrigger>
            <TabsTrigger value="numbers">Phone Numbers</TabsTrigger>
            <TabsTrigger value="history">Call History</TabsTrigger>
            <TabsTrigger value="recordings">Recordings</TabsTrigger>
            <TabsTrigger value="moh">Music on Hold</TabsTrigger>
          </TabsList>
        </div>


        <TabsContent value="extensions">
          <Card><CardContent className="p-4">
            <ExtensionsPanel
              domainUuid={domainUuid}
              domainName={domain?.domain_name || ''}
              organizationId={orgId}
              live={liveExtState}
              loading={loadingExt}
              onChanged={() => refetchExt()}
            />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ivr" className="space-y-2">
          <div className="flex justify-end"><Button size="sm" onClick={() => setIvrOpen(true)}>+ New IVR</Button></div>
          {(!ivrs || (ivrs as any[]).length === 0) ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No IVR menus.</CardContent></Card>
          ) : (
            <>
              <EditableList
                rows={ivrs as any[]}
                idKey="ivr_menu_uuid"
                fields={['ivr_menu_name', 'ivr_menu_extension', 'ivr_menu_greet_long']}
                editableFields={['ivr_menu_name', 'ivr_menu_extension', 'ivr_menu_greet_long']}
                enabledKey="ivr_menu_enabled"
                onToggle={async (r, en) => { if (await pbxWrite('update-ivr', { ivr_menu_uuid: r.ivr_menu_uuid, ivr_menu_enabled: en ? 'true' : 'false' }, 'IVR updated')) refetchIvrs(); }}
                onSave={async (r, patch) => { const ok = await pbxWrite('update-ivr', { ivr_menu_uuid: r.ivr_menu_uuid, ...patch }, 'IVR saved'); if (ok) refetchIvrs(); return ok; }}


                onDelete={async (r) => { if (confirm(`Delete IVR ${r.ivr_menu_name}?`) && await pbxWrite('delete-ivr', { ivr_menu_uuid: r.ivr_menu_uuid }, 'IVR deleted')) refetchIvrs(); }}
              />
              <div className="flex flex-wrap gap-2 pt-2">
                {(ivrs as any[]).map((r: any) => (
                  <Button key={r.ivr_menu_uuid} size="sm" variant="outline" onClick={() => setManageIvr(r)}>
                    Options · {pretty(r.ivr_menu_name)}
                  </Button>
                ))}
              </div>
            </>
          )}
        </TabsContent>


        <TabsContent value="queues" className="space-y-2">
          <div className="flex justify-end"><Button size="sm" onClick={() => setQueueOpen(true)}>+ New Queue</Button></div>
          <EditableList
            rows={queues as any[]}
            idKey="queue_uuid"
            fields={['queue_name', 'queue_extension', 'queue_strategy']}
            editableFields={['queue_name', 'queue_extension', 'queue_strategy']}
            enabledKey="queue_enabled"
            onToggle={async (r, en) => { if (await pbxWrite('update-queue', { queue_uuid: r.queue_uuid, queue_enabled: en ? 'true' : 'false' }, 'Queue updated')) refetchQueues(); }}
            onSave={async (r, patch) => { const ok = await pbxWrite('update-queue', { queue_uuid: r.queue_uuid, ...patch }, 'Queue saved'); if (ok) refetchQueues(); return ok; }}
            onEditFull={(r) => setEditRow({ kind: 'queue', row: r })}
            onDelete={async (r) => { if (confirm(`Delete queue ${r.queue_name}?`) && await pbxWrite('delete-queue', { queue_uuid: r.queue_uuid }, 'Queue deleted')) refetchQueues(); }}
          />
        </TabsContent>

        <TabsContent value="ringgroups" className="space-y-2">
          <div className="flex justify-end"><Button size="sm" onClick={() => setRgOpen(true)}>+ New Ring Group</Button></div>
          <EditableList
            rows={ringGroups as any[]}
            idKey="ring_group_uuid"
            fields={['ring_group_name', 'ring_group_extension']}
            editableFields={['ring_group_name', 'ring_group_extension']}
            enabledKey="ring_group_enabled"
            onToggle={async (r, en) => { if (await pbxWrite('update-ring-group', { ring_group_uuid: r.ring_group_uuid, ring_group_enabled: en ? 'true' : 'false' }, 'Ring group updated')) refetchRG(); }}
            onSave={async (r, patch) => { const ok = await pbxWrite('update-ring-group', { ring_group_uuid: r.ring_group_uuid, ...patch }, 'Ring group saved'); if (ok) refetchRG(); return ok; }}
            onEditFull={(r) => setEditRow({ kind: 'ringgroup', row: r })}
            onDelete={async (r) => { if (confirm(`Delete ring group ${r.ring_group_name}?`) && await pbxWrite('delete-ring-group', { ring_group_uuid: r.ring_group_uuid }, 'Ring group deleted')) refetchRG(); }}
          />
        </TabsContent>

        <TabsContent value="devices" className="space-y-2">
          <div className="flex justify-end"><Button size="sm" onClick={() => setDeviceCreateOpen(true)}><Plus className="w-3 h-3 mr-1" /> New Device</Button></div>
          <EditableList
            rows={devices as any[]}
            idKey="device_uuid"
            fields={['device_mac_address', 'device_template', 'device_label']}
            editableFields={['device_template', 'device_label']}
            enabledKey="device_enabled"
            onToggle={async (r, en) => { if (await pbxWrite('update-device', { device_uuid: r.device_uuid, device_enabled: en ? 'true' : 'false' }, 'Device updated')) refetchDevices(); }}
            onSave={async (r, patch) => { const ok = await pbxWrite('update-device', { device_uuid: r.device_uuid, ...patch }, 'Device saved'); if (ok) refetchDevices(); return ok; }}
            onEditFull={(r) => setEditRow({ kind: 'device', row: r })}
            onDelete={async (r) => { if (confirm(`Delete device ${r.device_mac_address || r.device_uuid}?`) && await pbxWrite('delete-device', { device_uuid: r.device_uuid }, 'Device deleted')) refetchDevices(); }}
          />
        </TabsContent>

        <TabsContent value="destinations">
          <EditableList
            rows={destinations as any[]}
            idKey="destination_uuid"
            fields={['destination_number', 'destination_context', 'destination_actions']}
            editableFields={['destination_number', 'destination_context', 'destination_actions']}
            enabledKey="destination_enabled"
            onToggle={async (r, en) => { if (await pbxWrite('update-destination', { destination_uuid: r.destination_uuid, destination_enabled: en ? 'true' : 'false' }, 'Destination updated')) refetchDest(); }}
            onSave={async (r, patch) => { const ok = await pbxWrite('update-destination', { destination_uuid: r.destination_uuid, ...patch }, 'Destination saved'); if (ok) refetchDest(); return ok; }}
            onEditFull={(r) => setEditRow({ kind: 'destination', row: r })}
            onDelete={async (r) => { if (confirm(`Delete destination ${r.destination_number}?`) && await pbxWrite('delete-destination', { destination_uuid: r.destination_uuid }, 'Destination deleted')) refetchDest(); }}
          />
        </TabsContent>




        <TabsContent value="numbers">
          <PhoneNumbersTab domainUuid={domainUuid} domainName={domain?.domain_name || ''} organizationId={org?.id}
            extensions={extensions as any[]} ivrs={ivrs as any[]} ringGroups={ringGroups as any[]} />
        </TabsContent>

        <TabsContent value="history">
          <Card><CardContent className="p-4 space-y-3">
            <FilterBar q={histQ} setQ={setHistQ} from={histFrom} setFrom={setHistFrom} to={histTo} setTo={setHistTo}
              ext={histExt} setExt={setHistExt} extOptions={extOptions} count={filteredHistory.length} total={callHistory.length} />
            {filteredHistory.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {callHistory.length === 0 ? 'No call history. Run Full sync to pull CDRs.' : 'No records match the filters.'}
              </div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>When</TableHead><TableHead>Dir</TableHead><TableHead>From</TableHead><TableHead>To</TableHead>
                  <TableHead>Ext</TableHead><TableHead>Caller name</TableHead>
                  <TableHead className="text-right">Sec</TableHead><TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredHistory.map((c: any) => (
                    <CdrRow key={c.id} row={c} onChanged={() => qc.invalidateQueries({ queryKey: ['cdr', 'history', domainUuid] })} />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="recordings">
          <Card><CardContent className="space-y-2 p-4">
            <FilterBar q={recQ} setQ={setRecQ} from={recFrom} setFrom={setRecFrom} to={recTo} setTo={setRecTo}
              ext={recExt} setExt={setRecExt} extOptions={extOptions} count={filteredRecordings.length} total={recordings.length} />
            {filteredRecordings.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {recordings.length === 0 ? 'No recordings.' : 'No recordings match the filters.'}
              </p>
            )}
            {filteredRecordings.map((r: any) => (
              <RecordingRow
                key={r.id} row={r}
                expanded={expandedRec === r.id} url={recUrls[r.id]} loading={recLoading === r.id}
                onPlay={async () => { const u = await fetchRecording(r); if (u) setExpandedRec(expandedRec === r.id ? null : r.id); }}
                onChanged={() => qc.invalidateQueries({ queryKey: ['cdr', 'recordings', domainUuid] })}
              />
            ))}
          </CardContent></Card>
        </TabsContent>


        <TabsContent value="moh">
          <Card><CardContent className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground">MOH audio files are managed on the PBX server. Values shown are read-only.</p>
            {(!moh || (moh as any[]).length === 0) ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No MOH entries.</div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>Rate</TableHead><TableHead>Shuffle</TableHead><TableHead>Enabled</TableHead><TableHead>Path</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(moh as any[]).map((m: any) => (
                    <TableRow key={m.music_on_hold_uuid}>
                      <TableCell className="font-medium">{pretty(m.music_on_hold_name)}</TableCell>
                      <TableCell className="font-mono text-xs">{pretty(m.music_on_hold_rate)}</TableCell>
                      <TableCell className="text-xs">{pretty(m.music_on_hold_shuffle)}</TableCell>
                      <TableCell><Badge variant={normalize(m.music_on_hold_enabled) === 'true' ? 'default' : 'secondary'} className="text-[10px]">{normalize(m.music_on_hold_enabled) === 'true' ? 'on' : 'off'}</Badge></TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-[280px]">{pretty(m.music_on_hold_path)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>


      {domain && (
        <>
          <IvrCreateDialog open={ivrOpen} onOpenChange={setIvrOpen}
            domainUuid={domainUuid} domainName={domain.domain_name}
            extensions={extensions as any[]} ringGroups={ringGroups as any[]} queues={queues as any[]}
            onCreated={() => qc.invalidateQueries({ queryKey: ['fpbx', 'ivrs', domainUuid] })} />
          <RingGroupCreateDialog open={rgOpen} onOpenChange={setRgOpen}
            domainUuid={domainUuid} domainName={domain.domain_name}
            extensions={extensions as any[]}
            onCreated={() => qc.invalidateQueries({ queryKey: ['fpbx', 'rg', domainUuid] })} />
          <QueueCreateDialog open={queueOpen} onOpenChange={setQueueOpen}
            domainUuid={domainUuid} extensions={extensions as any[]}
            onCreated={() => qc.invalidateQueries({ queryKey: ['fpbx', 'queues', domainUuid] })} />
          <IvrOptionsDialog open={!!manageIvr} onOpenChange={(o) => !o && setManageIvr(null)}
            ivr={manageIvr} domainUuid={domainUuid} domainName={domain.domain_name}
            extensions={extensions as any[]} ringGroups={ringGroups as any[]} queues={queues as any[]} />
        </>
      )}

      {/* Generic full-fields editor for queues, ring groups, devices, destinations */}
      <PbxRowEditDialog
        open={!!editRow}
        onOpenChange={(o) => { if (!o) setEditRow(null); }}
        title={editRow ? `${domain?.domain_name || 'Tenant'} › ${editRow.kind} — all FusionPBX fields` : ''}
        row={editRow?.row}
        idKey={editRow ? ({
          queue: 'queue_uuid', ringgroup: 'ring_group_uuid',
          device: 'device_uuid', destination: 'destination_uuid',
        } as const)[editRow.kind] : 'id'}
        idValue={editRow ? editRow.row?.[({
          queue: 'queue_uuid', ringgroup: 'ring_group_uuid',
          device: 'device_uuid', destination: 'destination_uuid',
        } as const)[editRow.kind]] : undefined}
        updateAction={editRow ? ({
          queue: 'update-queue', ringgroup: 'update-ring-group',
          device: 'update-device', destination: 'update-destination',
        } as const)[editRow.kind] : ''}
        resourceKind={editRow ? ({
          queue: 'queue', ringgroup: 'ring_group',
          device: 'device', destination: 'destination',
        } as const)[editRow.kind] : undefined}
        organizationId={orgId}
        domainUuid={domainUuid}
        onSaved={() => {
          if (editRow?.kind === 'queue') refetchQueues();
          else if (editRow?.kind === 'ringgroup') refetchRG();
          else if (editRow?.kind === 'device') refetchDevices();
          else if (editRow?.kind === 'destination') refetchDest();
        }}
      />

      {/* New Device dialog — scoped strictly to current tenant domain */}
      <DeviceCreateDialog
        open={deviceCreateOpen}
        onOpenChange={setDeviceCreateOpen}
        organizationId={orgId}
        domainUuid={domainUuid}
        extensions={extensions as any[]}
        onCreated={async () => {
          // Trigger a devices-only PBX sync for this tenant, then refetch.
          try {
            await supabase.functions.invoke('fusionpbx-proxy', {
              body: { action: 'sync-all', resources: ['devices'], organization_id: orgId, domain_uuid: domainUuid },
            });
          } catch { /* non-fatal */ }
          qc.invalidateQueries({ queryKey: ['fpbx', 'devices', domainUuid] });
          refetchDevices();
        }}
      />



      {/* Invite admin dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite admin for {org?.name || 'tenant'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Email</Label><Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value.toLowerCase())} /></div>
            <div>
              <Label>Role</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Button type="button" variant={inviteRole === 'org_admin' ? 'default' : 'outline'} size="sm" onClick={() => setInviteRole('org_admin')}>org_admin</Button>
                <Button type="button" variant={inviteRole === 'manager' ? 'default' : 'outline'} size="sm" onClick={() => setInviteRole('manager')}>manager</Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Close</Button>
            <Button onClick={handleInvite}>Send invite</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function normalize(v: any): string {
  if (v === null || v === undefined || v === '') return '';
  if (v === true || v === 'true') return 'true';
  if (v === false || v === 'false') return 'false';
  return String(v);
}
function pretty(v: any): string {
  const n = normalize(v);
  return n === '' ? '—' : n;
}

function EditableList({
  rows, idKey, fields, enabledKey, editableFields, onToggle, onDelete, onSave, onEditFull,
}: {
  rows: any[]; idKey: string; fields: string[]; enabledKey: string;
  editableFields?: string[];
  onToggle: (row: any, enabled: boolean) => Promise<void>;
  onDelete: (row: any) => Promise<void>;
  onSave?: (row: any, patch: Record<string, string>) => Promise<boolean>;
  onEditFull?: (row: any) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const editable = editableFields ?? [];

  if (!rows || rows.length === 0) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Empty — try Full sync from PBX.</CardContent></Card>;
  }

  const startEdit = (r: any) => {
    setEditing(r[idKey]);
    const d: Record<string, string> = {};
    editable.forEach(f => { d[f] = normalize(r[f]); });
    setDraft(d);
  };
  const cancel = () => { setEditing(null); setDraft({}); };
  const save = async (r: any) => {
    if (!onSave) return;
    setBusy(r[idKey]);
    try {
      const patch: Record<string, string> = {};
      editable.forEach(f => {
        const next = (draft[f] ?? '').trim();
        if (next !== normalize(r[f])) patch[f] = next;
      });
      if (Object.keys(patch).length === 0) { cancel(); return; }
      const ok = await onSave(r, patch);
      if (ok) cancel();
    } finally { setBusy(null); }
  };

  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          {fields.map(f => <TableHead key={f}>{f.replace(/_/g, ' ')}</TableHead>)}
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => {
            const id = r[idKey];
            const en = normalize(r[enabledKey]) === 'true';
            const isBusy = busy === id;
            const isEditing = editing === id;
            return (
              <TableRow key={id}>
                {fields.map(f => (
                  <TableCell key={f} className="font-mono text-xs">
                    {isEditing && editable.includes(f) ? (
                      <Input value={draft[f] ?? ''} onChange={(e) => setDraft(d => ({ ...d, [f]: e.target.value }))} className="h-7 text-xs" />
                    ) : pretty(r[f]).slice(0, 80)}
                  </TableCell>
                ))}
                <TableCell><Badge variant={en ? 'default' : 'secondary'} className="text-[10px]">{en ? 'on' : 'off'}</Badge></TableCell>
                <TableCell className="text-right space-x-1 whitespace-nowrap">
                  {isEditing ? (
                    <>
                      <Button size="sm" variant="default" disabled={isBusy} onClick={() => save(r)}>
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={isBusy} onClick={cancel}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      {onEditFull && (
                        <Button size="sm" variant="outline" title="All FusionPBX fields" onClick={() => onEditFull(r)}>All fields</Button>
                      )}
                      {onSave && editable.length > 0 && (
                        <Button size="sm" variant="ghost" title="Quick edit" onClick={() => startEdit(r)}>Edit</Button>
                      )}
                      <Button size="sm" variant="ghost" title={en ? 'Disable' : 'Enable'} disabled={isBusy}
                        onClick={async () => { setBusy(id); try { await onToggle(r, !en); } finally { setBusy(null); } }}>
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                      </Button>
                      <Button size="sm" variant="ghost" title="Delete" disabled={isBusy}
                        onClick={async () => { setBusy(id); try { await onDelete(r); } finally { setBusy(null); } }}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}


function ReadOnlyList({ rows, fields }: { rows: any[]; fields: string[] }) {
  if (!rows || rows.length === 0) return <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Empty — try Full sync from PBX.</CardContent></Card>;
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>{fields.map(f => <TableHead key={f}>{f.replace(/_/g, ' ')}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.id || r.uuid || i}>
              {fields.map(f => <TableCell key={f} className="font-mono text-xs">{String(r[f] ?? '—')}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function FilterBar(props: {
  q: string; setQ: (v: string) => void;
  from: string; setFrom: (v: string) => void;
  to: string; setTo: (v: string) => void;
  ext: string; setExt: (v: string) => void;
  extOptions: string[];
  count: number; total: number;
}) {
  const { q, setQ, from, setFrom, to, setTo, ext, setExt, extOptions, count, total } = props;
  const dirty = q || from || to || ext !== 'all';
  return (
    <div className="flex flex-wrap items-end gap-2 border rounded-lg p-3 bg-muted/30">
      <div className="flex-1 min-w-[180px]">
        <Label className="text-xs text-muted-foreground">Phone / extension</Label>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number…" className="pl-7 h-9" />
        </div>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">From</Label>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[140px]" />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">To</Label>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[140px]" />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Device / Ext</Label>
        <Select value={ext} onValueChange={setExt}>
          <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All extensions</SelectItem>
            {extOptions.map((e) => <SelectItem key={e} value={e}>Ext {e}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {dirty && (
        <Button variant="ghost" size="sm" onClick={() => { setQ(''); setFrom(''); setTo(''); setExt('all'); }}>
          <X className="w-3 h-3 mr-1" /> Clear
        </Button>
      )}
      <div className="ml-auto text-xs text-muted-foreground self-center">
        {count} / {total}
      </div>
    </div>
  );
}

function CdrRow({ row, onChanged }: { row: any; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(normalize(row.caller_name));
  const [notes, setNotes] = useState(normalize(row.notes));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const { error } = await (supabase as any).from('pbx_call_records')
      .update({ caller_name: name || null, notes: notes || null }).eq('id', row.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Saved'); setEditing(false); onChanged();
  };
  const del = async () => {
    if (!confirm('Delete this record locally?')) return;
    setBusy(true);
    const { error } = await (supabase as any).from('pbx_call_records').delete().eq('id', row.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Deleted'); onChanged();
  };

  return (
    <TableRow>
      <TableCell className="text-xs">{row.start_at ? formatDistanceToNow(new Date(row.start_at), { addSuffix: true }) : '—'}</TableCell>
      <TableCell className="text-xs">{pretty(row.direction)}</TableCell>
      <TableCell className="font-mono text-xs">{pretty(row.caller_number)}</TableCell>
      <TableCell className="font-mono text-xs">{pretty(row.destination_number)}</TableCell>
      <TableCell className="font-mono text-xs">{pretty(row.extension)}</TableCell>
      <TableCell className="text-xs">
        {editing ? <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs" />
          : pretty(row.caller_name)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">{Math.round(row.duration_seconds ?? 0)}</TableCell>
      <TableCell className="text-xs">{pretty(row.hangup_cause)}</TableCell>
      <TableCell className="text-right space-x-1 whitespace-nowrap">
        {editing ? (
          <>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="h-7 text-xs inline-block w-32" />
            <Button size="sm" variant="default" disabled={busy} onClick={save}>{busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={del}><Trash2 className="w-3 h-3 text-destructive" /></Button>
          </>
        )}
      </TableCell>
    </TableRow>
  );
}

function RecordingRow({ row, expanded, url, loading, onPlay, onChanged }: {
  row: any; expanded: boolean; url?: string; loading: boolean;
  onPlay: () => void; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(normalize(row.caller_name));
  const [notes, setNotes] = useState(normalize(row.notes));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const { error } = await (supabase as any).from('pbx_call_records')
      .update({ caller_name: name || null, notes: notes || null }).eq('id', row.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Saved'); setEditing(false); onChanged();
  };
  const hide = async () => {
    if (!confirm('Hide this recording locally? (PBX file is kept)')) return;
    setBusy(true);
    const { error } = await (supabase as any).from('pbx_call_records')
      .update({ has_recording: false, recording_url: null }).eq('id', row.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Hidden'); onChanged();
  };

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm">
          <span className="font-medium">{pretty(row.caller_number)} → {pretty(row.destination_number)}</span>
          <span className="text-muted-foreground ml-2">
            {pretty(row.caller_name) !== '—' && `· ${pretty(row.caller_name)} `}
            Ext {pretty(row.extension)} · {Math.round(row.duration_seconds ?? 0)}s · {row.start_at ? formatDistanceToNow(new Date(row.start_at), { addSuffix: true }) : '—'}
          </span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={loading} onClick={onPlay}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : expanded ? 'Hide' : 'Play'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}>{editing ? 'Close' : 'Edit'}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={hide}><Trash2 className="w-3 h-3 text-destructive" /></Button>
        </div>
      </div>
      {editing && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div><Label className="text-xs">Caller name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" /></div>
          <div><Label className="text-xs">Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-8 text-xs" /></div>
          <div className="col-span-full flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={busy}>{busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}</Button>
          </div>
        </div>
      )}
      {pretty(row.notes) !== '—' && !editing && <p className="text-xs text-muted-foreground italic">📝 {row.notes}</p>}
      {expanded && url && <RecordingWavePlayer key={row.id} url={url} autoPlay />}
    </div>
  );
}
