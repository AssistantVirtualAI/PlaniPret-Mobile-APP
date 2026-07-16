import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Smartphone, Monitor, Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Inline buttons to mint a one-shot auto-login token for a softphone user,
 * scoped to the customer domain. Copies the deep-link to clipboard.
 */
export default function SendAppInviteButtons({
  portalUserId,
  organizationId,
}: { portalUserId?: string | null; organizationId?: string | null }) {
  const [busy, setBusy] = useState<'mobile' | 'desktop' | null>(null);
  const [copied, setCopied] = useState(false);

  if (!portalUserId || !organizationId) {
    return <span className="text-xs text-muted-foreground">No portal account</span>;
  }

  const mint = async (app: 'mobile' | 'desktop') => {
    setBusy(app);
    try {
      const { data, error } = await supabase.functions.invoke('mint-app-login-token', {
        body: { target_user_id: portalUserId, organization_id: organizationId, app },
      });
      if (error) throw error;
      const token = (data as any)?.token;
      if (!token) throw new Error('No token returned');

      const base = app === 'mobile'
        ? 'avastatistic://login'
        : window.location.origin + '/login';
      const url = `${base}?ava_token=${encodeURIComponent(token)}`;

      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success(`${app === 'mobile' ? 'Mobile' : 'Desktop'} invite link copied (valid 15 min)`);
    } catch (e: any) {
      toast.error('Mint failed: ' + (e?.message || 'unknown'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => mint('desktop')} disabled={busy !== null} title="Desktop auto-login link">
        {busy === 'desktop' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Monitor className="w-3.5 h-3.5" />}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => mint('mobile')} disabled={busy !== null} title="Mobile auto-login link">
        {busy === 'mobile' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />}
      </Button>
      {copied && <Check className="w-3.5 h-3.5 text-primary self-center" />}
    </div>
  );
}
