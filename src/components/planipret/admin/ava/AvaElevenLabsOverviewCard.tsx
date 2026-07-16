import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bot, Clock, TrendingUp, Users, RefreshCw, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

const ACCENT = "#2E9BDC";
const SUCCESS = "#00D4AA";
const AGENT = "#9B7FE8";
const WARNING = "#F5A623";

type Timeframe = "24h" | "7d" | "30d" | "90d";

interface PerAgent {
  agent_id: string;
  broker_name: string | null;
  broker_user_id: string | null;
  extension: string | null;
  voice_agent_enabled: boolean;
  total_calls: number;
  total_duration_secs: number;
  avg_duration_secs: number;
  successful_calls: number;
  success_rate: number;
  last_call_at: string | null;
}

interface Overview {
  timeframe: string;
  subscription: { tier: string; character_count: number; character_limit: number; status: string } | null;
  totals: {
    total_calls: number;
    total_duration_secs: number;
    avg_duration_secs: number;
    successful_calls: number;
    success_rate: number;
    active_agents: number;
    total_agents: number;
  };
  per_agent: PerAgent[];
}

const fmtDuration = (secs: number) => {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m${s.toString().padStart(2, "0")}s` : `${s}s`;
};

export default function AvaElevenLabsOverviewCard() {
  const [timeframe, setTimeframe] = useState<Timeframe>("7d");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID ?? "gejxisrqtvxavbrfcoxz";
      const anonKey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/pp-admin-ava-elevenlabs?action=overview&timeframe=${timeframe}`,
        {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${session?.access_token ?? anonKey}`,
          },
        },
      );
      const j = await resp.json();
      if (!resp.ok) throw new Error(j?.error ?? `HTTP ${resp.status}`);
      setData(j as Overview);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);

  const usagePct = data?.subscription?.character_limit
    ? Math.round((data.subscription.character_count / data.subscription.character_limit) * 100)
    : 0;

  return (
    <div className="pp-card" style={{ padding: 20 }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5" style={{ color: AGENT }} />
          <div>
            <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 15, color: "var(--pp-text-primary)" }}>
              Agent vocal AVA (ElevenLabs)
            </h2>
            <p style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>
              Appels et statistiques en temps réel · endpoint <code>/v1/convai/conversations</code>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg overflow-hidden" style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)" }}>
            {(["24h", "7d", "30d", "90d"] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className="px-3 py-1.5"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: timeframe === tf ? "#fff" : "var(--pp-text-muted)",
                  background: timeframe === tf ? AGENT : "transparent",
                }}
              >
                {tf}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            className="px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-white/5"
            style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)", fontSize: 11, color: "var(--pp-text-muted)" }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 mb-3 rounded-md" style={{ background: "rgba(232,76,76,0.08)", border: "1px solid rgba(232,76,76,0.25)", fontSize: 12, color: "#E84C4C" }}>
          Erreur ElevenLabs: {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MiniKpi icon={<Sparkles className="w-4 h-4" />} label="Conversations" value={data?.totals.total_calls ?? 0} color={AGENT} />
        <MiniKpi icon={<Clock className="w-4 h-4" />} label="Durée totale" value={fmtDuration(data?.totals.total_duration_secs ?? 0)} color={ACCENT} />
        <MiniKpi icon={<TrendingUp className="w-4 h-4" />} label="Taux de succès" value={`${data?.totals.success_rate ?? 0}%`} color={SUCCESS} />
        <MiniKpi icon={<Users className="w-4 h-4" />} label="Agents actifs" value={`${data?.totals.active_agents ?? 0} / ${data?.totals.total_agents ?? 0}`} color={WARNING} />
      </div>

      {/* Subscription bar */}
      {data?.subscription && (
        <div className="mb-4 p-3 rounded-md" style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)" }}>
          <div className="flex items-center justify-between mb-1.5">
            <span style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>
              Compte ElevenLabs — <strong style={{ color: "var(--pp-text-primary)" }}>{data.subscription.tier}</strong>
            </span>
            <span className="tabular-nums" style={{ fontSize: 11, color: "var(--pp-text-primary)" }}>
              {data.subscription.character_count.toLocaleString()} / {data.subscription.character_limit.toLocaleString()} car. ({usagePct}%)
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
            <div className="h-full" style={{ width: `${Math.min(100, usagePct)}%`, background: usagePct > 85 ? "#E84C4C" : AGENT }} />
          </div>
        </div>
      )}

      {/* Per-agent table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--pp-bg-border-2)" }}>
              {["Courtier", "Agent ID", "Appels", "Durée moy.", "Succès", "Dernier appel"].map((h) => (
                <th key={h} className="py-2 px-2 text-left" style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--pp-text-faint)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.per_agent ?? []).map((a) => (
              <tr key={a.agent_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }} className="hover:bg-white/[0.02]">
                <td className="py-2.5 px-2" style={{ fontSize: 12, color: "var(--pp-text-primary)" }}>
                  <div className="flex items-center gap-1.5">
                    <span
                      style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: a.voice_agent_enabled ? SUCCESS : "var(--pp-text-faint)",
                      }}
                    />
                    {a.broker_name ?? "—"}
                    {a.extension && <span className="ml-1" style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>ext. {a.extension}</span>}
                  </div>
                </td>
                <td className="py-2.5 px-2 tabular-nums" style={{ fontSize: 10, color: "var(--pp-text-faint)", fontFamily: "monospace" }}>
                  {a.agent_id.slice(0, 12)}…
                </td>
                <td className="py-2.5 px-2 tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: AGENT }}>
                  {a.total_calls}
                </td>
                <td className="py-2.5 px-2 tabular-nums" style={{ fontSize: 12, color: "var(--pp-text-muted)" }}>
                  {fmtDuration(a.avg_duration_secs)}
                </td>
                <td className="py-2.5 px-2 tabular-nums" style={{ fontSize: 12, color: a.success_rate >= 70 ? SUCCESS : WARNING }}>
                  {a.success_rate}%
                </td>
                <td className="py-2.5 px-2" style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>
                  {a.last_call_at ? new Date(a.last_call_at).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" }) : "—"}
                </td>
              </tr>
            ))}
            {!loading && (!data?.per_agent || data.per_agent.length === 0) && (
              <tr>
                <td colSpan={6} className="py-6 text-center" style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>
                  Aucun agent AVA configuré avec un <code>elevenlabs_agent_id</code>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>
          Données ElevenLabs Convai — clé partagée gérée côté serveur
        </span>
        <Link to="/planipret/admin/enregistrements?tab=ava" style={{ fontSize: 11, color: ACCENT }} className="hover:underline">
          Voir les enregistrements AVA →
        </Link>
      </div>
    </div>
  );
}

function MiniKpi({ icon, label, value, color }: { icon: any; label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-md p-3" style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)" }}>
      <div className="flex items-center gap-1.5 mb-1" style={{ color }}>
        {icon}
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--pp-text-faint)" }}>
          {label}
        </span>
      </div>
      <div className="tabular-nums" style={{ fontSize: 20, fontWeight: 700, color: "var(--pp-text-primary)" }}>
        {value}
      </div>
    </div>
  );
}
