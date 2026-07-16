import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, Link } from 'react-router-dom';
import {
  ListChecks, UserCog, LogIn, Smartphone, Briefcase, Users,
  Network, RefreshCw, Clock, Printer, MessagesSquare, Building,
  List, Mic, Mail, ClipboardList, XCircle, MailOpen,
  Inbox, Ban, Contact, FileText, ShieldAlert, Phone,
  Expand, Pencil, Plus,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { useEffect, useState } from 'react';

const LEMTEL_ORG_ID = '71755d33-ed64-4ad5-a828-61c9d2029eb7';

type Tile = {
  label: string;
  icon: any;
  iconClass?: string;
  to?: string;
  badge?: string;
  badgeClass?: string;
  onClick?: () => void;
};

function TileCard({ tile }: { tile: Tile }) {
  const Inner = (
    <div className="flex flex-col items-center justify-center gap-2 px-2 py-4 rounded-md hover:bg-muted/60 transition cursor-pointer text-center h-full">
      <div className="text-xs font-semibold text-foreground/80 leading-tight min-h-[28px] flex items-center">
        {tile.label}
      </div>
      <div className="relative">
        <tile.icon className={`w-9 h-9 ${tile.iconClass ?? 'text-primary'}`} strokeWidth={1.75} />
        {tile.badge && (
          <span
            className={`absolute -bottom-1 -right-3 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${tile.badgeClass ?? 'bg-primary'}`}
          >
            {tile.badge}
          </span>
        )}
      </div>
    </div>
  );
  if (tile.onClick) {
    return <button type="button" onClick={tile.onClick} className="w-full">{Inner}</button>;
  }
  return <Link to={tile.to ?? '#'} className="block">{Inner}</Link>;
}

function TileGroup({ tiles, cols = 3 }: { tiles: Tile[]; cols?: number }) {
  return (
    <Card className="p-3">
      <div className={`grid grid-cols-${cols} gap-1`}>
        {tiles.map((t) => (
          <TileCard key={t.label} tile={t} />
        ))}
      </div>
    </Card>
  );
}

function StatusChart({ title, data, stroke }: { title: string; data: any[]; stroke: string }) {
  return (
    <Card className="p-4">
      <div className="text-sm font-semibold text-center mb-2">{title}</div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`g-${title}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={stroke} stopOpacity={0.5} />
              <stop offset="95%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" hide />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} width={28} />
          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
          <Area type="monotone" dataKey="v" stroke={stroke} fill={`url(#g-${title})`} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ['admin-dashboard-tiles', LEMTEL_ORG_ID],
    refetchInterval: 30_000,
    queryFn: async () => {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const last30 = new Date(); last30.setDate(last30.getDate() - 30);
      const last7 = new Date(); last7.setDate(last7.getDate() - 7);
      const [calls, vms, sms, recsAgg, sentiments, recent30, extTotal, softTotal] = await Promise.all([
        (supabase as any).from('pbx_call_records')
          .select('id,call_status,missed_call,start_at,duration_seconds,direction,billsec,extension,destination_number')
          .eq('organization_id', LEMTEL_ORG_ID)
          .gte('start_at', startOfDay.toISOString()),
        (supabase as any).from('pbx_voicemails')
          .select('id,read_at', { count: 'exact', head: true })
          .eq('organization_id', LEMTEL_ORG_ID).is('read_at', null),
        (supabase as any).from('pbx_sms_threads')
          .select('unread_count')
          .eq('organization_id', LEMTEL_ORG_ID),
        (supabase as any).from('pbx_call_recordings')
          .select('id,transcribed,analyzed', { count: 'exact' })
          .eq('organization_id', LEMTEL_ORG_ID).limit(2000),
        (supabase as any).from('pbx_call_recordings')
          .select('sentiment')
          .eq('organization_id', LEMTEL_ORG_ID)
          .not('sentiment','is',null).gte('updated_at', last7.toISOString()).limit(500),
        (supabase as any).from('pbx_call_records')
          .select('start_at,missed_call,billsec,direction')
          .eq('organization_id', LEMTEL_ORG_ID)
          .gte('start_at', last30.toISOString()).limit(20000),
        (supabase as any).from('pbx_extensions')
          .select('id', { count: 'exact', head: true }).eq('organization_id', LEMTEL_ORG_ID),
        (supabase as any).from('pbx_softphone_users')
          .select('id,app_access_enabled,desktop_access_enabled,mobile_access_enabled', { count: 'exact' })
          .eq('organization_id', LEMTEL_ORG_ID).limit(2000),
      ]);
      const callRows = (calls.data ?? []) as any[];
      const smsRows = (sms.data ?? []) as any[];
      const recRows = (recsAgg.data ?? []) as any[];
      const sentRows = (sentiments.data ?? []) as any[];
      const r30 = (recent30.data ?? []) as any[];
      const softRows = (softTotal.data ?? []) as any[];
      const answered = callRows.filter(r => (r.billsec ?? 0) > 0).length;
      const inbound = callRows.filter(r => r.direction === 'inbound').length;
      const outbound = callRows.filter(r => r.direction === 'outbound').length;
      const minutesToday = Math.round(callRows.reduce((s, r) => s + (r.billsec || 0), 0) / 60);
      const totalRec = (recsAgg as any).count ?? recRows.length;
      const transcribed = recRows.filter(r => r.transcribed).length;
      const analyzed = recRows.filter(r => r.analyzed).length;
      const sentDist = sentRows.reduce<Record<string, number>>((acc, r) => {
        const k = String(r.sentiment || 'unknown').toLowerCase();
        acc[k] = (acc[k] || 0) + 1; return acc;
      }, {});
      const perDay: Record<string, number> = {};
      const missedPerDay: Record<string, number> = {};
      r30.forEach(r => {
        const d = (r.start_at || '').slice(0, 10);
        if (!d) return;
        perDay[d] = (perDay[d] || 0) + 1;
        if (r.missed_call) missedPerDay[d] = (missedPerDay[d] || 0) + 1;
      });
      const days30 = Object.keys(perDay).sort().map(d => ({ t: d.slice(5), v: perDay[d], missed: missedPerDay[d] || 0 }));
      const perHourToday: Record<number, number> = {};
      callRows.forEach(r => { const h = new Date(r.start_at).getHours(); perHourToday[h] = (perHourToday[h] || 0) + 1; });
      const hoursToday = Array.from({length: 24}, (_, i) => ({ t: `${i}h`, v: perHourToday[i] || 0 }));
      const topExt: Record<string, number> = {};
      callRows.forEach(r => { if (r.extension) topExt[r.extension] = (topExt[r.extension] || 0) + 1; });
      const topExtensions = Object.entries(topExt).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([ext,v])=>({ext,v}));
      return {
        callsToday: callRows.length,
        missed: callRows.filter((r) => r.missed_call).length,
        answered, inbound, outbound, minutesToday,
        answerRate: callRows.length ? Math.round((answered / callRows.length) * 100) : 0,
        newVoicemails: (vms as any).count ?? 0,
        unreadSms: smsRows.reduce((s, t) => s + (t.unread_count || 0), 0),
        totalRec, transcribed, analyzed,
        transcribePct: totalRec ? Math.round((transcribed / totalRec) * 100) : 0,
        analyzedPct: totalRec ? Math.round((analyzed / totalRec) * 100) : 0,
        sentiment: sentDist,
        days30, hoursToday, topExtensions,
        extensionsTotal: (extTotal as any).count ?? 0,
        softphoneTotal: (softTotal as any).count ?? softRows.length,
        desktopGrant: softRows.filter(s => s.desktop_access_enabled !== false).length,
        mobileGrant: softRows.filter(s => s.mobile_access_enabled !== false).length,
      };
    },
  });


  // Live registrations from FusionPBX (15s server-side cache)
  const { data: regs } = useQuery({
    queryKey: ['admin-dashboard-registrations', LEMTEL_ORG_ID],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'get-registrations-live', organization_id: LEMTEL_ORG_ID },
      });
      if (error) throw error;
      return { registered: (data as any)?.registered ?? 0, total: (data as any)?.count ?? 0 };
    },
  });

  // Live active calls (5s server-side cache)
  const { data: activeCalls } = useQuery({
    queryKey: ['admin-dashboard-active-calls', LEMTEL_ORG_ID],
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'get-active-calls-live', organization_id: LEMTEL_ORG_ID },
      });
      if (error) throw error;
      return (data as any)?.count ?? 0;
    },
  });

  // Live system health (10s server-side cache). Returns null fields when unavailable.
  const { data: health } = useQuery({
    queryKey: ['admin-dashboard-system-health', LEMTEL_ORG_ID],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'get-system-health-live', organization_id: LEMTEL_ORG_ID },
      });
      if (error) throw error;
      return (data as any)?.data ?? null;
    },
  });

  const callsToday = stats?.callsToday ?? 0;
  const missed = stats?.missed ?? 0;
  const reg = `${regs?.registered ?? 0} / ${regs?.total ?? 0}`;
  const newMsgs = (stats?.newVoicemails ?? 0) + (stats?.unreadSms ?? 0);

  // Rolling 20-point sparklines fed from real metrics
  const [cpu, setCpu] = useState<any[]>(Array.from({ length: 20 }, (_, i) => ({ t: i, v: 0 })));
  const [net, setNet] = useState<any[]>(Array.from({ length: 20 }, (_, i) => ({ t: i, v: 0 })));
  const [active, setActive] = useState<any[]>(Array.from({ length: 20 }, (_, i) => ({ t: i, v: 0 })));

  useEffect(() => {
    setActive((p) => [...p.slice(1), { t: p.length, v: activeCalls ?? 0 }]);
  }, [activeCalls]);

  useEffect(() => {
    if (health?.cpu_percent != null) {
      setCpu((p) => [...p.slice(1), { t: p.length, v: Number(health.cpu_percent) }]);
    }
    if (health?.memory_percent != null) {
      setNet((p) => [...p.slice(1), { t: p.length, v: Number(health.memory_percent) }]);
    }
  }, [health]);

  const triggerSoftphone = () => {
    window.dispatchEvent(new CustomEvent('softphone:open'));
  };

  const accountTiles: Tile[] = [
    { label: 'Registrations', icon: ListChecks, to: '/org/lemtel/admin/extensions', badge: reg, badgeClass: 'bg-primary' },
    { label: 'Account Settings', icon: UserCog, to: '/org/lemtel/admin/settings' },
    { label: 'Destinations', icon: LogIn, to: '/org/lemtel/admin/dids' },
    { label: 'Devices', icon: Smartphone, to: '/org/lemtel/admin/devices' },
    { label: 'Extensions', icon: Briefcase, to: '/org/lemtel/admin/extensions' },
    { label: 'Ring Groups', icon: Users, to: '/org/lemtel/admin/ring-groups' },
  ];

  const callMgmtTiles: Tile[] = [
    { label: 'IVR Menus', icon: Network, to: '/org/lemtel/admin/ivr' },
    { label: 'Call Flows', icon: RefreshCw, to: '/org/lemtel/admin/queues' },
    { label: 'Time Conditions', icon: Clock, to: '/org/lemtel/admin/hours' },
    { label: 'Fax Server', icon: Printer, to: '/org/lemtel/admin/fax' },
    { label: 'Conferences', icon: MessagesSquare, to: '/org/lemtel/admin/conferences' },
    { label: 'Conference Centers', icon: Building, iconClass: 'text-purple-500', to: '/org/lemtel/admin/conference-centers' },
  ];

  const recordsTiles: Tile[] = [
    { label: 'Call Detail Records', icon: List, to: '/org/lemtel/telephony/calls' },
    { label: 'Call Recordings', icon: Mic, to: '/org/lemtel/admin/recordings' },
    { label: 'Voicemails', icon: Mail, to: '/org/lemtel/admin/voicemail' },
    { label: 'Recent Calls', icon: ClipboardList, to: '/org/lemtel/telephony/calls', badge: String(callsToday), badgeClass: 'bg-primary' },
    { label: 'Missed Calls', icon: XCircle, iconClass: 'text-muted-foreground', to: '/org/lemtel/telephony/calls?filter=missed', badge: String(missed), badgeClass: 'bg-red-500' },
    { label: 'New Messages', icon: MailOpen, iconClass: 'text-muted-foreground', to: '/org/lemtel/telephony/messages', badge: String(newMsgs), badgeClass: 'bg-green-500' },
  ];

  const toolsTiles: Tile[] = [
    { label: 'Email Queue', icon: Inbox, to: '/org/lemtel/admin/email-queue' },
    { label: 'Call Block', icon: Ban, iconClass: 'text-red-500', to: '/org/lemtel/admin/call-block' },
    { label: 'Contacts', icon: Contact, to: '/org/lemtel/admin/contacts' },
    { label: 'FAX Queue', icon: FileText, to: '/org/lemtel/admin/fax-queue' },
    { label: 'Event Guard', icon: ShieldAlert, iconClass: 'text-orange-500', to: '/org/lemtel/admin/event-guard' },
    { label: 'Phone', icon: Phone, iconClass: 'text-green-500', onClick: triggerSoftphone },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1">
            <Expand className="w-4 h-4" /> Expand All
          </Button>
          <Button variant="outline" size="sm" className="gap-1">
            <Pencil className="w-4 h-4" /> Edit
          </Button>
          <Button size="sm" className="gap-1" onClick={() => navigate('/org/lemtel/admin/settings')}>
            <Plus className="w-4 h-4" /> Settings
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TileGroup tiles={accountTiles} />
        <TileGroup tiles={callMgmtTiles} />
        <TileGroup tiles={recordsTiles} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TileGroup tiles={toolsTiles} />
        <div className="md:col-span-2" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusChart
          title={`System CPU${health?.metrics_available?.cpu === false ? ' (Unavailable)' : health?.cpu_percent != null ? ` — ${Math.round(Number(health.cpu_percent))}%` : ''}`}
          data={cpu}
          stroke="hsl(217 91% 60%)"
        />
        <StatusChart
          title={`Memory${health?.metrics_available?.memory === false ? ' (Unavailable)' : health?.memory_percent != null ? ` — ${Math.round(Number(health.memory_percent))}%` : ''}`}
          data={net}
          stroke="hsl(142 71% 45%)"
        />
        <StatusChart title={`Active Calls — ${activeCalls ?? 0}`} data={active} stroke="hsl(199 89% 48%)" />
      </div>

      {/* Real KPIs from live database */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: 'Calls today', value: stats?.callsToday ?? 0 },
          { label: 'Answered', value: stats?.answered ?? 0 },
          { label: 'Missed', value: stats?.missed ?? 0, cls: 'text-red-600' },
          { label: 'Answer rate', value: `${stats?.answerRate ?? 0}%` },
          { label: 'Minutes today', value: stats?.minutesToday ?? 0 },
          { label: 'Inbound', value: stats?.inbound ?? 0 },
          { label: 'Outbound', value: stats?.outbound ?? 0 },
          { label: 'Extensions', value: stats?.extensionsTotal ?? 0 },
        ].map(k => (
          <Card key={k.label} className="p-3">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className={`text-2xl font-bold ${(k as any).cls ?? ''}`}>{k.value}</div>
          </Card>
        ))}
      </div>

      {/* Recordings & AI insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-sm font-semibold mb-1">Recordings coverage</div>
          <div className="text-3xl font-bold">{stats?.totalRec ?? 0}</div>
          <div className="text-xs text-muted-foreground">
            {stats?.transcribed ?? 0} transcribed ({stats?.transcribePct ?? 0}%) ·
            {' '}{stats?.analyzed ?? 0} analyzed ({stats?.analyzedPct ?? 0}%)
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm font-semibold mb-2">Sentiment (last 7d)</div>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(stats?.sentiment ?? {}).map(([k, v]) => (
              <Badge key={k} variant="outline" className={
                k === 'positive' ? 'bg-green-500/15 text-green-600 border-green-500/30' :
                k === 'negative' ? 'bg-red-500/15 text-red-600 border-red-500/30' :
                'bg-blue-500/15 text-blue-600 border-blue-500/30'
              }>{k}: {v as number}</Badge>
            ))}
            {!Object.keys(stats?.sentiment ?? {}).length && (
              <span className="text-xs text-muted-foreground">No analyzed calls yet — open Recordings → AI Insights.</span>
            )}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm font-semibold mb-1">App access</div>
          <div className="text-xs text-muted-foreground">
            {stats?.desktopGrant ?? 0} desktop · {stats?.mobileGrant ?? 0} mobile / {stats?.softphoneTotal ?? 0} softphone users
          </div>
          <Link to="/org/lemtel/admin/extensions" className="text-xs text-primary underline">Manage app access →</Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatusChart title="Calls by hour (today)" data={stats?.hoursToday ?? []} stroke="hsl(199 89% 48%)" />
        <StatusChart title="Calls per day (30d)" data={stats?.days30 ?? []} stroke="hsl(142 71% 45%)" />
      </div>

      {!!(stats?.topExtensions?.length) && (
        <Card className="p-4">
          <div className="text-sm font-semibold mb-2">Top extensions today</div>
          <div className="space-y-1">
            {stats!.topExtensions!.map((e: any) => (
              <div key={e.ext} className="flex items-center justify-between text-sm border-b last:border-b-0 py-1">
                <span className="font-mono">{e.ext}</span>
                <span className="font-semibold">{e.v} calls</span>
              </div>
            ))}
          </div>
        </Card>
      )}

    </div>
  );
}
