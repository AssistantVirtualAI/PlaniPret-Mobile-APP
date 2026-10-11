import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type DiagRow = {
  broker_user_id: string;
  broker_label: string | null;
  broker_email: string | null;
  maestro_broker_id: string | null;
  connected: boolean;
  status: string;
  reason: string | null;
  http_status: number | null;
  rows_count: number;
  source: string | null;
  last_ok_at: string | null;
  last_attempt_at: string | null;
};

type RunRow = {
  started_at: string;
  error?: string | null;
  finished_at: string | null;
  brokers_total: number;
  brokers_connected: number;
  rows_upserted: number;
  admin_token_used: boolean;
  trigger_source: string | null;
};

const REASONS_FR: Record<string, string> = {
  connected_but_api_returned_no_deposits: "Compte connecté, mais l'API Maestro ne renvoie aucun dépôt pour ce courtier.",
  no_broker_token_and_no_maestro_broker_id: "Compte Maestro jamais connecté et aucun identifiant Maestro sur le profil.",
  no_broker_token_and_admin_lookup_failed: "Compte non connecté; la portée admin n'a pas retourné ses dépôts.",
};

const explain = (d: DiagRow, isFr: boolean) => {
  const raw = d.reason ?? "";
  if (!raw) return isFr ? "Synchronisé." : "Synced.";
  for (const [k, v] of Object.entries(REASONS_FR)) if (raw.includes(k)) return isFr ? v : k.replace(/_/g, " ");
  if (raw.startsWith("maestro_not_connected")) {
    return isFr
      ? `Ce courtier n'a jamais autorisé Maestro (${raw.replace("maestro_not_connected", "").trim() || "aucun jeton"}).`
      : raw;
  }
  return raw;
};

