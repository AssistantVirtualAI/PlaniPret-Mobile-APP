import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Smartphone, Plus, Circle, Loader2, X, BellOff, PhoneForwarded, AlertCircle, Activity, Pencil, Trash2, RefreshCw, Monitor } from 'lucide-react';
import { usePbxExtensions, usePbxSoftphoneUsers, usePbxSyncJobs, LEMTEL_ORG } from '@/hooks/usePbxData';
import { PbxRefreshButton } from '@/components/lemtel/PbxRefreshButton';
import { SyncEverythingButton } from '@/components/lemtel/SyncEverythingButton';
import { ProvisionExtensionModal } from '@/components/lemtel/ProvisionExtensionModal';
import { EnableSoftphonePopover } from '@/components/lemtel/EnableSoftphonePopover';
import { ExtensionStatusDialog } from '@/components/lemtel/ExtensionStatusDialog';
import { ExtensionEditDialog } from '@/components/lemtel/ExtensionEditDialog';
import ExtensionActionsMenu from '@/components/lemtel/ExtensionActionsMenu';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

type ExtType = { label: string; cls: string };
function getExtensionType(e: any): ExtType {
  const num = String(e.extension ?? '');
  const desc = String(e.description ?? '').toLowerCase();
  const cid = String(e.effective_cid_name ?? '').toLowerCase();
  if (cid === 'ai' || desc.includes('ai')) return { label: '🤖 AI Agent', cls: 'bg-orange-500/15 text-orange-600 border-orange-500/30' };
  if (num.length === 10) return { label: '📱 Mobile DID', cls: 'bg-blue-500/15 text-blue-600 border-blue-500/30' };
  if (['door','kitchen','bedroom','basement','garage','cordless'].some(w => desc.includes(w)))
    return { label: '🏠 Residential', cls: 'bg-purple-500/15 text-purple-600 border-purple-500/30' };
  const n = parseInt(num);
  if ((n >= 200 && n <= 299) || n >= 1000)
    return { label: '💼 Business', cls: 'bg-green-500/15 text-green-600 border-green-500/30' };
  return { label: '🔌 Extension', cls: 'bg-muted text-muted-foreground' };
}

const NOTABLE_AI_EXT = '5143122929';

