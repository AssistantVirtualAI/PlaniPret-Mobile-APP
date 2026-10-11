// Commissions en attente — même passerelle, même portée et même mémoire
// hors-ligne que les commissions déposées (action `pending`).
import DataQualityLine from "./DataQualityLine";
import { useEffect, useMemo, useState } from "react";
import { useCommissionLive } from "@/hooks/useCommissionLive";
import {
  ArrowDownAZ,
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  Hourglass,
  BarChart3,
  Download,
  RefreshCw,
  Landmark,
  Search,
  Users,
  WalletCards,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Line } from "recharts";
import { Button } from "@/components/ui/button";
import "./pendingCommissions.css";
import { readStatsCache, statsCacheKey, writeStatsCache, isStatsCacheFresh } from "@/lib/planipret/commissionsCache";
import { ppEdgeInvoke } from "@/lib/planipret/ppEdge";

type CommissionType = { type: string; label: string; amount: number };
type SplitPart = { amount: number; files: number; volume: number };
type TeamMember = SplitPart & { id: string; name: string };
type Split = { personal: SplitPart; team: SplitPart; team_members: TeamMember[] };
type BrokerRow = { users_id: number; name: string; amount: number; files: number; volume: number; personal?: SplitPart; team?: SplitPart; team_members?: TeamMember[] };
type SortKey = "amount" | "name" | "files" | "volume";
type Validation = { status: "MATCH" | "WARNING" | "BLOCKED"; checked_at: string; summary?: string };

type Summary = {
  total_commission: number;
  deposit_count: number;
  deal_count?: number;
  total_loan_volume: number;
  by_date?: { date: string; amount: number; count: number }[];
  truncated?: boolean;
  official_total?: number | null;
  official_by_type?: CommissionType[] | null;
  split?: Split | null;
};

const cad = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n || 0);

const exactCad = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const compactCad = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

const TONES = ["var(--pp-brand-accent-2)", "var(--pp-success)", "var(--pp-warning)", "var(--pp-agent)", "var(--pp-brand-accent)", "var(--pp-danger)"];

function monthLabel(value: string, fr: boolean) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat(fr ? "fr-CA" : "en-CA", { month: "short" }).format(new Date(year, month - 1, 1)).replace(".", "");
}

function PendingTooltip({ active, payload, label, fr }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 shadow-lg" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
      <div className="text-[11px] mb-0.5" style={{ color: "var(--pp-text-muted)" }}>{label}</div>
      <div className="text-[13px] font-bold" style={{ color: "var(--pp-warning)" }}>{cad(Number(payload[0]?.value ?? 0))}</div>
      {payload[0]?.payload?.files > 0 && (
        <div className="text-[11px] mt-0.5" style={{ color: "var(--pp-text-secondary)" }}>
          {payload[0].payload.files} {fr ? "dossiers" : "files"}
        </div>
      )}
    </div>
  );
}

