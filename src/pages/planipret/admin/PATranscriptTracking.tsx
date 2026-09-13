import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FileAudio, Loader2, PlayCircle, RefreshCw, RotateCw, Search } from "lucide-react";
import { toast } from "sonner";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import RecordingDetailDrawer from "@/components/planipret/recordings/RecordingDetailDrawer";

const L = (lang: string, fr: string, en: string) => (lang === "en" ? en : fr);

type Row = {
  id: string;
  extension: string | null;
  direction: string | null;
  from_number: string | null;
  to_number: string | null;
  duration_seconds: number | null;
  created_at: string;
  recording_url: string | null;
  ns_recording_url: string | null;
  has_recording: boolean | null;
  transcript: string | null;
  transcript_status: string | null;
  transcript_pending: boolean | null;
  transcript_attempts: number | null;
  transcript_last_attempt_at: string | null;
  ai_summary: string | null;
  ai_summary_short: string | null;
  ai_coaching: unknown;
  coaching_score: number | null;
  planipret_profiles?: { full_name: string | null } | null;
};

type Filter = "all" | "done" | "pending" | "no_audio";

const dur = (s: number | null) => {
  const v = s ?? 0;
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
};

const statusOf = (r: Row): Filter => {
  if (r.transcript) return "done";
  if (r.transcript_status === "no_audio") return "no_audio";
  return "pending";
};

