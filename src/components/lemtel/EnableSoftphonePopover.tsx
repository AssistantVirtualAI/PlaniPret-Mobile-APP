import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, RefreshCw, Copy, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const LEMTEL_ORG = '71755d33-ed64-4ad5-a828-61c9d2029eb7';
const SIP_DOMAIN = 'lemtel.lemtel.tel';

function generatePassword(len = 16) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

interface Props {
  extensionId: string;
  extension: string;
  defaultDisplayName?: string;
}

export function EnableSoftphonePopover({ extensionId, extension, defaultDisplayName = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState(() => generatePassword());
  const [displayName, setDisplayName] = useState(defaultDisplayName || `Ext ${extension}`);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const enable = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('pbx_softphone_users' as any).insert({
        organization_id: LEMTEL_ORG,
        extension_id: extensionId,
        extension,
        sip_domain: SIP_DOMAIN,
        display_name: displayName,
        status: 'offline',
      });
      if (error) throw error;
      toast.success(`✅ Softphone enabled for ext ${extension}`);
      qc.invalidateQueries({ queryKey: ['pbx'] });
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to enable softphone');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7">
          <Plus className="w-3 h-3 mr-1" /> Enable
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        <div className="text-sm font-medium">Enable softphone — ext {extension}</div>
        <div className="space-y-2">
          <Label className="text-xs">Display name</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">SIP password</Label>
          <div className="flex gap-1">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono text-xs" />
            <Button type="button" size="icon" variant="outline" title="Regenerate"
              onClick={() => setPassword(generatePassword())}>
              <RefreshCw className="w-3 h-3" />
            </Button>
            <Button type="button" size="icon" variant="outline" title="Copy"
              onClick={() => { navigator.clipboard.writeText(password); toast.success('Copied'); }}>
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <Button onClick={enable} disabled={saving} className="w-full">
          {saving && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
          Enable
        </Button>
      </PopoverContent>
    </Popover>
  );
}