export default function PendingCommissionsCard({ lang = "fr", filters, cacheScope = "default", refreshToken = 0 }: {
  lang?: "fr" | "en";
  filters?: { date_from?: string; date_to?: string; users_id?: string; financial_inst_id?: string };
  cacheScope?: string;
  refreshToken?: number;
}) {
  const fr = lang !== "en";
  const [agent, setAgent] = useState("");
  const [tab, setTab] = useState<"overview" | "brokers" | "monthly" | "types">("overview");
  const [reload, setReload] = useState(0);
  // Near real-time: refetch the scoped snapshot when the server reports new figures.
  useCommissionLive(() => setReload((n) => n + 1));
  const [brokers, setBrokers] = useState<BrokerRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [brokerSearch, setBrokerSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("amount");
  const ownPeriod = !(filters?.date_from && filters?.date_to);
  const nowY = new Date().getFullYear();
  const [pYear, setPYear] = useState(nowY);
  const [pGran, setPGran] = useState<"year" | "quarter" | "month">("year");
  const [pIdx, setPIdx] = useState(1);
  const [view, setView] = useState<"all" | "personal" | "team">("all");
  const f = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const last = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    const own = pGran === "year" ? { date_from: `${pYear}-01-01`, date_to: `${pYear}-12-31` }
      : pGran === "quarter" ? { date_from: `${pYear}-${pad((pIdx - 1) * 3 + 1)}-01`, date_to: `${pYear}-${pad(pIdx * 3)}-${last(pYear, pIdx * 3)}` }
      : { date_from: `${pYear}-${pad(pIdx)}-01`, date_to: `${pYear}-${pad(pIdx)}-${last(pYear, pIdx)}` };
    const base = filters?.date_from && filters?.date_to ? { date_from: filters.date_from, date_to: filters.date_to } : own;
    return {
      ...base,
      ...((agent || filters?.users_id) ? { users_id: agent || filters?.users_id } : {}),
      ...(filters?.financial_inst_id ? { financial_inst_id: filters.financial_inst_id } : {}),
    };
  }, [filters?.date_from, filters?.date_to, filters?.users_id, filters?.financial_inst_id, agent, ownPeriod, pYear, pGran, pIdx]);
  const cacheRole = cacheScope === "admin" || cacheScope === "default" ? "admin" : "broker";
  const key = statsCacheKey(cacheRole, ["pending-official-v2", cacheScope, f.date_from, f.date_to, f.users_id ?? "", f.financial_inst_id ?? ""]);
  const [summary, setSummary] = useState<Summary | null>(() => ((readStatsCache(key)?.value as any)?.summary as Summary) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validation, setValidation] = useState<Validation | null>(() => ((readStatsCache(key)?.value as any)?.validation as Validation) ?? null);

  useEffect(() => {
    let cancelled = false;
    const cached = readStatsCache(key);
    if (cached?.value) {
      setSummary((cached.value as any).summary ?? null);
      setValidation((cached.value as any).validation ?? null);
      if (!agent) setBrokers((cached.value as any).brokers ?? null);
    } else {
      // Never show the previous scope's numbers under another broker's name.
      setSummary(null);
      setValidation(null);
    }
    if (refreshToken === 0 && reload === 0 && isStatsCacheFresh(cached)) return;
    setLoading(!cached?.value);
    setError(null);
    (async () => {
      const r = await ppEdgeInvoke("planipret-commission-reports", { action: "pending", filters: f }, { retries: 1, timeoutMs: agent || filters?.users_id ? 30_000 : 60_000 });
      if (cancelled) return;
      const d = r.data as any;
      if (r.error || !d || d.success === false || d.ok !== true) {
        setError(d?.message ?? (fr ? "Commissions en attente indisponibles pour le moment." : "Pending commissions unavailable right now."));
        return;
      }
      setSummary(d.summary);
      setValidation(d.validation ?? null);
      if (!agent) setBrokers(Array.isArray(d.brokers) ? d.brokers : null);
      writeStatsCache(key, { summary: d.summary, brokers: d.brokers ?? null, validation: d.validation ?? null });
    })()
      .catch(() => { if (!cancelled) setError(fr ? "Commissions en attente indisponibles pour le moment." : "Pending commissions unavailable right now."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshToken, reload]);

  const months = useMemo(() => {
    const values = new Map<string, { amount: number; files: number }>();
    for (const row of summary?.by_date ?? []) {
      const month = String(row.date).slice(0, 7);
      const previous = values.get(month) ?? { amount: 0, files: 0 };
      values.set(month, { amount: previous.amount + Number(row.amount || 0), files: previous.files + Number(row.count || 0) });
    }
    return [...values.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({ month, label: monthLabel(month, fr), amount: Math.round(values.amount * 100) / 100, files: values.files }));
  }, [summary, fr]);

  const types = useMemo(() => summary?.official_by_type ?? [], [summary]);
  const officialTotal = Number(summary?.official_total ?? summary?.total_commission ?? 0);
  const dealCount = Number(summary?.deal_count ?? summary?.deposit_count ?? 0);
  const selectedBroker = brokers?.find((broker) => String(broker.users_id) === agent) ?? null;
  const isAdminView = Boolean(brokers?.length);
  const filteredBrokers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(fr ? "fr-CA" : "en-CA");
    const pick = (b: BrokerRow) => view === "personal" ? (b.personal?.amount ?? 0) : view === "team" ? (b.team?.amount ?? 0) : b.amount;
    return [...(brokers ?? [])]
      .map((b) => ({ ...b, amount: pick(b) }))
      .filter((b) => view !== "team" || (b.team_members?.length ?? 0) > 0)
      .filter((broker) => !query || broker.name.toLocaleLowerCase(fr ? "fr-CA" : "en-CA").includes(query))
      .sort((a, b) => sort === "name"
        ? a.name.localeCompare(b.name, fr ? "fr" : "en")
        : Number(b[sort] ?? 0) - Number(a[sort] ?? 0));
  }, [brokers, search, sort, fr, view]);

  const rangeLabel = `${new Intl.DateTimeFormat(fr ? "fr-CA" : "en-CA", { month: "short", year: "numeric" }).format(new Date(`${f.date_from}T12:00:00`))} – ${new Intl.DateTimeFormat(fr ? "fr-CA" : "en-CA", { month: "short", year: "numeric" }).format(new Date(`${f.date_to}T12:00:00`))}`;

  const exportCsv = () => {
    const rows = tab === "brokers" ? [[fr ? "Courtier" : "Broker", "Commission", fr ? "Personnel" : "Personal", fr ? "Équipe" : "Team", fr ? "Dossiers" : "Files", "Volume"], ...filteredBrokers.map(b => [b.name, b.amount, b.personal?.amount ?? "", b.team?.amount ?? "", b.files, b.volume])] : tab === "types" ? [["Type", "Commission"], ...types.map(t => [t.label, t.amount])] : [[fr ? "Mois" : "Month", "Commission", fr ? "Dossiers" : "Files"], ...months.map(m => [m.month, m.amount, m.files])];
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${fr ? "commissions-en-attente" : "pending-commissions"}-${f.users_id ?? (fr ? "tous" : "all")}-${f.date_from}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <section className="pending-commissions" aria-label={fr ? "Commissions en attente" : "Pending commissions"} aria-busy={loading}>
      <header className="pending-header">
        <div>
          <h3 className="pending-heading"><Hourglass className="h-5 w-5" />{fr ? "Commissions en attente" : "Pending commissions"}</h3>
          <p className="text-xs mt-1 text-muted-foreground">{selectedBroker?.name ?? (isAdminView ? (fr ? "Tous les courtiers" : "All brokers") : (fr ? "Mes commissions" : "My commissions"))} · {rangeLabel}</p>
          {validation && <ValidationBadge validation={validation} fr={fr} />}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={loading} onClick={() => setReload(n => n + 1)}><RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />{fr ? "Rafraîchir" : "Refresh"}</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!summary}><Download className="h-4 w-4 mr-2" />CSV</Button>
        </div>
      </header>
      <div className="pending-toolbar" aria-label={fr ? "Filtres commissions en attente" : "Pending commission filters"}>
        {isAdminView && <>
          <label className="flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground" /><input aria-label={fr ? "Rechercher un courtier en attente" : "Search pending broker"} placeholder={fr ? "Rechercher par nom" : "Search by name"} value={brokerSearch} onChange={e => setBrokerSearch(e.target.value)} className="w-44" /></label>
          <label className="flex flex-wrap items-center gap-2 text-xs"><Users className="h-4 w-4" />{fr ? "Courtier" : "Broker"}<select aria-label={fr ? "Courtier en attente" : "Pending broker"} value={agent} onChange={e => { setAgent(e.target.value); setTab("overview"); }}><option value="">{fr ? "Vue globale — tous les courtiers" : "Global view — all brokers"}</option>{brokers?.filter(b => String(b.users_id) === agent || b.name.toLocaleLowerCase().includes(brokerSearch.trim().toLocaleLowerCase())).map(b => <option key={b.users_id} value={b.users_id}>{b.name}</option>)}</select></label>
        </>}
        {ownPeriod && <>
          <select aria-label={fr ? "Année en attente" : "Pending year"} value={pYear} onChange={e => setPYear(Number(e.target.value))}>{[nowY + 1, nowY, nowY - 1, nowY - 2].map(y => <option key={y} value={y}>{y}</option>)}</select>
          <div className="inline-flex gap-1">
            {([["year", fr ? "Année" : "Year"], ["quarter", fr ? "Trimestre" : "Quarter"], ["month", fr ? "Mois" : "Month"]] as const).map(([k,l]) => <Button key={k} variant={pGran === k ? "secondary" : "ghost"} size="sm" aria-pressed={pGran === k} onClick={() => { setPGran(k); setPIdx(k === "month" ? new Date().getMonth() + 1 : k === "quarter" ? Math.floor(new Date().getMonth() / 3) + 1 : 1); }}>{l}</Button>)}
          </div>
          {pGran !== "year" && <select aria-label={fr ? "Période en attente" : "Pending period"} value={pIdx} onChange={e => setPIdx(Number(e.target.value))}>{(pGran === "quarter" ? [1,2,3,4] : Array.from({length:12},(_,i)=>i+1)).map(i => <option key={i} value={i}>{pGran === "quarter" ? `T${i}` : new Intl.DateTimeFormat(fr ? "fr-CA" : "en-CA",{month:"long"}).format(new Date(2026,i-1,15))}</option>)}</select>}
        </>}
      </div>
      <div className="pending-tabs" role="tablist" aria-label={fr ? "Vues en attente" : "Pending views"}>
        {([["overview", fr ? "Vue d’ensemble" : "Overview", BarChart3], ...(isAdminView && !selectedBroker ? [["brokers", fr ? "Courtiers et équipes" : "Brokers and teams", Users] as const] : []), ["monthly", fr ? "Détail mensuel" : "Monthly detail", CalendarDays], ["types", fr ? "Types de commissions" : "Commission types", WalletCards]] as const).map(([k,label,Icon]) => <Button key={k} role="tab" aria-selected={tab === k} className="pending-tab" variant="ghost" size="sm" onClick={() => setTab(k as typeof tab)}><Icon className="h-4 w-4 mr-2" />{label}</Button>)}
      </div>

      {error && (
        <div role="status" className="mx-4 mt-4 rounded-lg px-3 py-2 text-[12px]" style={{ color: "var(--pp-warning)", background: "color-mix(in srgb, var(--pp-warning) 9%, transparent)", border: "1px solid color-mix(in srgb, var(--pp-warning) 28%, transparent)" }}>
          {error} {summary ? (fr ? "Les dernières données enregistrées restent affichées." : "The latest saved data remains visible.") : ""}
        </div>
      )}

      {summary ? (
        <div className="py-5 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Kpi icon={<WalletCards className="w-4 h-4" />} label={fr ? "Total en attente" : "Pending total"} value={exactCad(officialTotal)} emphasized />
            <Kpi icon={<BriefcaseBusiness className="w-4 h-4" />} label={fr ? "Dossiers" : "Files"} value={String(dealCount)} tone={TONES[1]} />
            <Kpi icon={<Landmark className="w-4 h-4" />} label={fr ? "Volume hypothécaire" : "Mortgage volume"} value={cad(summary.total_loan_volume)} tone={TONES[0]} />
            <Kpi icon={<Users className="w-4 h-4" />} label={isAdminView && !selectedBroker ? (fr ? "Courtiers" : "Brokers") : (fr ? "Moyenne par dossier" : "Average per file")} value={isAdminView && !selectedBroker ? String(brokers?.length ?? 0) : cad(dealCount ? officialTotal / dealCount : 0)} />
          </div>
          <DataQualityLine dq={(summary as any).data_quality} ai={validation as any} fr={fr} />


          {(tab === "overview" || tab === "types") && types.length > 0 && (
            <div aria-label={fr ? "Totaux officiels Maestro" : "Official Maestro totals"}>
              <h4 className="text-[13px] font-bold mb-3" style={{ color: "var(--pp-text-primary)" }}>{fr ? "Totaux officiels Maestro" : "Official Maestro totals"}</h4>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,140px),1fr))] gap-2.5">
                {types.map((item, index) => <Kpi tone={TONES[index % TONES.length]} key={item.type} icon={<WalletCards className="w-4 h-4" />} label={item.type === "override" ? (fr ? "Outrepasser" : "Override") : item.type === "external" ? (fr ? "Tiers" : "External") : item.label} value={exactCad(item.amount)} />)}
              </div>
            </div>
          )}

          {tab === "overview" && <div className="grid gap-5 xl:grid-cols-2">
            <Panel title={fr ? "Commissions mensuelles" : "Monthly commissions"} icon={<CalendarDays className="w-4 h-4" />}>
              {months.length > 0 ? (
                <>
                  <div className="h-[210px] sm:h-[250px] min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={months} margin={{ top: 10, right: 4, left: -8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="pendingCommissionBars" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--pp-warning)" stopOpacity={1} />
                            <stop offset="100%" stopColor="var(--pp-brand-accent)" stopOpacity={0.72} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 4" stroke="var(--pp-bg-border-2)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--pp-text-muted)" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "var(--pp-text-muted)" }} axisLine={false} tickLine={false} width={52} tickFormatter={(value) => compactCad(Number(value)).replace("$", "")} />
                        <Tooltip cursor={{ fill: "var(--pp-bg-elevated)", opacity: 0.45 }} content={<PendingTooltip fr={fr} />} />
                        <Bar isAnimationActive={false} dataKey="amount" name={fr ? "En attente" : "Pending"} fill="var(--pp-brand-accent-2)" radius={[5, 5, 0, 0]} maxBarSize={42} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[10.5px] mt-1" style={{ color: "var(--pp-text-faint)" }}>
                    {fr ? "Répartition selon la date de clôture des dossiers." : "Distribution based on file closing dates."}
                  </p>
                </>
              ) : <EmptyMessage fr={fr} />}
            </Panel>

            <Panel title={fr ? "Commission par type" : "Commission by type"} icon={<WalletCards className="h-4 w-4" />}>
              {types.some(t => t.amount > 0) ? <div className="h-[250px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={types.map(t => ({...t, label: t.type === "override" ? (fr ? "Outrepasser" : "Override") : t.type === "external" ? (fr ? "Tiers" : "External") : t.label}))} dataKey="amount" nameKey="label" innerRadius={55} outerRadius={85} paddingAngle={3}>{types.map((t,i) => <Cell key={t.type} fill={TONES[i % TONES.length]} />)}</Pie><Tooltip formatter={v => exactCad(Number(v))} contentStyle={{background:"var(--pp-bg-elevated)",border:"1px solid var(--pp-bg-border)"}} /><Legend wrapperStyle={{fontSize:11}} /></PieChart></ResponsiveContainer></div> : <EmptyMessage fr={fr} />}
            </Panel>
            <Panel title={fr ? "Dossiers et commissions" : "Files and commissions"} icon={<BriefcaseBusiness className="h-4 w-4" />}>
              {months.length ? <div className="h-[250px]"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={months}><CartesianGrid stroke="var(--pp-bg-border)" vertical={false} /><XAxis dataKey="label" tick={{fill:"var(--pp-text-muted)",fontSize:11}} /><YAxis yAxisId="files" allowDecimals={false} tick={{fill:"var(--pp-text-muted)",fontSize:11}} width={35} /><YAxis yAxisId="amount" orientation="right" tickFormatter={v => compactCad(Number(v))} tick={{fill:"var(--pp-text-muted)",fontSize:11}} width={65} /><Tooltip formatter={(v,n) => n === (fr ? "Dossiers" : "Files") ? Number(v) : exactCad(Number(v))} contentStyle={{background:"var(--pp-bg-elevated)",border:"1px solid var(--pp-bg-border)"}} /><Legend wrapperStyle={{fontSize:11}} /><Bar isAnimationActive={false} yAxisId="files" dataKey="files" name={fr ? "Dossiers" : "Files"} fill="var(--pp-success)" radius={[4,4,0,0]} /><Line isAnimationActive={false} yAxisId="amount" dataKey="amount" name={fr ? "Commissions ventilées" : "Allocated commissions"} stroke="var(--pp-warning)" strokeWidth={3} dot={{r:3}} /></ComposedChart></ResponsiveContainer></div> : <EmptyMessage fr={fr} />}
            </Panel>
          </div>}


          {tab === "overview" && (() => { const sp = selectedBroker?.personal && selectedBroker.team ? { personal: selectedBroker.personal, team: selectedBroker.team, team_members: selectedBroker.team_members ?? [] } : (!isAdminView || selectedBroker) ? summary.split : null; return sp ? <TeamSplitPanel split={sp} fr={fr} name={selectedBroker?.name} /> : null; })()}

          {(tab === "brokers" || tab === "overview") && !selectedBroker && brokers && brokers.length > 0 ? (
            <Panel title={fr ? "Commissions par courtier" : "Commissions by broker"} icon={<Users className="w-4 h-4" />}>
              <div className="inline-flex rounded-lg overflow-hidden mb-2" style={{ border: "1px solid var(--pp-bg-border-2)" }}>
                {([["all", fr ? "Total" : "Total"], ["personal", fr ? "Personnel" : "Personal"], ["team", fr ? "Équipe" : "Team"]] as const).map(([k, l]) => (
                  <Button variant="ghost" size="sm" aria-pressed={view === k} key={k} onClick={() => setView(k)} className="h-8 px-3 text-[12px] font-semibold" style={{ background: view === k ? "var(--pp-brand-accent-2)" : "var(--pp-bg-surface)", color: view === k ? "var(--primary-foreground)" : "var(--pp-text-secondary)" }}>{l}</Button>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <label className="relative flex-1">
                  <span className="sr-only">{fr ? "Rechercher un courtier" : "Search for a broker"}</span>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--pp-text-muted)" }} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={fr ? "Rechercher un courtier" : "Search brokers"} className="w-full h-10 pl-9 pr-3 rounded-lg text-[13px] outline-none" style={{ background: "var(--pp-bg-surface)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border-2)" }} />
                </label>
                <label className="relative sm:w-48">
                  <span className="sr-only">{fr ? "Trier les courtiers" : "Sort brokers"}</span>
                  <ArrowDownAZ className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--pp-text-muted)" }} />
                  <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="w-full h-10 pl-9 pr-3 rounded-lg text-[13px] outline-none appearance-none" style={{ background: "var(--pp-bg-surface)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border-2)" }}>
                    <option value="amount">{fr ? "Montant décroissant" : "Highest amount"}</option>
                    <option value="name">{fr ? "Nom A–Z" : "Name A–Z"}</option>
                    <option value="files">{fr ? "Nombre de dossiers" : "File count"}</option>
                    <option value="volume">{fr ? "Volume hypothécaire" : "Mortgage volume"}</option>
                  </select>
                </label>
              </div>

              <div className="hidden md:block overflow-x-auto rounded-lg" style={{ border: "1px solid var(--pp-bg-border)" }}>
                <table className="w-full min-w-[860px] text-[12px]">
                  <thead style={{ background: "var(--pp-bg-deep)", color: "var(--pp-text-muted)" }}>
                    <tr>
                      <th className="w-12 text-center py-3 font-semibold">#</th>
                      <th className="text-left py-3 font-semibold">{fr ? "Courtier" : "Broker"}</th>
                      <th className="text-right py-3 font-semibold">{fr ? "En attente" : "Pending"}</th>
                      <th className="text-right py-3 font-semibold">{fr ? "Personnel" : "Personal"}</th>
                      <th className="text-right py-3 font-semibold">{fr ? "Équipe" : "Team"}</th>
                      <th className="text-right py-3 font-semibold">{fr ? "Dossiers" : "Files"}</th>
                      <th className="text-right py-3 font-semibold">Volume</th>
                      <th className="text-right py-3 pr-4 font-semibold">{fr ? "Part" : "Share"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBrokers.map((broker, index) => <BrokerTableRow key={broker.users_id} broker={broker} rank={index + 1} total={officialTotal} onSelect={() => setAgent(String(broker.users_id))} />)}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-2">
                {filteredBrokers.map((broker, index) => <BrokerMobileRow key={broker.users_id} broker={broker} rank={index + 1} total={officialTotal} onSelect={() => setAgent(String(broker.users_id))} fr={fr} />)}
              </div>
              {filteredBrokers.length === 0 && <p className="py-6 text-center text-[12px]" style={{ color: "var(--pp-text-muted)" }}>{fr ? "Aucun courtier trouvé." : "No brokers found."}</p>}
            </Panel>
          ) : null}
          {(tab === "monthly" || tab === "overview") && months.length > 0 && <Panel title={fr ? "Détail mensuel" : "Monthly detail"} icon={<CalendarDays className="h-4 w-4" />}>
            <div className="pending-scroll"><table className="pending-table"><thead><tr><th>{fr ? "Mois de clôture" : "Closing month"}</th><th>{fr ? "Commissions ventilées" : "Allocated commissions"}</th><th>{fr ? "Dossiers" : "Files"}</th><th>{fr ? "Commission moyenne" : "Average commission"}</th></tr></thead><tbody>{months.map(m => <tr key={m.month}><td className="capitalize">{monthLabel(m.month,fr)} {m.month.slice(0,4)}</td><td>{exactCad(m.amount)}</td><td>{m.files}</td><td>{m.files ? exactCad(m.amount/m.files) : "—"}</td></tr>)}</tbody><tfoot><tr><td>{fr ? "Total ventilé" : "Allocated total"}</td><td>{exactCad(months.reduce((sum,m)=>sum+m.amount,0))}</td><td>{months.reduce((sum,m)=>sum+m.files,0)}</td><td>—</td></tr></tfoot></table></div>
          </Panel>}
          {tab === "types" && types.length > 0 && <Panel title={fr ? "Répartition officielle Maestro" : "Official Maestro breakdown"} icon={<WalletCards className="h-4 w-4" />}><div className="pending-scroll"><table className="pending-table"><thead><tr><th>{fr ? "Catégorie" : "Category"}</th><th>{fr ? "En attente" : "Pending"}</th><th>{fr ? "Part du total" : "Share of total"}</th></tr></thead><tbody>{types.map((t,i)=><tr key={t.type}><td><span style={{color:TONES[i % TONES.length]}}>● </span>{t.type === "override" ? (fr ? "Outrepasser" : "Override") : t.type === "external" ? (fr ? "Tiers" : "External") : t.label}</td><td>{exactCad(t.amount)}</td><td>{officialTotal ? (100*t.amount/officialTotal).toFixed(1) : "0.0"} %</td></tr>)}</tbody><tfoot><tr><td>{fr ? "Total officiel Maestro" : "Official Maestro total"}</td><td>{exactCad(officialTotal)}</td><td>100 %</td></tr></tfoot></table></div></Panel>}

          {summary.truncated && <p className="text-[11px]" style={{ color: "var(--pp-warning)" }}>{fr ? "Résultats partiels : réduisez la période pour obtenir tous les dossiers." : "Partial results: narrow the period to include every file."}</p>}
        </div>
      ) : (
        <div className="p-8">{loading ? <div role="status" className="text-sm text-muted-foreground">{fr ? "Chargement des commissions…" : "Loading commissions…"}</div> : !error ? <EmptyMessage fr={fr} /> : null}</div>
      )}
    </section>
  );
}

