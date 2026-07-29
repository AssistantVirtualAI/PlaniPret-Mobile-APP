import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Radio, FileText, Sparkles, BarChart3, CheckCircle2, Clock, Search, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";


const DICT = {
  fr: {
    title: "Appels synchronisés — Maestro",
    subtitle: "Transcription complète, sommaire IA et analyse, mis à jour en direct dès que Maestro reçoit les données.",
    refresh: "Actualiser",
    live: "Live",
    offline: "Hors ligne",
    search: "Rechercher un numéro, un courtier…",
    onlySynced: "Synchronisés seulement",
    all: "Tous",
    synced: "Synchronisé",
    pending: "En attente",
    empty: "Aucun appel synchronisé pour le moment.",
    transcript: "Transcription complète",
    summary: "Sommaire IA",
    analysis: "Analyse IA",
    noTranscript: "Aucune transcription disponible.",
    noSummary: "Aucun sommaire IA disponible.",
    noAnalysis: "Aucune analyse disponible.",
    keyPoints: "Points clés",
    actions: "Prochaines actions",
    topics: "Thèmes",
    duration: "Durée",
    select: "Sélectionnez un appel pour voir la transcription, le sommaire et l'analyse.",
    total: "Appels",
    syncedCount: "Synchronisés",
    withTranscript: "Avec transcription",
    withAnalysis: "Analysés",
  },
  en: {
    title: "Synced calls — Maestro",
    subtitle: "Full transcript, AI summary and analysis, updated live as soon as Maestro receives the data.",
    refresh: "Refresh",
    live: "Live",
    offline: "Offline",
    search: "Search a number, a broker…",
    onlySynced: "Synced only",
    all: "All",
    synced: "Synced",
    pending: "Pending",
    empty: "No synced call yet.",
    transcript: "Full transcript",
    summary: "AI summary",
    analysis: "AI analysis",
    noTranscript: "No transcript available.",
    noSummary: "No AI summary available.",
    noAnalysis: "No analysis available.",
    keyPoints: "Key points",
    actions: "Next actions",
    topics: "Topics",
    duration: "Duration",
    select: "Select a call to see the transcript, summary and analysis.",
    total: "Calls",
    syncedCount: "Synced",
    withTranscript: "With transcript",
    withAnalysis: "Analyzed",
  },
};

const COLUMNS =
  "id,user_id,direction,status,from_number,from_name,to_number,to_name,started_at,duration_seconds," +
  "transcript,transcript_segments,transcript_language,ai_summary,ai_summary_short,ai_key_points,ai_topics," +
  "ai_action_items,ai_analysis_json,ai_client_insights,coaching_score,lead_temperature,analyzed_at," +
  "maestro_synced,maestro_call_id,maestro_client_name,recording_url,updated_at";

type CallRow = Record<string, any>;

const fmtDate = (s?: string | null, lang = "fr") =>
  s ? new Date(s).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "short", timeStyle: "short" }) : "—";

const fmtDur = (n?: number | null) => {
  const s = Math.max(0, Number(n ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const asList = (v: any): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : x?.text ?? x?.title ?? JSON.stringify(x)));
  if (typeof v === "string") return v.split("\n").filter(Boolean);
  return [];
};

