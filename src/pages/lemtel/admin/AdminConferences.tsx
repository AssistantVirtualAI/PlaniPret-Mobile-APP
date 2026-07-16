import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pbxInvoke } from '@/lib/pbxInvoke';
import { useOrganization } from '@/context/OrganizationContext';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { AdminSkeletonRows, AdminEmptyState } from '@/components/admin/AdminSkeletonRows';
import { Users, RefreshCw, Search, Plus, Trash2, Pencil, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Conf = {
  conference_room_uuid: string;
  conference_room_name?: string;
  conference_room_extension?: string;
  conference_room_pin_number?: string;
  conference_room_moderator_pin_number?: string;
  conference_room_max_members?: string;
  conference_room_enabled?: string | boolean;
  conference_room_description?: string;
};

const empty = {
  conference_room_uuid: '',
  conference_room_name: '',
  conference_room_extension: '',
  conference_room_pin_number: '',
  conference_room_moderator_pin_number: '',
  conference_room_max_members: '50',
  conference_room_enabled: true,
  conference_room_description: '',
};

export default function AdminConferences() {
  
  const { selectedOrgId } = useOrganization();
const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(empty);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['fpbx', 'conferences'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', { body: { action: 'list-conferences' } });
      if (error) throw error;
      return (data?.data || []) as Conf[];
    },
  });

  const filtered = rows.filter(c =>
    !q || `${c.conference_room_name} ${c.conference_room_extension ?? ''} ${c.conference_room_description ?? ''}`.toLowerCase().includes(q.toLowerCase())
  );

  const openCreate = () => { setForm(empty); setOpen(true); };
  const openEdit = (c: Conf) => {
    setForm({ ...empty, ...c, conference_room_enabled: c.conference_room_enabled === true || c.conference_room_enabled === 'true' });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const action = form.conference_room_uuid ? 'update-conferences' : 'create-conferences';
      const params: any = { ...form, conference_room_enabled: form.conference_room_enabled ? 'true' : 'false' };
      if (!form.conference_room_uuid) delete params.conference_room_uuid;
      const { data, error } = await pbxInvoke(action, params, { organizationId: selectedOrgId });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(form.conference_room_uuid ? 'Updated' : 'Created');
      setOpen(false);
      refetch();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const remove = async (c: Conf) => {
    if (!confirm(`Delete conference "${c.conference_room_name}"?`)) return;
    try {
      const { error } = await pbxInvoke('delete-conferences', { conference_room_uuid: c.conference_room_uuid }, { organizationId: selectedOrgId });
      if (error) throw error;
      toast.success('Deleted');
      refetch();
    } catch (e: any) { toast.error(e?.message || 'Delete failed'); }
  };

  return (
    <div className="space-y-5 w-full min-w-0">
      <AdminPageHeader
        icon={Users}
        title="Conference Rooms"
        subtitle="Conference bridges with PINs and member caps."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild><Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New room</Button></SheetTrigger>
              <SheetContent className="space-y-3 overflow-y-auto">
                <SheetHeader><SheetTitle>{form.conference_room_uuid ? 'Edit' : 'New'} Conference Room</SheetTitle></SheetHeader>
                <div className="space-y-3">
                  {[
                    ['conference_room_name', 'Name'],
                    ['conference_room_extension', 'Extension'],
                    ['conference_room_pin_number', 'Participant PIN'],
                    ['conference_room_moderator_pin_number', 'Moderator PIN'],
                    ['conference_room_max_members', 'Max members'],
                    ['conference_room_description', 'Description'],
                  ].map(([k, label]) => (
                    <div key={k}><Label>{label}</Label>
                      <Input value={(form as any)[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} />
                    </div>
                  ))}
                  <div className="flex items-center gap-3"><Switch checked={form.conference_room_enabled} onCheckedChange={v => setForm({ ...form, conference_room_enabled: v })} /><Label>Enabled</Label></div>
                  <Button className="w-full" disabled={saving || !form.conference_room_name} onClick={save}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}{form.conference_room_uuid ? 'Save' : 'Create'}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </>
        }
      />

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">{filtered.length} room{filtered.length === 1 ? '' : 's'}</CardTitle>
            <div className="relative w-72 max-w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Extension</TableHead>
                <TableHead>PIN</TableHead><TableHead>Max</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <AdminSkeletonRows rows={5} cols={6} /> :
                filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6}><AdminEmptyState title="No conference rooms" hint="Create your first conference bridge to host multi-party calls." /></TableCell></TableRow>
                ) : filtered.map(c => {
                  const enabled = c.conference_room_enabled === true || c.conference_room_enabled === 'true';
                  return (
                    <TableRow key={c.conference_room_uuid} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="font-medium">{c.conference_room_name}</TableCell>
                      <TableCell className="font-mono text-xs">{c.conference_room_extension || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{c.conference_room_pin_number || '—'}</TableCell>
                      <TableCell className="text-xs">{c.conference_room_max_members || '—'}</TableCell>
                      <TableCell><StatusBadge tone={enabled ? 'on' : 'off'}>{enabled ? 'Active' : 'Disabled'}</StatusBadge></TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => remove(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
