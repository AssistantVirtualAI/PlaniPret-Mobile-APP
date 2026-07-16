import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, User, Play } from "lucide-react";

type Broker = { user_id: string; full_name: string | null; extension: string | null; voice_agent_enabled: boolean | null };
type Preview = {
  broker: { full_name: string | null; first_name: string; extension: string | null; voice_agent_enabled: boolean | null; ms365_connected: boolean; maestro_connected: boolean };
  agent_id: string;
  voice_id: string;
  language: string;
  autonomy_mode: string;
  first_message: string;
  dynamic_variables: Record<string, string>;
};

export default function AvaVoiceSimulatorPanel() {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("ava-agent-config-preview", { body: {} });
      if (error || !(data as any)?.success) {
        setErr((data as any)?.error ?? error?.message ?? "Erreur");
      } else {
        setBrokers((data as any).brokers ?? []);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selected) { setPreview(null); return; }
    (async () => {
      setPreviewLoading(true);
      setErr(null);
      const { data, error } = await supabase.functions.invoke("ava-agent-config-preview", {
        body: { target_user_id: selected },
      });
      if (error || !(data as any)?.success) {
        setErr((data as any)?.error ?? error?.message ?? "Erreur");
        setPreview(null);
      } else {
        setPreview(data as Preview);
      }
      setPreviewLoading(false);
    })();
  }, [selected]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return brokers;
    return brokers.filter(
      (b) => (b.full_name ?? "").toLowerCase().includes(q) || (b.extension ?? "").includes(q),
    );
  }, [brokers, filter]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">Courtiers ({brokers.length})</h3>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer..."
            className="text-xs px-2 py-1 rounded border border-slate-200 w-40"
          />
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : (
          <div className="max-h-[420px] overflow-auto divide-y divide-slate-100">
            {filtered.map((b) => (
              <button
                key={b.user_id}
                onClick={() => setSelected(b.user_id)}
                className={`w-full text-left px-2 py-2 hover:bg-slate-50 flex items-center gap-2 ${
                  selected === b.user_id ? "bg-violet-50" : ""
                }`}
              >
                <User className="w-4 h-4 text-slate-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-800 truncate">{b.full_name || "—"}</div>
                  <div className="text-xs text-slate-500">Ext {b.extension || "—"}</div>
                </div>
                {b.voice_agent_enabled ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">AVA</span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Off</span>
                )}
              </button>
            ))}
            {filtered.length === 0 && <div className="text-xs text-slate-500 py-6 text-center">Aucun résultat</div>}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
          <Play className="w-4 h-4 text-violet-600" /> Simulation du salut
        </h3>
        {err && <div className="text-xs text-rose-600 mb-2">{err}</div>}
        {!selected && <div className="text-xs text-slate-500 py-6 text-center">Sélectionne un courtier à gauche.</div>}
        {selected && previewLoading && <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 animate-spin" /></div>}
        {preview && !previewLoading && (
          <div className="space-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Courtier</div>
              <div className="text-sm text-slate-800">{preview.broker.full_name} <span className="text-slate-400">· ext {preview.broker.extension || "—"}</span></div>
              <div className="text-xs text-slate-500 mt-0.5">
                {preview.broker.voice_agent_enabled ? "AVA activée" : "AVA désactivée"} ·
                {" "}M365 {preview.broker.ms365_connected ? "✓" : "✕"} ·
                {" "}Maestro {preview.broker.maestro_connected ? "✓" : "✕"}
              </div>
            </div>

            <div className="rounded-md bg-violet-50 border border-violet-200 p-3">
              <div className="text-[11px] uppercase tracking-wide text-violet-500 mb-1">First message (ElevenLabs override)</div>
              <div className="text-sm text-slate-800 italic">"{preview.first_message}"</div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Dynamic variables envoyées</div>
              <pre className="text-[11px] bg-slate-900 text-slate-100 rounded p-2 overflow-auto">
{JSON.stringify(preview.dynamic_variables, null, 2)}
              </pre>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-slate-400">Agent ID:</span> <span className="text-slate-700 font-mono">{preview.agent_id.slice(0, 12)}…</span></div>
              <div><span className="text-slate-400">Voice ID:</span> <span className="text-slate-700 font-mono">{preview.voice_id.slice(0, 12)}…</span></div>
              <div><span className="text-slate-400">Langue:</span> <span className="text-slate-700">{preview.language}</span></div>
              <div><span className="text-slate-400">Autonomie:</span> <span className="text-slate-700">{preview.autonomy_mode}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
