import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, PhoneIncoming, PhoneOutgoing, PhoneMissed, Sparkles } from 'lucide-react';
import { MOCK_CDRS } from '@/lib/lemtelMockData';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';

export default function LemtelAnalytics() {
  const totals = {
    inbound: MOCK_CDRS.filter(c => c.direction === 'inbound').length,
    outbound: MOCK_CDRS.filter(c => c.direction === 'outbound').length,
    missed: MOCK_CDRS.filter(c => c.direction === 'missed').length,
  };
  const sentimentData = (['positive', 'neutral', 'negative'] as const).map(s => ({
    name: s, value: MOCK_CDRS.filter(c => c.sentiment === s).length,
  }));
  const colors = ['hsl(var(--primary))', 'hsl(var(--muted-foreground))', 'hsl(var(--destructive))'];

  const hourly = Array.from({ length: 24 }, (_, h) => ({
    hour: `${h}h`,
    calls: MOCK_CDRS.filter(c => new Date(c.start_time).getHours() === h).length,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><BarChart3 className="w-7 h-7" /> Call Analytics</h1>
        <p className="text-muted-foreground">CDR insights with AI-powered call summaries (Claude 3.5 Sonnet)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm text-muted-foreground">Inbound</CardTitle><PhoneIncoming className="w-4 h-4 text-green-500" /></CardHeader><CardContent><div className="text-3xl font-bold">{totals.inbound}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm text-muted-foreground">Outbound</CardTitle><PhoneOutgoing className="w-4 h-4 text-blue-500" /></CardHeader><CardContent><div className="text-3xl font-bold">{totals.outbound}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm text-muted-foreground">Missed</CardTitle><PhoneMissed className="w-4 h-4 text-destructive" /></CardHeader><CardContent><div className="text-3xl font-bold">{totals.missed}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Calls by Hour</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={hourly}>
                <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Sentiment</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={sentimentData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                  {sentimentData.map((_, i) => <Cell key={i} fill={colors[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Recent Calls with AI Summary</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>When</TableHead><TableHead>Dir</TableHead><TableHead>From / To</TableHead>
              <TableHead>Customer</TableHead><TableHead>Duration</TableHead>
              <TableHead>Sentiment</TableHead><TableHead>AI Summary</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {MOCK_CDRS.slice(0, 15).map(c => (
                <TableRow key={c.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(c.start_time).toLocaleString()}</TableCell>
                  <TableCell><Badge variant={c.direction === 'missed' ? 'destructive' : 'outline'}>{c.direction}</Badge></TableCell>
                  <TableCell className="font-mono text-xs"><div>{c.from_number}</div><div className="text-muted-foreground">→ {c.to_number}</div></TableCell>
                  <TableCell className="text-sm">{c.customer_name}</TableCell>
                  <TableCell>{c.duration_seconds}s</TableCell>
                  <TableCell>{c.sentiment ? <Badge variant={c.sentiment === 'positive' ? 'default' : c.sentiment === 'negative' ? 'destructive' : 'secondary'}>{c.sentiment}</Badge> : '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs">{c.ai_summary || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
