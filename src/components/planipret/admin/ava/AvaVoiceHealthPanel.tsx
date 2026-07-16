import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, AlertTriangle, CheckCircle2, Radio, Users } from "lucide-react";

type Dashboard = {
  account: any;
  live_sessions: number;
  total_brokers: number;
  brokers_with_agent: number;
  brokers_enabled: number;
  errors_24h: number;
  top_errors: Array<{ reason: string; count: number }>;
  brokers: any[];
};

export default function AvaVoiceHealthPanel({ onData }: { onData?: (d: Dashboard) => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const { data: res } = await supabase.functions.invoke("pp-admin-ava-voice", { body: {} });
    if (res && !("error" in (res as any))) {
      setData(res as Dashboard);
      onData?.(res as Dashboard);
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); const i = setInterval(refresh, 30000); return () => clearInterval(i); }, []);

  if (loading && !data) return <div className="text-xs text-slate-500 p-4">Chargement de l'état de santé…</div>;
  if (!data) return <div className="text-xs text-red-500 p-4">Impossible de charger l'état de l'agent vocal.</div>;

  const acc = data.account ?? {};
  const sub = acc.subscription ?? {};
  const charUsedPct = sub.character_limit ? Math.round((sub.character_count / sub.character_limit) * 100) : 0;
  const apiOk = acc.ok;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      <Card
        icon={apiOk ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}
        title="API ElevenLabs"
        value={apiOk ? "OK" : "Erreur"}
        hint={apiOk ? `${acc.agents_count ?? 0} agent(s)` : (acc.error ?? "hors ligne")}
      />
      <Card
        icon={<Activity className="w-4 h-4 text-violet-500" />}
        title="Crédits caractères"
        value={sub.character_limit ? `${charUsedPct}%` : "—"}
        hint={sub.character_limit ? `${sub.character_count?.toLocaleString?.() ?? 0} / ${sub.character_limit?.toLocaleString?.() ?? 0}` : "abonnement inconnu"}
        alert={charUsedPct > 85}
      />
      <Card
        icon={<Radio className="w-4 h-4 text-emerald-500" />}
        title="Sessions en direct"
        value={String(data.live_sessions ?? 0)}
        hint={data.live_sessions ? "conversations actives" : "aucune session"}
      />
      <Card
        icon={<Users className="w-4 h-4 text-blue-500" />}
        title="Courtiers activés"
        value={`${data.brokers_enabled}/${data.total_brokers}`}
        hint={`${data.brokers_with_agent} avec agent provisionné`}
      />
      {data.errors_24h > 0 && (
        <div className="md:col-span-4 border border-amber-200 bg-amber-50 rounded-xl p-3">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-2">
            <AlertTriangle className="w-4 h-4" /> {data.errors_24h} erreur(s) dans les 24 dernières heures
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {data.top_errors.map((e) => (
              <span key={e.reason} className="px-2 py-1 rounded-md bg-white border border-amber-200 text-amber-800 font-mono">
                {e.reason} × {e.count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ icon, title, value, hint, alert }: { icon: any; title: string; value: string; hint?: string; alert?: boolean }) {
  return (
    <div className="rounded-xl p-3 border" style={{
      background: alert ? "#FEF3C7" : "var(--pp-bg-elevated, #fff)",
      borderColor: alert ? "#FCD34D" : "var(--pp-bg-border-2, #E5E7EB)",
    }}>
      <div className="flex items-center gap-2 text-xs text-slate-600">{icon}{title}</div>
      <div className="text-2xl font-bold mt-1" style={{ color: "var(--pp-text-primary, #0F172A)" }}>{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}
