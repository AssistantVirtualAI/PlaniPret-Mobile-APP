/**
 * NS Sync Dashboard
 * ----------------------------------------------------------------------------
 * - Per Edge Function status: last run date, status, summary, error
 * - Tail of NS-API requests (function, method, path + query, status, duration)
 * - Backfill trigger calling pp-admin-ns-sync (90-day window) with summary
 * - Post-sync /admin/calls join control: counts rows with broker_name not null
 *   via planipret_phone_calls.user_id -> planipret_profiles.id, plus 20 samples
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Play, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";

type RunRow = {
  id: string;
  function_name: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  summary: any;
  error: string | null;
};

type LogRow = {
  id: string;
  function_name: string;
  method: string;
  path: string;
  query_params: Record<string, string> | null;
  status: number | null;
  duration_ms: number | null;
  ok: boolean | null;
  error: string | null;
  created_at: string;
};

const FUNCTIONS = ["pp-admin-ns-sync", "pp-ns-cdr"] as const;

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: any }> = {
    success: { cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
    error:   { cls: "bg-red-500/15 text-red-300 border-red-500/30", icon: XCircle },
    running: { cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", icon: Clock },
  };
  const m = map[status] ?? { cls: "bg-white/5 text-white/70 border-white/10", icon: Clock };
  const I = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${m.cls}`}>
      <I className="w-3 h-3" /> {status}
    </span>
  );
}

export function NsSyncDashboardPanel() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [joinStats, setJoinStats] = useState<{ total: number; linked: number; unlinked: number; samples: any[] } | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [mobileBackfilling, setMobileBackfilling] = useState(false);


  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: rs }, { data: lg }] = await Promise.all([
        supabase
          .from("planipret_edge_function_runs")
          .select("id,function_name,started_at,finished_at,status,summary,error")
          .order("started_at", { ascending: false })
          .limit(50),
        supabase
          .from("planipret_ns_request_log")
          .select("id,function_name,method,path,query_params,status,duration_ms,ok,error,created_at")
          .order("created_at", { ascending: false })
          .limit(40),
      ]);
      setRuns((rs as any) ?? []);
      setLogs((lg as any) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime: refresh tables when new rows land
  useEffect(() => {
    const ch = supabase
      .channel("ns-sync-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_edge_function_runs" }, fetchAll)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "planipret_ns_request_log" }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAll]);

  const latestByFn = useMemo(() => {
    const map: Record<string, RunRow | undefined> = {};
    for (const r of runs) if (!map[r.function_name]) map[r.function_name] = r;
    return map;
  }, [runs]);

  const launchBackfill = useCallback(async () => {
    setSyncing(true);
    setLastResult(null);
    try {
      const end = new Date().toISOString();
      const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase.functions.invoke("pp-admin-ns-sync", { body: { start, end } });
      if (error) throw error;
      setLastResult(data);
      toast.success("Backfill lancé — exécution en arrière-plan");
      // give the bg job a moment then refresh
      setTimeout(() => { fetchAll(); runJoinCheck(); }, 4000);
    } catch (e: any) {
      toast.error(e?.message ?? "Échec backfill");
      setLastResult({ error: e?.message });
    } finally {
      setSyncing(false);
    }
  }, [fetchAll]);

  const runJoinCheck = useCallback(async () => {
    setJoinLoading(true);
    try {
      const { count: total } = await supabase
        .from("planipret_phone_calls")
        .select("id", { count: "exact", head: true });

      const { data: linked, count: linkedCount } = await supabase
        .from("planipret_phone_calls")
        .select("id, started_at, from_number, to_number, extension, direction, user_id, planipret_profiles!fk_phone_calls_profile(id, full_name, email)", { count: "exact" })
        .not("user_id", "is", null)
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(20);

      const samples = (linked ?? []).map((r: any) => ({
        id: r.id,
        when: r.started_at,
        direction: r.direction,
        from: r.from_number,
        to: r.to_number,
        extension: r.extension,
        broker_name: r.planipret_profiles?.full_name ?? null,
        broker_email: r.planipret_profiles?.email ?? null,
      }));

      setJoinStats({
        total: total ?? 0,
        linked: linkedCount ?? 0,
        unlinked: (total ?? 0) - (linkedCount ?? 0),
        samples,
      });
    } catch (e: any) {
      toast.error(`Join check: ${e?.message ?? "erreur"}`);
    } finally {
      setJoinLoading(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-white">Tableau de bord — synchro NS-API</h3>
          <p className="text-sm text-white/60">Statut des Edge Functions, journal des requêtes v2, et contrôle des jointures.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchAll}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-white/5 border border-white/10 text-white hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Rafraîchir
          </button>
          <button
            onClick={launchBackfill}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Lancer backfill NS CDR (90j)
          </button>
          <button
            onClick={async () => {
              setMobileBackfilling(true);
              try {
                const { data, error } = await supabase.functions.invoke("pp-backfill-mobile-devices", { body: {} });
                if (error) throw error;
                const d: any = data ?? {};
                toast.success(`Devices mobiles — créés: ${d.created ?? 0}, existants: ${d.skipped ?? 0}, erreurs: ${d.errors ?? 0}`);
                setLastResult(d);
              } catch (e: any) {
                toast.error(e?.message ?? "Échec backfill mobile");
              } finally {
                setMobileBackfilling(false);
              }
            }}
            disabled={mobileBackfilling}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-blue-500/20 border border-blue-500/40 text-blue-200 hover:bg-blue-500/30 disabled:opacity-50"
            title="Crée un device SIP mobile dédié pour chaque courtier (sans toucher au widget)"
          >
            {mobileBackfilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Provisionner devices mobiles
          </button>
        </div>
      </div>


      {/* Per-function status cards */}
      <div className="grid md:grid-cols-2 gap-3">
        {FUNCTIONS.map((fn) => {
          const r = latestByFn[fn];
          return (
            <div key={fn} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div className="font-mono text-sm text-white">{fn}</div>
                <StatusPill status={r?.status ?? "—"} />
              </div>
              <div className="mt-2 text-xs text-white/60 space-y-0.5">
                <div>Dernier run : <span className="text-white/80">{fmtDate(r?.started_at ?? null)}</span></div>
                <div>Terminé : <span className="text-white/80">{fmtDate(r?.finished_at ?? null)}</span></div>
              </div>
              {r?.error && (
                <div className="mt-2 text-xs text-red-300 break-words bg-red-500/10 border border-red-500/30 rounded p-2">
                  {r.error}
                </div>
              )}
              {r?.summary && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-white/70 hover:text-white">Résumé</summary>
                  <pre className="mt-1 max-h-48 overflow-auto bg-black/40 rounded p-2 text-[11px] text-white/80 whitespace-pre-wrap">
{JSON.stringify(r.summary, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {/* Last backfill summary */}
      {lastResult && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold text-white mb-2">Dernier appel — pp-admin-ns-sync</div>
          <pre className="text-[11px] text-white/80 bg-black/40 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap">
{JSON.stringify(lastResult, null, 2)}
          </pre>
        </div>
      )}

      {/* /admin/calls join control */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-sm font-semibold text-white">Contrôle /admin/calls — jointure broker</div>
            <div className="text-xs text-white/60">
              planipret_phone_calls.user_id → planipret_profiles.id (broker_name)
            </div>
          </div>
          <button
            onClick={runJoinCheck}
            disabled={joinLoading}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-white/5 border border-white/10 text-white hover:bg-white/10 disabled:opacity-50"
          >
            {joinLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Lancer le contrôle
          </button>
        </div>

        {joinStats && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-white/5 border border-white/10 p-2">
                <div className="text-[11px] uppercase text-white/50">Total appels</div>
                <div className="text-lg font-semibold text-white">{joinStats.total}</div>
              </div>
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2">
                <div className="text-[11px] uppercase text-emerald-300/80">broker_name non null</div>
                <div className="text-lg font-semibold text-emerald-200">{joinStats.linked}</div>
              </div>
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2">
                <div className="text-[11px] uppercase text-amber-300/80">Non liés</div>
                <div className="text-lg font-semibold text-amber-200">{joinStats.unlinked}</div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-xs">
                <thead className="bg-white/5 text-white/60">
                  <tr>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Sens</th>
                    <th className="text-left p-2">De</th>
                    <th className="text-left p-2">Vers</th>
                    <th className="text-left p-2">Ext</th>
                    <th className="text-left p-2">Courtier</th>
                  </tr>
                </thead>
                <tbody>
                  {joinStats.samples.length === 0 && (
                    <tr><td colSpan={6} className="p-3 text-center text-white/50">Aucun appel lié à un profil</td></tr>
                  )}
                  {joinStats.samples.map((s) => (
                    <tr key={s.id} className="border-t border-white/5">
                      <td className="p-2 text-white/70">{fmtDate(s.when)}</td>
                      <td className="p-2 text-white/70">{s.direction ?? "—"}</td>
                      <td className="p-2 text-white/70">{s.from ?? "—"}</td>
                      <td className="p-2 text-white/70">{s.to ?? "—"}</td>
                      <td className="p-2 text-white/70">{s.extension ?? "—"}</td>
                      <td className="p-2 text-white">{s.broker_name ?? <span className="text-amber-300/80">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Request log tail */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-semibold text-white mb-2">Journal NS-API (40 plus récents)</div>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-[11px]">
            <thead className="bg-white/5 text-white/60">
              <tr>
                <th className="text-left p-2">Quand</th>
                <th className="text-left p-2">Fonction</th>
                <th className="text-left p-2">Méthode</th>
                <th className="text-left p-2">Endpoint v2</th>
                <th className="text-left p-2">Params</th>
                <th className="text-left p-2">Statut</th>
                <th className="text-left p-2">Durée</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={7} className="p-3 text-center text-white/50">Aucune requête enregistrée pour l'instant</td></tr>
              )}
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-white/5">
                  <td className="p-2 text-white/60 whitespace-nowrap">{fmtDate(l.created_at)}</td>
                  <td className="p-2 text-white/80 font-mono">{l.function_name}</td>
                  <td className="p-2 text-white/70">{l.method}</td>
                  <td className="p-2 font-mono text-white/90 break-all">{l.path}</td>
                  <td className="p-2 text-white/60 break-all">
                    {l.query_params
                      ? Object.entries(l.query_params).map(([k, v]) => `${k}=${v}`).join("&")
                      : "—"}
                  </td>
                  <td className={`p-2 font-mono ${l.ok ? "text-emerald-300" : "text-red-300"}`}>{l.status ?? "—"}</td>
                  <td className="p-2 text-white/60">{l.duration_ms != null ? `${l.duration_ms}ms` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default NsSyncDashboardPanel;
