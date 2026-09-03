// Carte commissions de l'accueil mobile — KPI du mois, tendance 6 mois et
// top prêteurs. Visible uniquement pour les courtiers et administrateurs.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";

const cad = (n: number, max = 0) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: max }).format(n || 0);

const compact = (n: number) =>
  new Intl.NumberFormat("fr-CA", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

const pad = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type MonthPoint = { key: string; label: string; amount: number };

interface CardState {
  total: number;
  count: number;
  average: number;
  volume: number;
  prevTotal: number;
  series: MonthPoint[];
  institutions: { institution: string; amount: number }[];
}

export default function CommissionHomeCard({ profile, lang }: { profile: any; lang?: string }) {
  const fr = lang !== "en";
  const navigate = useNavigate();
  const role = String(profile?.role ?? "");
  const allowed = role === "broker" || role === "admin";
  const [state, setState] = useState<CardState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Toronto" }));
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    // Toujours scoper sur le courtier connecté (les admins voyaient sinon les
    // commissions de tout le cabinet sur leur écran d'accueil).
    const ownId = profile?.maestro_broker_id ? String(profile.maestro_broker_id) : "";
    const call = (from: Date, to: Date) =>
      supabase.functions.invoke("planipret-commission-reports", {
        body: { action: "summary", filters: { date_from: pad(from), date_to: pad(to), commission_type: "base", ...(ownId ? { users_id: ownId } : {}) } },
      });

    (async () => {
      const [monthRes, rangeRes] = await Promise.all([call(monthStart, monthEnd), call(rangeStart, monthEnd)]);
      if (cancelled) return;
      const m: any = monthRes.data;
      if (monthRes.error || m?.error || !m?.summary) { setFailed(true); return; }

      // Monthly buckets from the 6-month window (single upstream fetch).
      const buckets = new Map<string, number>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
      }
      const byDate: any[] = (rangeRes.data as any)?.summary?.by_date ?? [];
      for (const row of byDate) {
        const k = String(row.date ?? "").slice(0, 7);
        if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + Number(row.amount ?? 0));
      }
      const monthFmt = new Intl.DateTimeFormat(fr ? "fr-CA" : "en-CA", { month: "short", timeZone: "America/Toronto" });
      const series: MonthPoint[] = [...buckets.entries()].map(([key, amount]) => ({
        key,
        label: monthFmt.format(new Date(`${key}-15T12:00:00`)).replace(".", ""),
        amount,
      }));
      const prevKey = series.length > 1 ? series[series.length - 2].key : "";
      const prevTotal = series.find((s) => s.key === prevKey)?.amount ?? 0;

      setState({
        total: Number(m.summary.total_commission ?? 0),
        count: Number(m.summary.deposit_count ?? 0),
        average: Number(m.summary.average_commission ?? 0),
        volume: Number(m.summary.total_loan_volume ?? 0),
        prevTotal,
        series,
        institutions: (m.summary.top_institutions ?? []).slice(0, 3),
      });
    })().catch(() => { if (!cancelled) setFailed(true); });

    return () => { cancelled = true; };
  }, [allowed, fr, profile?.maestro_broker_id]);

  const delta = useMemo(() => {
    if (!state || !state.prevTotal) return null;
    return ((state.total - state.prevTotal) / state.prevTotal) * 100;
  }, [state]);

  if (!allowed || failed) return null;

  const open = (params?: Record<string, string>) => {
    const qp = new URLSearchParams({ period: "month", ...(params ?? {}) });
    navigate(`/mplanipret/commissions?${qp.toString()}`);
  };

  const maxSeries = state ? Math.max(...state.series.map((s) => s.amount), 1) : 1;
  const maxInst = state ? Math.max(...state.institutions.map((i) => i.amount), 1) : 1;

  return (
    <section
      className="rounded-2xl p-4 relative overflow-hidden pp-card animate-fade-in"
      style={{
        background: "linear-gradient(135deg, #FFFFFF 0%, #F0F4F9 100%)",
        borderColor: "var(--pp-bg-border)",
      }}
    >
      <div
        className="absolute -top-14 -right-10 w-44 h-44 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(155,127,232,0.20), transparent 70%)" }}
      />
      <div className="relative">
        <button onClick={() => open()} className="w-full flex items-center justify-between text-left">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(155,127,232,0.16)", color: "var(--pp-brand-accent)" }}>
              <Wallet className="w-4 h-4" />
            </div>
            <span className="pp-eyebrow">{fr ? "Commissions du mois" : "Commissions this month"}</span>
          </div>
          <ChevronRight className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} />
        </button>

        {!state ? (
          <div className="mt-3 space-y-2">
            <div className="h-7 w-40 rounded-lg animate-pulse" style={{ background: "rgba(59,111,160,0.12)" }} />
            <div className="h-14 w-full rounded-lg animate-pulse" style={{ background: "rgba(59,111,160,0.08)" }} />
          </div>
        ) : (
          <>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-[28px] leading-none font-extrabold"
                style={{ color: "var(--pp-text-primary)", fontFamily: "Urbanist,sans-serif" }}>
                {cad(state.total)}
              </span>
              {delta !== null && (
                <span className="mb-0.5 inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{
                    color: delta >= 0 ? "var(--pp-success, #1F9D63)" : "var(--pp-danger, #D2445E)",
                    background: delta >= 0 ? "rgba(31,157,99,0.12)" : "rgba(210,68,94,0.12)",
                  }}>
                  {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {Math.abs(delta).toFixed(0)}%
                </span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { l: fr ? "Dépôts" : "Deposits", v: String(state.count) },
                { l: fr ? "Moyenne" : "Average", v: cad(state.average) },
                { l: fr ? "Volume" : "Volume", v: `${compact(state.volume)} $` },
              ].map((k) => (
                <div key={k.l} className="rounded-xl px-2.5 py-2"
                  style={{ background: "rgba(59,111,160,0.06)", border: "1px solid rgba(59,111,160,0.16)" }}>
                  <p className="text-[10px]" style={{ color: "var(--pp-text-muted)" }}>{k.l}</p>
                  <p className="text-[13px] font-bold" style={{ color: "var(--pp-text-primary)", fontFamily: "Urbanist,sans-serif" }}>{k.v}</p>
                </div>
              ))}
            </div>

            {/* Tendance 6 mois */}
            <div className="mt-3.5 flex items-end justify-between gap-1.5 h-16">
              {state.series.map((p, i) => {
                const h = Math.max(6, Math.round((p.amount / maxSeries) * 56));
                const isLast = i === state.series.length - 1;
                return (
                  <button key={p.key} onClick={() => {
                    const [y, mo] = p.key.split("-").map(Number);
                    open({
                      period: "custom",
                      date_from: pad(new Date(y, mo - 1, 1)),
                      date_to: pad(new Date(y, mo, 0)),
                    });
                  }}
                    className="flex-1 flex flex-col items-center justify-end gap-1">
                    <span className="w-full rounded-t-md transition-all"
                      style={{
                        height: h,
                        background: isLast
                          ? "linear-gradient(180deg,#9B7FE8,#3B6FA0)"
                          : "rgba(59,111,160,0.25)",
                      }} />
                    <span className="text-[9px]" style={{ color: isLast ? "var(--pp-brand-accent-2)" : "var(--pp-text-muted)" }}>
                      {p.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Top prêteurs */}
            {state.institutions.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {state.institutions.map((inst) => (
                  <button key={inst.institution} onClick={() => open()} className="w-full text-left">
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className="truncate pr-2" style={{ color: "var(--pp-text-secondary)" }}>{inst.institution}</span>
                      <span className="font-semibold" style={{ color: "var(--pp-text-primary)" }}>{cad(inst.amount)}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(59,111,160,0.12)" }}>
                      <div className="h-full rounded-full"
                        style={{ width: `${Math.max(4, (inst.amount / maxInst) * 100)}%`, background: "linear-gradient(90deg,#3B6FA0,#9B7FE8)" }} />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {state.total === 0 && state.count === 0 && (
              <p className="mt-3 text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
                {fr ? "Aucun dépôt enregistré ce mois-ci." : "No deposits recorded this month."}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
