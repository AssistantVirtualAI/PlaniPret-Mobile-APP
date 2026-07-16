import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pbxInvoke } from '@/lib/pbxInvoke';
import { useOrganization } from '@/context/OrganizationContext';
import { Clock, RefreshCw, Search, Loader2, Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

type Plan = {
  dialplan_uuid: string;
  dialplan_name: string;
  dialplan_number?: string;
  dialplan_context?: string;
  dialplan_enabled?: string | boolean;
  dialplan_description?: string;
  dialplan_xml?: string;
};

const empty = {
  dialplan_uuid: '',
  dialplan_name: '',
  dialplan_number: '',
  dialplan_context: 'public',
  dialplan_enabled: true,
  dialplan_description: '',
  dialplan_xml: '',
};

// Time conditions on FusionPBX are stored in the dialplans table with a
// specific app type. We list dialplans and let the admin pick which ones are
// time conditions by name/description convention.
export default function AdminTimeConditions() {
  
  const { selectedOrgId } = useOrganization();
const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(empty);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['fpbx', 'time-conditions'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'list-dialplans' },
      });
      if (error) throw error;
      const all = (data?.data || []) as Plan[];
      // Heuristic filter: dialplans that look like time conditions
      return all.filter(d =>
        /time/i.test(d.dialplan_name || '') ||
        /time/i.test(d.dialplan_description || '') ||
        /hour|business|night|weekend|holiday/i.test(`${d.dialplan_name} ${d.dialplan_description}`)
      );
    },
  });

  const filtered = rows.filter(d =>
    !q || `${d.dialplan_name} ${d.dialplan_description ?? ''}`.toLowerCase().includes(q.toLowerCase())
  );

  const openCreate = () => { setForm(empty); setOpen(true); };
  const openEdit = (d: Plan) => {
    setForm({
      dialplan_uuid: d.dialplan_uuid,
      dialplan_name: d.dialplan_name || '',
      dialplan_number: d.dialplan_number || '',
      dialplan_context: d.dialplan_context || 'public',
      dialplan_enabled: d.dialplan_enabled === true || d.dialplan_enabled === 'true',
      dialplan_description: d.dialplan_description || '',
      dialplan_xml: d.dialplan_xml || '',
    });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const action = form.dialplan_uuid ? 'update-time-conditions' : 'create-time-conditions';
      const params: any = {
        dialplan_name: form.dialplan_name,
        dialplan_number: form.dialplan_number,
        dialplan_context: form.dialplan_context,
        dialplan_enabled: form.dialplan_enabled ? 'true' : 'false',
        dialplan_description: form.dialplan_description,
        dialplan_xml: form.dialplan_xml,
        app_uuid: '4b821450-926b-175a-af93-a03c441818b1', // time_conditions app uuid
      };
      if (form.dialplan_uuid) params.dialplan_uuid = form.dialplan_uuid;
      const { data, error } = await pbxInvoke(action, params, { organizationId: selectedOrgId });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(form.dialplan_uuid ? 'Updated' : 'Created');
      setOpen(false);
      refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const remove = async (d: Plan) => {
    if (!confirm(`Delete time condition "${d.dialplan_name}"?`)) return;
    try {
      const { error } = await pbxInvoke('delete-time-conditions', { dialplan_uuid: d.dialplan_uuid }, { organizationId: selectedOrgId });
      if (error) throw error;
      toast.success('Deleted');
      refetch();
    } catch (e: any) { toast.error(e?.message || 'Delete failed'); }
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Clock className="w-7 h-7" /> Time Conditions</h1>
          <p className="text-muted-foreground text-sm">Schedule-based routing (business hours, holidays, after-hours).</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild><Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New</Button></SheetTrigger>
            <SheetContent className="space-y-3 overflow-y-auto w-full sm:max-w-xl">
              <SheetHeader><SheetTitle>{form.dialplan_uuid ? 'Edit' : 'New'} Time Condition</SheetTitle></SheetHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={form.dialplan_name} onChange={e => setForm({ ...form, dialplan_name: e.target.value })} /></div>
                <div><Label>Number / Match</Label><Input value={form.dialplan_number} onChange={e => setForm({ ...form, dialplan_number: e.target.value })} /></div>
                <div><Label>Context</Label><Input value={form.dialplan_context} onChange={e => setForm({ ...form, dialplan_context: e.target.value })} /></div>
                <div><Label>Description</Label><Input value={form.dialplan_description} onChange={e => setForm({ ...form, dialplan_description: e.target.value })} /></div>
                <div>
                  <Label>XML (advanced)</Label>
                  <textarea
                    className="w-full min-h-[200px] font-mono text-xs rounded border bg-background p-2"
                    value={form.dialplan_xml}
                    onChange={e => setForm({ ...form, dialplan_xml: e.target.value })}
                    placeholder="<extension>...</extension>"
                  />
                </div>
                <Button className="w-full" disabled={saving || !form.dialplan_name} onClick={save}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}{form.dialplan_uuid ? 'Save' : 'Create'}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>{filtered.length} condition{filtered.length === 1 ? '' : 's'}</CardTitle>
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
                  <TableHead>Name</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No time conditions detected. Create one or check the dialplans page.</TableCell></TableRow>
                ) : filtered.map(d => {
                  const enabled = d.dialplan_enabled === true || d.dialplan_enabled === 'true';
                  return (
                    <TableRow key={d.dialplan_uuid}>
                      <TableCell className="font-medium">{d.dialplan_name}</TableCell>
                      <TableCell className="font-mono text-xs">{d.dialplan_number || '—'}</TableCell>
                      <TableCell className="text-xs">{d.dialplan_context || 'public'}</TableCell>
                      <TableCell className="text-xs">{d.dialplan_description || '—'}</TableCell>
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