function ValidationBadge({ validation, fr }: { validation: Validation; fr: boolean }) {
  const warning = validation.status === "WARNING";
  return <span title={validation.summary} className="inline-flex items-center mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: warning ? "var(--pp-warning)" : "var(--pp-success)", background: `color-mix(in srgb, ${warning ? "var(--pp-warning)" : "var(--pp-success)"} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${warning ? "var(--pp-warning)" : "var(--pp-success)"} 28%, transparent)` }}>{warning ? (fr ? "Contrôlé avec réserve" : "Checked with warning") : (fr ? "Maestro contrôlé" : "Maestro checked")}</span>;
}

function Kpi({ icon, label, value, emphasized = false, tone }: { icon: React.ReactNode; label: string; value: string; emphasized?: boolean; tone?: string }) {
  return <div className="pending-kpi" style={{ "--pending-tone": tone ?? (emphasized ? TONES[2] : TONES[0]) } as React.CSSProperties}><div className="pending-kpi-label">{icon}<span>{label}</span></div><div className="pending-kpi-value" title={value}>{value}</div></div>;
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="pending-panel"><h4><span>{icon}</span>{title}</h4>{children}</div>;
}

function EmptyMessage({ fr }: { fr: boolean }) {
  return <p className="text-[12px] text-center py-5" style={{ color: "var(--pp-text-muted)" }}>{fr ? "Aucune commission en attente pour cette période." : "No pending commissions for this period."}</p>;
}