export default function PASyncedCalls() {
  const { lang } = useMplanipretLang();
  const t = DICT[(lang === "en" ? "en" : "fr") as "fr" | "en"];
  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);

  const linkBrokers = useCallback(async () => {
    setLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("pp-maestro-broker-backfill", {
        body: { only_missing: true, max_id: 800 },
      });
      if (error) throw error;
      const d = data as { matched?: number; updated?: number; unmatched?: number };
      toast.success(
        lang === "fr"
          ? `${d?.updated ?? 0} courtier(s) liés à Maestro — ${d?.unmatched ?? 0} sans correspondance`
          : `${d?.updated ?? 0} broker(s) linked to Maestro — ${d?.unmatched ?? 0} unmatched`,
      );
    } catch (e) {
      toast.error((e as Error)?.message ?? "Error");
    } finally {
      setLinking(false);
    }
  }, [lang]);

  const [liveOk, setLiveOk] = useState(false);
  const [q, setQ] = useState("");
  const [onlySynced, setOnlySynced] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const onlySyncedRef = useRef(onlySynced);
  onlySyncedRef.current = onlySynced;

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("planipret_phone_calls")
      .select(COLUMNS)
      .order("started_at", { ascending: false })
      .limit(200);
    if (onlySyncedRef.current) query = query.eq("maestro_synced", true);
    const { data } = await query;
    setRows((data as any[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, onlySynced]);

  // Realtime — refresh the row as soon as Maestro sync / AI pipeline writes.
  useEffect(() => {
    const channel = supabase
      .channel(`pa-synced-calls-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "planipret_phone_calls" },
        (payload) => {
          const next = payload.new as CallRow | null;
          if (!next?.id) return;
          setRows((prev) => {
            const idx = prev.findIndex((r) => r.id === next.id);
            if (idx === -1) {
              if (onlySyncedRef.current && !next.maestro_synced) return prev;
              return [{ ...next }, ...prev].slice(0, 200);
            }
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...next };
            return copy;
          });
        },
      )
      .subscribe((status) => setLiveOk(status === "SUBSCRIBED"));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.from_number, r.to_number, r.from_name, r.to_name, r.maestro_client_name, r.ai_summary_short]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  const selected = useMemo(
    () => filtered.find((r) => r.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );

  const stats = useMemo(
    () => ({
      total: rows.length,
      synced: rows.filter((r) => r.maestro_synced).length,
      transcript: rows.filter((r) => r.transcript).length,
      analyzed: rows.filter((r) => r.analyzed_at || r.ai_analysis_json).length,
    }),
    [rows],
  );

  const segments: any[] = Array.isArray(selected?.transcript_segments) ? selected!.transcript_segments : [];

  return (
    <PAPage>
      <PAPageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title={t.title}
        subtitle={t.subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={liveOk ? "default" : "secondary"} className="gap-1">
              <Radio className="h-3 w-3" /> {liveOk ? t.live : t.offline}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => void linkBrokers()} disabled={linking}>
              <Link2 className={`h-4 w-4 ${linking ? "animate-pulse" : ""}`} />{" "}
              {lang === "fr" ? "Lier les courtiers à Maestro" : "Link brokers to Maestro"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> {t.refresh}
            </Button>
          </div>
        }
      />


      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: t.total, value: stats.total, Icon: BarChart3 },
          { label: t.syncedCount, value: stats.synced, Icon: CheckCircle2 },
          { label: t.withTranscript, value: stats.transcript, Icon: FileText },
          { label: t.withAnalysis, value: stats.analyzed, Icon: Sparkles },
        ].map(({ label, value, Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <Icon className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-2xl font-semibold leading-none">{value}</div>
                <div className="truncate text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className="pl-8" />
        </div>
        <Button size="sm" variant={onlySynced ? "default" : "outline"} onClick={() => setOnlySynced(true)}>
          {t.onlySynced}
        </Button>
        <Button size="sm" variant={!onlySynced ? "default" : "outline"} onClick={() => setOnlySynced(false)}>
          {t.all}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardContent className="max-h-[70vh] overflow-y-auto p-0">
            {filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">{t.empty}</div>
            ) : (
              <ul className="divide-y">
                {filtered.map((r) => {
                  const active = selected?.id === r.id;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted/60 ${active ? "bg-muted" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">
                            {r.maestro_client_name || r.from_name || r.from_number || "—"}
                          </span>
                          <Badge variant={r.maestro_synced ? "default" : "secondary"} className="shrink-0 gap-1">
                            {r.maestro_synced ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            {r.maestro_synced ? t.synced : t.pending}
                          </Badge>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {r.direction} · {r.from_number} → {r.to_number}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {fmtDate(r.started_at, lang)} · {t.duration} {fmtDur(r.duration_seconds)}
                        </div>
                        {r.ai_summary_short ? (
                          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.ai_summary_short}</div>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!selected ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">{t.select}</CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4" /> {t.summary}
                  </CardTitle>
                </CardHeader>
                <CardContent className="whitespace-pre-wrap text-sm">
                  {selected.ai_summary || selected.ai_summary_short || (
                    <span className="text-muted-foreground">{t.noSummary}</span>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="h-4 w-4" /> {t.analysis}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {(() => {
                    const keyPoints = asList(selected.ai_key_points);
                    const actions = asList(selected.ai_action_items ?? selected.next_actions);
                    const topics = asList(selected.ai_topics);
                    const has =
                      keyPoints.length || actions.length || topics.length || selected.ai_analysis_json || selected.coaching_score != null;
                    if (!has) return <span className="text-muted-foreground">{t.noAnalysis}</span>;
                    return (
                      <>
                        <div className="flex flex-wrap gap-2">
                          {selected.lead_temperature ? <Badge variant="outline">{selected.lead_temperature}</Badge> : null}
                          {selected.coaching_score != null ? (
                            <Badge variant="outline">score {selected.coaching_score}</Badge>
                          ) : null}
                          {selected.analyzed_at ? (
                            <Badge variant="outline">{fmtDate(selected.analyzed_at, lang)}</Badge>
                          ) : null}
                        </div>
                        {topics.length ? (
                          <div>
                            <div className="mb-1 text-xs font-medium text-muted-foreground">{t.topics}</div>
                            <div className="flex flex-wrap gap-1">
                              {topics.map((x, i) => (
                                <Badge key={i} variant="secondary">{x}</Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {keyPoints.length ? (
                          <div>
                            <div className="mb-1 text-xs font-medium text-muted-foreground">{t.keyPoints}</div>
                            <ul className="list-disc space-y-1 pl-5">
                              {keyPoints.map((x, i) => <li key={i}>{x}</li>)}
                            </ul>
                          </div>
                        ) : null}
                        {actions.length ? (
                          <div>
                            <div className="mb-1 text-xs font-medium text-muted-foreground">{t.actions}</div>
                            <ul className="list-disc space-y-1 pl-5">
                              {actions.map((x, i) => <li key={i}>{x}</li>)}
                            </ul>
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4" /> {t.transcript}
                    {selected.transcript_language ? (
                      <Badge variant="outline" className="ml-1">{selected.transcript_language}</Badge>
                    ) : null}
                  </CardTitle>
                </CardHeader>
                <CardContent className="max-h-[45vh] overflow-y-auto text-sm">
                  {segments.length ? (
                    <div className="space-y-2">
                      {segments.map((s: any, i: number) => (
                        <div key={i} className="rounded-md bg-muted/50 p-2">
                          <div className="text-xs font-medium text-muted-foreground">
                            {s.speaker ?? s.channel ?? `#${i + 1}`}
                          </div>
                          <div className="whitespace-pre-wrap">{s.text ?? s.transcript ?? ""}</div>
                        </div>
                      ))}
                    </div>
                  ) : selected.transcript ? (
                    <p className="whitespace-pre-wrap">{selected.transcript}</p>
                  ) : (
                    <span className="text-muted-foreground">{t.noTranscript}</span>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </PAPage>
  );
}
