// MCommissions — rapports de commissions Planiprêt (API officielle Maestro).
// Données financières sensibles : lecture seule, aucune donnée mise en cache
// hors de la session, aucun jeton Maestro côté client.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, RefreshCw, SlidersHorizontal, TrendingUp, Wallet,
  Building2, Receipt, X, Bot, AlertTriangle,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import MCommissionCharts from "@/components/planipret/mobile/MCommissionCharts";
import type { PlanipretMobileContext } from "../PlanipretMobile";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Period = "month" | "quarter" | "year" | "ytd" | "custom";

type Summary = {
  total_commission: number;
  deposit_count: number;
  average_commission: number;
  total_loan_volume: number;
  adjustments: number;
  top_institutions: { institution: string; amount: number; count: number }[];
  by_date: { date: string; amount: number; count: number }[];
  truncated: boolean;
};

type DepositRow = {
  number: string | null;
  institution: string | null;
  amount: string | number | null;
  loan_amt: string | number | null;
  date_trans: string | null;
  commission_type: string | null;
  split_type: string | null;
  primary_client_name: string | null;
  secondary_client_name?: string | null;
  points?: string | number | null;
  buy_down?: string | number | null;
  mortgage_type?: string | null;
  term?: string | number | null;
  agent_name?: string | null;
  target_name?: string | null;
  cabinet?: string | null;
  agent_company?: string | null;
  is_adjustment: number | null;
};


const COMMISSION_TYPES = ["base", "bonus", "bonus2", "perform"] as const;
const SPLIT_TYPES = ["planipret", "planipret_override", "planipret_external"] as const;
const ORDER_BY = ["date_trans", "amount", "loan_amt", "institution", "number", "points", "commission_type", "split_type", "agent_name", "target_name"] as const;
const selStyle: React.CSSProperties = {
  minHeight: 44,
  background: "rgba(155,127,232,0.08)",
  border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.28))",
  color: "var(--pp-text-primary, #E8EDF5)",
};
const PER_PAGE = 25;


const cad = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n || 0);
const cad2 = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n || 0);
const numOf = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
/** Masque raisonnable des noms de clients dans les aperçus de liste. */
const mask = (name: string | null | undefined) => {
  const v = String(name ?? "").trim();
  if (!v) return "";
  return v.split(/\s+/).map((w, i) => (i === 0 ? w : `${w[0]}.`)).join(" ");
};


