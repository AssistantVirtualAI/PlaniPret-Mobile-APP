import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { ChevronLeft, RefreshCw, CheckCircle2, AlertCircle, MinusCircle, HelpCircle } from "lucide-react";
import type { PlanipretMobileContext } from "../PlanipretMobile";
import { loadMHomeCache, HOME_KPI_WIRING, type SourceStatus } from "@/lib/mhomeCache";

type Period = "day" | "week" | "month" | "shift";

function currentPeriod(): Period {
  try {
    const p = localStorage.getItem("pp.mobile.period.v2") as Period | null;
    if (p && ["day", "week", "month", "shift"].includes(p)) return p;
  } catch {}
  return "month";
}

function relativeTime(ts: number | null): string {
  if (!ts) return "jamais";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "à l'instant";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

function StatusBadge({ status }: { status: SourceStatus["status"] }) {
  const map: Record<SourceStatus["status"], { label: string; color: string; bg: string; Icon: any }> = {
    ok:      { label: "Connecté",  color: "#16a34a", bg: "rgba(22,163,74,0.10)",  Icon: CheckCircle2 },
    empty:   { label: "Aucune donnée", color: "#7A8FB0", bg: "rgba(122,143,176,0.12)", Icon: MinusCircle },
    error:   { label: "Erreur",    color: "#dc2626", bg: "rgba(220,38,38,0.10)",  Icon: AlertCircle },
    timeout: { label: "Timeout",   color: "#d97706", bg: "rgba(217,119,6,0.10)",  Icon: AlertCircle },
    unknown: { label: "Non testé", color: "#7A8FB0", bg: "rgba(122,143,176,0.12)", Icon: HelpCircle },
  };
  const s = map[status] ?? map.unknown;
  const Icon = s.Icon;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color }}>
      <Icon className="w-3 h-3" /> {s.label}
    </span>
  );
}

export default function MKpiAudit() {
  const navigate = useNavigate();
  const { profile } = useOutletContext<PlanipretMobileContext>();
  const [period] = useState<Period>(() => currentPeriod());
  const [tick, setTick] = useState(0);

  const cache = useMemo(
    () => loadMHomeCache(profile?.user_id, period),
    [profile?.user_id, period, tick],
  );

  const rows = HOME_KPI_WIRING.map((w) => {
    const st: SourceStatus = cache?.sources?.[w.source] ?? { status: "unknown", lastAt: null };
    const value = w.id in (cache?.stats ?? {}) ? (cache?.stats as any)?.[w.id] : undefined;
    return { ...w, st, value };
  });

  const okCount = rows.filter((r) => r.st.status === "ok").length;
  const errCount = rows.filter((r) => r.st.status === "error" || r.st.status === "timeout").length;

  return (
    <div className="p-4 space-y-3 pb-8" style={{ background: "var(--pp-bg-base)", minHeight: "100%" }}>
      <header className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="pp-eyebrow">Audit</p>
          <h1 className="text-[20px] font-bold leading-tight">Audit des KPI Home</h1>
        </div>
        <button onClick={() => setTick((n) => n + 1)}
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}
          aria-label="Rafraîchir">
          <RefreshCw className="w-4 h-4" />
        </button>
      </header>

      <section className="pp-card p-4">
        <p className="text-[12px]" style={{ color: "var(--pp-text-secondary)" }}>
          Cette page vérifie que chaque KPI de la page d'accueil est bien connecté à sa source réelle
          (Supabase, NetSapiens, Microsoft 365, AVA) et affiche le dernier statut de synchronisation.
        </p>
        <div className="mt-3 flex items-center gap-4 text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
          <span><b style={{ color: "#16a34a" }}>{okCount}</b> connectés</span>
          <span><b style={{ color: "#dc2626" }}>{errCount}</b> en erreur</span>
          <span>Période&nbsp;: <b>{period}</b></span>
          {cache?.cachedAt && <span>Cache&nbsp;: <b>{relativeTime(cache.cachedAt)}</b></span>}
        </div>
      </section>

      <section className="pp-card divide-y" style={{ borderColor: "var(--pp-bg-border)" }}>
        {rows.map((r) => (
          <div key={r.id} className="p-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold" style={{ color: "var(--pp-text-primary)" }}>{r.label}</p>
                {typeof r.value === "number" && (
                  <span className="text-[11px] tabular-nums px-1.5 py-0.5 rounded"
                    style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-secondary)" }}>
                    valeur&nbsp;: {r.value}
                  </span>
                )}
                <StatusBadge status={r.st.status} />
              </div>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--pp-text-muted)" }}>{r.description}</p>
              <p className="text-[10px] mt-1 font-mono" style={{ color: "var(--pp-text-faint, #94a3b8)" }}>
                ← {r.sourceLabel}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--pp-text-muted)" }}>
                Dernière sync : {relativeTime(r.st.lastAt)}
                {r.st.message ? ` — ${r.st.message}` : ""}
              </p>
            </div>
          </div>
        ))}
      </section>

      {!cache && (
        <p className="text-center text-[12px] py-6" style={{ color: "var(--pp-text-muted)" }}>
          Aucun cache. Ouvrez la page d'accueil pour amorcer les KPI, puis revenez ici.
        </p>
      )}
    </div>
  );
}
