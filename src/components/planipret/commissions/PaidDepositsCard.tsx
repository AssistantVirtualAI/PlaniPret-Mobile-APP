// Commissions déboursées — source unique : rapport historique des dépôts Maestro
// (planipret-commission-reports, actions `summary` et `by_agent`). Même
// présentation que les commissions en attente; jamais mélangé avec `pending`.
import { useEffect, useMemo, useState } from "react";
import { useCommissionLive } from "@/hooks/useCommissionLive";
import { BarChart3, BriefcaseBusiness, CalendarDays, ChevronRight, Landmark, RefreshCw, Search, Users, WalletCards } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ComposedChart, Line, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import "./pendingCommissions.css";
import { readStatsCache, statsCacheKey, writeStatsCache, isStatsCacheFresh } from "@/lib/planipret/commissionsCache";
import { ppEdgeInvoke } from "@/lib/planipret/ppEdge";

type Agent = { users_id: number | null; name: string; total: number; count: number; loan_volume: number };
type Summary = {
  total_commission: number; deposit_count: number; total_loan_volume: number; deal_count: number;
  top_institutions?: { institution: string; amount: number; count: number }[];
  by_date?: { date: string; amount: number; count: number }[];
  truncated?: boolean;
};

const TONES = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#db2777", "#0891b2"];
const cad = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n || 0);
const exactCad = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const compact = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

