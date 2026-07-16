import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pbxInvoke } from '@/lib/pbxInvoke';
import { useOrganization } from '@/context/OrganizationContext';
import { GitBranch, RefreshCw, Loader2, Plus, Trash2, Pencil, Search } from 'lucide-react';
import { toast } from 'sonner';

type DP = {
  dialplan_uuid: string;
  dialplan_name?: string;
  dialplan_context?: string;
  dialplan_order?: string;
  dialplan_enabled?: string | boolean;
  dialplan_description?: string;
  dialplan_xml?: string;
};

const empty: any = {
  dialplan_uuid: '', dialplan_name: '', dialplan_context: 'public',
  dialplan_order: '100', dialplan_enabled: true, dialplan_description: '', dialplan_xml: '',
};

export default function AdminDialplans() {
  
  const { selectedOrgId } = useOrganization();
const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(empty);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['fpbx', 'dialplans'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', { body: { action: 'list-dialplans' } });
      if (error) throw error;
      return (data?.data || []) as DP[];
    },
  });

  const filtered = rows.filter(d =>
    !q || `${d.dialplan_name} ${d.dialplan_context} ${d.dialplan_description ?? ''}`.toLowerCase().includes(q.toLowerCase())
  );

  const save = async () => {
    setSaving(true);
    try {
      const action = form.dialplan_uuid ? 'update-dialplans' : 'create-dialplans';
      const params: any = { ...form, dialplan_enabled: form.dialplan_enabled ? 'true' : 'false' };
      if (!form.dialplan_uuid) delete params.dialplan_uuid;
      const { data, error } = await pbxInvoke(action, params, { organizationId: selectedOrgId });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(form.dialplan_uuid ? 'Updated' : 'Created');
      setOpen(false); refetch();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const remove = async (d: DP) => {
    if (!confirm(`Delete dialplan "${d.dialplan_name}"?`)) return;
    try {
      const { error } = await pbxInvoke('delete-dialplans', { dialplan_uuid: d.dialplan_uuid }, { organizationId: selectedOrgId });
      if (error) throw error;
      toast.success('Deleted'); refetch();
    } catch (e: any) { toast.error(e?.message || 'Delete failed'); }
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><GitBranch className="w-7 h-7" /> Dialplans</h1>
          <p className="text-muted-foreground text-sm">Low-level FusionPBX dialplan entries with XML editor.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild><Button onClick={() => { setForm(empty); setOpen(true); }}><Plus className="w-4 h-4 mr-2" /> New dialplan</Button></SheetTrigger>
            <SheetContent className="space-y-3 overflow-y-auto sm:max-w-2xl">
              <SheetHeader><SheetTitle>{form.dialplan_uuid ? 'Edit' : 'New'} dialplan</SheetTitle></SheetHeader>
              <div className="space-y-3">
                {[['dialplan_name', 'Name'], ['dialplan_context', 'Context'], ['dialplan_order', 'Order'], ['dialplan_description', 'Description']].map(([k, l]) => (
                  <div key={k}><Label>{l}</Label><Input value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} /></div>
                ))}
                <div><Label>XML definition</Label>
                  <Textarea rows={14} className="font-mono text-xs" value={form.dialplan_xml || ''} onChange={e => setForm({ ...form, dialplan_xml: e.target.value })} />
                </div>
                <div className="flex items-center gap-3"><Switch checked={form.dialplan_enabled} onCheckedChange={v => setForm({ ...form, dialplan_enabled: v })} /><Label>Enabled</Label></div>
                <Button className="w-full" disabled={saving || !form.dialplan_name} onClick={save}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{form.dialplan_uuid ? 'Save' : 'Create'}</Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>{filtered.length} dialplan{filtered.length === 1 ? '' : 's'}</CardTitle>
            <div className="relative w-72 max-w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="py-8 flex justify-center"><Loader2 className="animate-spin" /></div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Context</TableHead><TableHead>Order</TableHead><TableHead>Enabled</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No dialplans.</TableCell></TableRow> :
                  filtered.map(d => {
                    const enabled = d.dialplan_enabled === true || d.dialplan_enabled === 'true';
                    return (
                      <TableRow key={d.dialplan_uuid}>
                        <TableCell className="font-medium">{d.dialplan_name}</TableCell>
                        <TableCell className="font-mono text-xs">{d.dialplan_context || '—'}</TableCell>
                        <TableCell className="text-xs">{d.dialplan_order || '—'}</TableCell>
                        <TableCell><Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? 'On' : 'Off'}</Badge></TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => { setForm({ ...empty, ...d, dialplan_enabled: enabled }); setOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
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
