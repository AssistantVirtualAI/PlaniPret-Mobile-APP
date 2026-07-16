import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Disc, Voicemail as VmIcon, PhoneCall, Trash2, RefreshCw, Download, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LEMTEL_ORG } from "@/hooks/usePbxData";
import { usePbxWrite } from "@/hooks/usePbxWrite";
import { RecordingWavePlayer } from "@/components/portal/RecordingWavePlayer";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { loadPbxRecordingAudio } from "@/lib/pbxRecordingAudio";
import { runTranscribeAndAnalyze, isStubTranscript, type TranscriptStage } from "@/lib/transcriptStatus";
import { TranscriptStagePill } from "@/components/transcripts/TranscriptStagePill";


type Scope = "org" | "mine";
type HistoryRange = 7 | 30;

export default function TelephonyMediaCenter({ scope = "org" }: { scope?: Scope }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("cdr");
  const [q, setQ] = useState("");
  const [extFilter, setExtFilter] = useState("");
  const [rangeDays, setRangeDays] = useState<HistoryRange>(7);

  // -------- Realtime invalidation --------
  useEffect(() => {
    let lastInvalidatedAt = 0;
    const invalidate = (queryKey: string[], payload?: any) => {
      if (payload?.table === "pbx_call_records" && payload.eventType === "UPDATE") {
        const oldRow = payload.old || {};
        const newRow = payload.new || {};
        const hasComparableOldRow = Object.prototype.hasOwnProperty.call(oldRow, "has_recording")
          || Object.prototype.hasOwnProperty.call(oldRow, "recording_path")
          || Object.prototype.hasOwnProperty.call(oldRow, "recording_name")
          || Object.prototype.hasOwnProperty.call(oldRow, "start_at")
          || Object.prototype.hasOwnProperty.call(oldRow, "call_status");
        if (!hasComparableOldRow) return;
        const changed = oldRow.has_recording !== newRow.has_recording
          || oldRow.recording_path !== newRow.recording_path
          || oldRow.recording_name !== newRow.recording_name
          || oldRow.start_at !== newRow.start_at
          || oldRow.call_status !== newRow.call_status;
        if (!changed) return;
      }
      const now = Date.now();
      if (now - lastInvalidatedAt < 30_000) return;
      lastInvalidatedAt = now;
      qc.invalidateQueries({ queryKey });
    };
    const ch = supabase
      .channel("media-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "pbx_call_records" }, (payload) => invalidate(["media"], payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "pbx_voicemails" }, () => invalidate(["media", "vm"]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // -------- Caller extension (when scope=mine) --------
  const { data: myExt } = useQuery({
    queryKey: ["media", "my-ext"],
    enabled: scope === "mine",
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data } = await (supabase as any).from("pbx_softphone_users")
        .select("extension,organization_id").eq("portal_user_id", auth.user.id).maybeSingle();
      return data;
    },
  });

  const orgId = (myExt as any)?.organization_id ?? LEMTEL_ORG;
  const filterExt: string | null = scope === "mine" ? (myExt as any)?.extension ?? null : (extFilter.trim() || null);
  const mineReady = scope !== "mine" || !!((myExt as any)?.extension);

  // Auto-sync CDRs + voicemails from PBX when the /my media center opens
  useEffect(() => {
    if (scope !== "mine" || !mineReady || !orgId) return;
    (async () => {
      await Promise.allSettled([
        supabase.functions.invoke("fusionpbx-proxy", { body: { action: "sync-cdrs", organization_id: orgId } }),
        supabase.functions.invoke("voicemail-sync", { body: { organization_id: orgId, extension: filterExt ?? undefined } }),
      ]);
      qc.invalidateQueries({ queryKey: ["media"] });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, mineReady, orgId, filterExt]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Disc className="h-6 w-6" /> Media Center
          </h1>
          <p className="text-sm text-muted-foreground">{scope === "mine" ? "Vos appels, enregistrements et messagerie" : "CDR, enregistrements et messagerie unifiés"}</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Input placeholder="Rechercher numéro, nom, transcription…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
          {scope !== "mine" && (
            <Input
              placeholder="Filter by extension #"
              value={extFilter}
              onChange={(e) => setExtFilter(e.target.value.replace(/[^0-9*]/g, ""))}
              inputMode="numeric"
              className="max-w-[180px] font-mono"
            />
          )}
          <div className="flex rounded-md border border-border overflow-hidden">
            {([7, 30] as const).map((days) => (
              <Button key={days} type="button" size="sm" variant={rangeDays === days ? "default" : "ghost"} className="rounded-none" onClick={() => setRangeDays(days)}>
                {days} days
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={async () => {
            toast.info("Synchronisation en cours…");
            await supabase.functions.invoke("fusionpbx-proxy", { body: { action: "sync-cdrs", organization_id: orgId } }).catch(() => {});
            await supabase.functions.invoke("voicemail-sync", { body: { organization_id: orgId } }).catch(() => {});
            qc.invalidateQueries({ queryKey: ["media"] });
            toast.success("Synchronisé");
          }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Sync
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="cdr"><PhoneCall className="h-4 w-4 mr-1" /> CDR</TabsTrigger>
          <TabsTrigger value="recordings"><Disc className="h-4 w-4 mr-1" /> Enregistrements</TabsTrigger>
          <TabsTrigger value="voicemail"><VmIcon className="h-4 w-4 mr-1" /> Messagerie</TabsTrigger>
        </TabsList>

        <TabsContent value="cdr" className="mt-4">
          {mineReady ? <CdrTab orgId={orgId} extension={filterExt} search={q} rangeDays={rangeDays} /> : <Card><CardContent className="py-8 text-sm text-muted-foreground">Aucune extension liée à votre compte.</CardContent></Card>}
        </TabsContent>
        <TabsContent value="recordings" className="mt-4">
          {mineReady ? <RecordingsTab orgId={orgId} extension={filterExt} search={q} rangeDays={rangeDays} /> : <Card><CardContent className="py-8 text-sm text-muted-foreground">Aucune extension liée à votre compte.</CardContent></Card>}
        </TabsContent>
        <TabsContent value="voicemail" className="mt-4">
          {mineReady ? <VoicemailTab orgId={orgId} extension={filterExt} search={q} /> : <Card><CardContent className="py-8 text-sm text-muted-foreground">Aucune extension liée à votre compte.</CardContent></Card>}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- CDR TAB ---------------- */
function CdrTab({ orgId, extension, search, rangeDays }: { orgId: string; extension: string | null; search: string; rangeDays: HistoryRange }) {
  const write = usePbxWrite();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["media", "cdr", orgId, extension, rangeDays],
    queryFn: async () => {
      const since = (() => { const d = new Date(); d.setDate(d.getDate() - rangeDays); d.setHours(0, 0, 0, 0); return d.toISOString(); })();
      let q = (supabase as any).from("pbx_call_records")
        .select("id,start_at,duration_seconds,direction,caller_number,destination_number,source_number,extension,call_status,hangup_cause,recording_path,has_recording,pbx_uuid")
        .eq("organization_id", orgId).gte("start_at", since).order("start_at", { ascending: false }).limit(500);
      if (extension) q = q.or(`extension.eq.${extension},caller_number.eq.${extension},destination_number.eq.${extension},source_number.eq.${extension}`);
      const { data } = await q;
      return (data || []) as any[];
    },
  });

  const filtered = rows.filter((r) => !search || `${r.caller_number ?? ""} ${r.destination_number ?? ""} ${r.extension ?? ""} ${r.source_number ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  const remove = async (r: any) => {
    if (!confirm("Supprimer ce CDR ?")) return;
    await write.mutateAsync({
      organizationId: orgId,
      action: "delete-cdr",
      params: { xml_cdr_uuid: r.pbx_uuid },
    }).catch(() => {});
    await (supabase as any).from("pbx_call_records").delete().eq("id", r.id);
    toast.success("CDR supprimé");
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  return (
    <Card>
      <CardHeader><CardTitle>{filtered.length} appels</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">Aucun appel.</p>}
        {filtered.map((r) => (
          <div key={r.id} className="flex items-center justify-between border rounded p-2 text-sm flex-wrap gap-2">
            <div className="font-mono">
              <Badge variant="outline" className="mr-2">{r.direction || "—"}</Badge>
              {r.caller_number || "—"} → {r.destination_number || "—"}
              <span className="text-muted-foreground ml-2">ext {r.extension ?? "—"} · {r.duration_seconds ?? 0}s · {r.start_at ? formatDistanceToNow(new Date(r.start_at), { addSuffix: true }) : ""}</span>
            </div>
            <div className="flex gap-1">
              <Badge variant={r.call_status === "answered" ? "default" : "secondary"}>{r.call_status || "—"}</Badge>
              {r.has_recording && <Badge variant="outline">REC</Badge>}
              <Button size="icon" variant="ghost" onClick={() => remove(r)} disabled={write.isPending}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ---------------- RECORDINGS TAB ---------------- */
function RecordingsTab({ orgId, extension, search, rangeDays }: { orgId: string; extension: string | null; search: string; rangeDays: HistoryRange }) {
  const write = usePbxWrite();
  const qc = useQueryClient();
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [stages, setStages] = useState<Record<string, { stage: TranscriptStage; detail?: string }>>({});


  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["media", "recordings", orgId, extension, rangeDays],
    queryFn: async () => {
      const since = (() => { const d = new Date(); d.setDate(d.getDate() - rangeDays); d.setHours(0, 0, 0, 0); return d.toISOString(); })();
      let q = (supabase as any).from("pbx_call_records")
        .select("id,organization_id,start_at,duration_seconds,caller_number,destination_number,source_number,extension,recording_path,recording_name,recording_url,ai_summary,transcribed,pbx_uuid,domain_uuid,domain_name,raw_data")
        .eq("organization_id", orgId).gte("start_at", since).not("recording_path", "is", null).order("start_at", { ascending: false }).limit(500);
      if (extension) q = q.or(`extension.eq.${extension},caller_number.eq.${extension},destination_number.eq.${extension},source_number.eq.${extension}`);
      const { data } = await q;
      return (data || []) as any[];
    },
  });

  const sign = async (r: any) => {
    if (signed[r.id]) return signed[r.id];
    setWorking(r.id);
    try {
      const url = await loadPbxRecordingAudio(r, orgId);
      setSigned((s) => ({ ...s, [r.id]: url }));
      return url;
    } catch (e: any) {
      toast.error(e?.message || "Lecture impossible");
    } finally {
      setWorking(null);
    }
  };
  const transcribe = async (id: string) => {
    setWorking(id);
    setStages((s) => ({ ...s, [id]: { stage: 'downloading' } }));
    const result = await runTranscribeAndAnalyze({
      invoke: async (name, body) => await supabase.functions.invoke(name, { body }),
      callRecordId: id,
      organizationId: orgId,
      onStage: (stage, detail) => setStages((s) => ({ ...s, [id]: { stage, detail } })),
    });
    if (result.stage === 'failed') toast.error(result.reason || 'Échec');
    else if (result.stage === 'unavailable') toast.message('Enregistrement indisponible', { description: result.reason || 'Audio non récupérable' });
    else toast.success('Transcription terminée');
    qc.setQueriesData({ queryKey: ['media', 'recordings'] }, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((row) => row?.id === id ? {
        ...row,
        transcribed: result.stage === 'complete',
        ai_summary: result.data?.summary ?? row.ai_summary,
        raw_data: {
          ...(row.raw_data || {}),
          transcript_text: result.data?.transcript_text || result.data?.transcript || row.raw_data?.transcript_text,
          transcript_provider: result.data?.transcript_provider || row.raw_data?.transcript_provider,
          ai: result.data?.insights || result.data?.analysis || row.raw_data?.ai,
        },
      } : row);
    });
    setWorking(null);
  };

  const remove = async (r: any) => {
    if (!confirm("Supprimer cet enregistrement ?")) return;
    await write.mutateAsync({
      organizationId: orgId,
      action: "delete-recording",
      params: { call_recording_uuid: r.pbx_uuid, record_path: r.recording_path },
    }).catch(() => {});
    await (supabase as any).from("pbx_call_records").update({ recording_path: null, has_recording: false }).eq("id", r.id);
    toast.success("Enregistrement supprimé");
  };

  const filtered = rows.filter((r) => !search || `${r.caller_number ?? ""} ${r.destination_number ?? ""} ${r.source_number ?? ""} ${r.extension ?? ""} ${r.raw_data?.transcript_text ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  return (
    <Card>
      <CardHeader><CardTitle>{filtered.length} enregistrements</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">Aucun enregistrement.</p>}
        {filtered.map((r) => {
          const url = signed[r.id] || r.recording_url;
          const transcriptText = r.raw_data?.transcript_text || "";
          const ai = r.raw_data?.ai || {};
          return (
            <div key={r.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2 text-sm">
                <div>
                  <span className="font-mono">{r.caller_number ?? "—"} → {r.destination_number ?? "—"}</span>
                  <span className="text-muted-foreground ml-2">ext {r.extension ?? "—"} · {r.duration_seconds ?? 0}s · {r.start_at ? formatDistanceToNow(new Date(r.start_at), { addSuffix: true }) : ""}</span>
                </div>
                <div className="flex gap-1 items-center">
                  {(() => {
                    const live = stages[r.id];
                    const transcript = { provider: r.raw_data?.transcript_provider, transcript_text: transcriptText };
                    const stubT = isStubTranscript(transcript);
                    const stage: TranscriptStage = live?.stage
                      ?? (working === r.id ? 'transcribing'
                        : r.transcribed && !stubT ? 'complete'
                        : r.transcribed && stubT ? 'unavailable'
                        : 'idle');
                    return <TranscriptStagePill stage={stage} detail={live?.detail} compact />;
                  })()}
                  {ai.sentiment && <Badge variant="outline">{ai.sentiment}</Badge>}
                  <Button size="sm" variant="outline" onClick={() => transcribe(r.id)} disabled={working === r.id}>
                    {working === r.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                    {r.transcribed ? 'Réessayer' : 'Transcrire'}
                  </Button>

                  {r.recording_path && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => sign(r)} disabled={working === r.id}>{working === r.id ? 'Chargement…' : 'Charger'}</Button>
                      {url && <Button size="icon" variant="ghost" asChild><a href={url} download><Download className="h-4 w-4" /></a></Button>}
                    </>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              {url && <RecordingWavePlayer url={url} />}
              {transcriptText && <p className="text-xs text-muted-foreground italic bg-muted/30 rounded p-2">"{transcriptText}"</p>}
              {(r.ai_summary || ai.summary) && <p className="text-xs"><strong>Résumé IA:</strong> {r.ai_summary || ai.summary}</p>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/* ---------------- VOICEMAIL TAB ---------------- */
function VoicemailTab({ orgId, extension, search }: { orgId: string; extension: string | null; search: string }) {
  const write = usePbxWrite();
  const [urls, setUrls] = useState<Record<string, string>>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["media", "vm", orgId, extension],
    queryFn: async () => {
      let q = (supabase as any).from("pbx_voicemails")
        .select("id,extension,caller_number,duration_seconds,transcript,read_at,received_at,created_at,storage_path,audio_storage_path,pbx_uuid,folder")
        .eq("organization_id", orgId).neq("folder", "trash")
        .order("received_at", { ascending: false }).limit(200);
      if (extension) q = q.eq("extension", extension);
      const { data } = await q;
      return (data || []) as any[];
    },
  });

  const sign = async (path: string) => {
    if (urls[path]) return urls[path];
    const { data } = await supabase.storage.from("voicemail-audio").createSignedUrl(path, 3600);
    if (data?.signedUrl) setUrls((u) => ({ ...u, [path]: data.signedUrl }));
    return data?.signedUrl;
  };
  const markRead = async (id: string) => { await supabase.rpc("mark_voicemail_read", { _id: id } as any); };
  const remove = async (v: any) => {
    if (!confirm("Supprimer ce message vocal ?")) return;
    await write.mutateAsync({
      organizationId: orgId,
      action: "delete-voicemail",
      params: { voicemail_message_uuid: v.pbx_uuid },
    }).catch(() => {});
    await (supabase as any).from("pbx_voicemails").update({ folder: "trash", deleted_at: new Date().toISOString() }).eq("id", v.id);
    toast.success("Message supprimé");
  };

  const filtered = rows.filter((r) => !search || `${r.caller_number ?? ""} ${r.extension ?? ""} ${r.transcript ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  const grouped = useMemo(() => filtered.reduce<Record<string, any[]>>((acc, r) => {
    const k = r.extension ?? "—"; (acc[k] ||= []).push(r); return acc;
  }, {}), [filtered]);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-3">
      {Object.keys(grouped).length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Aucun message vocal.</CardContent></Card>}
      {Object.entries(grouped).map(([ext, items]) => (
        <Card key={ext}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Extension {ext} <Badge variant="outline">{items.filter((v) => !v.read_at).length} non lus</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.map((v) => {
              const path = v.audio_storage_path || v.storage_path;
              const url = path ? urls[path] : null;
              return (
                <div key={v.id} className={`border rounded p-3 space-y-2 ${!v.read_at ? "bg-muted/40" : ""}`}>
                  <div className="flex items-center justify-between flex-wrap gap-2 text-sm">
                    <div>
                      <strong>{v.caller_number ?? "Inconnu"}</strong>
                      <span className="text-muted-foreground ml-2">{Math.round(v.duration_seconds ?? 0)}s · {formatDistanceToNow(new Date(v.received_at || v.created_at), { addSuffix: true })}</span>
                    </div>
                    <div className="flex gap-1">
                      {path && <Button size="sm" variant="outline" onClick={async () => { await sign(path); await markRead(v.id); }}>Charger</Button>}
                      {!v.read_at && <Button size="sm" variant="ghost" onClick={() => markRead(v.id)}>Marquer lu</Button>}
                      <Button size="icon" variant="ghost" onClick={() => remove(v)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {url && <audio controls src={url} className="w-full h-10" />}
                  {v.transcript && <p className="text-xs text-muted-foreground italic">"{v.transcript}"</p>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
