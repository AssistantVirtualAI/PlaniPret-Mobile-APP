import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gauge, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const L = (lang: string, fr: string, en: string) => (lang === "en" ? en : fr);

type CallRow = {
  id: string;
  extension: string | null;
  direction: string | null;
  status: string | null;
  answered_at: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  transcript_status: string | null;
  created_at: string;
  planipret_profiles?: { full_name: string | null } | null;
};
type MsgRow = { id: string; direction: string | null; created_at: string };

const RANGES = [7, 14, 30, 90];

const dayKey = (iso: string) => iso.slice(0, 10);

export default function PATelephonyDashboard() {
  const { lang } = useMplanipretLang();
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [msgs, setMsgs] = useState<MsgRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const [c, m] = await Promise.all([
      supabase
        .from("planipret_phone_calls")
        .select("id, extension, direction, status, answered_at, duration_seconds, transcript, transcript_status, created_at, planipret_profiles(full_name)")
        .gte("created_at", since)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("planipret_phone_messages")
        .select("id, direction, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(10000),
    ]);
    setLoading(false);
    if (c.error) toast.error(c.error.message);
    if (m.error) toast.error(m.error.message);
    setCalls((c.data as unknown as CallRow[]) ?? []);
    setMsgs((m.data as unknown as MsgRow[]) ?? []);
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const kpis = useMemo(() => {
    const total = calls.length;
    const answered = calls.filter((r) => r.answered_at || (r.duration_seconds ?? 0) > 0).length;
    const eligible = calls.filter((r) => (r.duration_seconds ?? 0) >= 15);
    const transcribed = eligible.filter((r) => !!r.transcript).length;
    return {
      total,
      answered,
      answerRate: total ? Math.round((answered / total) * 100) : 0,
      eligible: eligible.length,
      transcribed,
      transcriptRate: eligible.length ? Math.round((transcribed / eligible.length) * 100) : 0,
      sms: msgs.length,
      smsPerDay: Math.round(msgs.length / days),
    };
  }, [calls, msgs, days]);

  const byExtension = useMemo(() => {
    const map = new Map<string, { ext: string; name: string; total: number; answered: number; eligible: number; transcribed: number }>();
    for (const r of calls) {
      const ext = String(r.extension ?? "—");
      const cur = map.get(ext) ?? { ext, name: r.planipret_profiles?.full_name ?? "—", total: 0, answered: 0, eligible: 0, transcribed: 0 };
      cur.total += 1;
      if (r.answered_at || (r.duration_seconds ?? 0) > 0) cur.answered += 1;
      if ((r.duration_seconds ?? 0) >= 15) {
        cur.eligible += 1;
        if (r.transcript) cur.transcribed += 1;
      }
      if (cur.name === "—" && r.planipret_profiles?.full_name) cur.name = r.planipret_profiles.full_name;
      map.set(ext, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [calls]);

  const smsPerDay = useMemo(() => {
    const map = new Map<string, { day: string; inbound: number; outbound: number; total: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = dayKey(new Date(Date.now() - i * 86400000).toISOString());
      map.set(d, { day: d, inbound: 0, outbound: 0, total: 0 });
    }
    for (const m of msgs) {
      const d = dayKey(m.created_at);
      const cur = map.get(d);
      if (!cur) continue;
      cur.total += 1;
      if (String(m.direction) === "inbound") cur.inbound += 1;
      else cur.outbound += 1;
    }
    return [...map.values()];
  }, [msgs, days]);

  const maxSms = Math.max(1, ...smsPerDay.map((d) => d.total));

  return (
    <PAPage>
      <PAPageHeader
        accent="#22C55E"
        icon={<Gauge className="w-5 h-5" />}
        title={L(lang, "Tableau de bord téléphonie", "Telephony dashboard")}
        subtitle={L(lang, "Appels par poste, taux de transcription, taux de réponse et textos par jour.", "Calls per extension, transcription rate, answer rate and texts per day.")}
        actions={
          <div className="flex items-center gap-2">
            {RANGES.map((d) => (
              <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
                {d}j
              </Button>
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
          <div className="pa-stat-label">{L(lang, "Appels", "Calls")}</div>
          <div className="pa-stat-value">{kpis.total}</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Taux de réponse", "Answer rate")}</div>
          <div className="pa-stat-value text-emerald-400">{kpis.answerRate}%</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Taux de transcription (>15s)", "Transcription rate (>15s)")}</div>
          <div className="pa-stat-value text-sky-400">{kpis.transcriptRate}%</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Textos / jour", "Texts / day")}</div>
          <div className="pa-stat-value">{kpis.smsPerDay}</div>
        </div>
      </div>

      <Card className="pa-card">
        <CardHeader className="pa-card-head">
          <CardTitle className="pa-card-title">{L(lang, "Appels par poste", "Calls per extension")}</CardTitle>
          <CardDescription className="pa-card-sub">
            {L(lang, "Volume, réponses et transcriptions pour chaque poste.", "Volume, answers and transcripts for each extension.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="pa-scroll overflow-x-auto">
            <table className="pa-table w-full text-sm">
              <thead>
                <tr>
                  <th>{L(lang, "Poste", "Ext.")}</th>
                  <th>{L(lang, "Courtier", "Broker")}</th>
                  <th className="text-right">{L(lang, "Appels", "Calls")}</th>
                  <th className="text-right">{L(lang, "Répondus", "Answered")}</th>
                  <th className="text-right">{L(lang, "Taux de réponse", "Answer rate")}</th>
                  <th className="text-right">{L(lang, "Transcrits", "Transcribed")}</th>
                  <th className="text-right">{L(lang, "Taux transcription", "Transcript rate")}</th>
                </tr>
              </thead>
              <tbody>
                {byExtension.map((r) => (
                  <tr key={r.ext}>
                    <td className="font-mono">{r.ext}</td>
                    <td>{r.name}</td>
                    <td className="text-right">{r.total}</td>
                    <td className="text-right">{r.answered}</td>
                    <td className="text-right">{r.total ? Math.round((r.answered / r.total) * 100) : 0}%</td>
                    <td className="text-right">{r.transcribed}/{r.eligible}</td>
                    <td className="text-right">{r.eligible ? Math.round((r.transcribed / r.eligible) * 100) : 0}%</td>
                  </tr>
                ))}
                {!byExtension.length && !loading ? (
                  <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">{L(lang, "Aucun appel sur la période.", "No call in this period.")}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="pa-card">
        <CardHeader className="pa-card-head">
          <CardTitle className="pa-card-title">{L(lang, "Textos par jour", "Texts per day")}</CardTitle>
          <CardDescription className="pa-card-sub">{L(lang, "Reçus et envoyés.", "Received and sent.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-40">
            {smsPerDay.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col justify-end items-center gap-1" title={`${d.day} · ${d.total}`}>
                <div className="w-full rounded-t bg-sky-500/70" style={{ height: `${(d.total / maxSms) * 100}%` }} />
                <span className="text-[10px] text-muted-foreground">{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </PAPage>
  );
}
