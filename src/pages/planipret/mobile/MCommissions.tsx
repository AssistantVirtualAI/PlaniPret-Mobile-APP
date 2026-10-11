// MCommissions — rapports de commissions Planiprêt (API officielle Maestro).
// Données financières sensibles : lecture seule, aucune donnée mise en cache
// hors de la session, aucun jeton Maestro côté client.
import PendingCommissionsCard, { TeamSplitPanel } from "@/components/planipret/commissions/PendingCommissionsCard";
import PaidDepositsCard from "@/components/planipret/commissions/PaidDepositsCard";
import RegisterCommissions from "@/components/planipret/commissions/RegisterCommissions";
import { useCommissionLive } from "@/hooks/useCommissionLive";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, RefreshCw, SlidersHorizontal, TrendingUp, Wallet,
  Building2, Receipt, X, Bot, AlertTriangle,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import MCommissionCharts from "@/components/planipret/mobile/MCommissionCharts";
import type { PlanipretMobileContext } from "../PlanipretMobile";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { tr } from "@/lib/i18n/tr";
import { isStatsCacheFresh, readStatsCache, statsCacheKey, writeStatsCache } from "@/lib/planipret/commissionsCache";
import { ppEdgeInvoke } from "@/lib/planipret/ppEdge";
import { Button } from "@/components/ui/button";

type Period = "month" | "quarter" | "year" | "ytd" | "custom";
type Validation = { status: "MATCH" | "WARNING" | "BLOCKED"; checked_at: string; summary?: string };

