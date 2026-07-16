import { useEffect, useState } from 'react';
import { useActiveDomain } from '@/hooks/useActiveDomain';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Phone, Users, Hash, Voicemail, Activity, Radio, PhoneIncoming, PhoneOutgoing, PhoneMissed, Timer, Radar, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

type Counts = {
  extensions: number;
  devices: number;
  numbers: number;
  ivrs: number;
  queues: number;
  ringGroups: number;
  callsToday: number;
  recordings: number;
  inboundToday: number;
  outboundToday: number;
  missedToday: number;
  avgDurationSec: number;
  activeNow: number;
  lastSyncAt: string | null;
};

const TILE = [
  { key: 'extensions', label: 'Extensions', icon: Phone, path: 'extensions' },
  { key: 'devices', label: 'Devices', icon: Radio, path: 'devices' },
  { key: 'numbers', label: 'Phone Numbers', icon: Hash, path: 'dids' },
  { key: 'ivrs', label: 'IVR Menus', icon: Voicemail, path: 'ivr' },
  { key: 'queues', label: 'Queues', icon: Users, path: 'queues' },
  { key: 'ringGroups', label: 'Ring Groups', icon: Users, path: 'ring-groups' },
  { key: 'callsToday', label: 'Calls today', icon: Activity, path: 'calls' },
  { key: 'recordings', label: 'Recordings', icon: Voicemail, path: 'recordings' },
] as const;

const LIVE = [
  { key: 'inboundToday', label: 'Inbound today', icon: PhoneIncoming },
  { key: 'outboundToday', label: 'Outbound today', icon: PhoneOutgoing },
  { key: 'missedToday', label: 'Missed today', icon: PhoneMissed },
  { key: 'avgDurationSec', label: 'Avg duration', icon: Timer, format: (v: number) => `${Math.round(v)}s` },
  { key: 'activeNow', label: 'Active right now', icon: Radar },
] as const;

const REFRESH_MS = 30_000;

export default function DomainDashboard() {
  const active = useActiveDomain();
  const [c, setC] = useState<Counts>({
    extensions: 0, devices: 0, numbers: 0, ivrs: 0, queues: 0, ringGroups: 0,
    callsToday: 0, recordings: 0,
    inboundToday: 0, outboundToday: 0, missedToday: 0,
    avgDurationSec: 0, activeNow: 0, lastSyncAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!active?.org_id) return;
    let cancelled = false;
    const sb: any = supabase;

    const load = async () => {
      const org = active.org_id;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const ts = today.toISOString();
      const [ext, dev, num, ivr, q, rg, cdrs, rec, inb, outb, miss, dur, live, sync] = await Promise.all([
        sb.from('pbx_extensions').select('extension_uuid', { count: 'exact', head: true }).eq('organization_id', org),
        sb.from('pbx_devices').select('device_uuid', { count: 'exact', head: true }).eq('organization_id', org),
        sb.from('phone_numbers').select('id', { count: 'exact', head: true }).eq('organization_id', org),
        sb.from('pbx_ivrs').select('ivr_menu_uuid', { count: 'exact', head: true }).eq('organization_id', org),
        sb.from('pbx_call_queues').select('queue_uuid', { count: 'exact', head: true }).eq('organization_id', org),
        sb.from('pbx_ring_groups').select('ring_group_uuid', { count: 'exact', head: true }).eq('organization_id', org),
        sb.from('pbx_call_records').select('id', { count: 'exact', head: true }).eq('organization_id', org).gte('start_stamp', ts),
        sb.from('pbx_call_recordings').select('id', { count: 'exact', head: true }).eq('organization_id', org),
        sb.from('pbx_call_records').select('id', { count: 'exact', head: true }).eq('organization_id', org).gte('start_stamp', ts).eq('direction', 'inbound'),
        sb.from('pbx_call_records').select('id', { count: 'exact', head: true }).eq('organization_id', org).gte('start_stamp', ts).eq('direction', 'outbound'),
        sb.from('pbx_call_records').select('id', { count: 'exact', head: true }).eq('organization_id', org).gte('start_stamp', ts).in('hangup_cause', ['NO_ANSWER', 'USER_BUSY', 'ORIGINATOR_CANCEL']),
        sb.from('pbx_call_records').select('duration').eq('organization_id', org).gte('start_stamp', ts).not('duration', 'is', null).limit(500),
        sb.from('telecom_live_calls').select('id', { count: 'exact', head: true }).eq('organization_id', org),
        sb.from('telecom_sync_health').select('last_sync_at').eq('organization_id', org).order('last_sync_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      const durations: number[] = (dur.data || []).map((r: any) => Number(r.duration) || 0);
      const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
      setC({
        extensions: ext.count ?? 0,
        devices: dev.count ?? 0,
        numbers: num.count ?? 0,
        ivrs: ivr.count ?? 0,
        queues: q.count ?? 0,
        ringGroups: rg.count ?? 0,
        callsToday: cdrs.count ?? 0,
        recordings: rec.count ?? 0,
        inboundToday: inb.count ?? 0,
        outboundToday: outb.count ?? 0,
        missedToday: miss.count ?? 0,
        avgDurationSec: avg,
        activeNow: live.count ?? 0,
        lastSyncAt: sync.data?.last_sync_at ?? null,
      });
      setRefreshedAt(new Date());
      setLoading(false);
    };

    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [active?.org_id]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{active?.name || 'Domain'} · Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Phone system cockpit for this customer domain.
          </p>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <RefreshCw className="h-3 w-3" />
          {refreshedAt ? `Updated ${refreshedAt.toLocaleTimeString()}` : 'Loading…'}
          {c.lastSyncAt && <span>· Last sync {new Date(c.lastSyncAt).toLocaleTimeString()}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {LIVE.map(({ key, label, icon: Icon, format }: any) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? '—' : (format ? format((c as any)[key]) : (c as any)[key])}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {TILE.map(({ key, label, icon: Icon, path }) => (
          <Link key={key} to={`./${path}`}>
            <Card className="hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{loading ? '—' : (c as any)[key]}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Quick links</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          {[
            ['extensions', 'Extensions'], ['devices', 'Devices'], ['ivr', 'IVR'],
            ['queues', 'Queues'], ['ring-groups', 'Ring Groups'], ['hold-music', 'Music on hold'],
            ['dids', 'Phone Numbers'], ['hours', 'Business Hours'], ['recordings', 'Recordings'],
            ['calls', 'Call History'], ['pbx-users', 'Users'], ['settings', 'Settings'],
          ].map(([p, l]) => (
            <Link key={p} to={`./${p}`} className="px-3 py-1.5 rounded-md border border-border/60 hover:bg-accent">{l}</Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
