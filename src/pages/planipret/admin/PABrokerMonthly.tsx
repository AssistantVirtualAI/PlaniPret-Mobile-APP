import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const L = (lang: string, fr: string, en: string) => (lang === "en" ? en : fr);

type CallRow = {
  id: string;
  user_id: string | null;
  extension: string | null;
  direction: string | null;
  answered_at: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  created_at: string;
  planipret_profiles?: { full_name: string | null } | null;
};
type MsgRow = { id: string; direction: string | null; user_id: string | null; created_at: string };

const MONTHS = [6, 12, 24];
const monthKey = (iso: string) => iso.slice(0, 7);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const isOutbound = (d: string | null) => (d ?? "").toLowerCase().startsWith("out");

function monthRange(count: number) {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = count - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(m.toISOString().slice(0, 7));
  }
  return out;
}

export default function PABrokerMonthly() {
  const { lang } = useMplanipretLang();
  const [months, setMonths] = useState(12);
  const [loading, setLoading] = useState(false);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [msgs, setMsgs] = useState<MsgRow[]>([]);
  const [broker, setBroker] = useState<string>("__all__");

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - (months - 1), 1)).toISOString();
    const [c, m] = await Promise.all([
      supabase
        .from("planipret_phone_calls")
        .select("id, user_id, extension, direction, answered_at, duration_seconds, transcript, created_at, planipret_profiles(full_name)")
        .gte("created_at", since)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20000),
      supabase
        .from("planipret_phone_messages")
        .select("id, direction, user_id, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20000),
    ]);
    setLoading(false);
    if (c.error) toast.error(c.error.message);
    if (m.error) toast.error(m.error.message);
    setCalls((c.data as unknown as CallRow[]) ?? []);
    setMsgs((m.data as unknown as MsgRow[]) ?? []);
  }, [months]);

  useEffect(() => { void load(); }, [load]);

  const nameByUser = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of calls) {
      if (r.user_id && r.planipret_profiles?.full_name) map.set(r.user_id, r.planipret_profiles.full_name);
    }
    return map;
  }, [calls]);

  const brokers = useMemo(
    () => [...nameByUser.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    [nameByUser],
  );

  const data = useMemo(() => {
    const keys = monthRange(months);
    const base = new Map(
      keys.map((k) => [k, { month: k, outbound: 0, eligible: 0, transcribed: 0, transcriptRate: 0, sms: 0, seconds: 0, answered: 0, avgDuration: 0 }]),
    );

    for (const r of calls) {
      if (broker !== "__all__" && r.user_id !== broker) continue;
      const row = base.get(monthKey(r.created_at));
      if (!row) continue;
      if (isOutbound(r.direction)) row.outbound += 1;
      const dur = r.duration_seconds ?? 0;
      if (dur > 0) { row.seconds += dur; row.answered += 1; }
      if (dur >= 15) {
        row.eligible += 1;
        if (r.transcript) row.transcribed += 1;
      }
    }

    for (const r of msgs) {
      if (broker !== "__all__" && r.user_id !== broker) continue;
      if ((r.direction ?? "").toLowerCase().startsWith("in")) continue;
      const row = base.get(monthKey(r.created_at));
      if (row) row.sms += 1;
    }

    return [...base.values()].map((r) => ({
      ...r,
      transcriptRate: pct(r.transcribed, r.eligible),
      avgDuration: r.answered ? Math.round(r.seconds / r.answered) : 0,
    }));
  }, [calls, msgs, broker, months]);

  const totals = useMemo(() => {
    const outbound = data.reduce((s, r) => s + r.outbound, 0);
    const sms = data.reduce((s, r) => s + r.sms, 0);
    const eligible = data.reduce((s, r) => s + r.eligible, 0);
    const transcribed = data.reduce((s, r) => s + r.transcribed, 0);
    const seconds = data.reduce((s, r) => s + r.seconds, 0);
    const answered = data.reduce((s, r) => s + r.answered, 0);
    return { outbound, sms, rate: pct(transcribed, eligible), avg: answered ? Math.round(seconds / answered) : 0 };
  }, [data]);

  const axis = { stroke: "hsl(var(--muted-foreground))", fontSize: 11 };
  const tooltipStyle = {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    color: "hsl(var(--popover-foreground))",
    fontSize: 12,
  };

  const chart = (
    title: string,
    node: React.ReactElement,
  ) => (
    <Card className="pa-card">
      <CardHeader className="pa-card-head">
        <CardTitle className="pa-card-title">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">{node}</ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <PAPage>
      <PAPageHeader
        accent="#0EA5E9"
        icon={<BarChart3 className="w-5 h-5" />}
        title={L(lang, "Graphiques mensuels par courtier", "Monthly charts by broker")}
        subtitle={L(
          lang,
          "Appels sortants, taux de transcription, textos envoyés et durée moyenne par appel.",
          "Outbound calls, transcription rate, sent texts and average call duration.",
        )}
        actions={
          <div className="flex items-center gap-2">
            <Select value={broker} onValueChange={setBroker}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{L(lang, "Tous les courtiers", "All brokers")}</SelectItem>
                {brokers.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {MONTHS.map((m) => (
              <Button key={m} size="sm" variant={months === m ? "default" : "outline"} onClick={() => setMonths(m)}>{m}m</Button>
            ))}
            <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {L(lang, "Actualiser", "Refresh")}
            </Button>
          </div>
        }
      />

      <div className="pa-stats">
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Appels sortants", "Outbound calls")}</div>
          <div className="pa-stat-value">{totals.outbound}</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Taux de transcription", "Transcription rate")}</div>
          <div className="pa-stat-value text-sky-400">{totals.rate}%</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Textos envoyés", "Texts sent")}</div>
          <div className="pa-stat-value">{totals.sms}</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Durée moyenne", "Average duration")}</div>
          <div className="pa-stat-value text-emerald-400">{totals.avg}s</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {chart(
          L(lang, "Appels sortants par mois", "Outbound calls per month"),
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" {...axis} />
            <YAxis {...axis} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="outbound" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>,
        )}
        {chart(
          L(lang, "Taux de transcription (%)", "Transcription rate (%)"),
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" {...axis} />
            <YAxis {...axis} domain={[0, 100]} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="transcriptRate" stroke="hsl(var(--chart-2, var(--primary)))" strokeWidth={2} dot={false} />
          </LineChart>,
        )}
        {chart(
          L(lang, "Textos envoyés par mois", "Texts sent per month"),
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" {...axis} />
            <YAxis {...axis} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="sms" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
          </BarChart>,
        )}
        {chart(
          L(lang, "Durée moyenne par appel (s)", "Average call duration (s)"),
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" {...axis} />
            <YAxis {...axis} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="avgDuration" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          </LineChart>,
        )}
      </div>

      <Card className="pa-card">
        <CardHeader className="pa-card-head">
          <CardTitle className="pa-card-title">{L(lang, "Détail mensuel", "Monthly detail")}</CardTitle>
          <CardDescription className="pa-card-sub">
            {broker === "__all__"
              ? L(lang, "Tous les courtiers.", "All brokers.")
              : brokers.find((b) => b.id === broker)?.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="pa-scroll overflow-x-auto">
            <table className="pa-table w-full text-sm">
              <thead>
                <tr>
                  <th>{L(lang, "Mois", "Month")}</th>
                  <th className="text-right">{L(lang, "Appels sortants", "Outbound")}</th>
                  <th className="text-right">{L(lang, "Transcrits", "Transcribed")}</th>
                  <th className="text-right">{L(lang, "Taux transcription", "Transcript rate")}</th>
                  <th className="text-right">{L(lang, "Textos envoyés", "Texts sent")}</th>
                  <th className="text-right">{L(lang, "Durée moyenne", "Avg duration")}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.month}>
                    <td className="font-mono">{r.month}</td>
                    <td className="text-right">{r.outbound}</td>
                    <td className="text-right">{r.transcribed}/{r.eligible}</td>
                    <td className="text-right">{r.transcriptRate}%</td>
                    <td className="text-right">{r.sms}</td>
                    <td className="text-right">{r.avgDuration}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PAPage>
  );
}