function BrokerTableRow({ broker, rank, total, onSelect }: { broker: BrokerRow; rank: number; total: number; onSelect: () => void }) {
  const share = total > 0 ? Math.round((broker.amount / total) * 100) : 0;
  return (
    <tr onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(); }} role="button" tabIndex={0} className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset" style={{ borderTop: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}>
      <td className="py-3 text-center"><Rank value={rank} /></td>
      <td className="py-3 font-semibold" style={{ color: "var(--pp-text-primary)" }}>{broker.name}</td>
      <td className="py-3 text-right font-bold" style={{ color: "var(--pp-warning)" }}>{cad(broker.amount)}</td>
      <td className="py-3 text-right">{broker.personal ? cad(broker.personal.amount) : "—"}</td>
      <td className="py-3 text-right">{broker.team && broker.team.amount > 0 ? <span>{cad(broker.team.amount)} <span style={{ color: "var(--pp-text-muted)" }}>({broker.team_members?.length ?? 0})</span></span> : "—"}</td>
      <td className="py-3 text-right">{broker.files}</td>
      <td className="py-3 text-right">{cad(broker.volume)}</td>
      <td className="py-3 pr-4">
        <div className="flex items-center justify-end gap-2"><span>{share}%</span><ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--pp-brand-accent)" }} /></div>
      </td>
    </tr>
  );
}

