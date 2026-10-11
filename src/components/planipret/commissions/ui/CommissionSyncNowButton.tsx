import { useEffect, useRef, useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Triggers `pp-commission-live-sync` and shows live progress across all brokers
 * by polling the per-broker diagnostics table while the run is in flight.
 */
export default function CommissionSyncNowButton({
  lang,
  onDone,
}: {
  lang: "fr" | "en";
  onDone?: () => void;
}) {
  const isFr = lang !== "en";
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const startPolling = async (startedAt: string) => {
    const { count } = await supabase
      .from("planipret_profiles").select("user_id", { count: "exact", head: true });
    setTotal(count ?? 0);
    timer.current = setInterval(async () => {
      const { count: processed } = await supabase
        .from("planipret_commission_sync_diag" as any)
        .select("broker_user_id", { count: "exact", head: true })
        .gte("last_attempt_at", startedAt);
      setDone(processed ?? 0);
    }, 2500);
  };

  const run = async () => {
    setBusy(true); setDone(0);
    const startedAt = new Date(Date.now() - 5000).toISOString();
    void startPolling(startedAt);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("pp-commission-live-sync", {
        body: {},
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error) throw error;
      const d = (data ?? {}) as any;
      setDone(d.brokers_total ?? done);
      setTotal(d.brokers_total ?? total);
      toast.success(isFr ? "Cache des commissions rechargé" : "Commission cache refreshed", {
        description: isFr
          ? `${d.brokers_connected ?? 0}/${d.brokers_total ?? 0} courtiers connectés · ${d.rows_upserted ?? 0} ligne(s)`
          : `${d.brokers_connected ?? 0}/${d.brokers_total ?? 0} brokers connected · ${d.rows_upserted ?? 0} row(s)`,
      });
      onDone?.();
    } catch (e: any) {
      toast.error(isFr ? "Échec de la synchronisation" : "Sync failed", { description: e?.message });
    } finally {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
      setBusy(false);
    }
  };

  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div className="pp-hide-export inline-flex items-center gap-2">
      <button
        onClick={run}
        disabled={busy}
        className="pp-toolbar-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
        title={isFr ? "Recharger immédiatement le cache pour tous les courtiers" : "Reload the cache for every broker now"}
        style={{
          fontSize: 12, fontWeight: 700, opacity: busy ? 0.75 : 1,
          background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)",
        }}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        {isFr ? "Synchroniser maintenant" : "Sync now"}
      </button>

      {busy && (
        <div className="inline-flex items-center gap-2" style={{ minWidth: 170 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--pp-bg-border)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--pp-brand-accent-2)", transition: "width .4s" }} />
          </div>
          <span style={{ fontSize: 11, color: "var(--pp-text-muted)", whiteSpace: "nowrap" }}>
            {done}/{total || "…"} {isFr ? "courtiers" : "brokers"}
          </span>
        </div>
      )}
    </div>
  );
}
