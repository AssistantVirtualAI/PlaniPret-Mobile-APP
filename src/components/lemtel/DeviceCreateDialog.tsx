import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PBX_DEVICE_BRANDS } from '@/data/pbxDeviceModels';

export function DeviceCreateDialog({
  open, onOpenChange, organizationId, domainUuid, extensions, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId?: string;
  domainUuid: string;
  extensions: any[];
  onCreated: () => void;
}) {
  const [mac, setMac] = useState('');
  const [brand, setBrand] = useState<string>('Yealink');
  const [model, setModel] = useState<string>('');
  const [label, setLabel] = useState('');
  const [extUuid, setExtUuid] = useState<string>('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const models = useMemo(() => PBX_DEVICE_BRANDS[brand] || [], [brand]);
  const template = model ? `${brand.toLowerCase().split('/')[0]}/${model.replace(/\s+/g, '_')}` : '';

  const save = async () => {
    const cleanMac = mac.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
    if (cleanMac.length !== 12) { toast.error('MAC must be 12 hex characters'); return; }
    if (!model) { toast.error('Pick a phone model'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('pbx-write', {
        body: {
          organizationId,
          action: 'create-device',
          params: {
            domain_uuid: domainUuid,
            device_mac_address: cleanMac,
            device_label: label || cleanMac,
            device_vendor: brand,
            device_model: model,
            device_template: template,
            device_profile: 'default',
            device_user_uuid: extUuid || undefined,
            device_enabled: enabled ? 'true' : 'false',
          },
        },
      });
      if (error) throw error;
      toast.success(`Device ${cleanMac} created`);
      onCreated();
      onOpenChange(false);
      setMac(''); setModel(''); setLabel(''); setExtUuid('');
    } catch (e: any) {
      toast.error(e?.message || 'Create failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New device</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>MAC address *</Label>
            <Input value={mac} onChange={(e) => setMac(e.target.value)} placeholder="aa:bb:cc:11:22:33" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Brand</Label>
              <Select value={brand} onValueChange={(v) => { setBrand(v); setModel(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(PBX_DEVICE_BRANDS).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Model *</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger><SelectValue placeholder="Choose model" /></SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Label / description</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Reception phone" />
          </div>
          <div>
            <Label>Assign to extension</Label>
            <Select value={extUuid} onValueChange={setExtUuid}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent className="max-h-[280px]">
                {extensions.map((e: any) => (
                  <SelectItem key={e.extension_uuid} value={e.extension_uuid}>
                    {e.extension} {e.effective_caller_id_name ? `· ${e.effective_caller_id_name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between border rounded p-2">
            <Label>Enabled</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
