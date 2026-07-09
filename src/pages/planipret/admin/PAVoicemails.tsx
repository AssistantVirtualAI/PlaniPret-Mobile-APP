import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Play, X, Check } from "lucide-react";
import { toast } from "sonner";
import Pagination from "@/components/planipret/admin/Pagination";
import DebugPanel, { type DebugEntry } from "@/components/planipret/admin/DebugPanel";
import { TableEmptyState, TableErrorState } from "@/components/planipret/admin/TableStates";

const ACCENT = "#2E9BDC";

export default function PAVoicemails() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const pageSizeRaw = parseInt(params.get("pageSize") ?? params.get("ps") ?? "25", 10);
  const pageSize = [25, 50, 100].includes(pageSizeRaw) ? pageSizeRaw : 25;
  const status = params.get("status") ?? "";
  const search = params.get("search") ?? "";
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
  const setFilterValue = (key: "status" | "search" | "from" | "to", value: string) => updateParams({ [key]: value }, true);
  const resetFilters = () => updateParams({ status: null, search: null, from: null, to: null }, true);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debug, setDebug] = useState<DebugEntry[]>([]);
  const [detail, setDetail] = useState<any | null>(null);
  const hasFilters = !!(status || search || from || to);

  const load = async (p = page, ps = pageSize) => {
    setLoading(true);
    setLoadError(null);
    const fromIdx = (p - 1) * ps;
    const t0 = performance.now();
    let q = supabase.from("planipret_voicemails")
      .select("*, planipret_profiles(full_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(fromIdx, fromIdx + ps - 1);
    if (status === "read") q = q.eq("is_read", true);
    if (status === "unread") q = q.eq("is_read", false);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    if (search) q = q.or(`from_number.ilike.%${search}%,transcript.ilike.%${search}%`);
    const { data, count, error } = await q;
    setDebug([{ label: "planipret_voicemails (page)", query: `SELECT * FROM planipret_voicemails ORDER BY created_at DESC LIMIT ${ps} OFFSET ${fromIdx}`, count, ms: Math.round(performance.now() - t0), error: error?.message ?? null, meta: { status, search, from, to }, sample: (data ?? []).slice(0, 3) }]);
    if (error) {
      setLoadError(error.message);
      setRows([]);
      setTotal(0);
    } else {
      setRows(data ?? []);
      setTotal(count ?? 0);
    }
    setLoading(false);
  };

  useEffect(() => { load(page, pageSize); /* eslint-disable-next-line */ }, [page, pageSize, status, search, from, to]);

  useEffect(() => {
    const ch = supabase.channel("admin-voicemails")
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_voicemails" }, () => load(page, pageSize))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, []);


  const markRead = async (v: any) => {
    const next = !v.is_read;
    setRows((p) => p.map((r) => r.id === v.id ? { ...r, is_read: next } : r));
    const { error } = await supabase.from("planipret_voicemails").update({ is_read: next }).eq("id", v.id);
    if (error) { toast.error("Erreur"); load(); } else { toast.success(next ? "Marqué lu" : "Marqué non lu"); }
  };

  return (
    <div className="space-y-4">
      <DebugPanel entries={debug} />
      <div className="pp-card p-4 flex items-center gap-2 flex-wrap">
        <input value={search} onChange={(e) => setFilterValue("search", e.target.value)} placeholder="Rechercher numéro/transcription…" className="px-3 py-2 rounded-lg text-sm w-64" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }} />
        <select value={status} onChange={(e) => setFilterValue("status", e.target.value)} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}>
          <option value="">Tous statuts</option>
          <option value="unread">Non lus</option>
          <option value="read">Lus</option>
        </select>
        <input type="date" value={from} onChange={(e) => setFilterValue("from", e.target.value)} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }} />
        <input type="date" value={to} onChange={(e) => setFilterValue("to", e.target.value)} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }} />
        {hasFilters && <button onClick={resetFilters} className="px-2 py-1.5 text-xs underline" style={{ color: "var(--pp-text-muted)" }}>✕ Réinitialiser</button>}
      </div>
      <div className="pp-card overflow-hidden">
        {loadError && <TableErrorState message={loadError} onRetry={() => load(page, pageSize)} />}
        <table className="w-full text-sm">
          <thead style={{ background: "var(--pp-bg-elevated)" }}>
            <tr style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--pp-text-faint)" }} className="text-left">
              <th className="p-3">Courtier</th><th>De</th><th>Durée</th><th>Date</th><th>Statut</th><th>Transcription</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>{Array.from({ length: 7 }).map((_, j) => <td key={j} className="p-3"><div className="h-3 w-3/4 animate-pulse rounded" style={{ background: "var(--pp-bg-elevated)" }} /></td>)}</tr>
            )) : rows.length === 0 ? <tr><td colSpan={7}><TableEmptyState icon="📬" title="Aucun message vocal" hint={hasFilters ? "Essayez d'élargir vos critères de recherche." : "Aucun voicemail synchronisé pour le moment."} action={hasFilters ? <button onClick={resetFilters} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: ACCENT }}>Réinitialiser les filtres</button> : undefined} /></td></tr> :
              rows.map((v) => (
                <tr key={v.id} className="hover:bg-white/[0.02]" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <td className="p-3" style={{ color: "var(--pp-text-primary)" }}>{v.planipret_profiles?.full_name ?? "—"}</td>
                  <td style={{ color: "var(--pp-text-secondary)" }}>{v.from_number ?? "—"}</td>
                  <td style={{ color: "var(--pp-text-muted)" }}>{v.duration_seconds ? `${v.duration_seconds}s` : "—"}</td>
                  <td style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>{new Date(v.created_at).toLocaleString("fr-CA")}</td>
                  <td>
                    {v.is_read ? (
                      <span className="pp-pill-success" style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99 }}>Lu</span>
                    ) : (
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: `${ACCENT}20`, color: ACCENT, border: `1px solid ${ACCENT}40` }}>● Nouveau</span>
                    )}
                  </td>
                  <td className="truncate max-w-[220px]" style={{ color: "var(--pp-text-muted)", fontSize: 12 }}>{v.transcript ? v.transcript.slice(0, 50) + "…" : "—"}</td>
                  <td className="flex items-center gap-1 p-3">
                    <button onClick={() => setDetail(v)} className="p-1.5 rounded hover:bg-white/[0.05]" title="Écouter">
                      <Play className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                    </button>
                    <button onClick={() => markRead(v)} className="p-1.5 rounded hover:bg-white/[0.05]" title={v.is_read ? "Marquer non lu" : "Marquer lu"}>
                      <Check className="w-3.5 h-3.5" style={{ color: v.is_read ? "var(--pp-text-faint)" : "var(--pp-success)" }} />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        <Pagination page={page} pageSize={pageSize} total={total} loading={loading} onPageChange={setPage} onPageSizeChange={setPageSize} unit="voicemails" />

      </div>
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={() => setDetail(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto p-5" style={{ background: "var(--pp-bg-surface)", borderLeft: "1px solid var(--pp-bg-border-2)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ fontWeight: 600, color: "var(--pp-text-primary)" }}>Voicemail · {detail.from_number}</h3>
              <button onClick={() => setDetail(null)}><X className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} /></button>
            </div>
            {detail.audio_url ? <audio src={detail.audio_url} controls className="w-full mb-4" /> : <p style={{ fontSize: 11, color: "var(--pp-text-faint)", marginBottom: 16 }}>Audio non disponible</p>}
            {detail.transcript && <div className="p-3 rounded text-sm whitespace-pre-wrap" style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-secondary)" }}>{detail.transcript}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
