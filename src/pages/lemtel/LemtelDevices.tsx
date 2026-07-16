import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Router, Circle, Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { usePbxDevices } from '@/hooks/usePbxData';
import { PbxRefreshButton } from '@/components/lemtel/PbxRefreshButton';
import { useLemtelAccess } from '@/hooks/useLemtelAccess';

const LEMTEL_ORG = '71755d33-ed64-4ad5-a828-61c9d2029eb7';

type DeviceForm = {
  id?: string;
  pbx_uuid?: string;
  mac_address: string;
  label: string;
  vendor: string;
  template: string;
  profile: string;
  enabled: boolean;
};

const emptyForm: DeviceForm = {
  mac_address: '', label: '', vendor: '', template: '', profile: 'internal', enabled: true,
};

export default function LemtelDevices() {
  const { data: devices = [], isLoading, refetch } = usePbxDevices();
  const { isAdmin } = useLemtelAccess();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<DeviceForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (d: any) => {
    setForm({
      id: d.id, pbx_uuid: d.pbx_uuid,
      mac_address: d.mac_address || '', label: d.label || '',
      vendor: d.vendor || '', template: d.template || '',
      profile: d.profile || 'internal', enabled: d.enabled !== false,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!/^[0-9a-fA-F:]{12,17}$/.test(form.mac_address.replace(/[:\-]/g, ''))) {
      toast.error('Invalid MAC address');
      return;
    }
    setSaving(true);
    try {
      const action = form.pbx_uuid ? 'update-device' : 'create-device';
      const params: any = {
        device_mac_address: form.mac_address.toLowerCase().replace(/[^0-9a-f]/g, ''),
        device_label: form.label, device_vendor: form.vendor,
        device_template: form.template, device_profile: form.profile,
        device_enabled: form.enabled ? 'true' : 'false',
      };
      if (form.pbx_uuid) params.device_uuid = form.pbx_uuid;

      const { data, error } = await supabase.functions.invoke('pbx-write', {
        body: {
          organizationId: LEMTEL_ORG, action, params,
          mirror: {
            table: 'pbx_devices',
            row: {
              ...(form.id ? { id: form.id } : {}),
              pbx_uuid: form.pbx_uuid ?? null,
              mac_address: params.device_mac_address,
              label: form.label, vendor: form.vendor,
              template: form.template, profile: form.profile,
              enabled: form.enabled,
            },
            onConflict: 'organization_id,pbx_uuid',
          },
          objectType: 'device',
          objectPbxUuid: form.pbx_uuid,
        },
      });
      if (error || (data as any)?.ok === false) {
        throw new Error((data as any)?.detail?.message || (data as any)?.error || error?.message || 'Failed');
      }
      toast.success(form.pbx_uuid ? 'Device updated' : 'Device created');
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ['pbx', 'devices'] });
      refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const remove = async (d: any) => {
    if (!confirm(`Delete device ${d.label || d.mac_address}?`)) return;
    try {
      const { data, error } = await supabase.functions.invoke('pbx-write', {
        body: {
          organizationId: LEMTEL_ORG, action: 'delete-device',
          params: { device_uuid: d.pbx_uuid },
          objectType: 'device', objectPbxUuid: d.pbx_uuid,
        },
      });
      if (error || (data as any)?.ok === false) throw new Error((data as any)?.detail?.message || error?.message);
      await supabase.from('pbx_devices' as any).delete().eq('id', d.id);
      toast.success('Device deleted');
      refetch();
    } catch (e: any) { toast.error(e?.message || 'Delete failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Router className="w-7 h-7" /> Devices</h1>
          <p className="text-muted-foreground">Provisioned SIP phones and ATAs</p>
        </div>
        <div className="flex gap-2">
          <PbxRefreshButton kind="devices" />
          <Button onClick={openAdd} disabled={!isAdmin}><Plus className="w-4 h-4 mr-2" /> Add device</Button>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>{devices.length} devices</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>MAC</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No devices yet — click <b>Add device</b>.</TableCell></TableRow>
                ) : devices.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.label || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{d.mac_address || '—'}</TableCell>
                    <TableCell>{d.vendor || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.template || '—'}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-sm">
                        <Circle className={`w-2.5 h-2.5 ${d.registration_status === 'registered' ? 'fill-green-500 text-green-500' : 'fill-muted text-muted'}`} />
                        {d.registration_status || (d.enabled ? 'enabled' : 'disabled')}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" disabled={!isAdmin} onClick={() => openEdit(d)} title="Edit"><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" disabled={!isAdmin} onClick={() => remove(d)} title="Delete"><Trash2 className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.pbx_uuid ? 'Edit device' : 'Add device'}</DialogTitle>
            <DialogDescription>Provision a SIP phone or ATA on the PBX.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>MAC address *</Label>
              <Input value={form.mac_address} onChange={e => setForm({ ...form, mac_address: e.target.value })} placeholder="aa:bb:cc:dd:ee:ff" /></div>
            <div><Label>Label</Label>
              <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Reception phone" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Vendor</Label>
                <Input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} placeholder="yealink" /></div>
              <div><Label>Template</Label>
                <Input value={form.template} onChange={e => setForm({ ...form, template: e.target.value })} placeholder="t46s" /></div>
            </div>
            <div><Label>Profile</Label>
              <Input value={form.profile} onChange={e => setForm({ ...form, profile: e.target.value })} /></div>
            <div className="flex items-center gap-2">
              <input id="en" type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />
              <Label htmlFor="en">Enabled</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
