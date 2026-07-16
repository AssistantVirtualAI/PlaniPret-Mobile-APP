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
import { Server, RefreshCw, Loader2, Plus, Trash2, Pencil, Power } from 'lucide-react';
import { toast } from 'sonner';

type Prof = {
  sip_profile_uuid: string;
  sip_profile_name?: string;
  sip_profile_hostname?: string;
  sip_profile_enabled?: string | boolean;
  sip_profile_description?: string;
};

const empty: any = { sip_profile_uuid: '', sip_profile_name: '', sip_profile_hostname: '', sip_profile_enabled: true, sip_profile_description: '' };

export default function AdminSipProfiles() {
  
  const { selectedOrgId } = useOrganization();
const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(empty);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['fpbx', 'sip-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', { body: { action: 'list-sip-profiles' } });
      if (error) throw error;
      return (data?.data || []) as Prof[];
    },
  });

  const save = async () => {
    setSaving(true);
    try {
      const action = form.sip_profile_uuid ? 'update-sip-profiles' : 'create-sip-profiles';
      const params: any = { ...form, sip_profile_enabled: form.sip_profile_enabled ? 'true' : 'false' };
      if (!form.sip_profile_uuid) delete params.sip_profile_uuid;
      const { data, error } = await pbxInvoke(action, params, { organizationId: selectedOrgId });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(form.sip_profile_uuid ? 'Updated' : 'Created');
      setOpen(false); refetch();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const remove = async (p: Prof) => {
    if (!confirm(`Delete SIP profile "${p.sip_profile_name}"?`)) return;
    try {
      const { error } = await pbxInvoke('delete-sip-profiles', { sip_profile_uuid: p.sip_profile_uuid }, { organizationId: selectedOrgId });
      if (error) throw error;
      toast.success('Deleted'); refetch();
    } catch (e: any) { toast.error(e?.message || 'Delete failed'); }
  };

  const restart = async (p: Prof) => {
    try {
      const { error } = await pbxInvoke('restart-sip-profile', { profile_name: p.sip_profile_name }, { organizationId: selectedOrgId });
      if (error) throw error;
      toast.success(`Restarted ${p.sip_profile_name}`);
    } catch (e: any) { toast.error(e?.message || 'Restart failed'); }
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Server className="w-7 h-7" /> SIP Profiles</h1>
          <p className="text-muted-foreground text-sm">FreeSWITCH SIP profiles (internal/external).</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild><Button onClick={() => { setForm(empty); setOpen(true); }}><Plus className="w-4 h-4 mr-2" /> New profile</Button></SheetTrigger>
            <SheetContent className="space-y-3 overflow-y-auto">
              <SheetHeader><SheetTitle>{form.sip_profile_uuid ? 'Edit' : 'New'} SIP profile</SheetTitle></SheetHeader>
              <div className="space-y-3">
                {[['sip_profile_name', 'Name'], ['sip_profile_hostname', 'Hostname'], ['sip_profile_description', 'Description']].map(([k, l]) => (
                  <div key={k}><Label>{l}</Label><Input value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} /></div>
                ))}
                <div className="flex items-center gap-3"><Switch checked={form.sip_profile_enabled} onCheckedChange={v => setForm({ ...form, sip_profile_enabled: v })} /><Label>Enabled</Label></div>
                <Button className="w-full" disabled={saving || !form.sip_profile_name} onClick={save}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{form.sip_profile_uuid ? 'Save' : 'Create'}</Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>{rows.length} profile{rows.length === 1 ? '' : 's'}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="py-8 flex justify-center"><Loader2 className="animate-spin" /></div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Hostname</TableHead><TableHead>Enabled</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No SIP profiles.</TableCell></TableRow> :
                  rows.map(p => {
                    const enabled = p.sip_profile_enabled === true || p.sip_profile_enabled === 'true';
                    return (
                      <TableRow key={p.sip_profile_uuid}>
                        <TableCell className="font-medium">{p.sip_profile_name}</TableCell>
                        <TableCell className="font-mono text-xs">{p.sip_profile_hostname || '—'}</TableCell>
                        <TableCell><Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? 'On' : 'Off'}</Badge></TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => restart(p)} title="Restart"><Power className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => { setForm({ ...empty, ...p, sip_profile_enabled: enabled }); setOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => remove(p)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