export default function PaidDepositsCard({
  lang = "fr",
  scope,
  forcedUsersId,
  presentation = "portal",
}: {
  lang?: "fr" | "en";
  scope: "admin" | "broker";
  /** Administrator personal view: must be their own verified Maestro identifier. */
  forcedUsersId?: string;
  presentation?: "portal" | "mobile";
}) {
  const fr = lang !== "en";
  const isAdmin = scope === "admin";
  const nowY = new Date().getFullYear();
  const [year, setYear] = useState(nowY);
  const [gran, setGran] = useState<"year" | "quarter" | "month">("year");
  const [idx, setIdx] = useState(1);
  const [agent, setAgent] = useState(forcedUsersId ?? "");
  const allowAgentPicker = isAdmin && !forcedUsersId;
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"overview" | "brokers" | "monthly" | "quarterly">("overview");
  const [reload, setReload] = useState(0);
  // Near real-time: refetch the scoped snapshot when the server reports new figures.
  useCommissionLive(() => setReload((n) => n + 1));

  const range = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const last = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    const r = gran === "year" ? { date_from: `${year}-01-01`, date_to: `${year}-12-31` }
      : gran === "quarter" ? { date_from: `${year}-${pad((idx - 1) * 3 + 1)}-01`, date_to: `${year}-${pad(idx * 3)}-${last(year, idx * 3)}` }
      : { date_from: `${year}-${pad(idx)}-01`, date_to: `${year}-${pad(idx)}-${last(year, idx)}` };
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
    if (r.date_to > today) r.date_to = today;
    return r;
  }, [year, gran, idx]);

  const key = statsCacheKey(isAdmin ? "admin" : "broker", ["paid-overview-v1", scope, forcedUsersId ?? "", range.date_from, range.date_to, agent]);
  const cached = readStatsCache(key)?.value as { summary?: Summary; agents?: Agent[] } | undefined;
  const [summary, setSummary] = useState<Summary | null>(cached?.summary ?? null);
  const [agents, setAgents] = useState<Agent[] | null>(cached?.agents ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const c = readStatsCache(key);
    const v = c?.value as { summary?: Summary; agents?: Agent[] } | undefined;
    setSummary(v?.summary ?? null);
    if (v?.agents) setAgents(v.agents);
    if (reload === 0 && isStatsCacheFresh(c)) return;
    setLoading(true); setError(null);
    (async () => {
      try {
        const filters = { ...range, ...(agent ? { users_id: agent } : {}) };
        const [s, a] = await Promise.all([
          ppEdgeInvoke("planipret-commission-reports", { action: "summary", filters }, { retries: 1, timeoutMs: 90_000 }),
          allowAgentPicker && !agent ? ppEdgeInvoke("planipret-commission-reports", { action: "by_agent", filters: range }, { retries: 1, timeoutMs: 90_000 }) : Promise.resolve(null),
        ]);
        const sd = (s as any)?.data ?? s;
        if ((s as any)?.error || !sd?.ok) {
          // Never surface raw server details; map known codes to a clear cause.
          const code = String(sd?.error ?? "");
          throw new Error(code === "admin_scope_unavailable"
            ? (fr ? "La vue « Tous les courtiers » requiert un accès Maestro administrateur." : "The All brokers view requires Maestro administrator access.")
            : (fr ? "Rapport des déboursées indisponible." : "Paid report unavailable."));
        }
        const ad = a ? ((a as any)?.data ?? a) : null;
        if (cancelled) return;
        setSummary(sd.summary);
        if (ad?.ok) setAgents(ad.agents);
        writeStatsCache(key, { summary: sd.summary, agents: ad?.ok ? ad.agents : agents });
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reload, allowAgentPicker]);

  const selected = agents?.find((x) => String(x.users_id) === agent) ?? null;
  const isGlobalAdminView = allowAgentPicker && !agent;
  const total = summary?.total_commission ?? 0;
  const list = (agents ?? []).filter((x) => x.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const months = useMemo(() => {
    const m = new Map<string, { amount: number; count: number }>();
    for (const d of summary?.by_date ?? []) {
      if (!/^\d{4}-\d{2}/.test(d.date)) continue;
      const k = d.date.slice(0, 7); const cur = m.get(k) ?? { amount: 0, count: 0 };
      cur.amount += d.amount; cur.count += d.count; m.set(k, cur);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({
      month, label: new Intl.DateTimeFormat(fr ? "fr-CA" : "en-CA", { month: "short" }).format(new Date(`${month}-15T12:00:00`)), ...v,
    }));
  }, [summary, fr]);
  const showBrokers = isAdmin && !agent;
  const monthRows = useMemo(() => {
    let cum = 0;
    return months.map((m, i) => {
      cum += m.amount;
      const prev = i > 0 ? months[i - 1].amount : 0;
      return { ...m, cumulative: cum, avg: m.count ? m.amount / m.count : 0, change: prev ? (m.amount - prev) / prev : null };
    });
  }, [months]);
  const quarters = useMemo(() => {
    const q = new Map<string, { amount: number; count: number }>();
    for (const m of months) {
      const k = `${m.month.slice(0, 4)}-T${Math.floor((Number(m.month.slice(5, 7)) - 1) / 3) + 1}`;
      const cur = q.get(k) ?? { amount: 0, count: 0 };
      cur.amount += m.amount; cur.count += m.count; q.set(k, cur);
    }
    const arr = [...q.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ key: k, label: k.slice(5), ...v }));
    return arr.map((x, i) => ({ ...x, avg: x.count ? x.amount / x.count : 0, change: i > 0 && arr[i - 1].amount ? (x.amount - arr[i - 1].amount) / arr[i - 1].amount : null }));
  }, [months]);
  const pct = (v: number | null) => v == null ? "—" : `${v >= 0 ? "▲" : "▼"} ${(Math.abs(v) * 100).toFixed(1)} %`;
  const pctColor = (v: number | null) => v == null ? "var(--pp-text-muted)" : v >= 0 ? "var(--pp-success)" : "var(--pp-danger,#ef4444)";

  return (
    <section className="pending-commissions" aria-label={fr ? "Commissions déboursées" : "Paid commissions"} aria-busy={loading}>
      <header className="pending-header">
        <div>
          <h3 className="pending-heading"><WalletCards className="h-5 w-5" />{fr ? "Commissions déboursées" : "Paid commissions"}</h3>
          <p className="text-xs mt-1 text-muted-foreground">
            {selected?.name ?? (isAdmin ? (fr ? "Tous les courtiers" : "All brokers") : (fr ? "Mes commissions" : "My commissions"))} · {range.date_from} → {range.date_to}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => setReload((n) => n + 1)}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />{fr ? "Rafraîchir" : "Refresh"}
        </Button>
      </header>

      <div className="pending-toolbar">
        {allowAgentPicker && <>
          <label className="flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground" /><input aria-label={fr ? "Rechercher un courtier déboursé" : "Search paid broker"} placeholder={fr ? "Rechercher par nom" : "Search by name"} value={search} onChange={(e) => setSearch(e.target.value)} className="w-44" /></label>
          <label className="flex flex-wrap items-center gap-2 text-xs"><Users className="h-4 w-4" />{fr ? "Courtier" : "Broker"}
            <select aria-label={fr ? "Courtier déboursé" : "Paid broker"} value={agent} onChange={(e) => { setAgent(e.target.value); setTab("overview"); }}>
              <option value="">{fr ? "Vue globale — tous les courtiers" : "Global view — all brokers"}</option>
              {(agents ?? []).filter((x) => x.users_id != null && (String(x.users_id) === agent || x.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))).map((x) => <option key={x.users_id!} value={String(x.users_id)}>{x.name}</option>)}
            </select>
          </label>
        </>}
        <select aria-label={fr ? "Année déboursée" : "Paid year"} value={year} onChange={(e) => setYear(Number(e.target.value))}>{[nowY, nowY - 1, nowY - 2, nowY - 3].map((y) => <option key={y} value={y}>{y}</option>)}</select>
        <div className="inline-flex gap-1">
          {([["year", fr ? "Année" : "Year"], ["quarter", fr ? "Trimestre" : "Quarter"], ["month", fr ? "Mois" : "Month"]] as const).map(([k, l]) => (
            <Button key={k} variant={gran === k ? "secondary" : "ghost"} size="sm" aria-pressed={gran === k} onClick={() => { setGran(k); setIdx(k === "month" ? new Date().getMonth() + 1 : k === "quarter" ? Math.floor(new Date().getMonth() / 3) + 1 : 1); }}>{l}</Button>
          ))}
        </div>
        {gran !== "year" && <select aria-label={fr ? "Période déboursée" : "Paid period"} value={idx} onChange={(e) => setIdx(Number(e.target.value))}>{(gran === "quarter" ? [1, 2, 3, 4] : Array.from({ length: 12 }, (_, i) => i + 1)).map((i) => <option key={i} value={i}>{gran === "quarter" ? `T${i}` : new Intl.DateTimeFormat(fr ? "fr-CA" : "en-CA", { month: "long" }).format(new Date(2026, i - 1, 15))}</option>)}</select>}
      </div>

      <div className="pending-tabs" role="tablist" aria-label={fr ? "Vues déboursées" : "Paid views"}>
        {([["overview", fr ? "Vue d’ensemble" : "Overview", BarChart3], ...(showBrokers ? [["brokers", fr ? "Courtiers" : "Brokers", Users] as const] : []), ["monthly", fr ? "Rapport mensuel" : "Monthly report", CalendarDays], ["quarterly", fr ? "Rapport trimestriel" : "Quarterly report", BarChart3]] as const).map(([k, label, Icon]) => (
          <Button key={k} role="tab" aria-selected={tab === k} className="pending-tab" variant="ghost" size="sm" onClick={() => setTab(k as typeof tab)}><Icon className="h-4 w-4 mr-2" />{label}</Button>
        ))}
      </div>

      {error && (
        <div role="status" className="mx-4 mt-4 rounded-lg px-3 py-2 text-[12px]" style={{ color: "var(--pp-warning)", background: "color-mix(in srgb, var(--pp-warning) 9%, transparent)", border: "1px solid color-mix(in srgb, var(--pp-warning) 28%, transparent)" }}>
          {error} {summary ? (fr ? "Les dernières données enregistrées restent affichées." : "The latest saved data remains visible.") : ""}
        </div>
      )}

      {summary ? (
        <div className="py-5 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Kpi icon={<WalletCards className="w-4 h-4" />} label={fr ? "Total déboursé" : "Paid total"} value={exactCad(total)} tone={TONES[2]} />
            <Kpi icon={<BriefcaseBusiness className="w-4 h-4" />} label={fr ? "Unités (dossiers)" : "Units (files)"} value={String(summary.deal_count)} tone={TONES[1]} />
            <Kpi icon={<Landmark className="w-4 h-4" />} label={fr ? "Volume hypothécaire" : "Mortgage volume"} value={exactCad(summary.total_loan_volume)} tone={TONES[0]} />
            <Kpi icon={<Users className="w-4 h-4" />} label={showBrokers ? (fr ? "Courtiers" : "Brokers") : (fr ? "Dépôts" : "Deposits")} value={showBrokers ? String(agents?.length ?? 0) : String(summary.deposit_count)} tone={TONES[3]} />
          </div>

          {tab === "overview" && (
            <div className="grid gap-4 lg:grid-cols-2">
              {showBrokers && list.length > 0 && (
                <Panel title={fr ? "Top 10 courtiers" : "Top 10 brokers"} icon={<Users className="h-4 w-4" />}>
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={list.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-bg-border)" />
                        <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 10, fill: "var(--pp-text-muted)" }} />
                        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: "var(--pp-text-secondary)" }} />
                        <Tooltip formatter={(v: number) => exactCad(v)} />
                        <Bar dataKey="total" isAnimationActive={false} radius={[0, 6, 6, 0]} onClick={(d: any) => d?.users_id != null && setAgent(String(d.users_id))}>
                          {list.slice(0, 10).map((_, i) => <Cell key={i} fill={TONES[i % TONES.length]} cursor="pointer" />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              )}
              {months.length > 0 && (
                <Panel title={fr ? "Commissions par mois" : "Commissions by month"} icon={<CalendarDays className="h-4 w-4" />}>
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={months}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-bg-border)" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--pp-text-muted)" }} />
                        <YAxis tickFormatter={compact} tick={{ fontSize: 10, fill: "var(--pp-text-muted)" }} />
                        <Tooltip formatter={(v: number) => exactCad(v)} />
                        <Bar dataKey="amount" fill={TONES[2]} isAnimationActive={false} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              )}
              {(summary.top_institutions?.length ?? 0) > 0 && (
                <Panel title={fr ? "Prêteurs" : "Lenders"} icon={<Landmark className="h-4 w-4" />}>
                  <div className="pending-scroll"><table className="pending-table"><thead><tr><th>{fr ? "Prêteur" : "Lender"}</th><th>{fr ? "Commission" : "Commission"}</th><th>{fr ? "Dépôts" : "Deposits"}</th><th>{fr ? "Part" : "Share"}</th></tr></thead>
                    <tbody>{summary.top_institutions!.map((t, i) => <tr key={t.institution}><td><span style={{ color: TONES[i % TONES.length] }}>● </span>{t.institution}</td><td>{exactCad(t.amount)}</td><td>{t.count}</td><td>{total ? (100 * t.amount / total).toFixed(1) : "0.0"} %</td></tr>)}</tbody></table></div>
                </Panel>
              )}
            </div>
          )}

          {(tab === "brokers" || (tab === "overview" && showBrokers)) && showBrokers && (
            <Panel title={fr ? "Commissions déboursées par courtier" : "Paid commissions by broker"} icon={<Users className="h-4 w-4" />}>
              <div className="pending-scroll"><table className="pending-table">
                <thead><tr><th>#</th><th>{fr ? "Courtier" : "Broker"}</th><th>{fr ? "Déboursé" : "Paid"}</th><th>{fr ? "Dépôts" : "Deposits"}</th><th>Volume</th><th>{fr ? "Part" : "Share"}</th></tr></thead>
                <tbody>{list.map((x, i) => (
                  <tr key={`${x.users_id}-${x.name}`} role="button" tabIndex={0} className="cursor-pointer" onClick={() => x.users_id != null && setAgent(String(x.users_id))} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && x.users_id != null) setAgent(String(x.users_id)); }}>
                    <td>{i + 1}</td><td className="font-semibold">{x.name}</td><td>{exactCad(x.total)}</td><td>{x.count}</td><td>{cad(x.loan_volume)}</td>
                    <td>{total ? Math.round(100 * x.total / total) : 0} % <ChevronRight className="inline w-3 h-3" /></td>
                  </tr>
                ))}</tbody>
                <tfoot><tr><td /><td>{fr ? "Total" : "Total"}</td><td>{exactCad(list.reduce((s, x) => s + x.total, 0))}</td><td>{list.reduce((s, x) => s + x.count, 0)}</td><td>{cad(list.reduce((s, x) => s + x.loan_volume, 0))}</td><td /></tr></tfoot>
              </table></div>
              {list.length === 0 && <p className="py-6 text-center text-[12px] text-muted-foreground">{fr ? "Aucun courtier trouvé." : "No brokers found."}</p>}
            </Panel>
          )}

          {tab === "monthly" && (
            <Panel title={fr ? "Rapport déboursé mensuel — tendance" : "Monthly paid report — trend"} icon={<CalendarDays className="h-4 w-4" />}>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-bg-border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--pp-text-muted)" }} />
                    <YAxis yAxisId="l" tickFormatter={compact} tick={{ fontSize: 10, fill: "var(--pp-text-muted)" }} />
                    <YAxis yAxisId="r" orientation="right" tickFormatter={compact} tick={{ fontSize: 10, fill: "var(--pp-text-muted)" }} />
                    <Tooltip formatter={(v: number) => exactCad(v)} />
                    <Legend />
                    <Bar yAxisId="l" dataKey="amount" name={fr ? "Déboursé du mois" : "Paid in month"} fill={TONES[2]} isAnimationActive={false} radius={[6, 6, 0, 0]} />
                    <Line yAxisId="r" dataKey="cumulative" name={fr ? "Cumul" : "Cumulative"} stroke={TONES[1]} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="pending-scroll"><table className="pending-table"><thead><tr><th>{fr ? "Mois" : "Month"}</th><th>{fr ? "Déboursé" : "Paid"}</th><th>{fr ? "Dépôts" : "Deposits"}</th><th>{fr ? "Moyenne" : "Average"}</th><th>{fr ? "Variation" : "Change"}</th><th>{fr ? "Cumul" : "Cumulative"}</th></tr></thead>
                <tbody>{monthRows.map((m) => <tr key={m.month}><td className="capitalize">{m.label} {m.month.slice(0, 4)}</td><td>{exactCad(m.amount)}</td><td>{m.count}</td><td>{exactCad(m.avg)}</td><td style={{ color: pctColor(m.change) }}>{pct(m.change)}</td><td>{exactCad(m.cumulative)}</td></tr>)}</tbody>
                <tfoot><tr><td>Total</td><td>{exactCad(months.reduce((s, m) => s + m.amount, 0))}</td><td>{months.reduce((s, m) => s + m.count, 0)}</td><td>—</td><td>—</td><td>—</td></tr></tfoot></table></div>
            </Panel>
          )}
          {tab === "quarterly" && (
            <Panel title={fr ? "Rapport déboursé trimestriel — tendance" : "Quarterly paid report — trend"} icon={<BarChart3 className="h-4 w-4" />}>
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={quarters}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-bg-border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--pp-text-muted)" }} />
                    <YAxis tickFormatter={compact} tick={{ fontSize: 10, fill: "var(--pp-text-muted)" }} />
                    <Tooltip formatter={(v: number) => exactCad(v)} />
                    <Bar dataKey="amount" name={fr ? "Déboursé" : "Paid"} isAnimationActive={false} radius={[6, 6, 0, 0]}>
                      {quarters.map((_, i) => <Cell key={i} fill={TONES[i % TONES.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="pending-scroll"><table className="pending-table"><thead><tr><th>{fr ? "Trimestre" : "Quarter"}</th><th>{fr ? "Déboursé" : "Paid"}</th><th>{fr ? "Dépôts" : "Deposits"}</th><th>{fr ? "Moyenne" : "Average"}</th><th>{fr ? "Variation" : "Change"}</th><th>{fr ? "Part" : "Share"}</th></tr></thead>
                <tbody>{quarters.map((q) => <tr key={q.key}><td>{q.label} {q.key.slice(0, 4)}</td><td>{exactCad(q.amount)}</td><td>{q.count}</td><td>{exactCad(q.avg)}</td><td style={{ color: pctColor(q.change) }}>{pct(q.change)}</td><td>{total ? (100 * q.amount / total).toFixed(1) : "0.0"} %</td></tr>)}</tbody>
                <tfoot><tr><td>Total</td><td>{exactCad(quarters.reduce((s, q) => s + q.amount, 0))}</td><td>{quarters.reduce((s, q) => s + q.count, 0)}</td><td>—</td><td>—</td><td>100 %</td></tr></tfoot></table></div>
            </Panel>
          )}
          {summary.truncated && <p className="text-[11px]" style={{ color: "var(--pp-warning)" }}>{fr ? "Résultats partiels : réduisez la période." : "Partial results: narrow the period."}</p>}
        </div>
      ) : (
        <div className="p-8 text-sm text-center text-muted-foreground">{loading ? (fr ? "Chargement des commissions déboursées…" : "Loading paid commissions…") : !error ? (fr ? "Aucune commission déboursée pour cette période." : "No paid commissions for this period.") : null}</div>
      )}
    </section>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return <div className="pending-kpi" style={{ "--pending-tone": tone } as React.CSSProperties}><div className="pending-kpi-label">{icon}<span>{label}</span></div><div className="pending-kpi-value" title={value}>{value}</div></div>;
}
function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="pending-panel"><h4><span>{icon}</span>{title}</h4>{children}</div>;
}
