import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, RefreshCw, QrCode, UserPlus, Monitor, Smartphone, KeyRound } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  extension: any | null;
};

function genPassword(len = 16) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

export function ExtensionEditDialog({ open, onOpenChange, extension }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [showQR, setShowQR] = useState(false);
  const [assignEmail, setAssignEmail] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [softphone, setSoftphone] = useState<any>(null);
  const [desktopAccess, setDesktopAccess] = useState(true);
  const [mobileAccess, setMobileAccess] = useState(true);
  const [savingAccess, setSavingAccess] = useState(false);

  useEffect(() => {
    if (!open || !extension) return;
    setForm({
      extension: extension.extension,
      effective_caller_id_name: extension.effective_cid_name || '',
      effective_caller_id_number: extension.effective_cid_number || '',
      password: extension.password || '',
      voicemail_password: extension.voicemail_password || '',
      voicemail_enabled: !!extension.voicemail_enabled,
      do_not_disturb: !!extension.do_not_disturb,
      forward_all_enabled: !!extension.forward_all_enabled,
      forward_all_destination: extension.forward_all_destination || '',
      call_timeout: extension.call_timeout ?? 30,
      enabled: extension.enabled !== false,
      description: extension.description || '',
    });
    // Try to fetch the latest config from FusionPBX
    if (extension.pbx_uuid) {
      setLoading(true);
      supabase.functions
        .invoke('fusionpbx-proxy', {
          body: { action: 'get-extension', extension_uuid: extension.pbx_uuid, extension: extension.extension },
        })
        .then(({ data }) => {
          const ext = (data as any)?.extension || (data as any)?.extensions?.[0] || (data as any)?.data;
          if (ext) {
            setForm((f: any) => ({
              ...f,
              effective_caller_id_name: ext.effective_caller_id_name ?? f.effective_caller_id_name,
              effective_caller_id_number: ext.effective_caller_id_number ?? f.effective_caller_id_number,
              password: ext.password ?? f.password,
              voicemail_password: ext.voicemail_password ?? f.voicemail_password,
              voicemail_enabled: ext.voicemail_enabled ?? f.voicemail_enabled,
              do_not_disturb: ext.do_not_disturb ?? f.do_not_disturb,
              forward_all_enabled: ext.forward_all_enabled ?? f.forward_all_enabled,
              forward_all_destination: ext.forward_all_destination ?? f.forward_all_destination,
              call_timeout: ext.call_timeout ?? f.call_timeout,
              enabled: ext.enabled ?? f.enabled,
              description: ext.description ?? f.description,
            }));
          }
        })
        .catch((e) => console.warn('get-extension failed', e))
        .finally(() => setLoading(false));
    }
    // Load softphone row (app access state)
    (async () => {
      const { data } = await (supabase as any).from('pbx_softphone_users')
        .select('id, portal_user_id, desktop_access_enabled, mobile_access_enabled, app_access_enabled')
        .eq('organization_id', extension.organization_id)
        .eq('extension', String(extension.extension))
        .maybeSingle();
      setSoftphone(data || null);
      setDesktopAccess(data?.desktop_access_enabled ?? true);
      setMobileAccess(data?.mobile_access_enabled ?? true);
    })();
  }, [open, extension]);

  const saveAppAccess = async (desktop: boolean, mobile: boolean) => {
    if (!extension) return;
    setSavingAccess(true);
    try {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: {
          action: 'set-app-access',
          extension: String(extension.extension),
          extension_uuid: extension.pbx_uuid,
          desktop, mobile,
        },
      });
      if (error) throw error;
      setDesktopAccess(desktop); setMobileAccess(mobile);
      setSoftphone((s: any) => ({ ...(s || {}), desktop_access_enabled: desktop, mobile_access_enabled: mobile, app_access_enabled: desktop || mobile, id: (data as any)?.softphone_id ?? s?.id }));
      toast({
        title: desktop || mobile ? 'App access updated' : 'App access revoked',
        description: (data as any)?.password_preserved
          ? 'User signs in with their existing extension password.'
          : 'Saved. No PBX password change.',
      });
      qc.invalidateQueries({ queryKey: ['pbx', 'pbx_softphone_users'] });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSavingAccess(false);
    }
  };

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const onSave = async () => {
    if (!extension) return;
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: {
          action: 'update-extension',
          extension_uuid: extension.pbx_uuid,
          extension: extension.extension,
          fields: form,
        },
      });
      if (error) throw error;
      toast({ title: 'Extension updated', description: `Synced to FusionPBX` });
      qc.invalidateQueries({ queryKey: ['pbx_extensions'] });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!extension) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Edit extension {extension.extension}
            {loading && <Loader2 className="inline w-4 h-4 ml-2 animate-spin" />}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2">
            <Label>Description</Label>
            <Input value={form.description || ''} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div>
            <Label>Caller ID name</Label>
            <Input value={form.effective_caller_id_name || ''} onChange={(e) => set('effective_caller_id_name', e.target.value)} />
          </div>
          <div>
            <Label>Caller ID number</Label>
            <Input value={form.effective_caller_id_number || ''} onChange={(e) => set('effective_caller_id_number', e.target.value)} />
          </div>
          <div>
            <Label>SIP password</Label>
            <div className="flex gap-2">
              <Input type="password" value={form.password || ''} onChange={(e) => set('password', e.target.value)} />
              <Button type="button" variant="outline" size="icon" title="Generate new password"
                onClick={() => { set('password', genPassword()); toast({ title: 'New password generated', description: 'Click Save to apply.' }); }}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div>
            <Label>Voicemail password</Label>
            <Input type="password" value={form.voicemail_password || ''} onChange={(e) => set('voicemail_password', e.target.value)} />
          </div>
          <div>
            <Label>Call timeout (sec)</Label>
            <Input type="number" value={form.call_timeout ?? 30} onChange={(e) => set('call_timeout', Number(e.target.value))} />
          </div>
          <div>
            <Label>Forward all to</Label>
            <Input value={form.forward_all_destination || ''} onChange={(e) => set('forward_all_destination', e.target.value)} />
          </div>
          <div className="flex items-center justify-between border rounded p-3">
            <Label htmlFor="vm">Voicemail enabled</Label>
            <Switch id="vm" checked={!!form.voicemail_enabled} onCheckedChange={(v) => set('voicemail_enabled', v)} />
          </div>
          <div className="flex items-center justify-between border rounded p-3">
            <Label htmlFor="dnd">Do Not Disturb</Label>
            <Switch id="dnd" checked={!!form.do_not_disturb} onCheckedChange={(v) => set('do_not_disturb', v)} />
          </div>
          <div className="flex items-center justify-between border rounded p-3">
            <Label htmlFor="fwd">Forward all</Label>
            <Switch id="fwd" checked={!!form.forward_all_enabled} onCheckedChange={(v) => set('forward_all_enabled', v)} />
          </div>
          <div className="flex items-center justify-between border rounded p-3">
            <Label htmlFor="en">Enabled</Label>
            <Switch id="en" checked={!!form.enabled} onCheckedChange={(v) => set('enabled', v)} />
          </div>
        </div>

        <div className="border-t pt-4 mt-2 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-2"><UserPlus className="w-4 h-4" /> Assign portal user (by email)</Label>
              {extension.portal_user_id && <span className="text-xs text-muted-foreground">Currently linked</span>}
            </div>
            <div className="flex gap-2">
              <Input placeholder="user@example.com" value={assignEmail} onChange={(e) => setAssignEmail(e.target.value)} />
              <Button type="button" variant="outline" disabled={assigning || !extension.extension}
                onClick={async () => {
                  setAssigning(true);
                  try {
                    const { data, error } = await (supabase as any).rpc('admin_link_softphone_by_extension_email', {
                      _org_id: extension.organization_id,
                      _extension: String(extension.extension),
                      _email: assignEmail.trim() || null,
                    });
                    if (error) throw error;
                    toast({ title: 'User linked', description: assignEmail || 'Unlinked' });
                    qc.invalidateQueries({ queryKey: ['pbx_extensions'] });
                    qc.invalidateQueries({ queryKey: ['lemtel', 'softphone-users'] });
                  } catch (e: any) {
                    toast({ title: 'Link failed', description: e?.message || String(e), variant: 'destructive' });
                  } finally { setAssigning(false); }
                }}>
                {assigning && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Link
              </Button>
            </div>
          </div>

          <div className="rounded-md border p-3 bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> Desktop & Mobile app access</Label>
              <span className="text-xs text-muted-foreground">
                {softphone?.app_access_enabled ? 'Active' : 'Revoked'}
                {savingAccess && <Loader2 className="inline w-3 h-3 ml-2 animate-spin" />}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, the user signs in to the AVA desktop and mobile apps with their
              <strong> existing extension password</strong> — no rotation, no new credentials.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between border rounded p-3">
                <Label htmlFor="desk" className="flex items-center gap-2"><Monitor className="w-4 h-4" /> Desktop app</Label>
                <Switch id="desk" disabled={savingAccess}
                  checked={desktopAccess}
                  onCheckedChange={(v) => saveAppAccess(v, mobileAccess)} />
              </div>
              <div className="flex items-center justify-between border rounded p-3">
                <Label htmlFor="mob" className="flex items-center gap-2"><Smartphone className="w-4 h-4" /> Mobile app</Label>
                <Switch id="mob" disabled={savingAccess}
                  checked={mobileAccess}
                  onCheckedChange={(v) => saveAppAccess(desktopAccess, v)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={savingAccess}
                onClick={() => saveAppAccess(true, true)}>Grant all</Button>
              <Button size="sm" variant="outline" disabled={savingAccess}
                className="text-red-600 border-red-500/30 hover:bg-red-500/10"
                onClick={() => saveAppAccess(false, false)}>Revoke all</Button>
            </div>
          </div>


          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-2"><QrCode className="w-4 h-4" /> Mobile provisioning QR</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowQR((v) => !v)}>
                {showQR ? 'Hide' : 'Show'}
              </Button>
            </div>
            {showQR && (
              <div className="flex items-center gap-4 rounded-md border p-3 bg-muted/30">
                <QRCodeSVG
                  size={140}
                  value={JSON.stringify({
                    portal: 'avastatistic.ca',
                    extension: extension.extension,
                    sip_domain: extension.sip_domain || 'lemtel.lemtel.tel',
                    wss: 'wss://lemtel.lemtel.tel:7443',
                    password: form.password || '',
                  })}
                />
                <div className="text-xs text-muted-foreground">
                  Scan in the AVA Softphone mobile app to auto-configure SIP credentials for this extension.
                </div>
              </div>
            )}
          </div>
        </div>


        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || loading}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save & sync to FusionPBX
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
