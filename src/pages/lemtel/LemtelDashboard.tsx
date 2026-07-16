import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Phone, MessageSquare, Bot, PhoneCall, Activity, TrendingUp, Smartphone, Voicemail } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { usePbxCallRecords, usePbxExtensions, usePbxIvrs, usePbxQueues, usePbxSmsThreads, usePbxIntegration } from '@/hooks/usePbxData';
import { usePbxAutoSync } from '@/hooks/usePbxAutoSync';

export default function LemtelDashboard() {
  // Live pull from FusionPBX on mount + every 60s so "Vue d'ensemble" is never stale.
  usePbxAutoSync(['cdrs', 'voicemails', 'sms']);
  const { data: cdrs = [] } = usePbxCallRecords(500);
  const { data: extensions = [] } = usePbxExtensions();
  const { data: ivrs = [] } = usePbxIvrs();
  const { data: queues = [] } = usePbxQueues();
  const { data: sms = [] } = usePbxSmsThreads();
  const { data: integration } = usePbxIntegration();
  const mockMode = integration?.config?.mock_mode;

  const todayCalls = (cdrs as any[]).filter((c: any) => c.start_at && new Date(c.start_at).toDateString() === new Date().toDateString()).length;
  const trend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const day = d.toDateString();
    return {
      day: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],
      calls: (cdrs as any[]).filter((c: any) => c.start_at && new Date(c.start_at).toDateString() === day).length,
    };
  });
  const unread = (sms as any[]).reduce((s: number, t: any) => s + (t.unread_count || 0), 0);
  const registered = (extensions as any[]).filter((e: any) => e.enabled).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Lemtel Dashboard</h1>
          <p className="text-muted-foreground">
            Telecom operations overview {mockMode && <Badge variant="outline" className="ml-2">Mock Data</Badge>}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={integration?.status === 'configured' ? 'default' : 'outline'}>FusionPBX {integration?.status === 'configured' ? '✅' : '⏳'}</Badge>
          <Badge variant="outline">Telnyx</Badge>
          <Badge variant="outline">ElevenLabs</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Extensions', value: extensions.length, icon: Smartphone, color: 'text-purple-500' },
          { label: 'IVR Menus', value: ivrs.length, icon: Voicemail, color: 'text-blue-500' },
          { label: 'Queues', value: queues.length, icon: PhoneCall, color: 'text-green-500' },
          { label: 'SMS Threads', value: sms.length, icon: MessageSquare, color: 'text-orange-500' },
        ].map(s => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold">{s.value}</div></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Call Volume (Last 7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Area type="monotone" dataKey="calls" stroke="hsl(var(--primary))" fill="url(#g1)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="w-4 h-4" /> Today</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Calls today</span><span className="font-bold">{todayCalls}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total CDRs</span><span className="font-bold">{cdrs.length}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Unread SMS</span><span className="font-bold">{unread}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Enabled extensions</span><span className="font-bold">{registered} / {extensions.length}</span></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Phone className="w-4 h-4" /> Recent Calls</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(cdrs as any[]).slice(0, 6).map((c: any) => (
            <div key={c.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div className="flex items-center gap-3">
                <Badge variant={c.direction === 'missed' ? 'destructive' : 'outline'}>{c.direction}</Badge>
                <div>
                  <div className="font-mono text-sm">{c.caller_number} → {c.destination}</div>
                  <div className="text-xs text-muted-foreground">Ext {c.extension} • {c.start_at && new Date(c.start_at).toLocaleString()}</div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">{c.duration_seconds}s</div>
            </div>
          ))}
          {cdrs.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No call records yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
