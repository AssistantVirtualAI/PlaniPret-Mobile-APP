import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pbxInvoke } from '@/lib/pbxInvoke';
import { useOrganization } from '@/context/OrganizationContext';
import { Music, RefreshCw, Search, Loader2, Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

type MoH = {
  music_on_hold_uuid: string;
  music_on_hold_name?: string;
  music_on_hold_path?: string;
  music_on_hold_rate?: string;
  music_on_hold_shuffle?: string | boolean;
  music_on_hold_enabled?: string | boolean;
  music_on_hold_description?: string;
};

const empty = {
  music_on_hold_uuid: '',
  music_on_hold_name: '',
  music_on_hold_path: '',
  music_on_hold_rate: '8000',
  music_on_hold_shuffle: false,
  music_on_hold_enabled: true,
  music_on_hold_description: '',
};

export default function AdminHoldMusic() {
  
  const { selectedOrgId } = useOrganization();
const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(empty);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['fpbx', 'hold-music'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', { body: { action: 'list-hold-music' } });
      if (error) throw error;
      return (data?.data || []) as MoH[];
    },
  });

  const filtered = rows.filter(m =>
    !q || `${m.music_on_hold_name} ${m.music_on_hold_path ?? ''}`.toLowerCase().includes(q.toLowerCase())
  );

  const openCreate = () => { setForm(empty); setOpen(true); };
  const openEdit = (m: MoH) => {
    setForm({
      ...empty, ...m,
      music_on_hold_shuffle: m.music_on_hold_shuffle === true || m.music_on_hold_shuffle === 'true',
      music_on_hold_enabled: m.music_on_hold_enabled === true || m.music_on_hold_enabled === 'true',
    });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const action = form.music_on_hold_uuid ? 'update-hold-music' : 'create-hold-music';
      const params: any = {
        ...form,
        music_on_hold_shuffle: form.music_on_hold_shuffle ? 'true' : 'false',
        music_on_hold_enabled: form.music_on_hold_enabled ? 'true' : 'false',
      };
      if (!form.music_on_hold_uuid) delete params.music_on_hold_uuid;
      const { data, error } = await pbxInvoke(action, params, { organizationId: selectedOrgId });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(form.music_on_hold_uuid ? 'Updated' : 'Created');
      setOpen(false);
      refetch();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const remove = async (m: MoH) => {
    if (!confirm(`Delete "${m.music_on_hold_name}"?`)) return;
    try {
      const { error } = await pbxInvoke('delete-hold-music', { music_on_hold_uuid: m.music_on_hold_uuid }, { organizationId: selectedOrgId });
      if (error) throw error;
      toast.success('Deleted');
      refetch();
    } catch (e: any) { toast.error(e?.message || 'Delete failed'); }
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Music className="w-7 h-7" /> Music on Hold</h1>
          <p className="text-muted-foreground text-sm">Hold music streams played to callers on hold.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild><Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New Stream</Button></SheetTrigger>
            <SheetContent className="space-y-3 overflow-y-auto">
              <SheetHeader><SheetTitle>{form.music_on_hold_uuid ? 'Edit' : 'New'} Hold Music</SheetTitle></SheetHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={form.music_on_hold_name} onChange={e => setForm({ ...form, music_on_hold_name: e.target.value })} /></div>
                <div><Label>Path (file or URL)</Label><Input value={form.music_on_hold_path} onChange={e => setForm({ ...form, music_on_hold_path: e.target.value })} placeholder="$${sounds_dir}/music/8000" /></div>
                <div><Label>Sample Rate</Label><Input value={form.music_on_hold_rate} onChange={e => setForm({ ...form, music_on_hold_rate: e.target.value })} /></div>
                <div><Label>Description</Label><Input value={form.music_on_hold_description} onChange={e => setForm({ ...form, music_on_hold_description: e.target.value })} /></div>
                <div className="flex items-center gap-3"><Switch checked={form.music_on_hold_shuffle} onCheckedChange={v => setForm({ ...form, music_on_hold_shuffle: v })} /><Label>Shuffle</Label></div>
                <div className="flex items-center gap-3"><Switch checked={form.music_on_hold_enabled} onCheckedChange={v => setForm({ ...form, music_on_hold_enabled: v })} /><Label>Enabled</Label></div>
                <Button className="w-full" disabled={saving || !form.music_on_hold_name} onClick={save}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}{form.music_on_hold_uuid ? 'Save' : 'Create'}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>{filtered.length} stream{filtered.length === 1 ? '' : 's'}</CardTitle>
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
                  <TableHead>Name</TableHead><TableHead>Path</TableHead>
                  <TableHead>Rate</TableHead><TableHead>Shuffle</TableHead>
                  <TableHead>Enabled</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No hold music.</TableCell></TableRow>
                ) : filtered.map(m => {
                  const enabled = m.music_on_hold_enabled === true || m.music_on_hold_enabled === 'true';
                  const shuf = m.music_on_hold_shuffle === true || m.music_on_hold_shuffle === 'true';
                  return (
                    <TableRow key={m.music_on_hold_uuid}>
                      <TableCell className="font-medium">{m.music_on_hold_name}</TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-xs">{m.music_on_hold_path || '—'}</TableCell>
                      <TableCell className="text-xs">{m.music_on_hold_rate || '—'}</TableCell>
                      <TableCell><Badge variant={shuf ? 'default' : 'secondary'}>{shuf ? 'Yes' : 'No'}</Badge></TableCell>
                      <TableCell><Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? 'On' : 'Off'}</Badge></TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(m)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => remove(m)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
