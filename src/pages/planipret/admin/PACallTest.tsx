import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, PhoneIncoming, Play, RefreshCw, Radio, Square } from "lucide-react";
import { toast } from "sonner";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const L = (lang: string, fr: string, en: string) => (lang === "en" ? en : fr);

type Did = { extension: string | null; phone_number_e164: string | null; status: string | null; display_name: string | null };
type Call = {
  id: string; extension: string | null; direction: string | null; status: string | null;
  from_number: string | null; to_number: string | null; started_at: string | null; answered_at: string | null;
  ended_at: string | null; duration_seconds: number | null; ns_callid: string | null; ns_call_id: string | null;
  ns_cdr_id: string | null; recording_url: string | null; has_recording: boolean | null; transcript: string | null;
};

export default function PACallTest() {
  const { lang } = useMplanipretLang();
  const [ext, setExt] = useState("1136");
  const [dids, setDids] = useState<Did[]>([]);
  const [watching, setWatching] = useState(false);
  const [since, setSince] = useState<string | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<Call | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDids = useCallback(async () => {
    const { data } = await supabase
      .from("planipret_did_assignments")
      .select("extension, phone_number_e164, status, display_name")
      .eq("extension", ext);
    setDids((data as Did[]) ?? []);
  }, [ext]);

  useEffect(() => { void loadDids(); }, [loadDids]);

  const fetchCalls = useCallback(async (from: string | null) => {
    let q = supabase
      .from("planipret_phone_calls")
      .select("id, extension, direction, status, from_number, to_number, started_at, answered_at, ended_at, duration_seconds, ns_callid, ns_call_id, ns_cdr_id, recording_url, has_recording, transcript")
      .eq("extension", ext)
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(25);
    if (from) q = q.gte("started_at", from);
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    setCalls((data as Call[]) ?? []);
  }, [ext]);

  const syncCdr = useCallback(async () => {
    setSyncing(true);
    const { error } = await supabase.functions.invoke("pp-ns-cdr?action=sync", { body: {} });
    setSyncing(false);
    if (error) toast.error(L(lang, "Synchronisation CDR échouée", "CDR sync failed"), { description: error.message });
    await fetchCalls(since);
  }, [fetchCalls, since, lang]);

  const start = useCallback(async () => {
    const from = new Date(Date.now() - 60_000).toISOString();
    setSince(from);
    setCalls([]);
    setSelected(null);
    setAudioUrl(null);
    setWatching(true);
    await fetchCalls(from);
    toast.success(L(lang, `Appelez le numéro ci-dessus — écoute du poste ${ext}`, `Call the number above — watching ext ${ext}`));
  }, [fetchCalls, ext, lang]);

  const stop = useCallback(() => {
    setWatching(false);
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
  }, []);

  useEffect(() => {
    if (!watching) return;
    timer.current = setInterval(() => { void fetchCalls(since); }, 5000);
    const slow = setInterval(() => { void syncCdr(); }, 30_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
      clearInterval(slow);
    };
  }, [watching, since, fetchCalls, syncCdr]);

  const loadRecording = useCallback(async (c: Call) => {
    setSelected(c);
    setAudioUrl(null);
    if (c.recording_url) { setAudioUrl(c.recording_url); return; }
    setAudioLoading(true);
    const { data, error } = await supabase.functions.invoke("ns-get-recording", {
      body: { call_db_id: c.id, ns_callid: c.ns_callid ?? c.ns_call_id, prefer_url: true },
    });
    setAudioLoading(false);
    const url = (data as any)?.recording_url ?? (data as any)?.url;
    if (error || !url) {
      toast.error((data as any)?.message ?? L(lang, "Enregistrement pas encore disponible", "Recording not available yet"));
      return;
    }
    setAudioUrl(url);
  }, [lang]);

  const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString(lang === "en" ? "en-CA" : "fr-CA") : "—");
  const did = useMemo(() => dids.find((d) => d.status === "assigned") ?? dids[0] ?? null, [dids]);

  return (
    <PAPage>
      <PAPageHeader
        icon={<PhoneIncoming className="h-5 w-5" />}
        title={L(lang, "Test d'appel entrant", "Inbound call test")}
        subtitle={L(lang, "Compose le poste, suis l'appel en direct, affiche le CDR et l'enregistrement.", "Dial the extension, follow the call live, show the CDR and the recording.")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={ext}
              onChange={(e) => setExt(e.target.value.replace(/\D/g, ""))}
              className="h-9 w-24 rounded-md border border-border bg-background px-3 font-mono text-sm"
              placeholder="1136"
            />
            {watching ? (
              <Button size="sm" variant="outline" onClick={stop}><Square className="h-4 w-4" />{L(lang, "Arrêter", "Stop")}</Button>
            ) : (
              <Button size="sm" onClick={start}><Radio className="h-4 w-4" />{L(lang, "Démarrer le test", "Start test")}</Button>
            )}
            <Button size="sm" variant="outline" onClick={syncCdr} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {L(lang, "Forcer la synchro CDR", "Force CDR sync")}
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{L(lang, "Numéro à composer", "Number to dial")}</CardTitle>
          <CardDescription className="text-xs">
            {L(lang, "Numéro public qui sonne sur ce poste.", "Public number that rings this extension.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {did ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-2xl font-semibold">{did.phone_number_e164}</span>
              <Badge variant="outline">{did.status ?? "—"}</Badge>
              <span className="text-xs text-muted-foreground">{did.display_name ?? "—"} · {L(lang, "poste", "ext")} {ext}</span>
              {watching && (
                <span className="flex items-center gap-1 text-xs text-emerald-500">
                  <Loader2 className="h-3 w-3 animate-spin" /> {L(lang, "en écoute…", "watching…")}
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{L(lang, "Aucun numéro assigné à ce poste.", "No number assigned to this extension.")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{L(lang, "Appels détectés (CDR)", "Detected calls (CDR)")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="pa-scroll max-h-[420px] overflow-auto rounded-md border">
            <table className="pa-table w-full text-sm">
              <thead>
                <tr>
                  <th>{L(lang, "Début", "Start")}</th>
                  <th>{L(lang, "Sens", "Direction")}</th>
                  <th>{L(lang, "De", "From")}</th>
                  <th>{L(lang, "Vers", "To")}</th>
                  <th className="pa-num">{L(lang, "Durée", "Duration")}</th>
                  <th>CDR</th>
                  <th>{L(lang, "Enregistrement", "Recording")}</th>
                </tr>
              </thead>
              <tbody>
                {calls.length === 0 ? (
                  <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">
                    {watching ? L(lang, "En attente d'un appel…", "Waiting for a call…") : L(lang, "Démarrez le test puis composez le numéro.", "Start the test then dial the number.")}
                  </td></tr>
                ) : calls.map((c) => (
                  <tr key={c.id} className={selected?.id === c.id ? "bg-muted/40" : undefined}>
                    <td>{fmt(c.started_at)}</td>
                    <td><Badge variant="outline">{c.direction ?? "—"}</Badge></td>
                    <td className="font-mono">{c.from_number ?? "—"}</td>
                    <td className="font-mono">{c.to_number ?? "—"}</td>
                    <td className="pa-num">{c.duration_seconds ?? 0} s</td>
                    <td className="font-mono text-xs">{c.ns_cdr_id ?? c.ns_callid ?? "—"}</td>
                    <td>
                      <Button size="sm" variant="outline" onClick={() => void loadRecording(c)} disabled={audioLoading}>
                        {audioLoading && selected?.id === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        {L(lang, "Écouter", "Listen")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{L(lang, "Détail de l'appel", "Call details")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-xs">
            <dl className="grid grid-cols-1 gap-y-1 md:grid-cols-2 md:gap-x-6">
              <Row k={L(lang, "Début", "Start")} v={fmt(selected.started_at)} />
              <Row k={L(lang, "Répondu", "Answered")} v={fmt(selected.answered_at)} />
              <Row k={L(lang, "Fin", "End")} v={fmt(selected.ended_at)} />
              <Row k={L(lang, "Statut", "Status")} v={selected.status ?? "—"} />
              <Row k="NS call-id" v={selected.ns_callid ?? selected.ns_call_id ?? "—"} />
              <Row k="CDR id" v={selected.ns_cdr_id ?? "—"} />
            </dl>
            {audioUrl ? (
              <audio controls src={audioUrl} className="w-full" />
            ) : (
              <p className="text-muted-foreground">{L(lang, "Aucun enregistrement chargé.", "No recording loaded.")}</p>
            )}
            {selected.transcript && (
              <div className="max-h-40 overflow-auto rounded-md border bg-muted/30 p-2 whitespace-pre-wrap">{selected.transcript}</div>
            )}
          </CardContent>
        </Card>
      )}
    </PAPage>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1 last:border-b-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right break-all">{v}</dd>
    </div>
  );
}
