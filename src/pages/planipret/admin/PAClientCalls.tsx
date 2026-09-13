import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Loader2, PlayCircle, RefreshCw, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import RecordingDetailDrawer from "@/components/planipret/recordings/RecordingDetailDrawer";

const L = (lang: string, fr: string, en: string) => (lang === "en" ? en : fr);

type Call = {
  id: string;
  extension: string | null;
  direction: string | null;
  from_number: string | null;
  to_number: string | null;
  from_name: string | null;
  to_name: string | null;
  duration_seconds: number | null;
  created_at: string;
  ended_at: string | null;
  recording_url: string | null;
  ns_recording_url: string | null;
  has_recording: boolean | null;
  transcript: string | null;
  transcript_status: string | null;
  ai_summary: string | null;
  ai_summary_short: string | null;
  ai_coaching: unknown;
  coaching_score: number | null;
  planipret_profiles?: { full_name: string | null } | null;
};

type Group = { key: string; name: string; number: string; calls: Call[] };

const digits = (v: string | null) => String(v ?? "").replace(/\D/g, "").slice(-10);
const dur = (s: number | null) => {
  const v = s ?? 0;
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
};
const hasAudio = (c: Call) => Boolean(c.recording_url || c.ns_recording_url || c.has_recording);

export default function PAClientCalls() {
  const { lang } = useMplanipretLang();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<Call | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("planipret_phone_calls")
      .select("id, extension, direction, from_number, to_number, from_name, to_name, duration_seconds, created_at, ended_at, recording_url, ns_recording_url, has_recording, transcript, transcript_status, ai_summary, ai_summary_short, ai_coaching, coaching_score, planipret_profiles(full_name)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setCalls((data as unknown as Call[]) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const c of calls) {
      const outbound = String(c.direction ?? "").toLowerCase() === "outbound";
      const number = outbound ? (c.to_number ?? "") : (c.from_number ?? "");
      const name = (outbound ? c.to_name : c.from_name) ?? "";
      const key = digits(number) || name || c.id;
      if (!key) continue;
      const g = map.get(key) ?? { key, name: name || number || key, number: number || "", calls: [] };
      if (!g.name && name) g.name = name;
      if (name && (!g.name || /^\+?\d/.test(g.name))) g.name = name;
      g.calls.push(c);
      map.set(key, g);
    }
    const n = q.trim().toLowerCase();
    return Array.from(map.values())
      .filter((g) => !n || g.name.toLowerCase().includes(n) || g.number.toLowerCase().includes(n))
      .sort((a, b) => b.calls.length - a.calls.length);
  }, [calls, q]);

  const statusBadge = (c: Call) => {
    if (c.transcript) return <Badge variant="default">{L(lang, "Transcrit", "Transcribed")}</Badge>;
    if (c.transcript_status === "no_audio") return <Badge variant="secondary">{L(lang, "Sans enregistrement", "No recording")}</Badge>;
    return <Badge variant="outline">{L(lang, "En attente", "Pending")}</Badge>;
  };

  return (
    <PAPage>
      <PAPageHeader
        accent="#06B6D4"
        icon={<UserRound className="w-5 h-5" />}
        title={L(lang, "Appels par client", "Calls by client")}
        subtitle={L(lang, "Appels, dates, durées, statut de transcription et résumé IA, avec ouverture de l'audio.", "Calls, dates, durations, transcription status and AI summary, with audio playback.")}
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {L(lang, "Actualiser", "Refresh")}
          </Button>
        }
      />

      <div className="pa-stats">
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Clients", "Clients")}</div>
          <div className="pa-stat-value">{groups.length}</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Appels", "Calls")}</div>
          <div className="pa-stat-value">{calls.length}</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Avec audio", "With audio")}</div>
          <div className="pa-stat-value text-emerald-400">{calls.filter(hasAudio).length}</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Avec résumé IA", "With AI summary")}</div>
          <div className="pa-stat-value">{calls.filter((c) => c.ai_summary || c.ai_summary_short).length}</div>
        </div>
      </div>

      <Card className="pa-card">
        <CardHeader className="pa-card-head">
          <CardTitle className="pa-card-title">{L(lang, "Clients", "Clients")}</CardTitle>
          <CardDescription className="pa-card-sub">
            {L(lang, "Cliquez un client pour voir tous ses appels.", "Click a client to see all their calls.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-xs">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L(lang, "Nom ou numéro", "Name or number")} className="pl-8" />
          </div>

          <div className="space-y-2">
            {groups.map((g) => {
              const isOpen = !!open[g.key];
              return (
                <div key={g.key} className="rounded-lg border border-border/60">
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-left"
                    onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}
                  >
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span className="font-medium">{g.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{g.number}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {g.calls.length} {L(lang, "appels", "calls")} · {g.calls.filter(hasAudio).length} {L(lang, "audio", "audio")}
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="pa-scroll overflow-x-auto border-t border-border/60">
                      <table className="pa-table w-full text-sm">
                        <thead>
                          <tr>
                            <th>{L(lang, "Date", "Date")}</th>
                            <th>{L(lang, "Sens", "Direction")}</th>
                            <th>{L(lang, "Courtier", "Broker")}</th>
                            <th className="text-right">{L(lang, "Durée", "Duration")}</th>
                            <th>{L(lang, "Transcription", "Transcription")}</th>
                            <th>{L(lang, "Résumé IA", "AI summary")}</th>
                            <th className="text-right">{L(lang, "Audio", "Audio")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.calls.map((c) => (
                            <tr key={c.id}>
                              <td className="whitespace-nowrap">{new Date(c.created_at).toLocaleString(lang === "en" ? "en-CA" : "fr-CA")}</td>
                              <td>{String(c.direction ?? "").toLowerCase() === "outbound" ? L(lang, "Sortant", "Outbound") : L(lang, "Entrant", "Inbound")}</td>
                              <td>{c.planipret_profiles?.full_name ?? c.extension ?? "—"}</td>
                              <td className="text-right">{dur(c.duration_seconds)}</td>
                              <td>{statusBadge(c)}</td>
                              <td className="max-w-[280px] truncate">{c.ai_summary_short ?? c.ai_summary ?? "—"}</td>
                              <td className="text-right">
                                <Button size="sm" variant="outline" className="gap-1" disabled={!hasAudio(c)} onClick={() => setDetail(c)}>
                                  <PlayCircle className="w-4 h-4" />
                                  {L(lang, "Ouvrir", "Open")}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!groups.length && !loading ? (
              <div className="text-center py-6 text-muted-foreground text-sm">{L(lang, "Aucun client.", "No client.")}</div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {detail ? (
        <RecordingDetailDrawer call={detail} onClose={() => setDetail(null)} onUpdated={() => void load()} showBroker />
      ) : null}
    </PAPage>
  );
}
