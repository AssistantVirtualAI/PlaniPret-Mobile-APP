import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";

type Broker = {
  user_id: string; full_name: string | null; extension: string | null;
  elevenlabs_agent_id: string | null; voice_agent_enabled: boolean;
  ava_last_session_at: string | null; ava_sessions_count: number | null;
  sessions_7d: number; errors_24h: number; last_error: string | null;
};

export default function AvaVoiceBrokersTable() {
  const [rows, setRows] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("pp-admin-ava-voice", { body: {} });
    setRows(((data as any)?.brokers ?? []) as Broker[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Realtime: reflète immédiatement toute modification du toggle AVA
    // (voice_agent_enabled / elevenlabs_agent_id) faite par un autre admin
    // ou par une edge function.
    const channel = supabase
      .channel("ava-brokers-profiles")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "planipret_profiles" },
        (payload) => {
          const n = payload.new as any;
          const o = payload.old as any;
          if (!n?.user_id) return;
          const changed =
            n.voice_agent_enabled !== o?.voice_agent_enabled ||
            n.elevenlabs_agent_id !== o?.elevenlabs_agent_id;
          if (!changed) return;
          setRows((rs) =>
            rs.map((r) =>
              r.user_id === n.user_id
                ? {
                    ...r,
                    voice_agent_enabled: !!n.voice_agent_enabled,
                    elevenlabs_agent_id: n.elevenlabs_agent_id ?? null,
                  }
                : r,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "planipret_profiles" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "planipret_profiles" },
        () => load(),
      )
      .subscribe();

    // Filet de sécurité: polling léger toutes les 30s au cas où Realtime décroche.
    const poll = setInterval(load, 30_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, []);

  const toggle = async (b: Broker) => {
    const next = !b.voice_agent_enabled;
    if (!confirm(`${next ? "Activer" : "Désactiver"} l'agent vocal AVA pour ${b.full_name ?? "ce courtier"} ?`)) return;
    setBusy(b.user_id);
    // Optimistic update so l'UI reflète l'état immédiatement.
    setRows((rs) => rs.map((r) => r.user_id === b.user_id ? { ...r, voice_agent_enabled: next } : r));
    const { data, error } = await supabase.functions.invoke("pp-admin-ava-voice-toggle", {
      body: { user_id: b.user_id, enabled: next },
    });
    setBusy(null);
    if (error || !(data as any)?.success) {
      // Rollback
      setRows((rs) => rs.map((r) => r.user_id === b.user_id ? { ...r, voice_agent_enabled: b.voice_agent_enabled } : r));
      toast.error("Échec: " + (error?.message ?? (data as any)?.error ?? "inconnu"));
      return;
    }
    toast.success(`${b.full_name ?? "Courtier"}: agent vocal ${next ? "activé ✅" : "désactivé 🚫"}`);
    load();
  };

  if (loading) return <div className="text-xs text-slate-500 p-4">Chargement des courtiers…</div>;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="text-sm font-semibold text-slate-800">Courtiers & agents ElevenLabs ({rows.length})</div>
        <button onClick={load} className="text-xs text-violet-700 hover:underline flex items-center gap-1"><RefreshCw className="w-3 h-3" />Actualiser</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
            <tr>
              <th className="text-left px-3 py-2">Courtier</th>
              <th className="text-left px-3 py-2">Ext.</th>
              <th className="text-left px-3 py-2">Agent ID</th>
              <th className="text-left px-3 py-2">Sessions 7j</th>
              <th className="text-left px-3 py-2">Erreurs 24h</th>
              <th className="text-left px-3 py-2">Dernière session</th>
              <th className="text-left px-3 py-2">Statut</th>
              <th className="text-right px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.user_id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-800">{b.full_name ?? "—"}</td>
                <td className="px-3 py-2 text-slate-600">{b.extension ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{b.elevenlabs_agent_id ? b.elevenlabs_agent_id.slice(0, 12) + "…" : "—"}</td>
                <td className="px-3 py-2 text-slate-700">{b.sessions_7d}</td>
                <td className="px-3 py-2">
                  {b.errors_24h > 0 ? (
                    <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-mono">
                      {b.errors_24h} · {b.last_error ?? "?"}
                    </span>
                  ) : <span className="text-emerald-600">0</span>}
                </td>
                <td className="px-3 py-2 text-slate-500">{b.ava_last_session_at ? new Date(b.ava_last_session_at).toLocaleString("fr-CA") : "—"}</td>
                <td className="px-3 py-2">
                  {b.voice_agent_enabled ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />Activé
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                      <XCircle className="w-3.5 h-3.5" />Désactivé
                    </span>
                  )}
                  {b.voice_agent_enabled && !b.elevenlabs_agent_id && (
                    <div className="text-[10px] text-amber-700 mt-1">⚠️ Aucun agent ElevenLabs — fallback par défaut</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    disabled={busy === b.user_id}
                    onClick={() => toggle(b)}
                    className={`text-[11px] px-2.5 py-1 rounded border font-medium disabled:opacity-50 ${
                      b.voice_agent_enabled
                        ? "border-red-300 text-red-700 hover:bg-red-50"
                        : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    }`}
                    title={b.voice_agent_enabled ? "Retirer l'accès à l'agent vocal AVA" : "Autoriser ce courtier à utiliser l'agent vocal AVA"}
                  >
                    {busy === b.user_id ? "..." : b.voice_agent_enabled ? "Désactiver" : "Activer"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="text-center text-slate-500 py-6">Aucun courtier</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
