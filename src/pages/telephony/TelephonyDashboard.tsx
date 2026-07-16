import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, MessageSquare, Smartphone, Voicemail, Brain, Plus, RefreshCw, Bot, Activity, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { usePbxCallRecords, usePbxExtensions, usePbxSmsThreads, usePbxIntegration, usePbxAgents, usePbxDevices, usePbxSync, usePbxRegistrations, usePbxSyncJobs } from '@/hooks/usePbxData';
import { formatDistanceToNow } from 'date-fns';

const COLORS = ['#22c55e', '#3b82f6', '#ef4444'];

export default function TelephonyDashboard() {
  const { data: cdrs = [] } = usePbxCallRecords(500);
  const { data: extensions = [] } = usePbxExtensions();
  const { data: devices = [] } = usePbxDevices();
  const { data: sms = [] } = usePbxSmsThreads();
  const { data: agents = [] } = usePbxAgents();
  const { data: integration } = usePbxIntegration();
  const { data: registrations = [] } = usePbxRegistrations(30000);
  const sync = usePbxSync();
  const { data: syncJobs = [] } = usePbxSyncJobs(3);

  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const today = startOfDay(new Date());
  const yesterday = startOfDay(new Date(Date.now() - 86400000));

  const isToday = (s: string) => s && new Date(s) >= today;
  const isYesterday = (s: string) => s && new Date(s) >= yesterday && new Date(s) < today;

  const calls = cdrs as any[];
  const todayCalls = calls.filter(c => isToday(c.start_at));
  const missed = todayCalls.filter(c => c.missed_call || c.call_status === 'missed').length;
  const answered = todayCalls.filter(c => c.answer_at).length;
  const avgDur = todayCalls.length ? Math.round(todayCalls.reduce((s,c) => s + (c.duration_seconds || 0), 0) / todayCalls.length) : 0;
  const answerRate = todayCalls.length ? Math.round((answered / todayCalls.length) * 100) : 0;

  const byHour = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, today: 0, yesterday: 0 }));
    calls.forEach(c => {
      if (!c.start_at) return;
      const d = new Date(c.start_at);
      const h = d.getHours();
      if (isToday(c.start_at)) buckets[h].today++;
      else if (isYesterday(c.start_at)) buckets[h].yesterday++;
    });
    return buckets.filter(b => b.today || b.yesterday);
  }, [calls]);

  const direction = [
    { name: 'Inbound', value: todayCalls.filter(c => c.direction === 'inbound').length },
    { name: 'Outbound', value: todayCalls.filter(c => c.direction === 'outbound').length },
    { name: 'Missed', value: missed },
  ];

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i)); d.setHours(0,0,0,0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    return {
      day: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],
      calls: calls.filter(c => c.start_at && new Date(c.start_at) >= d && new Date(c.start_at) < next).length,
    };
  });

  const recent = calls.slice(0, 10);
  const smsPreview = (sms as any[]).slice(0, 5);
  const unread = (sms as any[]).reduce((s,t) => s + (t.unread_count || 0), 0);
  const registered = (devices as any[]).filter(d => d.registration_status === 'registered').length;
  const liveReg = (registrations as any[]).length;
  const lastSync = integration?.last_sync_at ? formatDistanceToNow(new Date(integration.last_sync_at), { addSuffix: true }) : 'never';

  const kpi = (label: string, value: string | number, Icon: any, color: string, sub?: React.ReactNode, href?: string) => {
    const inner = (
      <Card className={href ? 'hover:bg-muted/40 transition cursor-pointer' : ''}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
          <Icon className={`w-4 h-4 ${color}`} />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
        </CardContent>
      </Card>
    );
    return href ? <Link to={href} key={label}>{inner}</Link> : inner;
  };

  const lastJob = syncJobs[0] as any;
  const lastJobAgo = lastJob ? (Date.now() - new Date(lastJob.completed_at || lastJob.created_at).getTime()) / 60000 : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Telephony Dashboard</h1>
          <p className="text-muted-foreground">Live operations overview</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/org/lemtel/telephony/extensions"><Plus className="w-4 h-4 mr-2" /> Extension</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/org/lemtel/telephony/ivr"><Plus className="w-4 h-4 mr-2" /> IVR</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/org/lemtel/telephony/queues"><Plus className="w-4 h-4 mr-2" /> Queue</Link></Button>
          <Button size="sm" onClick={() => sync.mutate('cdr')} disabled={sync.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${sync.isPending ? 'animate-spin' : ''}`} /> Sync Now
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpi('Calls Today', todayCalls.length, Phone, 'text-blue-500',
          <span>{answered} answered · <span className={missed > 0 ? 'text-red-600' : ''}>{missed} missed</span></span>,
          '/org/lemtel/telephony/calls')}
        {kpi('Missed Calls', missed, PhoneMissed, 'text-red-500')}
        {kpi('Avg Duration', `${avgDur}s`, Activity, 'text-purple-500')}
        {kpi('Answered Rate', `${answerRate}%`, PhoneIncoming, 'text-green-500')}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpi('Active Extensions', extensions.length, Smartphone, 'text-indigo-500',
          `${extensions.length} / ${extensions.length} active`, '/org/lemtel/telephony/extensions')}
        {kpi(`Registered (live)`, `${liveReg} / ${extensions.length}`, Voicemail, 'text-cyan-500',
          liveReg > 0 ? <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> live</span> : 'no live registrations')}
        {kpi('Unread SMS', unread, MessageSquare, 'text-orange-500',
          `${(sms as any[]).length} conversations`, '/org/lemtel/telephony/messages')}
        {kpi('Voice Agents', agents.length, Bot, 'text-pink-500')}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Calls by Hour (today vs yesterday)</CardTitle></CardHeader>
          <CardContent style={{ height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={byHour}>
                <XAxis dataKey="hour" fontSize={11} /><YAxis fontSize={11} /><Tooltip />
                <Legend /><Bar dataKey="yesterday" fill="#94a3b8" /><Bar dataKey="today" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Direction Breakdown (today)</CardTitle></CardHeader>
          <CardContent style={{ height: 260 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={direction} dataKey="value" nameKey="name" outerRadius={90} label>
                  {direction.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Recent Calls</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {recent.length === 0 ? <tr><td className="p-4 text-muted-foreground text-center">No calls yet</td></tr> : recent.map((c: any) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-2 w-6">{c.direction === 'inbound' ? <PhoneIncoming className="w-4 h-4 text-green-500" /> : c.direction === 'outbound' ? <PhoneOutgoing className="w-4 h-4 text-blue-500" /> : <PhoneMissed className="w-4 h-4 text-red-500" />}</td>
                    <td className="px-2 py-2 font-mono text-xs">{c.caller_number || c.caller_name || '—'}</td>
                    <td className="px-2 py-2 text-muted-foreground">{c.duration_seconds || 0}s</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground text-right">{c.start_at ? formatDistanceToNow(new Date(c.start_at), { addSuffix: true }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>SMS Inbox</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {smsPreview.length === 0 ? <tr><td className="p-4 text-muted-foreground text-center">No messages yet</td></tr> : smsPreview.map((t: any) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-2">{t.contact_name || t.contact_phone}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{t.did_number}</td>
                    <td className="px-2 py-2 text-right">{t.unread_count ? <Badge>{t.unread_count}</Badge> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Calls last 7 days</CardTitle></CardHeader>
          <CardContent style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={last7}><XAxis dataKey="day" /><YAxis /><Tooltip /><Bar dataKey="calls" fill="#0023e6" /></BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Sync Status</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {lastJob?.status === 'failed' && (
              <div className="p-2 rounded bg-red-500/10 text-red-600 text-xs flex items-center justify-between">
                <span>❌ Last sync failed</span>
                <Button size="sm" variant="outline" className="h-6" onClick={() => sync.mutate('all')}>Retry</Button>
              </div>
            )}
            {lastJobAgo !== null && lastJobAgo > 10 && lastJob?.status !== 'failed' && (
              <div className="p-2 rounded bg-orange-500/10 text-orange-600 text-xs">
                ⚠️ Last sync was {Math.round(lastJobAgo)} min ago
              </div>
            )}
            <div className="space-y-1">
              {syncJobs.length === 0 && <div className="text-muted-foreground text-xs">No sync jobs yet</div>}
              {(syncJobs as any[]).map(j => (
                <div key={j.id} className="flex items-center justify-between text-xs border-b last:border-0 py-1">
                  <span className="inline-flex items-center gap-2">
                    {j.status === 'completed' ? <CheckCircle2 className="w-3 h-3 text-green-500" />
                      : j.status === 'failed' ? <XCircle className="w-3 h-3 text-red-500" />
                      : <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />}
                    <span className="font-mono">{j.job_type}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {j.completed_at ? formatDistanceToNow(new Date(j.completed_at), { addSuffix: true }) : '—'}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Mock mode</span><Badge variant={integration?.config?.mock_mode ? 'secondary' : 'outline'}>{integration?.config?.mock_mode ? 'On' : 'Off'}</Badge></div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => sync.mutate('cdr')}><RefreshCw className="w-3 h-3 mr-1" /> CDR</Button>
              <Button size="sm" variant="outline" onClick={() => sync.mutate('config')}><RefreshCw className="w-3 h-3 mr-1" /> Config</Button>
              <Button size="sm" onClick={() => sync.mutate('all')}><RefreshCw className="w-3 h-3 mr-1" /> Full</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
