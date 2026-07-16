import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Smartphone, CheckCircle2, XCircle, KeyRound, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export default function MyDevices() {
  const [loading, setLoading] = useState(true);
  const [ext, setExt] = useState<string | null>(null);
  const [softphone, setSoftphone] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [resetting, setResetting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const syncSipPassword = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('softphone-sync-password', { body: { force_local_to_pbx: true } });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error || (data as any)?.message);
      const changed = (data as any)?.changed;
      toast.success(changed ? 'SIP password forced into PBX and apps. Reloading…' : 'Password already aligned.');
      if (changed) setTimeout(() => window.location.reload(), 800);
    } catch (e: any) {
      toast.error('Sync failed: ' + (e?.message || e));
    } finally { setSyncing(false); }
  };

  const resetSipPassword = async () => {
    if (!confirm('Reset SIP password? You will need to sign in again on every device.')) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('softphone-reset-password', { body: {} });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      toast.success('SIP password reset. Reloading…');
      setTimeout(() => window.location.reload(), 800);
    } catch (e: any) {
      toast.error('Reset failed: ' + (e?.message || e));
    } finally { setResetting(false); }
  };

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setLoading(false); return; }
      const { data: spu } = await (supabase as any)
        .from('pbx_softphone_users')
        .select('id, extension, status, last_seen_at, active_platforms, last_seen_web, last_seen_ios, last_seen_android, last_seen_mac, last_seen_windows, last_seen_linux')
        .eq('portal_user_id', auth.user.id)
        .maybeSingle();
      setSoftphone(spu);
      setExt(spu?.extension ?? null);
      const { data: devs } = await (supabase as any)
        .from('pbx_user_devices')
        .select('*')
        .eq('user_id', auth.user.id)
        .order('updated_at', { ascending: false });
      setDevices(devs ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!ext) return <div className="p-6 text-muted-foreground">No extension assigned.</div>;

  const platforms: Array<[string, string | null]> = [
    ['Web', softphone?.last_seen_web],
    ['iOS', softphone?.last_seen_ios],
    ['Android', softphone?.last_seen_android],
    ['Mac', softphone?.last_seen_mac],
    ['Windows', softphone?.last_seen_windows],
    ['Linux', softphone?.last_seen_linux],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Smartphone className="h-6 w-6 text-cockpit-cyan" />
        <h1 className="page-title text-2xl font-semibold">My Devices · Ext {ext}</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>Registration status</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            {softphone?.status === 'online'
              ? <><CheckCircle2 className="h-4 w-4 text-cockpit-success" /><span>Online</span></>
              : <><XCircle className="h-4 w-4 text-muted-foreground" /><span>Offline</span></>}
            {softphone?.last_seen_at && (
              <Badge variant="outline" className="ml-2">last seen {formatDistanceToNow(new Date(softphone.last_seen_at), { addSuffix: true })}</Badge>
            )}
            <Button size="sm" variant="outline" className="ml-auto" disabled={syncing} onClick={syncSipPassword}>
              {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <KeyRound className="w-3.5 h-3.5 mr-1" />}
              Force password sync
            </Button>
            <Button size="sm" variant="outline" disabled={resetting} onClick={resetSipPassword}>
              {resetting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <KeyRound className="w-3.5 h-3.5 mr-1" />}
              Reset SIP password
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">If the softphone shows <code>Registration failed: Rejected (403)</code>, force-sync pushes the stored SIP password into the PBX, portal login, desktop app, and mobile app.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {platforms.map(([name, ts]) => (
              <div key={name} className="rounded-lg border border-cockpit-border/40 p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{name}</div>
                <div className="text-sm mt-1">{ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : '—'}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Registered devices ({devices.length})</CardTitle></CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <div className="text-muted-foreground text-sm">No devices registered yet. Sign in from the desktop or mobile app.</div>
          ) : (
            <div className="space-y-2">
              {devices.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-cockpit-border/40 p-3">
                  <div>
                    <div className="font-medium">{d.device_name ?? d.platform ?? 'Device'}</div>
                    <div className="text-xs text-muted-foreground">{d.user_agent ?? d.platform}</div>
                  </div>
                  <Badge variant="outline">{d.updated_at ? formatDistanceToNow(new Date(d.updated_at), { addSuffix: true }) : '—'}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