type Summary = {
  total_commission: number;
  deposit_count: number;
  deal_count: number;
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

function commissionErrorMessage(error: unknown, payload: any, fr: boolean) {
  const code = String(payload?.error ?? error ?? "").trim();
  const message = String(payload?.message ?? error ?? "").trim();
  if (code === "admin_scope_unavailable") {
    return fr ? "La vue « Tous les courtiers » requiert un accès Maestro administrateur. Vos commissions personnelles restent disponibles." : "The All brokers view requires Maestro administrator access. Your personal commissions remain available.";
  }
  if (/failed to send|failed to fetch|networkerror|load failed/i.test(message)) {
    return fr ? "La connexion aux commissions est temporairement indisponible. Réessayez dans un instant." : "The commission connection is temporarily unavailable. Try again shortly.";
  }
  return message || (fr ? "Les commissions sont temporairement indisponibles." : "Commissions are temporarily unavailable.");
}
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
  if (period === "year") return { from: `${now.getFullYear()}-01-01`, to: iso(now) };
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
  const [section, setSection] = useState<"pending" | "paid">("paid");

  // Deep-link AVA : /mplanipret/commissions?period=…&commission_type=…
  const [sp] = useSearchParams();
  const spPeriod = sp.get("period");
  const [period, setPeriod] = useState<Period>(
    (["month", "quarter", "year", "ytd", "custom"] as string[]).includes(String(spPeriod)) ? (spPeriod as Period) : "month",
  );
  const [customFrom, setCustomFrom] = useState(sp.get("date_from") ?? "");
  const [customTo, setCustomTo] = useState(sp.get("date_to") ?? "");
  const [commissionType, setCommissionType] = useState<string>(
    (COMMISSION_TYPES as readonly string[]).includes(String(sp.get("commission_type"))) ? String(sp.get("commission_type")) : "",
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

  const [paidSplit, setPaidSplit] = useState<any>(null);
  const [paidValidation, setPaidValidation] = useState<Validation | null>(null);
  const [rows, setRows] = useState<DepositRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopeNotice, setScopeNotice] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Sheet edits a draft; reports reload only on « Appliquer ».
  type Draft = { commissionType: string; institutionId: string; agentId: string; splitType: string; numberPrefix: string; orderBy: string; sortDir: "asc" | "desc" };
  const [draft, setDraft] = useState<Draft>({ commissionType: "", institutionId: "", agentId: "", splitType: "", numberPrefix: "", orderBy: "date_trans", sortDir: "desc" });
  const [avaPref, setAvaPref] = useState<boolean | null>(null);
  const [chartRefreshToken, setChartRefreshToken] = useState(0);

  const range = useMemo(() => rangeFor(period, customFrom, customTo), [period, customFrom, customTo]);
  const rangeReady = period !== "custom" || (!!customFrom && !!customTo);

  const filters = useMemo(() => ({
    date_from: range.from,
    date_to: range.to,
    ...(commissionType ? { commission_type: commissionType } : {}),
    order_by: orderBy,
    sort: sortDir,
    ...(institutionId ? { financial_inst_id: institutionId } : {}),
    ...(splitType ? { split_type: splitType } : {}),
    ...(numberPrefix.trim() ? { number_prefix: numberPrefix.trim() } : {}),
    ...(agentId ? { users_id: agentId } : {}),
  }), [range.from, range.to, commissionType, institutionId, splitType, numberPrefix, orderBy, sortDir, agentId]);

  // Cache keys include the signed-in user and complete filter set. Commission
  // rows are never shared across brokers on a device.
  const cacheScope = String(profile?.user_id ?? profile?.id ?? "anonymous");
  const reportCacheKey = useMemo(
    () => statsCacheKey(isAdmin ? "admin" : "broker", [cacheScope, "paid-fundings-v4", JSON.stringify(filters)]),
    [isAdmin, cacheScope, filters],
  );
  const metadataCacheKey = useMemo(
    () => statsCacheKey(isAdmin ? "admin" : "broker", [cacheScope, "metadata"]),
    [isAdmin, cacheScope],
  );


  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error: fnErr } = await ppEdgeInvoke<any>("planipret-commission-reports", body, { retries: 1 });
    if (fnErr) throw new Error(commissionErrorMessage(fnErr.message, data, fr));
    if (data?.error || data?.success === false || data?.ok === false) {
      throw new Error(commissionErrorMessage(data?.error, data, fr));
    }
    return data;
  }, [fr]);

  // Latest request wins: a response for an older filter key is never published.
  const loadGen = useRef(0);
  const moreInflight = useRef<string | null>(null);
  useEffect(() => () => { loadGen.current += 1; }, []);
  const load = useCallback(async (force = false) => {
    if (!allowed || !rangeReady || section !== "paid") return;
    const gen = ++loadGen.current;
    const stale = () => gen !== loadGen.current;
    moreInflight.current = null; setLoadingMore(false);
    const cached = readStatsCache(reportCacheKey);
    const cachedReport = cached?.value as { summary?: Summary; rows?: DepositRow[]; total?: number } | undefined;
    if (cachedReport) {
      setPaidValidation((cachedReport as any).validation ?? null);
      setPaidSplit((cachedReport as any).paid_split ?? null);
      setSummary(cachedReport.summary ?? null);
      setRows(cachedReport.rows ?? []);
      setTotal(cachedReport.total ?? 0);
      setPage(1);
      setLoading(false);
    }
    if (!force && isStatsCacheFresh(cached)) return;
    if (!cachedReport) setLoading(true);
    setError(null);
    try {
      const [s, d] = await Promise.all([
        call({ action: "summary", filters }),
        call({ action: "deposits", filters: { ...filters, page: 1, per_page: PER_PAGE } }),
      ]);
      if (stale()) return;
      setScopeNotice(isAdmin && !agentId && s?.scope?.mode === "own"
        ? "Accès Maestro administrateur manquant : seules vos commissions personnelles sont affichées, pas celles de tous les courtiers."
        : null);
      setPaidSplit(s?.paid_split ?? null);
      setPaidValidation(s?.validation ?? null);
      setSummary(s.summary);
      setRows(d.rows ?? []);
      setTotal(d.pagination?.total ?? 0);
      setPage(1);
      writeStatsCache(reportCacheKey, {
        summary: s.summary ?? null,
        paid_split: s?.paid_split ?? null,
        validation: s?.validation ?? null,
        rows: d.rows ?? [],
        total: d.pagination?.total ?? 0,
      });
      if (force) setChartRefreshToken((value) => value + 1);
    } catch (e) {
      if (stale()) return;
      setError((e as Error).message);
      // Keep the last known report on screen. A temporary Maestro outage must
      // never turn a populated commissions page into an empty error screen.
      if (!cachedReport) { setSummary(null); setRows([]); setTotal(0); }
    } finally {
      if (!stale()) setLoading(false);
    }
  }, [allowed, rangeReady, section, filters, call, reportCacheKey, isAdmin, agentId]);

  useEffect(() => { load(); }, [load]);
  // Near real-time: the server announces new figures; re-read the scoped snapshot.
  const loadRef = useRef(load);
  loadRef.current = load;
  useCommissionLive(() => { void loadRef.current(true); });

  useEffect(() => {
    if (!allowed || section !== "paid") return;
    const cached = readStatsCache(metadataCacheKey);
    const cachedMetadata = cached?.value as { avaPref?: boolean | null; institutions?: { id: number; label: string }[]; agents?: { users_id: number; name: string }[] } | undefined;
    if (cachedMetadata) {
      setAvaPref(cachedMetadata.avaPref ?? null);
      setInstitutions(cachedMetadata.institutions ?? []);
      setAgents(cachedMetadata.agents ?? []);
    }
    if (isStatsCacheFresh(cached)) return;
    Promise.all([
      call({ action: "preference" }),
      call({ action: "institutions" }),
      call({ action: "agents" }),
    ]).then(([preference, institutionData, agentData]) => {
      const next = {
        avaPref: preference.ava_include_commissions === true,
        institutions: institutionData.institutions ?? [],
        agents: agentData.agents ?? [],
      };
      setAvaPref(next.avaPref);
      setInstitutions(next.institutions);
      setAgents(next.agents);
      writeStatsCache(metadataCacheKey, next);
    }).catch(() => {
      if (!cachedMetadata) { setAvaPref(null); setInstitutions([]); setAgents([]); }
    });
  }, [allowed, section, call, metadataCacheKey]);


  const openFilters = () => {
    setDraft({ commissionType, institutionId, agentId, splitType, numberPrefix, orderBy, sortDir });
    setFiltersOpen(true);
  };
  const applyDraft = () => {
    setCommissionType(draft.commissionType); setInstitutionId(draft.institutionId); setAgentId(draft.agentId);
    setSplitType(draft.splitType); setNumberPrefix(draft.numberPrefix); setOrderBy(draft.orderBy); setSortDir(draft.sortDir);
    setFiltersOpen(false);
  };

  const loadMore = async () => {
    const key = `${reportCacheKey}|${page + 1}`;
    if (moreInflight.current === key || rows.length >= total) return;
    moreInflight.current = key;
    const gen = loadGen.current;
    setLoadingMore(true);
    try {
      const d = await call({ action: "deposits", filters: { ...filters, page: page + 1, per_page: PER_PAGE } });
      if (gen !== loadGen.current) return;
      setRows((prev) => [...prev, ...(d.rows ?? [])]);
      setPage((p) => p + 1);
    } catch (e) {
      if (gen === loadGen.current) setError((e as Error).message);
    } finally {
      if (moreInflight.current === key) moreInflight.current = null;
      if (gen === loadGen.current) setLoadingMore(false);
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
          <button onClick={openFilters} aria-label={fr ? "Filtres" : "Filters"} className="p-2 rounded-lg" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button onClick={() => load(true)} aria-label={fr ? "Rafraîchir" : "Refresh"} className="p-2 rounded-lg" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      }
    >
      <div role="tablist" aria-label={fr ? "Statut des commissions" : "Commission status"} className="grid grid-cols-2 gap-2 mb-3 sticky top-0 z-20 py-2" style={{ background: "var(--pp-bg-deep, #07111f)" }}>
        <Button role="tab" aria-selected={section === "pending"} variant={section === "pending" ? "default" : "outline"} onClick={() => setSection("pending")} className="min-h-11">
          {fr ? "En attente" : "Pending"}
        </Button>
        <Button role="tab" aria-selected={section === "paid"} variant={section === "paid" ? "default" : "outline"} onClick={() => setSection("paid")} className="min-h-11">
          {fr ? "Déboursées" : "Paid"}
        </Button>
      </div>

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

      {section === "paid" && scopeNotice && !error && (
        <div role="status" className="rounded-xl px-3 py-3 mb-3 text-[13px]" style={{ background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.4)", color: "#FFD89A" }}>
          {scopeNotice}
        </div>
      )}

      {section === "paid" && error && (
        <div className="rounded-xl px-3 py-3 mb-3 text-[13px]" style={{ background: "rgba(232,76,76,0.12)", border: "1px solid rgba(232,76,76,0.4)", color: "#FFB4B4" }}>
          {error}
        </div>
      )}

      {section === "paid" && (
        <div className="mb-4">
          <PaidDepositsCard lang={fr ? "fr" : "en"} scope={isAdmin ? "admin" : "broker"} />
          <h2 className="flex items-center gap-2 text-base font-bold mt-5 mb-3">{fr ? "Analyse détaillée" : "Detailed analysis"}</h2>
          <RegisterCommissions lang={fr ? "fr" : "en"} scope={isAdmin ? "admin" : "broker"} />
          <Button variant="outline" className="w-full min-h-11 mt-3" onClick={() => navigate("tableaux")}>
            {fr ? "Graphiques par courtier" : "Broker charts"}
          </Button>
        </div>
      )}
      {section === "paid" && (loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "var(--pp-bg-surface, #0A1628)" }} />)}
        </div>
      ) : summary ? (
        <>
          <SectionTitle color="var(--pp-success, #34D399)" title={fr ? "Commissions déboursées" : "Paid commissions"} sub={fr ? "Déjà versées par Maestro" : "Already paid by Maestro"} />
          {paidValidation && <ValidationPill validation={paidValidation} fr={fr} />}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Kpi icon={<Wallet className="w-4 h-4" />} label={fr ? "Commissions" : "Commissions"} value={cad(summary.total_commission)} />
            <Kpi icon={<Receipt className="w-4 h-4" />} label={fr ? "Unités uniques" : "Unique units"} value={String(summary.deal_count)} />
            <Kpi icon={<TrendingUp className="w-4 h-4" />} label={fr ? "Moyenne" : "Average"} value={cad(summary.average_commission)} />
            <Kpi icon={<Building2 className="w-4 h-4" />} label={fr ? "Volume de prêts" : "Loan volume"} value={cad(summary.total_loan_volume)} />
          </div>

          {summary.truncated && (
            <p className="text-[11.5px] mb-3" style={{ color: "#F0B429" }}>
              {fr ? "Résultats partiels : affinez la période pour un total exact." : "Partial results: narrow the period for an exact total."}
            </p>
          )}

          {paidSplit && <div className="mb-4"><TeamSplitPanel split={paidSplit} fr={fr} title={fr ? "Déboursé — moi et mon équipe" : "Paid — me and my team"} /></div>}
              <MCommissionCharts filters={filters} lang={lang} cacheScope={cacheScope} refreshToken={chartRefreshToken} />

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
      ) : null)}

      {section === "pending" && <>
        <SectionTitle color="var(--pp-warning, #F0B429)" title={fr ? "Commissions en attente" : "Pending commissions"} sub={fr ? "À recevoir" : "To be received"} />
        <PendingCommissionsCard filters={filters} lang={lang === "en" ? "en" : "fr"} cacheScope={cacheScope} refreshToken={chartRefreshToken} />
      </>}

      {/* Filtres */}
      {filtersOpen && (
        <div className="fixed inset-0 z-[70] flex items-end" style={{ background: "rgba(4,11,22,0.7)" }} onClick={() => setFiltersOpen(false)}>
          <div data-pp-sheet role="dialog" aria-modal="true" className="w-full rounded-t-2xl p-5 min-h-0 overflow-y-auto overscroll-contain" onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - 16px)", paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))", background: "var(--pp-bg-surface, #0A1628)", border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.28))" }}>
            <div className="flex justify-between items-center mb-4">
              <span className="text-[15px] font-bold" style={{ color: "var(--pp-text-primary, #E8EDF5)" }}>{fr ? "Filtres" : "Filters"}</span>
              <button onClick={() => setFiltersOpen(false)} aria-label={fr ? "Fermer" : "Close"}><X className="w-4 h-4" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }} /></button>
            </div>

            <div className="mb-4">
              <div className="text-[12px] mb-2" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{fr ? "Type de commission" : "Commission type"}</div>
              <div className="flex flex-wrap gap-2">
                <Button variant={commissionType === "" ? "default" : "outline"} size="sm" onClick={() => setCommissionType("")}>
                  {fr ? "Tous les types" : "All types"}
                </Button>
                {COMMISSION_TYPES.map((t) => (
                  <button key={t} onClick={() => setDraft((d) => ({ ...d, commissionType: t }))}
                    className="px-3 py-1.5 rounded-full text-[12px] font-semibold"
                    style={{
                      background: draft.commissionType === t ? "var(--pp-brand-accent, #9B7FE8)" : "transparent",
                      color: draft.commissionType === t ? "#0A1628" : "var(--pp-text-secondary, #B4C6D8)",
                      border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.28))",
                    }}>{t}</button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="text-[12px] mb-2" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{fr ? "Institution" : "Lender"}</div>
              <select value={draft.institutionId} onChange={(e) => setDraft((d) => ({ ...d, institutionId: e.target.value }))}
                className="w-full rounded-xl px-3 py-2.5 text-[13px]" style={selStyle}>
                <option value="">{fr ? "Toutes" : "All"}</option>
                {institutions.map((i) => <option key={i.id} value={String(i.id)}>{i.label}</option>)}
              </select>
            </div>

            {agents.length > 1 && (
              <div className="mb-4">
                <div className="text-[12px] mb-2" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{fr ? "Courtier" : "Broker"}</div>
                <select value={draft.agentId} onChange={(e) => setDraft((d) => ({ ...d, agentId: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2.5 text-[13px]" style={selStyle}>
                  <option value="">{fr ? "Tous les courtiers" : "All brokers"}</option>
                  {agents.map((a) => <option key={a.users_id} value={String(a.users_id)}>{a.name}</option>)}
                </select>
              </div>
            )}

            <div className="mb-4">
              <div className="text-[12px] mb-2" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{fr ? "Type de partage" : "Split type"}</div>
              <select value={draft.splitType} onChange={(e) => setDraft((d) => ({ ...d, splitType: e.target.value }))}
                className="w-full rounded-xl px-3 py-2.5 text-[13px]" style={selStyle}>
                <option value="">{fr ? "Tous" : "All"}</option>
                {SPLIT_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="mb-4">
              <div className="text-[12px] mb-2" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{fr ? "Préfixe de contrat" : "Contract prefix"}</div>
              <input value={draft.numberPrefix} onChange={(e) => setDraft((d) => ({ ...d, numberPrefix: e.target.value }))} inputMode="text"
                placeholder={fr ? "ex. 2026" : "e.g. 2026"}
                className="w-full rounded-xl px-3 py-2.5 text-[13px]" style={selStyle} />
            </div>

            <div className="mb-5 flex gap-2">
              <div className="flex-1">
                <div className="text-[12px] mb-2" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{fr ? "Trier par" : "Order by"}</div>
                <select value={draft.orderBy} onChange={(e) => setDraft((d) => ({ ...d, orderBy: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2.5 text-[13px]" style={selStyle}>
                  {ORDER_BY.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ width: 110 }}>
                <div className="text-[12px] mb-2" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>{fr ? "Sens" : "Sort"}</div>
                <select value={draft.sortDir} onChange={(e) => setDraft((d) => ({ ...d, sortDir: e.target.value as "asc" | "desc" }))}
                  className="w-full rounded-xl px-3 py-2.5 text-[13px]" style={selStyle}>
                  <option value="desc">desc</option>
                  <option value="asc">asc</option>
                </select>
              </div>
            </div>

            <button onClick={applyDraft}
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

function ValidationPill({ validation, fr }: { validation: Validation; fr: boolean }) {
  const warning = validation.status === "WARNING";
  return <div title={validation.summary} className="inline-flex rounded-full px-2.5 py-1 mb-2 text-[10.5px] font-bold" style={{ color: warning ? "var(--pp-warning, #F0B429)" : "var(--pp-success, #34D399)", background: warning ? "rgba(240,180,41,.10)" : "rgba(52,211,153,.10)", border: `1px solid ${warning ? "rgba(240,180,41,.35)" : "rgba(52,211,153,.35)"}` }}>{warning ? (fr ? "Contrôlé avec réserve" : "Checked with warning") : (fr ? "Maestro contrôlé" : "Maestro checked")}</div>;
}

function Shell({ title, onBack, right, children }: { title: string; onBack: () => void; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-full px-4 pt-3 pb-24">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} aria-label={tr("Retour", "Back")} className="p-2 -ml-2 rounded-lg" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>
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

function SectionTitle({ title, sub, color }: { title: string; sub: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mt-2 mb-2.5">
      <span className="w-1.5 h-6 rounded-full" style={{ background: color }} />
      <div className="min-w-0">
        <div className="text-[15px] font-bold leading-tight" style={{ color: "var(--pp-text-primary, #E8EDF5)" }}>{title}</div>
        <div className="text-[11px]" style={{ color: "var(--pp-text-muted, #8597AD)" }}>{sub}</div>
      </div>
    </div>
  );
}
