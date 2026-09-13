import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Headphones, Loader2, PlayCircle, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import RecordingDetailDrawer from "@/components/planipret/recordings/RecordingDetailDrawer";

const L = (lang: string, fr: string, en: string) => (lang === "en" ? en : fr);

type Row = {
  id: string;
  extension: string | null;
  to_number: string | null;
  to_name: string | null;
  duration_seconds: number | null;
  created_at: string;
  recording_url: string | null;
  ns_recording_url: string | null;
  has_recording: boolean | null;
  transcript: string | null;
  ai_summary: string | null;
  ai_summary_short: string | null;
  ai_coaching: unknown;
  coaching_score: number | null;
  planipret_profiles?: { full_name: string | null } | null;
};

const dur = (s: number | null) => {
  const v = s ?? 0;
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
};

export default function PAOutboundAudio() {
  const { lang } = useMplanipretLang();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [onlyAudio, setOnlyAudio] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("planipret_phone_calls")
      .select("id, extension, to_number, to_name, duration_seconds, created_at, recording_url, ns_recording_url, has_recording, transcript, ai_summary, ai_summary_short, ai_coaching, coaching_score, planipret_profiles(full_name)")
      .eq("direction", "outbound")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data as unknown as Row[]) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const hasAudio = (r: Row) => !!(r.recording_url || r.ns_recording_url || r.has_recording);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyAudio && !hasAudio(r)) return false;
      if (!n) return true;
      return [r.extension, r.to_number, r.to_name, r.planipret_profiles?.full_name]
        .some((v) => String(v ?? "").toLowerCase().includes(n));
    });
  }, [rows, q, onlyAudio]);

  const stats = useMemo(() => ({
    total: rows.length,
    audio: rows.filter(hasAudio).length,
    summary: rows.filter((r) => !!(r.ai_summary || r.ai_summary_short)).length,
    coaching: rows.filter((r) => !!r.ai_coaching || r.coaching_score != null).length,
  }), [rows]);

  return (
    <PAPage>
      <PAPageHeader
        accent="#F59E0B"
        icon={<Headphones className="w-5 h-5" />}
        title={L(lang, "Audio des appels sortants", "Outbound call audio")}
        subtitle={L(lang, "Fichier audio, résumé IA et coaching pour chaque appel sortant.", "Audio file, AI summary and coaching for each outbound call.")}
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {L(lang, "Actualiser", "Refresh")}
          </Button>
        }
      />

      <div className="pa-stats">
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Appels sortants", "Outbound calls")}</div>
          <div className="pa-stat-value">{stats.total}</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Avec audio", "With audio")}</div>
          <div className="pa-stat-value text-emerald-400">{stats.audio}</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Résumé IA", "AI summary")}</div>
          <div className="pa-stat-value text-sky-400">{stats.summary}</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Coaching", "Coaching")}</div>
          <div className="pa-stat-value text-violet-400">{stats.coaching}</div>
        </div>
      </div>

      <Card className="pa-card">
        <CardHeader className="pa-card-head">
          <CardTitle className="pa-card-title">{L(lang, "Appels sortants", "Outbound calls")}</CardTitle>
          <CardDescription className="pa-card-sub">
            {L(lang, "Cliquez « Ouvrir » pour écouter l'audio et voir le résumé et le coaching.", "Click \"Open\" to play the audio and see summary and coaching.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-xs flex-1">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L(lang, "Rechercher", "Search")} className="pl-8" />
            </div>
            <Button size="sm" variant={onlyAudio ? "default" : "outline"} onClick={() => setOnlyAudio((v) => !v)}>
              {L(lang, "Avec audio seulement", "With audio only")}
            </Button>
          </div>

          <div className="pa-scroll overflow-x-auto">
            <table className="pa-table w-full text-sm">
              <thead>
                <tr>
                  <th>{L(lang, "Date", "Date")}</th>
                  <th>{L(lang, "Poste", "Ext.")}</th>
                  <th>{L(lang, "Courtier", "Broker")}</th>
                  <th>{L(lang, "Vers", "To")}</th>
                  <th className="text-right">{L(lang, "Durée", "Duration")}</th>
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
                    <td className="font-mono">{r.to_number ?? r.to_name ?? "—"}</td>
                    <td className="text-right">{dur(r.duration_seconds)}</td>
                    <td>
                      <Badge variant={hasAudio(r) ? "default" : "secondary"}>
                        {hasAudio(r) ? L(lang, "Disponible", "Available") : L(lang, "Aucun", "None")}
                      </Badge>
                    </td>
                    <td className="max-w-[260px] truncate">{r.ai_summary_short ?? r.ai_summary ?? "—"}</td>
                    <td>{r.coaching_score != null ? `${r.coaching_score}/100` : r.ai_coaching ? "✓" : "—"}</td>
                    <td className="text-right">
                      <Button size="sm" className="gap-1" onClick={() => setDetail(r)}>
                        <PlayCircle className="w-4 h-4" />
                        {L(lang, "Ouvrir", "Open")}
                      </Button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && !loading ? (
                  <tr><td colSpan={9} className="text-center py-6 text-muted-foreground">{L(lang, "Aucun appel sortant.", "No outbound call.")}</td></tr>
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