/** Shows exactly which brokers are connected to Maestro, and why data is missing. */
export default function MaestroSyncDiagnostics({ lang, canSync }: { lang: "fr" | "en"; canSync?: boolean }) {
  const isFr = lang !== "en";
  const [rows, setRows] = useState<DiagRow[]>([]);
  const [run, setRun] = useState<RunRow | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<"all" | "connected" | "problem">("problem");
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: diag }, { data: runs }] = await Promise.all([
      supabase.from("planipret_commission_sync_diag" as any)
        .select("*").order("connected", { ascending: false }).order("rows_count", { ascending: false }).limit(500),
      supabase.from("planipret_commission_sync_runs" as any)
        .select("*").order("started_at", { ascending: false }).limit(1),
    ]);
    setRows(((diag ?? []) as unknown) as DiagRow[]);
    setRun((((runs ?? [])[0] ?? null) as unknown) as RunRow | null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runSync = async (brokerIds?: string[]) => {
    if (brokerIds?.length) setRetrying(brokerIds[0]); else setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("pp-commission-live-sync", {
        body: brokerIds?.length ? { broker_ids: brokerIds } : {},
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error) throw error;
      const d = (data ?? {}) as any;
      toast.success(isFr ? "Synchronisation terminée" : "Sync complete", {
        description: isFr
          ? `${d.brokers_connected ?? 0}/${d.brokers_total ?? 0} courtiers connectés · ${d.rows_upserted ?? 0} lignes`
          : `${d.brokers_connected ?? 0}/${d.brokers_total ?? 0} brokers connected · ${d.rows_upserted ?? 0} rows`,
      });
      await load();
    } catch (e: any) {
      toast.error(isFr ? "Échec de la synchronisation" : "Sync failed", { description: e?.message });
    } finally {
      setSyncing(false);
      setRetrying(null);
    }
  };

  // Maestro 5xx / "temporarily unavailable" are transient upstream hiccups,
  // retried automatically on the next sync — not import errors to surface.
  const isTransient = (r: DiagRow) =>
    (r.http_status != null && r.http_status >= 500) || /temporarily_unavailable|timeout/i.test(r.reason ?? "");
  const hardErrors = rows.filter((r) => r.status === "error" && !isTransient(r));
  const runError = run?.error && !/temporarily_unavailable|\b50[234]\b|timeout/i.test(run.error) ? run.error : null;
  const connected = rows.filter((r) => r.connected);
  const problems = rows.filter((r) => !r.connected || r.status === "error" || r.rows_count === 0);
  const shown = filter === "all" ? rows : filter === "connected" ? connected : problems;

  return (
    <div className="pp-hide-export mb-2 rounded-xl" style={{ border: "1px solid var(--pp-bg-border)", background: "var(--pp-bg-elevated)" }}>
      <div className="flex flex-wrap items-center gap-2" style={{ padding: "8px 10px" }}>
        <Activity className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--pp-text-primary)" }}>
          {isFr ? "Diagnostic de synchronisation Maestro" : "Maestro sync diagnostics"}
        </span>
        <span style={{ fontSize: 11.5, color: "var(--pp-text-secondary)" }}>
          {loading ? "…" : isFr
            ? `${connected.length} courtier(s) connecté(s) · ${problems.length} sans données`
            : `${connected.length} connected · ${problems.length} without data`}
          {run?.started_at && (
            <> · {isFr ? "dernière synchro" : "last sync"} {new Date(run.started_at).toLocaleString(isFr ? "fr-CA" : "en-CA")}</>
          )}
          {run && !run.admin_token_used && (
            <> · {isFr ? "portée admin non configurée" : "admin scope not configured"}</>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {canSync && (
            <button onClick={() => void runSync()} disabled={syncing} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg"
              style={{ fontSize: 11.5, fontWeight: 700, background: "var(--pp-bg-card)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)", opacity: syncing ? .6 : 1 }}>
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {isFr ? "Synchroniser maintenant" : "Sync now"}
            </button>
          )}
          <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg"
            style={{ fontSize: 11.5, fontWeight: 700, background: "transparent", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-muted)" }}>
            {isFr ? "Détails" : "Details"}
            <ChevronDown className="w-3.5 h-3.5" style={{ transform: open ? "rotate(180deg)" : undefined }} />
          </button>
        </div>
      </div>

      {!loading && (runError || hardErrors.length > 0) && (
        <div className="flex flex-wrap items-start gap-2" style={{ borderTop: "1px solid var(--pp-bg-border)", padding: "8px 10px", background: "rgba(239,68,68,.08)" }}>
          <XCircle className="w-4 h-4 mt-[1px]" style={{ color: "#ef4444" }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#ef4444" }}>
              {isFr ? "Erreurs d'import Maestro" : "Maestro import errors"}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--pp-text-secondary)", wordBreak: "break-word" }}>
              {runError
                ? runError
                : isFr
                  ? `${hardErrors.length} courtier(s) en erreur lors de la dernière synchronisation.`
                  : `${hardErrors.length} broker(s) failed during the last sync.`}
            </div>
            <ul style={{ marginTop: 4, fontSize: 11, color: "var(--pp-text-muted)" }}>
              {hardErrors.slice(0, 5).map((r) => (
                <li key={r.broker_user_id}>
                  • {r.broker_label ?? r.broker_email ?? r.broker_user_id} — {explain(r, isFr)}
                  {r.http_status ? ` (HTTP ${r.http_status})` : ""}
                </li>
              ))}
            </ul>
          </div>
          {canSync && (
            <button onClick={() => void runSync()} disabled={syncing} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg"
              style={{ fontSize: 11.5, fontWeight: 700, background: "var(--pp-bg-card)", border: "1px solid #ef4444", color: "#ef4444", opacity: syncing ? .6 : 1 }}>
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {isFr ? "Réessayer la synchronisation" : "Retry sync"}
            </button>
          )}
        </div>
      )}

      {open && (
        <div style={{ borderTop: "1px solid var(--pp-bg-border)", padding: "8px 10px" }}>
          <div className="flex items-center gap-1.5 mb-2">
            {(["problem", "connected", "all"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className="px-2 py-0.5 rounded-full"
                style={{
                  fontSize: 11, fontWeight: 700, border: "1px solid var(--pp-bg-border)",
                  background: filter === f ? "var(--pp-bg-card)" : "transparent",
                  color: filter === f ? "var(--pp-text-primary)" : "var(--pp-text-muted)",
                }}>
                {f === "problem" ? (isFr ? "Problèmes" : "Problems") : f === "connected" ? (isFr ? "Connectés" : "Connected") : (isFr ? "Tous" : "All")}
              </button>
            ))}
          </div>

          <div style={{ maxHeight: 320, overflow: "auto" }}>
            <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--pp-text-muted)", textAlign: "left" }}>
                  <th style={{ padding: "4px 6px" }}>{isFr ? "Courtier" : "Broker"}</th>
                  <th style={{ padding: "4px 6px" }}>{isFr ? "État" : "State"}</th>
                  <th style={{ padding: "4px 6px" }}>{isFr ? "Lignes" : "Rows"}</th>
                  <th style={{ padding: "4px 6px" }}>{isFr ? "Raison exacte" : "Exact reason"}</th>
                  {canSync && <th style={{ padding: "4px 6px" }} />}
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => (
                  <tr key={d.broker_user_id} style={{ borderTop: "1px solid var(--pp-bg-border)" }}>
                    <td style={{ padding: "4px 6px", color: "var(--pp-text-primary)", fontWeight: 600 }}>
                      {d.broker_label ?? d.broker_email ?? d.broker_user_id}
                      {d.maestro_broker_id && <span style={{ color: "var(--pp-text-muted)", fontWeight: 400 }}> · #{d.maestro_broker_id}</span>}
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      {d.connected
                        ? <span className="inline-flex items-center gap-1" style={{ color: "#16a34a" }}><CheckCircle2 className="w-3 h-3" />{isFr ? "Connecté" : "Connected"}</span>
                        : d.status === "error"
                          ? <span className="inline-flex items-center gap-1" style={{ color: "#ef4444" }}><XCircle className="w-3 h-3" />{isFr ? "Erreur" : "Error"}</span>
                          : <span className="inline-flex items-center gap-1" style={{ color: "#f59e0b" }}><AlertTriangle className="w-3 h-3" />{isFr ? "Non connecté" : "Not connected"}</span>}
                    </td>
                    <td style={{ padding: "4px 6px", color: "var(--pp-text-secondary)" }}>{d.rows_count}</td>
                    <td style={{ padding: "4px 6px", color: "var(--pp-text-muted)" }}>
                      {explain(d, isFr)}{d.http_status ? ` (HTTP ${d.http_status})` : ""}
                    </td>
                    {canSync && (
                      <td style={{ padding: "4px 6px" }}>
                        <button onClick={() => void runSync([d.broker_user_id])} disabled={!!retrying || syncing}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                          style={{ fontSize: 11, fontWeight: 700, background: "var(--pp-bg-card)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)", opacity: retrying || syncing ? .6 : 1 }}>
                          {retrying === d.broker_user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          {isFr ? "Réessayer" : "Retry"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!loading && shown.length === 0 && (
                  <tr><td colSpan={canSync ? 5 : 4} style={{ padding: 10, color: "var(--pp-text-muted)" }}>
                    {isFr ? "Aucune donnée de diagnostic — lancez une synchronisation." : "No diagnostic data — run a sync."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