function BrokerMobileRow({ broker, rank, total, onSelect, fr }: { broker: BrokerRow; rank: number; total: number; onSelect: () => void; fr: boolean }) {
  const share = total > 0 ? Math.round((broker.amount / total) * 100) : 0;
  return (
    <Button variant="ghost" onClick={onSelect} className="h-auto min-h-[72px] w-full justify-start rounded-lg px-3 py-2.5 text-left" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" }}>
      <Rank value={rank} />
      <div className="ml-2.5 min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[12.5px] font-bold truncate">{broker.name}</span>
          <span className="text-[13px] font-bold shrink-0" style={{ color: "var(--pp-warning)" }}>{cad(broker.amount)}</span>
        </div>
        <div className="flex items-center justify-between mt-1 text-[10.5px]" style={{ color: "var(--pp-text-muted)" }}>
          <span>{broker.files} {fr ? "dossiers" : "files"} · {compactCad(broker.volume)}</span>
        </div>
        <div className="flex items-center justify-between mt-0.5 text-[10.5px]" style={{ color: "var(--pp-text-secondary)" }}>
          <span>{fr ? "Perso" : "Own"} {compactCad(broker.personal?.amount ?? 0)}</span>
          <span>{fr ? "Équipe" : "Team"} {compactCad(broker.team?.amount ?? 0)}{broker.team_members?.length ? ` (${broker.team_members.length})` : ""}</span>
          <span>{share}% <ChevronRight className="inline w-3 h-3" /></span>
        </div>
      </div>
    </Button>
  );
}

