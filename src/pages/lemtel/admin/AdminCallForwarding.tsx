import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Router, RefreshCw, Loader2, Save, Search, X, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminSkeletonRows, AdminEmptyState } from '@/components/admin/AdminSkeletonRows';
import { LEMTEL_ORG } from '@/hooks/usePbxData';

type DestKind = 'custom' | 'voicemail' | 'extension' | 'ring_group' | 'queue';
const PAGE_SIZE = 25;

function useDebounced<T>(value: T, delay = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

function DestinationPicker({
  value, onChange, extensions, ringGroups, queues, placeholder,
}: {
  value: string; onChange: (v: string) => void;
  extensions: any[]; ringGroups: any[]; queues: any[];
  placeholder?: string;
}) {
  const detect = (): DestKind => {
    if (!value) return 'custom';
    if (value.startsWith('*97') || value.startsWith('voicemail:')) return 'voicemail';
    if (extensions.some(e => e.extension === value)) return 'extension';
    if (ringGroups.some(r => r.extension === value)) return 'ring_group';
    if (queues.some(q => q.extension === value)) return 'queue';
    return 'custom';
  };
  const kind = detect();
  const list = kind === 'extension' ? extensions : kind === 'ring_group' ? ringGroups : kind === 'queue' ? queues : [];
  const emptyLabel = kind === 'extension' ? 'No extensions synced'
    : kind === 'ring_group' ? 'No ring groups synced'
    : kind === 'queue' ? 'No queues synced' : '';

  return (
    <div className="flex gap-1 items-center">
      <Select
        value={kind}
        onValueChange={(k: DestKind) => {
          if (k === 'voicemail') onChange('*97');
          else if (k === 'custom') onChange(value && !['*97'].includes(value) ? value : '');
          else onChange('');
        }}
      >
        <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="custom">Custom</SelectItem>
          <SelectItem value="voicemail">Voicemail</SelectItem>
          <SelectItem value="extension">Extension</SelectItem>
          <SelectItem value="ring_group">Ring group</SelectItem>
          <SelectItem value="queue">Queue</SelectItem>
        </SelectContent>
      </Select>
      {(kind === 'extension' || kind === 'ring_group' || kind === 'queue') ? (
        list.length === 0 ? (
          <span className="text-[10px] text-muted-foreground italic px-1">{emptyLabel}</span>
        ) : (
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Pick…" /></SelectTrigger>
            <SelectContent>
              {list.map((o: any) => (
                <SelectItem key={o.id} value={o.extension || ''}>
                  {o.extension} {o.name || o.display_name ? `— ${o.name || o.display_name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      ) : (
        <Input
          className="w-28 h-8 font-mono text-xs"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || (kind === 'voicemail' ? '*97' : 'Number…')}
          disabled={kind === 'voicemail'}
        />
      )}
    </div>
  );
}

export default function AdminCallForwarding() {
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput, 250);
  const [page, setPage] = useState(0);

  useEffect(() => { setPage(0); }, [search]);

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pbx-call-forwarding-admin'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pbx_call_forwarding').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const userIds = useMemo(() => rows.map((r: any) => r.user_id).filter(Boolean), [rows]);

  const { data: directory = {} } = useQuery({
    queryKey: ['cf-directory', userIds.join(',')],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const [{ data: profiles = [] }, { data: softphones = [] }] = await Promise.all([
        supabase.from('profiles').select('id, email, full_name').in('id', userIds),
        supabase.from('pbx_softphone_users').select('portal_user_id, extension, display_name').in('portal_user_id', userIds),
      ]);
      const map: Record<string, any> = {};
      for (const p of profiles as any[]) map[p.id] = { ...(map[p.id] || {}), ...p };
      for (const s of softphones as any[]) map[s.portal_user_id] = { ...(map[s.portal_user_id] || {}), extension: s.extension, display_name: s.display_name };
      return map;
    },
  });

  const { data: extensions = [] } = useQuery({
    queryKey: ['cf-extensions'],
    queryFn: async () => {
      const { data } = await supabase.from('pbx_extensions').select('id, extension, display_name').eq('organization_id', LEMTEL_ORG).order('extension');
      return data || [];
    },
    staleTime: 60_000,
  });
  const { data: ringGroups = [] } = useQuery({
    queryKey: ['cf-ring-groups'],
    queryFn: async () => {
      const { data } = await supabase.from('pbx_ring_groups').select('id, extension, name').eq('organization_id', LEMTEL_ORG).order('extension');
      return data || [];
    },
    staleTime: 60_000,
  });
  const { data: queues = [] } = useQuery({
    queryKey: ['cf-queues'],
    queryFn: async () => {
      const { data } = await supabase.from('pbx_call_queues').select('id, extension, name').eq('organization_id', LEMTEL_ORG).order('extension');
      return data || [];
    },
    staleTime: 60_000,
  });

  const val = (r: any, k: string) => edits[r.user_id]?.[k] ?? r[k];
  const setVal = (id: string, k: string, v: any) => setEdits(e => ({ ...e, [id]: { ...e[id], [k]: v } }));

  const save = async (r: any) => {
    setSavingId(r.user_id);
    try {
      const patch = edits[r.user_id];
      const { error } = await supabase.from('pbx_call_forwarding').update(patch).eq('user_id', r.user_id);
      if (error) throw error;
      try {
        await supabase.functions.invoke('fusionpbx-proxy', {
          body: { organization_id: LEMTEL_ORG, action: 'update-forwarding', params: { user_id: r.user_id, ...patch } },
        });
      } catch (e: any) {
        toast.warning(`Saved locally — PBX sync warning: ${e?.message || 'unknown'}`);
      }
      toast.success('Forwarding rule saved');
      setEdits(e => { const n = { ...e }; delete n[r.user_id]; return n; });
      refetch();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSavingId(null); }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return (rows as any[]).filter((r) => {
      const d = directory[r.user_id] || {};
      return [d.email, d.full_name, d.display_name, d.extension, r.user_id].some((v: any) => v && String(v).toLowerCase().includes(s));
    });
  }, [rows, directory, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4 w-full min-w-0">
      <AdminPageHeader
        icon={Router}
        title="Call Forwarding"
        subtitle="Per-user forwarding rules (always, busy, no-answer, offline, DND) — synced with FusionPBX."
        actions={
          <div className="flex gap-2 items-center">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search name, email, ext…"
                className="pl-8 pr-8 w-56 h-9"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Refresh
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle>
            {filtered.length} rule{filtered.length === 1 ? '' : 's'}
            {search && rows.length !== filtered.length && (
              <span className="text-sm font-normal text-muted-foreground ml-2">(of {rows.length})</span>
            )}
          </CardTitle>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-muted-foreground">Page {page + 1} / {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>User</TableHead>
              <TableHead>Always</TableHead><TableHead>To</TableHead>
              <TableHead>Busy</TableHead><TableHead>To</TableHead>
              <TableHead>No-ans</TableHead><TableHead>To / sec</TableHead>
              <TableHead>Offline</TableHead><TableHead>To</TableHead>
              <TableHead>DND</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? <AdminSkeletonRows rows={5} cols={11} /> :
                filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={11}>
                    {search ? (
                      <div className="text-center py-10 space-y-2">
                        <Inbox className="w-10 h-10 mx-auto text-muted-foreground/60" />
                        <div className="font-medium">No matches for "{search}"</div>
                        <div className="text-sm text-muted-foreground">Try a different name, email, or extension.</div>
                        <Button size="sm" variant="outline" onClick={() => setSearchInput('')}>Clear search</Button>
                      </div>
                    ) : (
                      <AdminEmptyState title="No forwarding rules" hint="Users haven't configured call forwarding yet." />
                    )}
                  </TableCell></TableRow>
                ) :
                paged.map((r: any) => {
                  const d = directory[r.user_id] || {};
                  return (
                  <TableRow key={r.user_id} className="hover:bg-muted/40">
                    <TableCell>
                      <div className="text-sm font-medium">{d.full_name || d.display_name || d.email || r.user_id.slice(0, 8) + '…'}</div>
                      <div className="text-xs text-muted-foreground flex gap-2 items-center">
                        {d.extension && <Badge variant="outline" className="font-mono text-[10px]">ext {d.extension}</Badge>}
                        {d.email && <span className="truncate max-w-[180px]">{d.email}</span>}
                      </div>
                    </TableCell>
                    <TableCell><Switch checked={!!val(r, 'always_enabled')} onCheckedChange={v => setVal(r.user_id, 'always_enabled', v)} /></TableCell>
                    <TableCell><DestinationPicker value={val(r, 'always_to') || ''} onChange={(v) => setVal(r.user_id, 'always_to', v)} extensions={extensions} ringGroups={ringGroups} queues={queues} /></TableCell>
                    <TableCell><Switch checked={!!val(r, 'busy_enabled')} onCheckedChange={v => setVal(r.user_id, 'busy_enabled', v)} /></TableCell>
                    <TableCell><DestinationPicker value={val(r, 'busy_to') || ''} onChange={(v) => setVal(r.user_id, 'busy_to', v)} extensions={extensions} ringGroups={ringGroups} queues={queues} /></TableCell>
                    <TableCell><Switch checked={!!val(r, 'no_answer_enabled')} onCheckedChange={v => setVal(r.user_id, 'no_answer_enabled', v)} /></TableCell>
                    <TableCell className="flex gap-1 items-center">
                      <DestinationPicker value={val(r, 'no_answer_to') || ''} onChange={(v) => setVal(r.user_id, 'no_answer_to', v)} extensions={extensions} ringGroups={ringGroups} queues={queues} />
                      <Input type="number" className="w-14 h-8" value={val(r, 'no_answer_seconds') ?? ''} onChange={e => setVal(r.user_id, 'no_answer_seconds', e.target.value ? parseInt(e.target.value) : null)} />
                    </TableCell>
                    <TableCell><Switch checked={!!val(r, 'offline_enabled')} onCheckedChange={v => setVal(r.user_id, 'offline_enabled', v)} /></TableCell>
                    <TableCell><DestinationPicker value={val(r, 'offline_to') || ''} onChange={(v) => setVal(r.user_id, 'offline_to', v)} extensions={extensions} ringGroups={ringGroups} queues={queues} /></TableCell>
                    <TableCell><Switch checked={!!val(r, 'dnd_enabled')} onCheckedChange={v => setVal(r.user_id, 'dnd_enabled', v)} /></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" disabled={!edits[r.user_id] || savingId === r.user_id} onClick={() => save(r)}>
                        {savingId === r.user_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
