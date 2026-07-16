import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Eye, EyeOff, RefreshCw, ShieldAlert, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useLemtelAccess } from '@/hooks/useLemtelAccess';
import { Alert, AlertDescription } from '@/components/ui/alert';

const LEMTEL_ORG = '71755d33-ed64-4ad5-a828-61c9d2029eb7';
const DOMAIN_UUID = '2936594e-17b7-42a9-9165-95be48627923';
const SIP_DOMAIN = 'lemtel.lemtel.tel';
const WSS_URL = 'wss://lemtel.lemtel.tel:7443';
const DEFAULT_OUTBOUND_CID = '15144942888';

function generatePassword(len = 16) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

export interface ExtensionPrefill {
  extension?: string;
  displayName?: string;
  outboundCid?: string;
  enableSoftphone?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefill?: ExtensionPrefill;
}

export function ProvisionExtensionModal({ open, onOpenChange, prefill }: Props) {
  const [extension, setExtension] = useState('');
  const [sipPassword, setSipPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [callerIdName, setCallerIdName] = useState('');
  const [outboundCid, setOutboundCid] = useState(DEFAULT_OUTBOUND_CID);
  const [callTimeout, setCallTimeout] = useState('30');
  const [callGroup, setCallGroup] = useState('');
  const [voicemail, setVoicemail] = useState(true);
  const [callRecording, setCallRecording] = useState<'none' | 'inbound' | 'outbound' | 'all'>('none');
  const [enabled, setEnabled] = useState(true);
  const [enableSoftphone, setEnableSoftphone] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const qc = useQueryClient();
  const { isAdmin } = useLemtelAccess();

  // Initialize / re-initialize when opening
  useEffect(() => {
    if (open) {
      setExtension(prefill?.extension ?? '');
      setDisplayName(prefill?.displayName ?? '');
      setCallerIdName(prefill?.displayName ?? '');
      setOutboundCid(prefill?.outboundCid ?? DEFAULT_OUTBOUND_CID);
      setSipPassword(generatePassword());
      setCallTimeout('30');
      setCallGroup('');
      setVoicemail(true);
      setCallRecording('none');
      setEnabled(true);
      setEnableSoftphone(prefill?.enableSoftphone ?? true);
      setErrorMsg(null);
      setShowPwd(false);
    }
  }, [open, prefill]);

  // Auto-mirror display name → caller ID name when user hasn't edited CID
  useEffect(() => {
    setCallerIdName((curr) => (curr === '' || curr === displayName ? displayName : curr));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName]);

  const submit = async () => {
    setErrorMsg(null);
    if (!isAdmin) { toast.error('Admin access required'); return; }
    if (!/^\d{3,11}$/.test(extension)) { setErrorMsg('Extension must be 3–11 digits'); return; }
    if (sipPassword.length < 8) { setErrorMsg('SIP password must be at least 8 characters'); return; }
    if (!displayName.trim()) { setErrorMsg('Display name is required'); return; }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: {
          action: 'create-extension',
          organization_id: LEMTEL_ORG,
          params: {
            domain_uuid: DOMAIN_UUID,
            extension,
            password: sipPassword,
            effective_caller_id_name: callerIdName || displayName,
            effective_caller_id_number: extension,
            outbound_caller_id_name: displayName,
            outbound_caller_id_number: outboundCid || DEFAULT_OUTBOUND_CID,
            emergency_caller_id_name: 'Lemtel',
            emergency_caller_id_number: '5144942888',
            call_timeout: callTimeout,
            call_group: callGroup || '',
            user_record: callRecording,
            voicemail_enabled: voicemail ? 'true' : 'false',
            enabled: enabled ? 'true' : 'false',
            description: displayName,
            user_context: SIP_DOMAIN,
            accountcode: SIP_DOMAIN,
            limit_max: '5',
            limit_destination: '!USER_BUSY',
          },
        },
      });
      if (error) throw new Error(error.message || 'Edge function call failed');
      const result = data as any;
      if (result?.error) {
        const code = result.error;
        const embed = result.embeddedCode ? ` [FusionPBX ${result.embeddedCode}]` : '';
        const msg = result.message || result.details?.details?.[0]?.message || code;
        if (code === 'FUSIONPBX_AUTH_FAILED') throw new Error('Authentication error — check API key');
        if (code === 'DUPLICATE_EXTENSION' || /duplicate|exists/i.test(msg)) {
          throw new Error(`Extension ${extension} already exists in FusionPBX${embed}`);
        }
        if (code === 'FUSIONPBX_UNREACHABLE') throw new Error('Cannot reach FusionPBX — check connection');
        throw new Error(`${msg}${embed}`);
      }

      // Extract extension_uuid from FusionPBX response
      const extUuid =
        result?.extension_uuid ||
        result?.data?.extensions?.[0]?.extension_uuid ||
        result?.data?.extension_uuid ||
        null;

      // Insert into pbx_extensions with full provisioning metadata
      const { data: row, error: insErr } = await supabase
        .from('pbx_extensions' as any)
        .insert({
          organization_id: LEMTEL_ORG,
          pbx_uuid: extUuid,
          extension,
          effective_cid_name: displayName,
          effective_cid_number: extension,
          call_group: callGroup || null,
          voicemail_enabled: voicemail,
          call_recording: callRecording,
          enabled,
          description: displayName,
          domain_uuid: DOMAIN_UUID,
          raw_data: {
            password: sipPassword,
            sip_password: sipPassword,
            provisioning: {
              extension_result: result?.extension_result ?? null,
              voicemail_result: result?.voicemail_result ?? null,
              completed_at: new Date().toISOString(),
            },
          },
          synced_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (insErr && !/duplicate|unique/i.test(insErr.message)) {
        console.warn('Local insert failed', insErr);
      }

      // Softphone user record
      if (enableSoftphone) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('pbx_softphone_users' as any).upsert({
          organization_id: LEMTEL_ORG,
          extension_id: (row as any)?.id ?? null,
          extension,
          sip_domain: SIP_DOMAIN,
          wss_url: WSS_URL,
          display_name: displayName,
          sip_password: sipPassword,
          portal_user_id: user?.id ?? null,
          status: 'offline',
        }, { onConflict: 'extension' });
      }

      toast.success(`✅ Extension ${extension} created successfully`);
      qc.invalidateQueries({ queryKey: ['pbx'] });
      onOpenChange(false);
    } catch (e: any) {
      const msg = e?.message || 'Failed to create extension';
      if (/permission|forbidden/i.test(msg)) setErrorMsg('You need admin access to create extensions');
      else setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Extension</DialogTitle>
          <DialogDescription>Create a new SIP extension in FusionPBX</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!isAdmin && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>Lemtel admin or super-admin role required.</AlertDescription>
            </Alert>
          )}

          {errorMsg && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ext">Extension Number *</Label>
              <Input id="ext" placeholder="300" inputMode="numeric" value={extension}
                onChange={(e) => setExtension(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pwd">SIP Password *</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input id="pwd" type={showPwd ? 'text' : 'password'} value={sipPassword}
                    onChange={(e) => setSipPassword(e.target.value)} className="pr-9" />
                  <button type="button" onClick={() => setShowPwd(s => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" size="icon" title="Generate"
                  onClick={() => setSipPassword(generatePassword())}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Display Name *</Label>
              <Input id="name" placeholder="Mohamad Hassoun" value={displayName}
                onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cid">Caller ID Name</Label>
              <Input id="cid" placeholder={displayName || 'Display name'} value={callerIdName}
                onChange={(e) => setCallerIdName(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ocid">Outbound Caller ID Number</Label>
              <Input id="ocid" placeholder="15144942888" value={outboundCid}
                onChange={(e) => setOutboundCid(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">Call Timeout (seconds)</Label>
              <Select value={callTimeout} onValueChange={setCallTimeout}>
                <SelectTrigger id="to"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['15', '20', '30', '45', '60'].map(v => <SelectItem key={v} value={v}>{v}s</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cg">Call Group</Label>
              <Input id="cg" placeholder="sales" value={callGroup}
                onChange={(e) => setCallGroup(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rec">Call Recording</Label>
              <Select value={callRecording} onValueChange={(v) => setCallRecording(v as any)}>
                <SelectTrigger id="rec"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch id="vm" checked={voicemail} onCheckedChange={setVoicemail} />
              <Label htmlFor="vm">Voicemail</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="en" checked={enabled} onCheckedChange={setEnabled} />
              <Label htmlFor="en">Enabled</Label>
            </div>
          </div>

          <div className="rounded-md border p-3 bg-muted/30 space-y-1">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox checked={enableSoftphone} onCheckedChange={(v) => setEnableSoftphone(!!v)} className="mt-1" />
              <div>
                <div className="font-medium text-sm">Enable Softphone Access</div>
                <div className="text-xs text-muted-foreground">Create softphone account — allows login to Lemtel Telecom desktop/mobile app</div>
              </div>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !isAdmin}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Extension
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