function Rank({ value }: { value: number }) {
  return <span className="w-7 h-7 rounded-full inline-flex items-center justify-center text-[10.5px] font-bold shrink-0" style={{ background: value <= 3 ? "color-mix(in srgb, var(--pp-warning) 16%, transparent)" : "var(--pp-bg-elevated)", color: value <= 3 ? "var(--pp-warning)" : "var(--pp-text-muted)", border: "1px solid var(--pp-bg-border-2)" }}>{value}</span>;
}
export function TeamSplitPanel({ split, fr, name, title }: { split: Split; fr: boolean; name?: string; title?: string }) {
  const hasTeam = split.team_members.length > 0 && split.team.amount !== 0;
  // Without a team the KPIs above already show the broker's own commissions.
  if (!hasTeam) return null;
  const total = split.personal.amount + split.team.amount;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const Box = ({ label, part, accent }: { label: string; part: SplitPart; accent: string }) => (
    <div className="rounded-lg p-3 min-w-0" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)" }}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[11px] font-semibold uppercase" style={{ color: accent }}>{label}</span>
        <span className="text-[10.5px]" style={{ color: "var(--pp-text-muted)" }}>{pct(part.amount)}%</span>
      </div>
      <div className="text-[18px] sm:text-[20px] font-bold truncate" style={{ color: "var(--pp-text-primary)" }}>{cad(part.amount)}</div>
      <div className="text-[10.5px] mt-0.5" style={{ color: "var(--pp-text-muted)" }}>{part.files} {fr ? "dossiers" : "files"} · {compactCad(part.volume)}</div>
    </div>
  );
  return (
    <Panel title={title ?? (name ? (fr ? `${name} — personnel et équipe` : `${name} — personal and team`) : (fr ? "Personnel et équipe" : "Personal and team"))} icon={<Users className="w-4 h-4" />}>
      <div className={`grid grid-cols-1 ${hasTeam ? "sm:grid-cols-2" : ""} gap-2.5 mb-3`}>
        <Box label={name ? (fr ? "Dossiers du courtier" : "Broker files") : (fr ? "Mes dossiers" : "My files")} part={split.personal} accent="var(--pp-warning)" />
        {hasTeam && <Box label={name ? (fr ? `Son équipe (${split.team_members.length})` : `Team (${split.team_members.length})`) : (fr ? `Mon équipe (${split.team_members.length})` : `My team (${split.team_members.length})`)} part={split.team} accent="var(--pp-brand-accent)" />}
      </div>
      {hasTeam && <div className="h-2 rounded-full overflow-hidden flex mb-3" style={{ background: "var(--pp-bg-border)" }}>
        <div style={{ width: `${pct(split.personal.amount)}%`, background: "var(--pp-warning)" }} />
        <div style={{ width: `${pct(split.team.amount)}%`, background: "var(--pp-brand-accent)" }} />
      </div>}
      {hasTeam ? (
        <div className="divide-y" style={{ borderColor: "var(--pp-bg-border)" }}>
          {split.team_members.map((m) => (
            <div key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2 text-[12px]" style={{ borderColor: "var(--pp-bg-border)" }}>
              <span className="font-medium truncate" style={{ color: "var(--pp-text-secondary)" }}>{m.name}</span>
              <span style={{ color: "var(--pp-text-muted)" }}>{m.files} {fr ? "dossiers" : "files"}</span>
              <span className="font-bold text-right" style={{ color: "var(--pp-text-primary)" }}>{cad(m.amount)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {hasTeam && <p className="text-[10.5px] mt-2" style={{ color: "var(--pp-text-faint)" }}>
        {fr ? "Séparation selon le courtier principal de chaque dossier dans Maestro. Les montants hors lignes (ex. Override) restent dans le total officiel." : "Split by each file's primary broker in Maestro. Amounts without file lines (e.g. Override) stay in the official total."}
      </p>}
    </Panel>
  );
}
