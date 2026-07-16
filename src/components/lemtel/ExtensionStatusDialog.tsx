import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { usePbxRegistrations } from '@/hooks/usePbxData';

function generatePassword(len = 16) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

const LEMTEL_ORG = '71755d33-ed64-4ad5-a828-61c9d2029eb7';
const DOMAIN_UUID = '2936594e-17b7-42a9-9165-95be48627923';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ext: any | null;
}

function StatusBadge({ ok, label }: { ok: boolean | null | undefined; label?: string }) {
  if (ok === true) return <Badge className="bg-green-500/15 text-green-600 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />{label ?? 'OK'}</Badge>;
  if (ok === false) return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />{label ?? 'Failed'}</Badge>;
  return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />{label ?? 'Unknown'}</Badge>;
}

export function ExtensionStatusDialog({ open, onOpenChange, ext }: Props) {
  const qc = useQueryClient();
  const [pushing, setPushing] = useState(false);
  const [pwdInput, setPwdInput] = useState('');
  const { data: regs = [] } = usePbxRegistrations(open ? 15000 : 0);
  const storedPassword = ext?.raw_data?.sip_password || ext?.raw_data?.password || '';
  useEffect(() => {
    if (ext) setPwdInput(storedPassword || generatePassword());
  }, [ext?.id, storedPassword]);

  if (!ext) return null;

  const prov = ext?.raw_data?.provisioning ?? null;
  const extResult = prov?.extension_result;
  const vmResult = prov?.voicemail_result;
  const registered = (regs as any[]).some((r) => String(r.extension ?? r.user ?? '').startsWith(String(ext.extension)));

  const pushToFusionPBX = async () => {
    const sipPassword = (pwdInput || '').trim();
    if (sipPassword.length < 8) { toast.error('SIP password must be at least 8 characters'); return; }
    setPushing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: {
          action: 'create-extension',
          organization_id: LEMTEL_ORG,
          params: {
            domain_uuid: DOMAIN_UUID,
            extension: ext.extension,
            password: sipPassword,
            effective_caller_id_name: ext.effective_cid_name || ext.description,
            effective_caller_id_number: ext.extension,
            voicemail_enabled: ext.voicemail_enabled ? 'true' : 'false',
            user_record: ext.call_recording || 'none',
            enabled: 'true',
            description: ext.description || ext.effective_cid_name,
          },
        },
      });
      if (error) throw error;
      const r = data as any;
      if (r?.error) throw new Error(`${r.message || r.error}${r.embeddedCode ? ` [${r.embeddedCode}]` : ''}`);
      await supabase.from('pbx_extensions' as any).update({
        pbx_uuid: r.extension_uuid ?? ext.pbx_uuid,
        raw_data: {
          ...(ext.raw_data || {}),
          password: sipPassword,
          sip_password: sipPassword,
          provisioning: {
            extension_result: r.extension_result,
            voicemail_result: r.voicemail_result,
            completed_at: new Date().toISOString(),
          },
        },
        synced_at: new Date().toISOString(),
      }).eq('id', ext.id);
      await supabase.from('pbx_softphone_users' as any)
        .update({ sip_password: sipPassword })
        .eq('extension', String(ext.extension));
      qc.invalidateQueries({ queryKey: ['pbx'] });
      toast.success(`Extension ${ext.extension} pushed to FusionPBX`);
    } catch (e: any) {
      toast.error(e?.message || 'Push failed');
    } finally {
      setPushing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Extension {ext.extension} — Status</DialogTitle>
          <DialogDescription>{ext.effective_cid_name || ext.description || '—'}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground mb-1">FusionPBX UUID</div>
              <StatusBadge ok={!!ext.pbx_uuid} label={ext.pbx_uuid ? 'Pushed' : 'Local only'} />
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground mb-1">Voicemail</div>
              <StatusBadge ok={vmResult ? vmResult.ok : (ext.voicemail_enabled ? null : true)} label={vmResult?.skipped ? 'Disabled' : undefined} />
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground mb-1">SIP Registration</div>
              <StatusBadge ok={registered} label={registered ? 'Registered' : 'Not registered'} />
            </div>
          </div>

          {!ext.pbx_uuid && (
            <div className="rounded-md border border-orange-500/40 bg-orange-500/10 p-3 space-y-3">
              <div className="text-sm">This extension exists locally but was not pushed to FusionPBX.</div>
              <div className="space-y-1">
                <Label htmlFor="repair-pwd" className="text-xs">SIP password {storedPassword ? '(stored)' : '(generated — set/edit before push)'}</Label>
                <div className="flex gap-2">
                  <Input id="repair-pwd" value={pwdInput} onChange={(e) => setPwdInput(e.target.value)} className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={() => setPwdInput(generatePassword())} title="Generate">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={pushToFusionPBX} disabled={pushing}>
                  {pushing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Push to FusionPBX
                </Button>
              </div>
            </div>
          )}

          <section>
            <h3 className="text-sm font-semibold mb-2">Last provisioning attempt</h3>
            {extResult ? (
              <div className="rounded-md border p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <StatusBadge ok={extResult.ok} />
                  <span className="text-xs text-muted-foreground font-mono">
                    {new Date(extResult.attempted_at).toLocaleString()} · {extResult.latency_ms}ms
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>HTTP: <span className="font-mono">{extResult.http_status}</span></div>
                  <div>FusionPBX code: <span className="font-mono">{extResult.embedded_code ?? '—'}</span></div>
                </div>
                {extResult.message && (
                  <div className="text-xs">
                    <div className="text-muted-foreground mb-1">Message</div>
                    <div className="font-mono bg-muted/40 rounded p-2">{extResult.message}</div>
                  </div>
                )}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Raw response</summary>
                  <pre className="font-mono bg-muted/40 rounded p-2 overflow-x-auto mt-1">{JSON.stringify(extResult.response, null, 2)}</pre>
                </details>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No provisioning attempt recorded.</div>
            )}
          </section>

          {vmResult && !vmResult.skipped && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Voicemail provisioning</h3>
              <div className="rounded-md border p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <StatusBadge ok={vmResult.ok} />
                  <span className="text-xs text-muted-foreground font-mono">
                    {vmResult.attempted_at && new Date(vmResult.attempted_at).toLocaleString()} · {vmResult.latency_ms ?? '—'}ms
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>HTTP: <span className="font-mono">{vmResult.http_status ?? '—'}</span></div>
                  <div>FusionPBX code: <span className="font-mono">{vmResult.embedded_code ?? '—'}</span></div>
                </div>
                {vmResult.message && (
                  <div className="text-xs font-mono bg-muted/40 rounded p-2">{vmResult.message}</div>
                )}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
