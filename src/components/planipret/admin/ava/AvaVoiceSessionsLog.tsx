import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

type Session = {
  id: string; user_id: string; session_id: string; connection_type: string;
  agent_id: string | null; started_at: string; ended_at: string | null;
  duration_ms: number | null; disconnect_reason: string | null;
  error_code: string | null; error_message: string | null;
  broker: { full_name: string | null; extension: string | null } | null;
};

export default function AvaVoiceSessionsLog() {
  const [rows, setRows] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "errors" | "live">("all");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("pp-admin-ava-voice?action=sessions&limit=100", { body: {} });
    setRows(((data as any)?.sessions ?? []) as Session[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = rows.filter((s) => {
    if (filter === "errors") return !!s.error_code;
    if (filter === "live") return !s.ended_at;
    return true;
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 gap-2 flex-wrap">
        <div className="text-sm font-semibold text-slate-800">Journal des sessions vocales</div>
        <div className="flex gap-1 items-center">
          {(["all", "errors", "live"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-[11px] px-2.5 py-1 rounded-full ${filter === f ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              {f === "all" ? "Tout" : f === "errors" ? "Erreurs" : "En cours"}
            </button>
          ))}
          <button onClick={load} className="ml-2 text-xs text-violet-700 hover:underline flex items-center gap-1"><RefreshCw className="w-3 h-3" />Actualiser</button>
        </div>
      </div>
      {loading ? <div className="p-4 text-xs text-slate-500">Chargement…</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
              <tr>
                <th className="text-left px-3 py-2">Début</th>
                <th className="text-left px-3 py-2">Courtier</th>
                <th className="text-left px-3 py-2">Transport</th>
                <th className="text-left px-3 py-2">Durée</th>
                <th className="text-left px-3 py-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{new Date(s.started_at).toLocaleString("fr-CA")}</td>
                  <td className="px-3 py-2 text-slate-800">{s.broker?.full_name ?? s.user_id.slice(0, 8)}</td>
                  <td className="px-3 py-2 font-mono text-slate-500">{s.connection_type}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {s.duration_ms ? `${Math.round(s.duration_ms / 1000)}s`
                      : (!s.ended_at ? <span className="text-emerald-600">en cours</span> : "—")}
                  </td>
                  <td className="px-3 py-2">
                    {s.error_code ? (
                      <span className="inline-flex items-center gap-1 text-red-700">
                        <AlertTriangle className="w-3 h-3" />
                        <span className="font-mono">{s.error_code}</span>
                        {s.error_message && <span className="text-[10px] text-red-500 truncate max-w-[220px]">: {s.error_message}</span>}
                      </span>
                    ) : s.disconnect_reason ? (
                      <span className="text-slate-500 font-mono text-[10px]">{s.disconnect_reason}</span>
                    ) : !s.ended_at ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3 h-3" />live</span>
                    ) : (
                      <span className="text-slate-400">ok</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center text-slate-500 py-6">Aucune session</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
