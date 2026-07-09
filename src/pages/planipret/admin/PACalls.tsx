import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowDownLeft, ArrowUpRight, X, Mic, Sparkles, Download, Eye, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import Pagination from "@/components/planipret/admin/Pagination";
import DebugPanel, { type DebugEntry } from "@/components/planipret/admin/DebugPanel";
import { TableErrorState, TableEmptyState } from "@/components/planipret/admin/TableStates";
import { getPlanipretBrokerDirectory } from "@/lib/planipret/adminDirectory";
import { applyPlanipretCallFilters } from "@/lib/planipret/adminCounts";
import { usePlanipretNsAutoSync } from "@/hooks/usePlanipretNsAutoSync";
import NsSyncBar from "@/components/planipret/admin/NsSyncBar";

const ACCENT = "#2E9BDC";
const SUCCESS = "#00D4AA";
const DANGER = "#E84C4C";
const AGENT = "#9B7FE8";

export default function PACalls() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const pageSizeRaw = parseInt(params.get("pageSize") ?? params.get("ps") ?? "25", 10);
  const pageSize = [25, 50, 100].includes(pageSizeRaw) ? pageSizeRaw : 25;
  const filters = {
    broker: params.get("broker") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    direction: params.get("direction") ?? "",
    status: params.get("status") ?? "",
    ai: params.get("ai") ?? "",
    search: params.get("search") ?? "",
  };
  const updateParams = (patch: Record<string, string | null>, resetPage = false) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => { if (v == null || v === "") next.delete(k); else next.set(k, v); });
    if (resetPage) next.set("page", "1");
    setParams(next, { replace: true });
  };
  const setPage = (p: number) => updateParams({ page: String(p) });
  const setPageSize = (s: number) => updateParams({ pageSize: String(s), ps: null }, true);
  const setFilterValue = (key: keyof typeof filters, value: string) => updateParams({ [key]: value }, true);
  const resetFilters = () => updateParams({ broker: null, from: null, to: null, direction: null, status: null, ai: null, search: null }, true);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [brokers, setBrokers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debug, setDebug] = useState<DebugEntry[]>([]);
  const [detail, setDetail] = useState<any | null>(null);

  const hasFilters = Object.values(filters).some((v) => v);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  useEffect(() => {
    (async () => {
      const directory = await getPlanipretBrokerDirectory();
      setBrokers(directory.brokers.map((b: any) => ({ user_id: b.user_id, full_name: b.full_name, extension: b.extension ?? b.ns_extension, ns_only: b.ns_only })));
    })();
  }, []);

  const brokerName = (r: any) => r.planipret_profiles?.full_name ?? r.metadata?.ns_user?.name ?? r.metadata?.user_name ?? r.metadata?.extension_name ?? (r.extension ? `Ext. ${r.extension}` : "—");

  const buildQuery = (forCount = false) => {
    const q = supabase.from("planipret_phone_calls")
      .select(forCount ? "id" : "*, planipret_profiles(full_name)", { count: "exact", head: forCount });
    return applyPlanipretCallFilters(q, filters);
  };

  const load = async (p = page, ps = pageSize) => {
    setLoading(true);
    setLoadError(null);
    const dbg: DebugEntry[] = [];
    const t0 = performance.now();
    const fromIdx = (p - 1) * ps;
    const toIdx = fromIdx + ps - 1;
    const q = buildQuery().order("started_at", { ascending: false }).range(fromIdx, toIdx);
    const { data, count, error } = await q;
    dbg.push({
      label: "planipret_phone_calls (page)",
      query: `SELECT * FROM planipret_phone_calls ORDER BY started_at DESC LIMIT ${ps} OFFSET ${fromIdx}`,
      count,
      ms: Math.round(performance.now() - t0),
      error: error?.message ?? null,
      meta: { filters },
      sample: (data ?? []).slice(0, 3),
    });
    if (error) {
      setLoadError(error.message);
      setRows([]);
      setTotal(0);
    } else {
      setRows(data ?? []);
      setTotal(count ?? 0);
    }
    setDebug(dbg);
    setLoading(false);
  };

  usePlanipretNsAutoSync({ onQueued: () => load(page, pageSize) });

  useEffect(() => {
    load(page, pageSize);
    const ch = supabase.channel("admin-calls")
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_calls" }, () => load(page, pageSize))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filters.broker, filters.from, filters.to, filters.direction, filters.status, filters.ai, filters.search]);

  const paged = rows;

  const exportCsv = async () => {
    const q = buildQuery().order("started_at", { ascending: false }).limit(5000);
    const { data: all } = await q;
    const headers = ["Courtier", "Direction", "De", "Vers", "Durée", "Date"];
    const lines = [headers.join(",")].concat((all ?? []).map((r: any) =>
      [brokerName(r), r.direction, r.from_number, r.to_number, r.duration_seconds, r.started_at].map((v) => `"${v ?? ""}"`).join(",")
    ));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `appels-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <DebugPanel entries={debug} />

      <NsSyncBar features={["cdrs", "recordings"]} onReload={() => load(page, pageSize)} />



      <div className="pp-card p-4 flex flex-wrap items-end gap-2">
        <Select label="Courtier" value={filters.broker} onChange={(v) => setFilterValue("broker", v)}
          options={[{ v: "", l: "Tous" }, ...brokers.map((b) => ({ v: b.ns_only ? `ext:${b.extension}` : `user:${b.user_id}`, l: `${b.full_name}${b.extension ? ` · ${b.extension}` : ""}` }))]} />
        <Input label="Date début" type="date" value={filters.from} onChange={(v) => setFilterValue("from", v)} />
        <Input label="Date fin" type="date" value={filters.to} onChange={(v) => setFilterValue("to", v)} />
        <Select label="Direction" value={filters.direction} onChange={(v) => setFilterValue("direction", v)}
          options={[{ v: "", l: "Toutes" }, { v: "inbound", l: "Entrant" }, { v: "outbound", l: "Sortant" }, { v: "missed", l: "Manqué" }]} />
        <Select label="Statut" value={filters.status} onChange={(v) => setFilterValue("status", v)}
          options={[{ v: "", l: "Tous" }, { v: "completed", l: "Complété" }, { v: "active", l: "En cours" }, { v: "missed", l: "Manqué" }]} />
        <Select label="Analyse IA" value={filters.ai} onChange={(v) => setFilterValue("ai", v)}
          options={[{ v: "", l: "Tous" }, { v: "yes", l: "Analysé" }, { v: "no", l: "Non analysé" }]} />
        <Input label="Recherche" placeholder="Numéro..." value={filters.search} onChange={(v) => setFilterValue("search", v)} />
        {hasFilters && (
          <button onClick={resetFilters} className="px-2 py-1.5 text-xs underline" style={{ color: "var(--pp-text-muted)" }}>
            ✕ Réinitialiser ({activeFilterCount})
          </button>
        )}
        <button onClick={exportCsv} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm"

          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
          <Download className="w-4 h-4" /> Exporter CSV
        </button>
      </div>

      <div className="pp-card overflow-hidden">
        {loadError && <TableErrorState message={loadError} onRetry={() => load(page, pageSize)} />}

        <table className="w-full text-sm">
          <thead style={{ background: "var(--pp-bg-elevated)" }}>
            <tr style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--pp-text-faint)" }} className="text-left">
              <th className="p-3">Courtier</th><th>Dir.</th><th>De</th><th>Vers</th><th>Durée</th><th>Date</th><th>Enreg.</th><th>IA</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="p-3"><div className="h-3 w-3/4 animate-pulse rounded" style={{ background: "var(--pp-bg-elevated)" }} /></td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr><td colSpan={9}>
                <TableEmptyState
                  icon="📞"
                  title="Aucun appel trouvé"
                  hint={hasFilters
                    ? "Essayez d'élargir vos critères de recherche."
                    : "Aucun appel enregistré. Synchronisation NS-API automatique. Vérifiez que le webhook NS-API est configuré dans Intégrations."}
                  action={hasFilters ? (
                    <button onClick={resetFilters} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: ACCENT }}>
                      Réinitialiser les filtres
                    </button>
                  ) : (
                    <Link to="/planipret/admin/integrations" className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
                      Aller aux intégrations →
                    </Link>
                  )}
                />
              </td></tr>
            ) : paged.map((c) => {
              const inb = c.direction === "inbound", missed = c.direction === "missed";
              const Icon = missed ? X : inb ? ArrowDownLeft : ArrowUpRight;
              const col = missed ? DANGER : inb ? ACCENT : SUCCESS;
              return (
                <tr key={c.id} className="cursor-pointer hover:bg-white/[0.02]"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                  onClick={() => setDetail(c)}>
                  <td className="p-3" style={{ color: "var(--pp-text-primary)" }}>{brokerName(c)}</td>
                  <td><Icon className="w-4 h-4" style={{ color: col }} /></td>
                  <td style={{ color: "var(--pp-text-secondary)" }}>{c.from_number ?? "—"}</td>
                  <td style={{ color: "var(--pp-text-secondary)" }}>{c.to_number ?? "—"}</td>
                  <td style={{ color: "var(--pp-text-muted)" }}>{c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}m${c.duration_seconds % 60}s` : "—"}</td>
                  <td style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>{c.started_at ? new Date(c.started_at).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" }) : ""}</td>
                  <td>{c.recording_url && <Mic className="w-3.5 h-3.5" style={{ color: "var(--pp-text-muted)" }} />}</td>
                  <td>{c.ai_summary && <Sparkles className="w-3.5 h-3.5" style={{ color: AGENT }} />}</td>
                  <td><button className="p-1.5 rounded hover:bg-white/[0.05]"><Eye className="w-3.5 h-3.5" style={{ color: "var(--pp-text-muted)" }} /></button></td>
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
          unit="appels"
        />
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={() => setDetail(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto p-5" style={{ background: "var(--pp-bg-surface)", borderLeft: "1px solid var(--pp-bg-border-2)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ fontWeight: 600, color: "var(--pp-text-primary)" }}>Détails de l'appel</h3>
              <button onClick={() => setDetail(null)}><X className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} /></button>
            </div>
            <div className="space-y-3 text-sm">
              <Row k="Courtier" v={brokerName(detail)} />
              <Row k="Extension" v={detail.extension} />
              <Row k="Direction" v={detail.direction} />
              <Row k="De" v={detail.from_number} />
              <Row k="Vers" v={detail.to_number} />
              <Row k="Durée" v={detail.duration_seconds ? `${detail.duration_seconds}s` : "—"} />
              <Row k="Date" v={detail.started_at ? new Date(detail.started_at).toLocaleString("fr-CA") : ""} />
              {detail.recording_url && (
                <div><p style={{ fontSize: 11, color: "var(--pp-text-muted)", marginBottom: 4 }}>Enregistrement</p><audio src={detail.recording_url} controls className="w-full" /></div>
              )}
              {detail.transcript && (
                <div><p style={{ fontSize: 11, color: "var(--pp-text-muted)", marginBottom: 4 }}>Transcription</p><div className="p-3 rounded whitespace-pre-wrap" style={{ fontSize: 11, background: "var(--pp-bg-elevated)", color: "var(--pp-text-secondary)" }}>{detail.transcript}</div></div>
              )}
              {detail.ai_summary && (
                <div><p style={{ fontSize: 11, color: "var(--pp-text-muted)", marginBottom: 4 }}>Résumé IA</p><div className="p-3 rounded" style={{ fontSize: 11, background: "rgba(155,127,232,0.08)", border: `1px solid ${AGENT}33`, color: "var(--pp-text-primary)" }}>{detail.ai_summary}</div></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Input({ label, type = "text", value, onChange, placeholder }: any) {
  return (
    <div className="flex flex-col">
      <label style={{ fontSize: 10, color: "var(--pp-text-muted)", marginBottom: 4 }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="px-3 py-1.5 rounded-lg text-sm"
        style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }} />
    </div>
  );
}
function Select({ label, value, onChange, options }: any) {
  return (
    <div className="flex flex-col">
      <label style={{ fontSize: 10, color: "var(--pp-text-muted)", marginBottom: 4 }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 rounded-lg text-sm"
        style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}>
        {options.map((o: any) => <option key={o.v} value={o.v} style={{ background: "var(--pp-bg-deep)" }}>{o.l}</option>)}
      </select>
    </div>
  );
}
function Row({ k, v }: any) {
  return (
    <div className="flex justify-between pb-1" style={{ borderBottom: "1px solid var(--pp-bg-border-2)" }}>
      <span style={{ color: "var(--pp-text-muted)" }}>{k}</span>
      <span style={{ color: "var(--pp-text-primary)" }}>{v ?? "—"}</span>
    </div>
  );
}