export default function PATranscriptTracking() {
  const { lang } = useMplanipretLang();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("planipret_phone_calls")
      .select("id, extension, direction, from_number, to_number, duration_seconds, created_at, recording_url, ns_recording_url, has_recording, transcript, transcript_status, transcript_pending, transcript_attempts, transcript_last_attempt_at, ai_summary, ai_summary_short, ai_coaching, coaching_score, planipret_profiles(full_name)")
      .is("deleted_at", null)
      .gte("duration_seconds", 10)
      .order("created_at", { ascending: false })
      .limit(300);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data as unknown as Row[]) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && statusOf(r) !== filter) return false;
      if (!n) return true;
      return [r.extension, r.from_number, r.to_number, r.planipret_profiles?.full_name]
        .some((v) => String(v ?? "").toLowerCase().includes(n));
    });
  }, [rows, q, filter]);

  const stats = useMemo(() => ({
    total: rows.length,
    done: rows.filter((r) => statusOf(r) === "done").length,
    pending: rows.filter((r) => statusOf(r) === "pending").length,
    noAudio: rows.filter((r) => statusOf(r) === "no_audio").length,
  }), [rows]);

  const relaunch = async (r: Row) => {
    setBusy(r.id);
    const { data, error } = await supabase.functions.invoke("pp-admin-transcribe", { body: { call_id: r.id } });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    const res = data as { ok?: boolean; pending?: boolean; unavailable?: boolean; error?: string };
    if (res?.ok) toast.success(L(lang, "Transcription terminée", "Transcription completed"));
    else if (res?.unavailable) toast.warning(L(lang, "Aucun enregistrement disponible pour cet appel.", "No recording available for this call."));
    else if (res?.pending) toast.info(L(lang, "Enregistrement pas encore prêt, nouvelle tentative plus tard.", "Recording not ready yet, will retry later."));
    else toast.error(res?.error ?? L(lang, "Relance échouée", "Relaunch failed"));
    await load();
  };

  const badge = (r: Row) => {
    const s = statusOf(r);
    if (s === "done") return <Badge variant="default">{L(lang, "Transcrit", "Transcribed")}</Badge>;
    if (s === "no_audio") return <Badge variant="secondary">{L(lang, "Sans enregistrement", "No recording")}</Badge>;
    return <Badge variant="outline">{L(lang, "En attente", "Pending")}</Badge>;
  };

  const FILTERS: { key: Filter; fr: string; en: string }[] = [
    { key: "all", fr: "Tous", en: "All" },
    { key: "done", fr: "Transcrits", en: "Transcribed" },
    { key: "pending", fr: "En attente", en: "Pending" },
    { key: "no_audio", fr: "Sans enregistrement", en: "No recording" },
  ];

  return (
    <PAPage>
      <PAPageHeader
        accent="#8B5CF6"
        icon={<FileAudio className="w-5 h-5" />}
        title={L(lang, "Suivi transcription par appel", "Transcription tracking by call")}
        subtitle={L(lang, "Statut, durée, date, audio, résumé IA et coaching, avec relance.", "Status, duration, date, audio, AI summary and coaching, with relaunch.")}
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {L(lang, "Actualiser", "Refresh")}
          </Button>
        }
      />

      <div className="pa-stats">
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Appels suivis", "Calls tracked")}</div>
          <div className="pa-stat-value">{stats.total}</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Transcrits", "Transcribed")}</div>
          <div className="pa-stat-value text-emerald-400">{stats.done}</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "En attente", "Pending")}</div>
          <div className="pa-stat-value text-amber-400">{stats.pending}</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Sans enregistrement", "No recording")}</div>
          <div className="pa-stat-value text-muted-foreground">{stats.noAudio}</div>
        </div>
      </div>

      <Card className="pa-card">
        <CardHeader className="pa-card-head">
          <CardTitle className="pa-card-title">{L(lang, "Appels", "Calls")}</CardTitle>
          <CardDescription className="pa-card-sub">
            {L(lang, "Relancez une transcription ou ouvrez le détail pour écouter l'audio.", "Relaunch a transcription or open the detail to play the audio.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-xs flex-1">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L(lang, "Rechercher", "Search")} className="pl-8" />
            </div>
            {FILTERS.map((f) => (
              <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
                {L(lang, f.fr, f.en)}
              </Button>
            ))}
          </div>

          <div className="pa-scroll overflow-x-auto">
            <table className="pa-table w-full text-sm">
              <thead>
                <tr>
                  <th>{L(lang, "Date", "Date")}</th>
                  <th>{L(lang, "Poste", "Ext.")}</th>
                  <th>{L(lang, "Courtier", "Broker")}</th>
                  <th className="text-right">{L(lang, "Durée", "Duration")}</th>
                  <th>{L(lang, "Statut", "Status")}</th>
                  <th>{L(lang, "Audio", "Audio")}</th>
                  <th>{L(lang, "Résumé IA", "AI summary")}</th>
                  <th>{L(lang, "Coaching", "Coaching")}</th>
                  <th className="text-right">{L(lang, "Actions", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{new Date(r.created_at).toLocaleString(lang === "en" ? "en-CA" : "fr-CA")}</td>
                    <td className="font-mono">{r.extension ?? "—"}</td>
                    <td>{r.planipret_profiles?.full_name ?? "—"}</td>
                    <td className="text-right">{dur(r.duration_seconds)}</td>
                    <td>{badge(r)}</td>
                    <td>{(r.recording_url || r.ns_recording_url || r.has_recording) ? "●" : "—"}</td>
                    <td className="max-w-[220px] truncate">{r.ai_summary_short ?? r.ai_summary ?? "—"}</td>
                    <td>{r.coaching_score != null ? `${r.coaching_score}/100` : r.ai_coaching ? "✓" : "—"}</td>
                    <td className="text-right whitespace-nowrap">
                      <Button size="sm" variant="outline" className="gap-1 mr-2" onClick={() => setDetail(r)}>
                        <PlayCircle className="w-4 h-4" />
                        {L(lang, "Ouvrir", "Open")}
                      </Button>
                      <Button size="sm" className="gap-1" disabled={busy === r.id} onClick={() => void relaunch(r)}>
                        {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                        {L(lang, "Relancer", "Relaunch")}
                      </Button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && !loading ? (
                  <tr><td colSpan={9} className="text-center py-6 text-muted-foreground">{L(lang, "Aucun appel.", "No call.")}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {detail ? (
        <RecordingDetailDrawer call={detail} onClose={() => setDetail(null)} onUpdated={() => void load()} />
      ) : null}
    </PAPage>
  );
}
