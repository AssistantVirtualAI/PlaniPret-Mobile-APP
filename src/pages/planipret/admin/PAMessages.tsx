import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { X, ArrowDownLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import Pagination from "@/components/planipret/admin/Pagination";
import DebugPanel, { type DebugEntry } from "@/components/planipret/admin/DebugPanel";
import { TableErrorState, TableEmptyState } from "@/components/planipret/admin/TableStates";
import { getPlanipretBrokerDirectory } from "@/lib/planipret/adminDirectory";
import { usePlanipretNsAutoSync } from "@/hooks/usePlanipretNsAutoSync";
import NsSyncBar from "@/components/planipret/admin/NsSyncBar";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const ACCENT = "#2E9BDC";
const SUCCESS = "#00D4AA";

const DICT = {
  fr: {
    allBrokers: "Tous courtiers",
    allDirections: "Toutes directions",
    received: "Reçu",
    sent: "Envoyé",
    allStatuses: "Tous statuts",
    delivered: "Livré",
    failed: "Échoué",
    pending: "En attente",
    reset: (n: number) => `✕ Réinitialiser (${n})`,
    broker: "Courtier",
    dir: "Dir.",
    from: "De",
    to: "Vers",
    preview: "Aperçu",
    date: "Date",
    noMessagesFound: "Aucun message trouvé",
    hintWiden: "Essayez d'élargir vos critères de recherche.",
    hintNoSync: "Aucun message synchronisé. Synchronisation NS-API automatique. Vérifiez que le webhook NS-API est configuré dans Intégrations.",
    resetFilters: "Réinitialiser les filtres",
    goToIntegrations: "Aller aux intégrations →",
    conversation: (peer: string) => `Conversation · ${peer}`,
    syncing: "Synchronisation NS-API messages/appels…",
    syncSuccess: (n: number) => `${n} extensions synchronisées · messages en arrière-plan`,
    syncFailed: (msg: string) => `Échec: ${msg}`,
  },
  en: {
    allBrokers: "All brokers",
    allDirections: "All directions",
    received: "Received",
    sent: "Sent",
    allStatuses: "All statuses",
    delivered: "Delivered",
    failed: "Failed",
    pending: "Pending",
    reset: (n: number) => `✕ Reset (${n})`,
    broker: "Broker",
    dir: "Dir.",
    from: "From",
    to: "To",
    preview: "Preview",
    date: "Date",
    noMessagesFound: "No messages found",
    hintWiden: "Try broadening your search criteria.",
    hintNoSync: "No message synced yet. Automatic NS-API sync. Check that the NS-API webhook is configured in Integrations.",
    resetFilters: "Reset filters",
    goToIntegrations: "Go to integrations →",
    conversation: (peer: string) => `Conversation · ${peer}`,
    syncing: "Syncing NS-API messages/calls…",
    syncSuccess: (n: number) => `${n} extensions synced · messages in background`,
    syncFailed: (msg: string) => `Failed: ${msg}`,
  },
};

export default function PAMessages() {
  const { lang } = useMplanipretLang();
  const t = DICT[lang];
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const pageSizeRaw = parseInt(params.get("pageSize") ?? params.get("ps") ?? "25", 10);
  const pageSize = [25, 50, 100].includes(pageSizeRaw) ? pageSizeRaw : 25;
  const broker = params.get("broker") ?? "";
  const direction = params.get("direction") ?? "";
  const status = params.get("status") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const updateParams = (patch: Record<string, string | null>, resetPage = false) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => { if (v == null || v === "") next.delete(k); else next.set(k, v); });
    if (resetPage) next.set("page", "1");
    setParams(next, { replace: true });
  };
  const setPage = (p: number) => updateParams({ page: String(p) });
  const setPageSize = (s: number) => updateParams({ pageSize: String(s), ps: null }, true);
  const setFilterValue = (key: "broker" | "direction" | "status" | "from" | "to", value: string) => updateParams({ [key]: value }, true);
  const resetFilters = () => updateParams({ broker: null, direction: null, status: null, from: null, to: null }, true);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [brokers, setBrokers] = useState<any[]>([]);
  const [thread, setThread] = useState<any[] | null>(null);
  const [threadKey, setThreadKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debug, setDebug] = useState<DebugEntry[]>([]);
  const [syncing, setSyncing] = useState(false);

  const hasFilters = !!(broker || direction || status || from || to);
  const activeFilterCount = [broker, direction, status, from, to].filter(Boolean).length;

  useEffect(() => {
    (async () => {
      const directory = await getPlanipretBrokerDirectory();
      setBrokers(directory.brokers);
    })();
  }, []);

  const brokerName = (m: any) => m.planipret_profiles?.full_name ?? m.metadata?.user_name ?? m.metadata?.extension_name ?? (m.metadata?.extension ? `Ext. ${m.metadata.extension}` : "—");

  const load = async (p = page, ps = pageSize) => {
    setLoading(true);
    setLoadError(null);
    const dbg: DebugEntry[] = [];
    const t0 = performance.now();
    const fromIdx = (p - 1) * ps;
    let q = supabase.from("planipret_phone_messages")
      .select("*, planipret_profiles(full_name)", { count: "exact" })
      .order("sent_at", { ascending: false })
      .range(fromIdx, fromIdx + ps - 1);
    if (broker?.startsWith("ext:")) q = q.eq("metadata->>extension", broker.slice(4));
    else if (broker?.startsWith("user:")) q = q.eq("user_id", broker.slice(5));
    if (direction) q = q.eq("direction", direction);
    if (status) q = q.eq("status", status);
    if (from) q = q.gte("sent_at", from);
    if (to) q = q.lte("sent_at", to);
    const { data, count, error } = await q;
    dbg.push({
      label: "planipret_phone_messages (page)",
      query: `SELECT * FROM planipret_phone_messages ORDER BY sent_at DESC LIMIT ${ps} OFFSET ${fromIdx}`,
      count,
      ms: Math.round(performance.now() - t0),
      error: error?.message ?? null,
      meta: { broker, direction, status, from, to },
      sample: (data ?? []).slice(0, 3),
    });
    if (error) {
      setLoadError(error.message);
      setRows([]); setTotal(0);
    } else {
      setRows(data ?? []);
      setTotal(count ?? 0);
    }
    setDebug(dbg);
    setLoading(false);
  };

  usePlanipretNsAutoSync({ onQueued: () => load(page, pageSize) });

  useEffect(() => { load(page, pageSize); /* eslint-disable-next-line */ }, [page, pageSize, broker, direction, status, from, to]);

  useEffect(() => {
    const ch = supabase.channel("admin-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "planipret_phone_messages" }, () => load(page, pageSize))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, []);

  const openThread = async (m: any) => {
    const peer = m.direction === "outbound" ? m.to_number : m.from_number;
    setThreadKey(peer);
    const { data } = await supabase.from("planipret_phone_messages")
      .select("*").or(`from_number.eq.${peer},to_number.eq.${peer}`).order("created_at", { ascending: true });
    setThread(data ?? []);
  };

  const syncAll = async () => {
    setSyncing(true);
    const id = toast.loading(t.syncing);
    try {
      const { data, error } = await supabase.functions.invoke("pp-admin-ns-sync", { body: {} });
      if (error) throw error;
      toast.success(t.syncSuccess((data as any)?.extensions ?? (data as any)?.users_total ?? 0), { id });
      await load(1, pageSize);
    } catch (e: any) { toast.error(t.syncFailed(e.message ?? e), { id }); }
    finally { setSyncing(false); }
  };

  const inputStyle = { background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" };

  return (
    <div className="space-y-4">
      <DebugPanel entries={debug} />

      <NsSyncBar features={["messages", "cdrs"]} onReload={() => load(page, pageSize)} />



      <div className="pp-card p-4 flex flex-wrap items-end gap-2">
        <select value={broker} onChange={(e) => setFilterValue("broker", e.target.value)} className="px-3 py-1.5 rounded-lg text-sm" style={inputStyle}>
          <option value="">{t.allBrokers}</option>
          {brokers.map((b: any) => (
            <option key={b.user_id} value={b.ns_only ? `ext:${b.extension}` : `user:${b.user_id}`}>{b.full_name}{b.extension ? ` · ${b.extension}` : ""}</option>
          ))}
        </select>
        <select value={direction} onChange={(e) => setFilterValue("direction", e.target.value)} className="px-3 py-1.5 rounded-lg text-sm" style={inputStyle}>
          <option value="">{t.allDirections}</option>
          <option value="inbound">{t.received}</option>
          <option value="outbound">{t.sent}</option>
        </select>
        <select value={status} onChange={(e) => setFilterValue("status", e.target.value)} className="px-3 py-1.5 rounded-lg text-sm" style={inputStyle}>
          <option value="">{t.allStatuses}</option>
          <option value="delivered">{t.delivered}</option>
          <option value="failed">{t.failed}</option>
          <option value="pending">{t.pending}</option>
        </select>
        <input type="date" value={from} onChange={(e) => setFilterValue("from", e.target.value)} className="px-3 py-1.5 rounded-lg text-sm" style={inputStyle} />
        <input type="date" value={to} onChange={(e) => setFilterValue("to", e.target.value)} className="px-3 py-1.5 rounded-lg text-sm" style={inputStyle} />
        {hasFilters && (
          <button onClick={resetFilters} className="ml-auto px-2 py-1.5 text-xs underline" style={{ color: "var(--pp-text-muted)" }}>
            {t.reset(activeFilterCount)}
          </button>
        )}
      </div>



      <div className="pp-card overflow-hidden">
        {loadError && <TableErrorState message={loadError} onRetry={() => load(page, pageSize)} />}
        <table className="w-full text-sm">
          <thead style={{ background: "var(--pp-bg-elevated)" }}>
            <tr style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--pp-text-faint)" }} className="text-left">
              <th className="p-3">{t.broker}</th><th>{t.dir}</th><th>{t.from}</th><th>{t.to}</th><th>{t.preview}</th><th>{t.date}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="p-3"><div className="h-3 w-3/4 animate-pulse rounded" style={{ background: "var(--pp-bg-elevated)" }} /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={6}>
                <TableEmptyState
                  icon="💬"
                  title={t.noMessagesFound}
                  hint={hasFilters
                    ? t.hintWiden
                    : t.hintNoSync}
                  action={hasFilters ? (
                    <button onClick={resetFilters} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: ACCENT }}>{t.resetFilters}</button>
                  ) : (
                    <Link to="/planipret/admin/integrations" className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
                      {t.goToIntegrations}
                    </Link>
                  )}
                />
              </td></tr>
            ) : rows.map((m) => {
              const out = m.direction === "outbound";
              const Icon = out ? ArrowUpRight : ArrowDownLeft;
              return (
                <tr key={m.id} className="cursor-pointer hover:bg-white/[0.02]" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }} onClick={() => openThread(m)}>
                  <td className="p-3" style={{ color: "var(--pp-text-primary)" }}>{brokerName(m)}</td>
                  <td><Icon className="w-3.5 h-3.5" style={{ color: out ? SUCCESS : ACCENT }} /></td>
                  <td style={{ color: "var(--pp-text-secondary)" }}>{m.from_number}</td>
                  <td style={{ color: "var(--pp-text-secondary)" }}>{m.to_number}</td>
                  <td className="truncate max-w-[300px]" style={{ color: "var(--pp-text-muted)" }}>{(m.body ?? "").slice(0, 60)}</td>
                  <td style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>{new Date(m.created_at).toLocaleString("fr-CA")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          loading={loading}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          unit="messages"
        />
      </div>

      {thread && (
        <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={() => setThread(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto p-5" style={{ background: "var(--pp-bg-surface)", borderLeft: "1px solid var(--pp-bg-border-2)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ fontWeight: 600, color: "var(--pp-text-primary)" }}>{t.conversation(threadKey ?? "")}</h3>
              <button onClick={() => setThread(null)}><X className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} /></button>
            </div>
            <div className="space-y-2">
              {thread.map((m) => {
                const out = m.direction === "outbound";
                return (
                  <div key={m.id} className={`p-2.5 rounded-lg text-sm ${out ? "ml-8" : "mr-8"}`}
                    style={{
                      background: out ? "rgba(46,155,220,0.12)" : "var(--pp-bg-elevated)",
                      border: `1px solid ${out ? "rgba(46,155,220,0.25)" : "var(--pp-bg-border-2)"}`,
                      color: "var(--pp-text-primary)",
                    }}>
                    <p>{m.body}</p>
                    <p style={{ fontSize: 10, color: "var(--pp-text-faint)", marginTop: 4 }}>{new Date(m.created_at).toLocaleString("fr-CA")}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