export default function LemtelExtensions() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [statusExt, setStatusExt] = useState<any | null>(null);
  const [editExt, setEditExt] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [prefill, setPrefill] = useState<{ extension?: string; displayName?: string; outboundCid?: string } | undefined>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: extensions = [], isLoading, refetch } = usePbxExtensions();
  const { data: softphones = [] } = usePbxSoftphoneUsers();
  const { data: recentJobs = [] } = usePbxSyncJobs(50);
  const lastExtJob = (recentJobs as any[]).find(j => String(j.job_type || '').toLowerCase().includes('extension'));
  const [autoSyncing, setAutoSyncing] = useState(false);
  const softphoneByExt = useMemo(() => {
    const m = new Map<string, any>();
    (softphones as any[]).forEach(s => m.set(String(s.extension), s));
    return m;
  }, [softphones]);
  const all = extensions as any[];

  // Auto-resync once when the table is empty (first visit after deploy / cache miss).
  useEffect(() => {
    if (!isLoading && all.length === 0 && !autoSyncing) {
      setAutoSyncing(true);
      (async () => {
        try {
          // Guard: only attempt when a real user session exists, otherwise
          // the proxy will 401 (anon key is not accepted) and surface as a
          // blank screen via the global error boundary.
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) return;
          const { error } = await supabase.functions.invoke('fusionpbx-proxy', {
            body: { action: 'sync-extensions', organization_id: LEMTEL_ORG },
          });
          if (!error) { queryClient.invalidateQueries({ queryKey: ['pbx'] }); refetch(); }
        } catch (e) {
          console.warn('[LemtelExtensions] auto-sync skipped:', e);
        } finally {
          setAutoSyncing(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, all.length]);

  const runManualSync = async () => {
    setAutoSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'sync-extensions', organization_id: LEMTEL_ORG },
      });
      if (error) throw error;
      toast({ title: 'Sync complete', description: `Fetched ${(data as any)?.fetched ?? 0}, upserted ${(data as any)?.upserted ?? 0}` });
      queryClient.invalidateQueries({ queryKey: ['pbx'] });
      refetch();
    } catch (e: any) {
      toast({ title: 'Sync failed', description: e?.message || String(e), variant: 'destructive' });
    } finally { setAutoSyncing(false); }
  };


  const handleDelete = async (e: any) => {
    if (!confirm(`Delete extension ${e.extension}? This removes it from FusionPBX.`)) return;
    setDeletingId(e.id);
    try {
      const { error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'delete-extension', extension_uuid: e.pbx_uuid, extension: e.extension },
      });
      if (error) throw error;
      toast({ title: 'Extension deleted' });
      queryClient.invalidateQueries({ queryKey: ['pbx'] });
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message || String(err), variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    const create = searchParams.get('create');
    if (create) {
      setPrefill({
        extension: create,
        displayName: searchParams.get('name') || '',
        outboundCid: searchParams.get('cid') || undefined,
      });
      setProvisionOpen(true);
      searchParams.delete('create'); searchParams.delete('name'); searchParams.delete('cid');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const s: Record<string, number> = {};
    all.forEach(e => { const t = getExtensionType(e).label; s[t] = (s[t] ?? 0) + 1; });
    return s;
  }, [all]);

  const exts = all.filter(e => {
    if (typeFilter && getExtensionType(e).label !== typeFilter) return false;
    if (!search) return true;
    return e.extension?.includes(search) ||
      e.effective_cid_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.description?.toLowerCase().includes(search.toLowerCase());
  });

  const lastSync = useMemo(() => {
    const dates = all.map(e => e.synced_at).filter(Boolean).sort().reverse();
    return dates[0] ? { iso: dates[0], rel: formatDistanceToNow(new Date(dates[0]), { addSuffix: true }) } : null;
  }, [all]);
  const syncStale = lastSync ? (Date.now() - new Date(lastSync.iso).getTime()) / 60000 > 30 : false;

  // Auto-clear type filter if it accidentally hides everything
  useEffect(() => {
    if (typeFilter && all.length > 0) {
      const visible = all.filter(e => getExtensionType(e).label === typeFilter).length;
      if (visible === 0) setTypeFilter(null);
    }
  }, [typeFilter, all]);

  // Diagnostic: fetch access info when list is empty
  const [diag, setDiag] = useState<any>(null);
  useEffect(() => {
    if (!isLoading && all.length === 0) {
      (supabase.rpc as any)('audit_my_pbx_extensions_access', { _org_id: LEMTEL_ORG })
        .then(({ data }: any) => setDiag(data));
    }
  }, [isLoading, all.length]);

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Smartphone className="w-7 h-7" /> Extensions</h1>
          <p className="text-muted-foreground">
            Last synced {lastSync?.rel ?? 'never'}
            {syncStale && <span className="ml-2 text-orange-600">⚠️ may be outdated</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><a href="/org/lemtel/admin/pbx-users">PBX Users →</a></Button>
          <PbxRefreshButton kind="config" />
          <SyncEverythingButton />
          <Button onClick={() => setProvisionOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Extension</Button>
        </div>
      </div>
      <ProvisionExtensionModal open={provisionOpen} onOpenChange={(v) => { setProvisionOpen(v); if (!v) setPrefill(undefined); }} prefill={prefill} />

      <div className="flex flex-wrap gap-2 items-center">
        {Object.entries(stats).map(([k, v]) => {
          const active = typeFilter === k;
          return (
            <button key={k} onClick={() => setTypeFilter(active ? null : k)}
              className={`text-sm py-1 px-3 rounded-md border transition ${active ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:bg-muted'}`}>
              {k}: {v}
            </button>
          );
        })}
        <Badge variant="default" className="text-sm py-1 px-3">Total: {all.length}</Badge>
        {typeFilter && (
          <Button size="sm" variant="ghost" onClick={() => setTypeFilter(null)} className="h-7">
            <X className="w-3 h-3 mr-1" /> Clear filter
          </Button>
        )}
      </div>

      {!isLoading && all.length === 0 && (
        <Card className="border-orange-500/40 bg-orange-500/5">
          <CardContent className="py-4 flex items-center justify-between gap-4">
            <div className="text-sm">
              <div className="font-semibold">No extensions in database for Lemtel domain.</div>
              <div className="text-muted-foreground">
                {lastExtJob
                  ? <>Last <code>{lastExtJob.job_type}</code> job: <strong>{lastExtJob.status}</strong> · fetched {lastExtJob.fetched ?? 0} · upserted {lastExtJob.upserted ?? 0}{lastExtJob.error && <> · <span className="text-red-600">{String(lastExtJob.error).slice(0,200)}</span></>}</>
                  : 'No recent sync job found.'}
              </div>
              {diag && (
                <div className="text-xs mt-2 text-muted-foreground">
                  Signed in as <strong>{diag.email}</strong> · super_admin={String(diag.is_super_admin)} · lemtel_admin={String(diag.is_lemtel_admin)} · lemtel_member={String(diag.is_lemtel_member)} · rows in org: <strong>{diag.total_in_org}</strong> · visible to you: <strong>{diag.visible_to_me}</strong>
                  {diag.total_in_org > 0 && diag.visible_to_me === 0 && (
                    <div className="text-red-600 mt-1">⚠ Rows exist but RLS blocks you — your account isn't a Lemtel member.</div>
                  )}
                </div>
              )}
            </div>
            <Button onClick={runManualSync} disabled={autoSyncing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${autoSyncing ? 'animate-spin' : ''}`} />
              Resync from PBX
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>{exts.length} extensions</CardTitle></CardHeader>
        <CardContent>
          <Input className="mb-4 max-w-sm" placeholder="Search extension, name..." value={search} onChange={e => setSearch(e.target.value)} />
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
            ))}</div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ext</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Display Name</TableHead>
                <TableHead>Caller ID</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead>Voicemail</TableHead>
                <TableHead>Softphone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Health</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exts.map((e: any) => {
                const t = getExtensionType(e);
                const notable = String(e.extension) === NOTABLE_AI_EXT;
                return (
                  <TableRow key={e.id} className={notable ? 'border-l-4 border-l-orange-500' : ''}>
                    <TableCell className="font-mono font-bold">
                      {notable ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1">{e.extension}<AlertCircle className="w-3 h-3 text-orange-500" /></span>
                          </TooltipTrigger>
                          <TooltipContent>AI Voice Agent — verify ElevenLabs connection</TooltipContent>
                        </Tooltip>
                      ) : e.extension}
                    </TableCell>
                    <TableCell><Badge variant="outline" className={t.cls}>{t.label}</Badge></TableCell>
                    <TableCell>{e.effective_cid_name || e.description || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.effective_cid_number || '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {e.do_not_disturb && (
                          <Tooltip><TooltipTrigger><BellOff className="w-4 h-4 text-muted-foreground" /></TooltipTrigger>
                            <TooltipContent>Do Not Disturb</TooltipContent></Tooltip>
                        )}
                        {e.forward_user_not_registered_enabled && (
                          <Tooltip><TooltipTrigger><PhoneForwarded className="w-4 h-4 text-blue-500" /></TooltipTrigger>
                            <TooltipContent>Forwarded to {e.forward_user_not_registered_destination || '—'}</TooltipContent></Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{e.voicemail_enabled ? <Badge variant="secondary">On</Badge> : <Badge variant="outline">Off</Badge>}</TableCell>
                    <TableCell>
                      {(() => {
                        const sp = softphoneByExt.get(String(e.extension));
                        if (!sp) {
                          return (
                            <EnableSoftphonePopover
                              extensionId={e.id}
                              extension={String(e.extension)}
                              defaultDisplayName={e.effective_cid_name || e.description || ''}
                            />
                          );
                        }
                        const d = sp.desktop_access_enabled !== false;
                        const m = sp.mobile_access_enabled !== false;
                        return (
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className={d ? 'bg-green-500/15 text-green-600 border-green-500/30' : 'bg-muted text-muted-foreground'}>
                              <Monitor className="w-3 h-3 mr-1" />{d ? 'Desktop' : 'Desktop off'}
                            </Badge>
                            <Badge variant="outline" className={m ? 'bg-green-500/15 text-green-600 border-green-500/30' : 'bg-muted text-muted-foreground'}>
                              <Smartphone className="w-3 h-3 mr-1" />{m ? 'Mobile' : 'Mobile off'}
                            </Badge>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-sm">
                        <Circle className={`w-2.5 h-2.5 ${e.enabled ? 'fill-green-500 text-green-500' : 'fill-muted text-muted'}`} />
                        {e.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant={e.pbx_uuid ? 'ghost' : 'outline'} onClick={() => setStatusExt(e)}
                        className={!e.pbx_uuid ? 'border-orange-500/40 text-orange-600' : ''}>
                        <Activity className="w-3.5 h-3.5 mr-1" />
                        {e.pbx_uuid ? 'Status' : 'Not pushed'}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" onClick={() => setEditExt(e)}>
                          <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                        </Button>
                        <ExtensionActionsMenu ext={{ id: e.id, extension: String(e.extension), organization_id: e.organization_id, effective_cid_name: e.effective_cid_name, description: e.description }} />
                        <Button size="sm" variant="outline" className="text-red-600 border-red-500/30 hover:bg-red-500/10"
                          disabled={deletingId === e.id} onClick={() => handleDelete(e)}>
                          {deletingId === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
      <ExtensionStatusDialog open={!!statusExt} onOpenChange={(v) => !v && setStatusExt(null)} ext={statusExt} />
      <ExtensionEditDialog open={!!editExt} onOpenChange={(v) => !v && setEditExt(null)} extension={editExt} />
      <p className="text-xs text-muted-foreground text-right">Press R to refresh</p>
    </div>
    </TooltipProvider>
  );
}
