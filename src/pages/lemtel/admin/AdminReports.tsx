import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { usePbxAutoSync } from '@/hooks/usePbxAutoSync';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

const LEMTEL_ORG_ID = '71755d33-ed64-4ad5-a828-61c9d2029eb7';
const COLORS = ['hsl(var(--primary))', '#22c55e', '#eab308', '#ef4444', '#8b5cf6'];

export default function AdminReports() {
  const [rows, setRows] = useState<any[]>([]);
  // Auto-pull the latest CDRs from FusionPBX every time Reports is opened so
  // charts and KPIs stay live without a manual "Sync" click.
  usePbxAutoSync(['cdrs', 'recordings'], { orgId: LEMTEL_ORG_ID });

  const loadRows = async () => {
    const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    const { data } = await (supabase as any).from('pbx_call_records')
      .select('id,start_at,duration_seconds,direction,call_status,extension,missed_call')
      .eq('organization_id', LEMTEL_ORG_ID)
      .gte('start_at', since)
      .order('start_at', { ascending: false })
      .limit(5000);
    setRows((data ?? []) as any[]);
  };

  useEffect(() => { loadRows(); }, []);

  // Refresh chart data whenever the auto-sync inserts new rows.
  useEffect(() => {
    const ch = supabase
      .channel(`admin-reports-cdr-${LEMTEL_ORG_ID}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'pbx_call_records', filter: `organization_id=eq.${LEMTEL_ORG_ID}` },
        () => { loadRows(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const trend = useMemo(() => {
    const m = new Map<string, { day: string; inbound: number; outbound: number; missed: number }>();
    rows.forEach(r => {
      const day = r.start_at.slice(0, 10);
      if (!m.has(day)) m.set(day, { day, inbound: 0, outbound: 0, missed: 0 });
      const x = m.get(day)!;
      if (r.missed_call) x.missed++;
      else if (r.direction === 'inbound') x.inbound++;
      else x.outbound++;
    });
    return Array.from(m.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [rows]);

  const byExtension = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach(r => m.set(r.extension ?? '—', (m.get(r.extension ?? '—') ?? 0) + 1));
    return Array.from(m.entries()).map(([extension, calls]) => ({ extension, calls }))
      .sort((a, b) => b.calls - a.calls).slice(0, 10);
  }, [rows]);

  const disposition = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach(r => {
      const k = r.missed_call ? 'Missed' : (r.call_status ?? 'Unknown');
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const sla = useMemo(() => {
    const m = new Map<string, { day: string; sla: number }>();
    const acc = new Map<string, { total: number; ok: number }>();
    rows.forEach(r => {
      const day = r.start_at.slice(0, 10);
      const a = acc.get(day) ?? { total: 0, ok: 0 };
      a.total++;
      if (!r.missed_call) a.ok++;
      acc.set(day, a);
    });
    acc.forEach((v, day) => m.set(day, { day, sla: Math.round((v.ok / v.total) * 100) }));
    return Array.from(m.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [rows]);

  const exportCsv = () => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CDR');
    XLSX.writeFile(wb, 'lemtel-cdr.xlsx');
  };
  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Lemtel — Call Detail Records', 14, 18);
    doc.setFontSize(9);
    rows.slice(0, 40).forEach((r, i) => {
      doc.text(`${r.start_at?.slice(0, 16)}  ${r.direction ?? ''}  ${r.extension ?? ''}  ${r.call_status ?? ''}`, 14, 28 + i * 5);
    });
    doc.save('lemtel-cdr.pdf');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reports & Analytics</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>Export Excel</Button>
          <Button variant="outline" onClick={exportPdf}>Export PDF</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Call Volume (30d)</CardTitle></CardHeader>
          <CardContent style={{ height: 240 }}>
            <ResponsiveContainer><LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis /><Tooltip /><Legend />
              <Line type="monotone" dataKey="inbound" stroke={COLORS[0]} />
              <Line type="monotone" dataKey="outbound" stroke={COLORS[1]} />
              <Line type="monotone" dataKey="missed" stroke={COLORS[3]} />
            </LineChart></ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top 10 Extensions</CardTitle></CardHeader>
          <CardContent style={{ height: 240 }}>
            <ResponsiveContainer><BarChart data={byExtension}>
              <XAxis dataKey="extension" /><YAxis /><Tooltip />
              <Bar dataKey="calls" fill={COLORS[0]} />
            </BarChart></ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Disposition</CardTitle></CardHeader>
          <CardContent style={{ height: 240 }}>
            <ResponsiveContainer><PieChart>
              <Pie data={disposition} dataKey="value" nameKey="name" outerRadius={80} label>
                {disposition.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie><Tooltip />
            </PieChart></ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>SLA Trend</CardTitle></CardHeader>
          <CardContent style={{ height: 240 }}>
            <ResponsiveContainer><AreaChart data={sla}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis domain={[0, 100]} /><Tooltip />
              <Area type="monotone" dataKey="sla" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.3} />
            </AreaChart></ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
