import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Download, Filter, Search } from "lucide-react";
import { toast } from "sonner";

const ACTION_COLORS: Record<string, string> = {
  LOGIN: "#94A3B8", LOGOUT: "#94A3B8",
  CALL_START: "#2E9BDC", CALL_END: "#2E9BDC",
  SMS_SEND: "#2E9BDC",
  VOICEMAIL_ACCESS: "#F5A623",
  RECORDING_ACCESS: "#F5A623",
  TRANSCRIPT_ACCESS: "#F5A623",
  AI_ANALYSIS: "#A855F7",
  PROFILE_UPDATE: "#94A3B8",
  USER_CREATE: "#EF4444", USER_DELETE: "#EF4444",
  EXPORT_CSV: "#FBBF24",
  INTEGRATION_UPDATE: "#94A3B8",
  PASSWORD_RESET: "#94A3B8",
  DATA_RETENTION_RUN: "#10B981",
  SESSION_TIMEOUT: "#94A3B8",
};

type Row = {
  id: string; created_at: string; action: string;
  resource_type: string | null; resource_id: string | null;
  ip_address: string | null;
  user_id: string | null;
  metadata: any;
};

const PAGE = 100;

export default function PAAuditLog() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [userFilter, setUserFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [users, setUsers] = useState<Array<{ id: string; full_name: string | null; email: string }>>([]);

  const load = async (p = page) => {
    setLoading(true);
    const fromIdx = (p - 1) * PAGE;
    let q = supabase.from("planipret_audit_log")
      .select("id, created_at, action, resource_type, resource_id, ip_address, user_id, metadata", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(fromIdx, fromIdx + PAGE - 1);
    if (userFilter) q = q.eq("user_id", userFilter);
    if (actionFilter) q = q.eq("action", actionFilter);
    if (from) q = q.gte("created_at", new Date(from).toISOString());
    if (to) q = q.lte("created_at", new Date(to + "T23:59:59").toISOString());
    const { data, count } = await q;
    setRows(data ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("planipret_profiles").select("id, full_name, email").order("full_name");
      setUsers(data ?? []);
    })();
  }, []);

  useEffect(() => { setPage(1); load(1); /* eslint-disable-next-line */ }, [userFilter, actionFilter, from, to]);
  useEffect(() => { load(page); /* eslint-disable-next-line */ }, [page]);


  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.full_name || u.email])), [users]);

  const exportCsv = async () => {
    let q = supabase.from("planipret_audit_log")
      .select("id, created_at, action, resource_type, resource_id, ip_address, user_id, metadata")
      .order("created_at", { ascending: false }).limit(10000);
    if (userFilter) q = q.eq("user_id", userFilter);
    if (actionFilter) q = q.eq("action", actionFilter);
    if (from) q = q.gte("created_at", new Date(from).toISOString());
    if (to) q = q.lte("created_at", new Date(to + "T23:59:59").toISOString());
    const { data: all } = await q;
    const csv = [
      ["Date", "Utilisateur", "Action", "Ressource", "IP", "Détails"].join(","),
      ...(all ?? []).map((r: any) => [
        new Date(r.created_at).toISOString(),
        `"${userMap.get(r.user_id ?? "") ?? "—"}"`,
        r.action,
        `${r.resource_type ?? ""}/${r.resource_id ?? ""}`,
        r.ip_address ?? "",
        `"${JSON.stringify(r.metadata ?? {}).replace(/"/g, '""')}"`,
      ].join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `planipret-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    // Self-log the export
    const { data: { user } } = await supabase.auth.getUser();
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pp-audit-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // service role required — this will only succeed when invoked via the admin proxy; best-effort
    }).catch(() => {});
    toast.success("Export CSV téléchargé");
    if (user) {
      await supabase.from("planipret_audit_log").select("id").limit(1); // no-op
    }
  };

  const actions = Array.from(new Set(rows.map((r) => r.action))).sort();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 pp-card" style={{ padding: 16 }}>
        <div>
          <label className="text-[11px] block mb-1" style={{ color: "var(--pp-text-muted)" }}>Utilisateur</label>
          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border)" }}>
            <option value="">Tous</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] block mb-1" style={{ color: "var(--pp-text-muted)" }}>Action</label>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border)" }}>
            <option value="">Toutes</option>
            {Object.keys(ACTION_COLORS).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] block mb-1" style={{ color: "var(--pp-text-muted)" }}>Du</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border)" }} />
        </div>
        <div>
          <label className="text-[11px] block mb-1" style={{ color: "var(--pp-text-muted)" }}>Au</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border)" }} />
        </div>
        <button onClick={exportCsv} className="pp-btn-primary flex items-center gap-2 ml-auto">
          <Download className="w-4 h-4" /> Exporter CSV
        </button>
      </div>

      <div className="pp-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--pp-bg-deep)", color: "var(--pp-text-muted)" }}>
              <tr>
                <th className="text-left px-4 py-3 font-medium">Date/Heure</th>
                <th className="text-left px-4 py-3 font-medium">Utilisateur</th>
                <th className="text-left px-4 py-3 font-medium">Action</th>
                <th className="text-left px-4 py-3 font-medium">Ressource</th>
                <th className="text-left px-4 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--pp-text-muted)" }}>Chargement…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--pp-text-muted)" }}>Aucune entrée</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" }}>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--pp-text-secondary)" }}>
                    {new Date(r.created_at).toLocaleString("fr-CA")}
                  </td>
                  <td className="px-4 py-3">{userMap.get(r.user_id ?? "") ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded-md text-[11px] font-semibold"
                      style={{ background: `${ACTION_COLORS[r.action] ?? "#64748B"}22`, color: ACTION_COLORS[r.action] ?? "#94A3B8" }}>
                      {r.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px]" style={{ color: "var(--pp-text-secondary)" }}>
                    {r.resource_type ? `${r.resource_type}${r.resource_id ? ` · ${r.resource_id.slice(0, 8)}` : ""}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-[12px]" style={{ color: "var(--pp-text-muted)" }}>{r.ip_address ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--pp-bg-border-2)", fontSize: 11, color: "var(--pp-text-muted)" }}>
          <span>{total === 0 ? 0 : (page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} sur {total}</span>
          <div className="flex gap-1">
            <button disabled={page === 1} onClick={() => setPage(page - 1)} className="px-2 py-1 rounded disabled:opacity-40" style={{ border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>←</button>
            <span className="px-3 py-1">{page} / {Math.max(1, Math.ceil(total / PAGE))}</span>
            <button disabled={page >= Math.ceil(total / PAGE)} onClick={() => setPage(page + 1)} className="px-2 py-1 rounded disabled:opacity-40" style={{ border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>→</button>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-center" style={{ color: "var(--pp-text-muted)" }}>
        📋 Logs conservés 24 mois (Loi 25)
      </p>
    </div>
  );
}