/** Fenêtre de dates America/Toronto pour la période choisie. */
function rangeFor(period: Period, customFrom: string, customTo: string) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Toronto" }));
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (period === "custom") return { from: customFrom, to: customTo };
  if (period === "year") return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  if (period === "ytd") return { from: `${now.getFullYear()}-01-01`, to: iso(now) };
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return { from: iso(new Date(now.getFullYear(), q * 3, 1)), to: iso(new Date(now.getFullYear(), q * 3 + 3, 0)) };
  }
  return {
    from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export default function MCommissions() {
  const { lang } = useMplanipretLang();
  const fr = lang !== "en";
  const navigate = useNavigate();
  const { profile } = useOutletContext<PlanipretMobileContext>();
  const role = String(profile?.role ?? "");
  const allowed = role === "broker" || role === "admin";

  // Deep-link AVA : /mplanipret/commissions?period=…&commission_type=…
  const [sp] = useSearchParams();
  const spPeriod = sp.get("period");
  const [period, setPeriod] = useState<Period>(
    (["month", "quarter", "year", "ytd", "custom"] as string[]).includes(String(spPeriod)) ? (spPeriod as Period) : "month",
  );
  const [customFrom, setCustomFrom] = useState(sp.get("date_from") ?? "");
  const [customTo, setCustomTo] = useState(sp.get("date_to") ?? "");
  const [commissionType, setCommissionType] = useState<string>(
    (COMMISSION_TYPES as readonly string[]).includes(String(sp.get("commission_type"))) ? String(sp.get("commission_type")) : "base",
  );
  const [splitType, setSplitType] = useState<string>("");
  const [numberPrefix, setNumberPrefix] = useState<string>("");
  const [orderBy, setOrderBy] = useState<string>("date_trans");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [institutionId, setInstitutionId] = useState<string>(/^\d+$/.test(String(sp.get("financial_inst_id"))) ? String(sp.get("financial_inst_id")) : "");

  const [institutions, setInstitutions] = useState<{ id: number; label: string }[]>([]);
  const [agents, setAgents] = useState<{ users_id: number; name: string }[]>([]);
  // Les admins voient par défaut TOUT le cabinet (bascule explicite en haut de
  // page). Les courtiers restent scopés sur leur propre identifiant Maestro.
  const isAdmin = role === "admin";
  const ownId = profile?.maestro_broker_id ? String(profile.maestro_broker_id) : "";
  const [agentId, setAgentId] = useState<string>(() => {
    const q = sp.get("users_id");
    if (q && /^\d+$/.test(q)) return q;
    return isAdmin ? "" : ownId;
  });

  const [detail, setDetail] = useState<DepositRow | null>(null);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<DepositRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [avaPref, setAvaPref] = useState<boolean | null>(null);

  const range = useMemo(() => rangeFor(period, customFrom, customTo), [period, customFrom, customTo]);
  const rangeReady = period !== "custom" || (!!customFrom && !!customTo);

  const filters = useMemo(() => ({
    date_from: range.from,
    date_to: range.to,
    commission_type: commissionType,
    order_by: orderBy,
    sort: sortDir,
    ...(institutionId ? { financial_inst_id: institutionId } : {}),
    ...(splitType ? { split_type: splitType } : {}),
    ...(numberPrefix.trim() ? { number_prefix: numberPrefix.trim() } : {}),
    ...(agentId ? { users_id: agentId } : {}),
  }), [range.from, range.to, commissionType, institutionId, splitType, numberPrefix, orderBy, sortDir, agentId]);


  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error: fnErr } = await supabase.functions.invoke("planipret-commission-reports", { body });
    if (fnErr) throw new Error(fnErr.message);
    if (data?.error) throw new Error(data.message ?? data.error);
    return data;
  }, []);

  const load = useCallback(async () => {
    if (!allowed || !rangeReady) return;
    setLoading(true); setError(null); setPage(1);
    try {
      const [s, d] = await Promise.all([
        call({ action: "summary", filters }),
        call({ action: "deposits", filters: { ...filters, page: 1, per_page: PER_PAGE } }),
      ]);
      setSummary(s.summary);
      setRows(d.rows ?? []);
      setTotal(d.pagination?.total ?? 0);
    } catch (e) {
      setError((e as Error).message);
      setSummary(null); setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [allowed, rangeReady, filters, call]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!allowed) return;
    call({ action: "preference" }).then((d) => setAvaPref(d.ava_include_commissions === true)).catch(() => setAvaPref(null));
    call({ action: "institutions" }).then((d) => setInstitutions(d.institutions ?? [])).catch(() => setInstitutions([]));
    call({ action: "agents" }).then((d) => setAgents(d.agents ?? [])).catch(() => setAgents([]));
  }, [allowed, call]);


  const loadMore = async () => {
    if (loadingMore || rows.length >= total) return;
    setLoadingMore(true);
    try {
      const d = await call({ action: "deposits", filters: { ...filters, page: page + 1, per_page: PER_PAGE } });
      setRows((prev) => [...prev, ...(d.rows ?? [])]);
      setPage((p) => p + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleAvaPref = async (next: boolean) => {
    setAvaPref(next);
    try { await call({ action: "preference", set: next }); }
    catch { setAvaPref(!next); }
  };

  const chartData = useMemo(() => (summary?.by_date ?? []).map((b) => ({
    label: b.date.slice(5),
    amount: b.amount,
  })), [summary]);

  if (!allowed) {
    return (
      <Shell title={fr ? "Commissions" : "Commissions"} onBack={() => navigate(-1)}>
        <Empty icon={<AlertTriangle className="w-5 h-5" />}
          text={fr ? "Les rapports de commissions sont réservés aux courtiers et administrateurs." : "Commission reports are restricted to brokers and administrators."} />
      </Shell>
    );
  }

  return (
    <Shell
      title={fr ? "Commissions" : "Commissions"}
      onBack={() => navigate(-1)}
      right={
        <div className="flex items-center gap-1">
          <button onClick={() => setFiltersOpen(true)} aria-label={fr ? "Filtres" : "Filters"} className="p-2 rounded-lg" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button onClick={load} aria-label={fr ? "Rafraîchir" : "Refresh"} className="p-2 rounded-lg" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      }
    >
      {/* Périodes */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
        {(["month", "quarter", "ytd", "year", "custom"] as Period[]).map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap"
            style={{
              background: period === p ? "var(--pp-brand-accent, #9B7FE8)" : "var(--pp-bg-surface, #0A1628)",
              color: period === p ? "#0A1628" : "var(--pp-text-secondary, #B4C6D8)",
              border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.28))",
            }}>
            {p === "month" ? (fr ? "Mois" : "Month")
              : p === "quarter" ? (fr ? "Trimestre" : "Quarter")
              : p === "ytd" ? (fr ? "Année en cours" : "YTD")
              : p === "year" ? (fr ? "Année" : "Year")
              : (fr ? "Personnalisé" : "Custom")}
          </button>
        ))}
      </div>

      {/* Portée (admins seulement) : cabinet vs personnel */}
      {isAdmin && (
        <div className="flex gap-2 mb-3">
          {[
            { id: "", label: fr ? "Tous les courtiers" : "All brokers" },
            { id: ownId, label: fr ? "Mes commissions" : "My commissions" },
          ].filter((s) => s.id !== "" ? !!ownId : true).map((s) => (
            <button key={s.id || "all"} onClick={() => setAgentId(s.id)}
              className="flex-1 px-3 py-2 rounded-xl text-[12.5px] font-semibold"
              style={{
                minHeight: 44,
                background: agentId === s.id ? "var(--pp-brand-accent, #9B7FE8)" : "var(--pp-bg-surface, #0A1628)",
                color: agentId === s.id ? "#0A1628" : "var(--pp-text-secondary, #B4C6D8)",
                border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.28))",
              }}>
              {s.label}
            </button>
          ))}
        </div>
      )}



      {period === "custom" && (
        <div className="flex gap-2 mb-3">
          <DateInput value={customFrom} onChange={setCustomFrom} label={fr ? "Du" : "From"} />
          <DateInput value={customTo} onChange={setCustomTo} label={fr ? "Au" : "To"} />
        </div>
      )}

      {error && (
        <div className="rounded-xl px-3 py-3 mb-3 text-[13px]" style={{ background: "rgba(232,76,76,0.12)", border: "1px solid rgba(232,76,76,0.4)", color: "#FFB4B4" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "var(--pp-bg-surface, #0A1628)" }} />)}
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Kpi icon={<Wallet className="w-4 h-4" />} label={fr ? "Commissions" : "Commissions"} value={cad(summary.total_commission)} />
            <Kpi icon={<Receipt className="w-4 h-4" />} label={fr ? "Dépôts" : "Deposits"} value={String(summary.deposit_count)} />
            <Kpi icon={<TrendingUp className="w-4 h-4" />} label={fr ? "Moyenne" : "Average"} value={cad(summary.average_commission)} />
            <Kpi icon={<Building2 className="w-4 h-4" />} label={fr ? "Volume de prêts" : "Loan volume"} value={cad(summary.total_loan_volume)} />
          </div>

          {summary.truncated && (
            <p className="text-[11.5px] mb-3" style={{ color: "#F0B429" }}>
              {fr ? "Résultats partiels : affinez la période pour un total exact." : "Partial results: narrow the period for an exact total."}
            </p>
          )}

          <MCommissionCharts filters={filters} lang={lang} />

          {chartData.length > 0 && (
            <Card title={fr ? "Par date" : "By date"}>
              <div style={{ height: 170 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(155,127,232,0.15)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#B4C6D8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#B4C6D8" }} axisLine={false} tickLine={false} width={48} />
                    <Tooltip formatter={(v: any) => cad2(Number(v))} contentStyle={{ background: "#0A1628", border: "1px solid rgba(155,127,232,0.3)", borderRadius: 10, fontSize: 12 }} />
                    <Bar dataKey="amount" fill="var(--pp-brand-accent-2, #2E9BDC)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {summary.top_institutions.length > 0 && (
            <Card title={fr ? "Par institution" : "By lender"}>
              <div className="space-y-2">
                {summary.top_institutions.map((i) => {
                  const pct = summary.total_commission ? Math.round((i.amount / summary.total_commission) * 100) : 0;
                  return (
                    <div key={i.institution}>
                      <div className="flex justify-between text-[12.5px] mb-1">
                        <span style={{ color: "var(--pp-text-primary, #E8EDF5)" }}>{i.institution}</span>
                        <span style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{cad(i.amount)} · {i.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(155,127,232,0.15)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--pp-brand-accent, #9B7FE8)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card title={`${fr ? "Dépôts" : "Deposits"} (${total})`}>
            {rows.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>
                {fr ? "Aucun dépôt de commission pour cette période." : "No commission deposit for this period."}
              </p>
            ) : (
              <div className="space-y-2">
                {rows.map((r, idx) => (
                  <button key={`${r.number ?? "row"}-${idx}`} onClick={() => setDetail(r)}
                    className="w-full text-left rounded-xl px-3 py-2.5"
                    style={{ minHeight: 44, background: "rgba(155,127,232,0.06)", border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.2))" }}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold truncate" style={{ color: "var(--pp-text-primary, #E8EDF5)" }}>
                          {r.institution ?? "—"}
                        </div>
                        <div className="text-[11.5px] truncate" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>
                          {[r.number, mask(r.primary_client_name), r.date_trans ? String(r.date_trans).slice(0, 10) : null].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[13.5px] font-bold" style={{ color: "var(--pp-brand-accent, #9B7FE8)" }}>{cad2(numOf(r.amount))}</div>
                        <div className="text-[11px]" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>
                          {r.commission_type ?? "base"}{Number(r.is_adjustment) === 1 ? " · ajust." : ""}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}

                {rows.length < total && (
                  <button onClick={loadMore} disabled={loadingMore}
                    className="w-full py-2.5 rounded-xl text-[13px] font-semibold"
                    style={{ background: "var(--pp-bg-surface, #0A1628)", border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.28))", color: "var(--pp-text-primary, #E8EDF5)" }}>
                    {loadingMore ? (fr ? "Chargement…" : "Loading…") : (fr ? "Charger plus" : "Load more")}
                  </button>
                )}
              </div>
            )}
          </Card>

          {/* Préférence AVA — désactivée par défaut */}
          <Card title={fr ? "Partage avec AVA" : "Share with AVA"}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={avaPref === true}
                onChange={(e) => toggleAvaPref(e.target.checked)} />
              <span className="text-[12.5px]" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>
                <span className="font-semibold flex items-center gap-1" style={{ color: "var(--pp-text-primary, #E8EDF5)" }}>
                  <Bot className="w-3.5 h-3.5" /> {fr ? "Inclure les commissions dans AVA" : "Include commissions in AVA"}
                </span>
                {fr
                  ? "Désactivé par défaut. Si activé, AVA (clavardage et voix) peut consulter vos totaux de commissions et vos dépôts."
                  : "Off by default. When enabled, AVA (chat and voice) can read your commission totals and deposits."}
              </span>
            </label>
          </Card>
        </>
      ) : !error ? (
        <Empty icon={<Receipt className="w-5 h-5" />} text={fr ? "Aucune donnée de commission." : "No commission data."} />
      ) : null}

      {/* Filtres */}
      {filtersOpen && (
        <div className="fixed inset-0 z-[70] flex items-end" style={{ background: "rgba(4,11,22,0.7)" }} onClick={() => setFiltersOpen(false)}>
          <div className="w-full rounded-t-2xl p-5 pb-8" onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--pp-bg-surface, #0A1628)", border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.28))" }}>
            <div className="flex justify-between items-center mb-4">
              <span className="text-[15px] font-bold" style={{ color: "var(--pp-text-primary, #E8EDF5)" }}>{fr ? "Filtres" : "Filters"}</span>
              <button onClick={() => setFiltersOpen(false)} aria-label={fr ? "Fermer" : "Close"}><X className="w-4 h-4" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }} /></button>
            </div>

            <div className="mb-4">
              <div className="text-[12px] mb-2" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{fr ? "Type de commission" : "Commission type"}</div>
              <div className="flex flex-wrap gap-2">
                {COMMISSION_TYPES.map((t) => (
                  <button key={t} onClick={() => setCommissionType(t)}
                    className="px-3 py-1.5 rounded-full text-[12px] font-semibold"
                    style={{
                      background: commissionType === t ? "var(--pp-brand-accent, #9B7FE8)" : "transparent",
                      color: commissionType === t ? "#0A1628" : "var(--pp-text-secondary, #B4C6D8)",
                      border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.28))",
                    }}>{t}</button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="text-[12px] mb-2" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{fr ? "Institution" : "Lender"}</div>
              <select value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-[13px]" style={selStyle}>
                <option value="">{fr ? "Toutes" : "All"}</option>
                {institutions.map((i) => <option key={i.id} value={String(i.id)}>{i.label}</option>)}
              </select>
            </div>

            {agents.length > 1 && (
              <div className="mb-4">
                <div className="text-[12px] mb-2" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{fr ? "Courtier" : "Broker"}</div>
                <select value={agentId} onChange={(e) => setAgentId(e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-[13px]" style={selStyle}>
                  <option value="">{fr ? "Tous les courtiers" : "All brokers"}</option>
                  {agents.map((a) => <option key={a.users_id} value={String(a.users_id)}>{a.name}</option>)}
                </select>
              </div>
            )}

            <div className="mb-4">
              <div className="text-[12px] mb-2" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{fr ? "Type de partage" : "Split type"}</div>
              <select value={splitType} onChange={(e) => setSplitType(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-[13px]" style={selStyle}>
                <option value="">{fr ? "Tous" : "All"}</option>
                {SPLIT_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="mb-4">
              <div className="text-[12px] mb-2" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{fr ? "Préfixe de contrat" : "Contract prefix"}</div>
              <input value={numberPrefix} onChange={(e) => setNumberPrefix(e.target.value)} inputMode="text"
                placeholder={fr ? "ex. 2026" : "e.g. 2026"}
                className="w-full rounded-xl px-3 py-2.5 text-[13px]" style={selStyle} />
            </div>

            <div className="mb-5 flex gap-2">
              <div className="flex-1">
                <div className="text-[12px] mb-2" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{fr ? "Trier par" : "Order by"}</div>
                <select value={orderBy} onChange={(e) => setOrderBy(e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-[13px]" style={selStyle}>
                  {ORDER_BY.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ width: 110 }}>
                <div className="text-[12px] mb-2" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{fr ? "Sens" : "Sort"}</div>
                <select value={sortDir} onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
                  className="w-full rounded-xl px-3 py-2.5 text-[13px]" style={selStyle}>
                  <option value="desc">desc</option>
                  <option value="asc">asc</option>
                </select>
              </div>
            </div>

            <button onClick={() => { setFiltersOpen(false); load(); }}
              className="w-full py-3 rounded-xl text-[14px] font-bold" style={{ minHeight: 44, background: "var(--pp-brand-accent, #9B7FE8)", color: "#0A1628" }}>
              {fr ? "Appliquer" : "Apply"}
            </button>

          </div>
        </div>
      )}

      {/* Détail d'un dépôt (lecture seule) */}
      {detail && (
        <div className="fixed inset-0 z-[75] flex items-end" style={{ background: "rgba(4,11,22,0.7)" }} onClick={() => setDetail(null)}>
          <div className="w-full rounded-t-2xl p-5 pb-8 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--pp-bg-surface, #0A1628)", border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.28))", WebkitOverflowScrolling: "touch" }}>
            <div className="flex justify-between items-center mb-4">
              <span className="text-[15px] font-bold" style={{ color: "var(--pp-text-primary, #E8EDF5)" }}>{fr ? "Détail du dépôt" : "Deposit detail"}</span>
              <button onClick={() => setDetail(null)} aria-label={fr ? "Fermer" : "Close"} style={{ minWidth: 44, minHeight: 44 }}>
                <X className="w-4 h-4" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }} />
              </button>
            </div>
            <div className="space-y-2">
              {([
                [fr ? "Contrat" : "Contract", detail.number],
                [fr ? "Date" : "Date", detail.date_trans ? String(detail.date_trans).slice(0, 10) : null],
                [fr ? "Institution" : "Lender", detail.institution],
                [fr ? "Client" : "Client", detail.primary_client_name],
                [fr ? "Co-emprunteur" : "Co-borrower", detail.secondary_client_name],
                [fr ? "Montant" : "Amount", cad2(numOf(detail.amount))],
                [fr ? "Montant du prêt" : "Loan amount", cad2(numOf(detail.loan_amt))],
                ["Points", detail.points],
                ["Buy down", detail.buy_down],
                [fr ? "Type de commission" : "Commission type", detail.commission_type],
                [fr ? "Type de partage" : "Split type", detail.split_type],
                [fr ? "Type de prêt" : "Mortgage type", detail.mortgage_type],
                [fr ? "Terme" : "Term", detail.term],
                [fr ? "Courtier" : "Broker", detail.agent_name],
                [fr ? "Cible" : "Target", detail.target_name],
                [fr ? "Cabinet" : "Firm", detail.cabinet ?? detail.agent_company],
                [fr ? "Ajustement" : "Adjustment", Number(detail.is_adjustment) === 1 ? (fr ? "Oui" : "Yes") : (fr ? "Non" : "No")],
              ] as [string, unknown][]).filter(([, v]) => v != null && String(v).trim() !== "").map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 text-[12.5px]">
                  <span style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{k}</span>
                  <span className="text-right font-semibold" style={{ color: "var(--pp-text-primary, #E8EDF5)" }}>{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Shell>

  );
}

function Shell({ title, onBack, right, children }: { title: string; onBack: () => void; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-full px-4 pt-3 pb-24">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} aria-label="Retour" className="p-2 -ml-2 rounded-lg" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-[16px] font-bold" style={{ color: "var(--pp-text-primary, #E8EDF5)" }}>{title}</h1>
        <div className="min-w-[40px] flex justify-end">{right}</div>
      </div>
      {children}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 mb-3" style={{ background: "var(--pp-bg-surface, #0A1628)", border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.22))" }}>
      <div className="text-[13px] font-bold mb-3" style={{ color: "var(--pp-text-primary, #E8EDF5)" }}>{title}</div>
      {children}
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl p-3" style={{ background: "var(--pp-bg-surface, #0A1628)", border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.22))" }}>
      <div className="flex items-center gap-1.5 mb-1.5" style={{ color: "var(--pp-brand-accent, #9B7FE8)" }}>
        {icon}<span className="text-[11.5px]" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{label}</span>
      </div>
      <div className="text-[17px] font-bold" style={{ color: "var(--pp-text-primary, #E8EDF5)" }}>{value}</div>
    </div>
  );
}

function DateInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex-1 text-[11.5px]" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>
      {label}
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 rounded-xl px-3 py-2 text-[13px]"
        style={{ background: "rgba(155,127,232,0.08)", border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.28))", color: "var(--pp-text-primary, #E8EDF5)" }} />
    </label>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="rounded-2xl p-6 text-center" style={{ background: "var(--pp-bg-surface, #0A1628)", border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.22))" }}>
      <div className="flex justify-center mb-2" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{icon}</div>
      <p className="text-[13px]" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{text}</p>
    </div>
  );
}
