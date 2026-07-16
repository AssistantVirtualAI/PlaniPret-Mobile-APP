import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pbxInvoke } from '@/lib/pbxInvoke';
import { useOrganization } from '@/context/OrganizationContext';
import { PhoneIncoming, RefreshCw, Search, Loader2, Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

type Dest = {
  destination_uuid: string;
  destination_number: string;
  destination_context?: string;
  destination_actions?: any;
  destination_data?: string;
  destination_enabled?: string | boolean;
  destination_description?: string;
};

type ActionKind = 'extension' | 'queue' | 'ivr' | 'ringgroup' | 'voicemail' | 'conference' | 'hangup' | 'custom';

const ACTION_LABELS: Record<ActionKind, string> = {
  extension: 'Extension',
  queue: 'Call Queue',
  ivr: 'IVR Menu',
  ringgroup: 'Ring Group',
  voicemail: 'Voicemail',
  conference: 'Conference',
  hangup: 'Hangup',
  custom: 'Custom (raw)',
};

const empty = {
  destination_uuid: '',
  destination_number: '',
  destination_context: 'public',
  destination_data: '',
  destination_enabled: true,
  destination_description: '',
  action_kind: 'extension' as ActionKind,
  action_target: '',
};

function parseExistingAction(data?: string): { kind: ActionKind; target: string } {
  if (!data) return { kind: 'extension', target: '' };
  const m = /^transfer:(\S+)/.exec(data.trim());
  if (m) return { kind: 'extension', target: m[1] };
  if (/^hangup/i.test(data)) return { kind: 'hangup', target: '' };
  if (/voicemail/i.test(data)) return { kind: 'voicemail', target: data.replace(/.*voicemail[^0-9]*/i, '') };
  if (/conference/i.test(data)) return { kind: 'conference', target: data };
  return { kind: 'custom', target: data };
}

function buildAction(kind: ActionKind, target: string): string {
  switch (kind) {
    case 'extension': return `transfer:${target} XML public`;
    case 'queue': return `transfer:${target} XML public`;
    case 'ivr': return `transfer:${target} XML public`;
    case 'ringgroup': return `transfer:${target} XML public`;
    case 'voicemail': return `transfer:*99${target} XML public`;
    case 'conference': return `conference:${target}@default`;
    case 'hangup': return 'hangup:NORMAL_CLEARING';
    case 'custom': return target;
  }
}

export default function AdminDestinations() {
  const { selectedOrgId } = useOrganization();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(empty);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['fpbx', 'destinations'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'list-destinations' },
      });
      if (error) throw error;
      return (data?.data || []) as Dest[];
    },
  });

  // Target option lists for cascading picker
  const exts = useQuery({
    queryKey: ['fpbx', 'extensions-mini'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('fusionpbx-proxy', { body: { action: 'list-extensions' } });
      return ((data?.data || []) as any[]).map(e => ({ value: e.extension, label: `${e.extension} ${e.description || ''}`.trim() }));
    },
  });
  const queues = useQuery({
    queryKey: ['fpbx', 'queues-mini'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('fusionpbx-proxy', { body: { action: 'list-queues' } });
      return ((data?.data || []) as any[]).map(e => ({ value: e.queue_extension || e.extension, label: `${e.queue_name || e.name} (${e.queue_extension || e.extension})` }));
    },
  });
  const ivrs = useQuery({
    queryKey: ['fpbx', 'ivrs-mini'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('fusionpbx-proxy', { body: { action: 'list-ivrs' } });
      return ((data?.data || []) as any[]).map(e => ({ value: e.ivr_menu_extension || e.extension, label: `${e.ivr_menu_name || e.name} (${e.ivr_menu_extension || e.extension})` }));
    },
  });
  const ringGroups = useQuery({
    queryKey: ['fpbx', 'ringgroups-mini'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('fusionpbx-proxy', { body: { action: 'list-ring-groups' } });
      return ((data?.data || []) as any[]).map(e => ({ value: e.ring_group_extension || e.extension, label: `${e.ring_group_name || e.name} (${e.ring_group_extension || e.extension})` }));
    },
  });
  const confs = useQuery({
    queryKey: ['fpbx', 'conferences-mini'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('fusionpbx-proxy', { body: { action: 'list-conferences' } });
      return ((data?.data || []) as any[]).map(e => ({ value: e.conference_extension || e.extension || e.conference_name, label: `${e.conference_name || e.name}` }));
    },
  });

  const targetOptions = useMemo(() => {
    switch (form.action_kind as ActionKind) {
      case 'extension': return exts.data || [];
      case 'queue': return queues.data || [];
      case 'ivr': return ivrs.data || [];
      case 'ringgroup': return ringGroups.data || [];
      case 'voicemail': return exts.data || [];
      case 'conference': return confs.data || [];
      default: return [];
    }
  }, [form.action_kind, exts.data, queues.data, ivrs.data, ringGroups.data, confs.data]);

  // Keep destination_data in sync with cascading picker
  useEffect(() => {
    if (form.action_kind === 'custom') return;
    setForm((f: any) => ({ ...f, destination_data: buildAction(f.action_kind, f.action_target) }));
  }, [form.action_kind, form.action_target]);

  const filtered = rows.filter(d =>
    !q || `${d.destination_number} ${d.destination_description ?? ''} ${d.destination_data ?? ''}`.toLowerCase().includes(q.toLowerCase())
  );

  const openCreate = () => { setForm(empty); setOpen(true); };
  const openEdit = (d: Dest) => {
    const parsed = parseExistingAction(d.destination_data);
    setForm({
      destination_uuid: d.destination_uuid,
      destination_number: d.destination_number || '',
      destination_context: d.destination_context || 'public',
      destination_data: d.destination_data || '',
      destination_enabled: d.destination_enabled === true || d.destination_enabled === 'true',
      destination_description: d.destination_description || '',
      action_kind: parsed.kind,
      action_target: parsed.target,
    });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const action = form.destination_uuid ? 'update-destination' : 'create-destination';
      const params: any = {
        destination_number: form.destination_number,
        destination_context: form.destination_context,
        destination_data: form.destination_data,
        destination_enabled: form.destination_enabled ? 'true' : 'false',
        destination_description: form.destination_description,
      };
      if (form.destination_uuid) params.destination_uuid = form.destination_uuid;
      const { data, error } = await pbxInvoke(action, params, { organizationId: selectedOrgId });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(form.destination_uuid ? 'Updated' : 'Created');
      setOpen(false);
      refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const remove = async (d: Dest) => {
    if (!confirm(`Delete inbound route ${d.destination_number}?`)) return;
    try {
      const { error } = await pbxInvoke('delete-destination', { destination_uuid: d.destination_uuid }, { organizationId: selectedOrgId });
      if (error) throw error;
      toast.success('Deleted');
      refetch();
    } catch (e: any) { toast.error(e?.message || 'Delete failed'); }
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><PhoneIncoming className="w-7 h-7" /> Inbound Routes</h1>
          <p className="text-muted-foreground text-sm">DIDs routed to extensions, IVRs, queues, ring groups, voicemail, or conferences.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild><Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New Route</Button></SheetTrigger>
            <SheetContent className="space-y-3 overflow-y-auto">
              <SheetHeader><SheetTitle>{form.destination_uuid ? 'Edit' : 'New'} Inbound Route</SheetTitle></SheetHeader>
              <div className="space-y-3">
                <div><Label>DID / Number</Label><Input value={form.destination_number} onChange={e => setForm({ ...form, destination_number: e.target.value })} placeholder="^15145551234$" /></div>
                <div><Label>Context</Label><Input value={form.destination_context} onChange={e => setForm({ ...form, destination_context: e.target.value })} /></div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Route to</Label>
                    <Select value={form.action_kind} onValueChange={(v) => setForm({ ...form, action_kind: v as ActionKind, action_target: '' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ACTION_LABELS) as ActionKind[]).map(k => (
                          <SelectItem key={k} value={k}>{ACTION_LABELS[k]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Target</Label>
                    {form.action_kind === 'hangup' ? (
                      <Input value="hangup" disabled />
                    ) : form.action_kind === 'custom' ? (
                      <Input value={form.action_target} onChange={e => setForm({ ...form, action_target: e.target.value, destination_data: e.target.value })} placeholder="transfer:1001 XML public" />
                    ) : (
                      <Select value={form.action_target} onValueChange={(v) => setForm({ ...form, action_target: v })}>
                        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          {targetOptions.map((o: any) => (
                            <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Generated action</Label>
                  <Input value={form.destination_data} onChange={e => setForm({ ...form, destination_data: e.target.value, action_kind: 'custom' })} className="font-mono text-xs" />
                </div>

                <div><Label>Description</Label><Input value={form.destination_description} onChange={e => setForm({ ...form, destination_description: e.target.value })} /></div>
                <div className="flex items-center gap-3"><Switch checked={form.destination_enabled} onCheckedChange={v => setForm({ ...form, destination_enabled: v })} /><Label>Enabled</Label></div>
                <Button className="w-full" disabled={saving || !form.destination_number || !form.destination_data} onClick={save}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}{form.destination_uuid ? 'Save' : 'Create'}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>{filtered.length} route{filtered.length === 1 ? '' : 's'}</CardTitle>
            <div className="relative w-72 max-w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="py-8 flex justify-center"><Loader2 className="animate-spin" /></div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No inbound routes.</TableCell></TableRow>
                ) : filtered.map(d => {
                  const enabled = d.destination_enabled === true || d.destination_enabled === 'true';
                  return (
                    <TableRow key={d.destination_uuid}>
                      <TableCell className="font-mono">{d.destination_number}</TableCell>
                      <TableCell className="text-xs">{d.destination_context || 'public'}</TableCell>
                      <TableCell className="text-xs font-mono">{d.destination_data || '—'}</TableCell>
                      <TableCell className="text-xs">{d.destination_description || '—'}</TableCell>
                      <TableCell><Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? 'On' : 'Off'}</Badge></TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(d)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => remove(d)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
