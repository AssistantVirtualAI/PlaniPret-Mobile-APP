// Graphiques de commissions mobiles — parité avec le portail (RegisterCommissions).
// Les données proviennent uniquement de l'action `analytics` de
// `planipret-commission-reports` (année courante + même fenêtre l'an dernier).
import { useEffect, useMemo, useRef, useState } from "react";
import { isStatsCacheFresh, readStatsCache, statsCacheKey, writeStatsCache } from "@/lib/planipret/commissionsCache";
import { ppEdgeInvoke } from "@/lib/planipret/ppEdge";
import {
  BarChart, Bar, ComposedChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";

const COLORS = ["#5B8FF9", "#9B7FE8", "#2E9BDC", "#F0B429", "#70AD47", "#ED7D31", "#A5A5A5", "#8B5CF6"];

const compact = (n: number) =>
  new Intl.NumberFormat("fr-CA", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
const cad = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n || 0);

const numOf = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

type Row = {
  number?: string | null;
  amount?: string | number | null;
  loan_amt?: string | number | null;
  date_trans?: string | null;
  institution?: string | null;
  commission_type?: string | null;
};

type MonthRow = {
  key: string;
  label: string;
  cyVolume: number;
  pyVolume: number;
  cyCommission: number;
  pyCommission: number;
  deals: number;
  commPerDeal: number;
  bps: number;
  cyCum: number;
  pyCum: number;
};

const shiftYear = (iso: string, delta: number) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  return `${y + delta}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

function ChartCard({ title, height = 200, children }: { title: string; height?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-3 mb-3" style={{ background: "var(--pp-bg-surface, #0A1628)", border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.24))" }}>
      <h3 className="text-[12.5px] font-semibold mb-2" style={{ color: "var(--pp-text-primary, #E8EDF5)" }}>{title}</h3>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">{children as any}</ResponsiveContainer>
      </div>
    </div>
  );
}

const tooltipStyle = {
  background: "var(--pp-bg-surface, #0A1628)",
  border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.3))",
  borderRadius: 10,
  fontSize: 12,
} as React.CSSProperties;

const axisTick = { fontSize: 10, fill: "var(--pp-text-secondary, #B4C6D8)" };

export default function MCommissionCharts({
  filters,
  lang,
  cacheScope,
  refreshToken = 0,
}: {
  filters: Record<string, unknown>;
  lang?: string;
  cacheScope: string;
  refreshToken?: number;
}) {
  const fr = lang !== "en";
  const [cy, setCy] = useState<Row[] | null>(null);
  const [py, setPy] = useState<Row[]>([]);
  const [failed, setFailed] = useState(false);
  const [report, setReport] = useState<"overview" | "monthly" | "quarterly">("overview");
  const appliedRefreshToken = useRef(refreshToken);

  const from = String((filters as any).date_from ?? "");
  const to = String((filters as any).date_to ?? "");
  const key = JSON.stringify(filters);
  const cacheKey = statsCacheKey("broker", [cacheScope, "charts-fundings-v4", key]);

  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    const cached = readStatsCache(cacheKey);
    const cachedRows = cached?.value as { cy?: Row[]; py?: Row[] } | undefined;
    if (cachedRows) {
      setCy(cachedRows.cy ?? []);
      setPy(cachedRows.py ?? []);
      setFailed(false);
    } else {
      setCy(null); setFailed(false);
    }
    const force = refreshToken !== appliedRefreshToken.current;
    appliedRefreshToken.current = refreshToken;
    if (!force && isStatsCacheFresh(cached)) return;

    const call = (f: Record<string, unknown>) =>
      ppEdgeInvoke("planipret-commission-reports", {
        action: "analytics",
        filters: f,
      }, { retries: 1, timeoutMs: 30_000 });

    (async () => {
      const [a, b] = await Promise.all([
        call(filters),
        call({ ...filters, date_from: shiftYear(from, -1), date_to: shiftYear(to, -1) }),
      ]);
      if (cancelled) return;
      if (a.error || b.error || (a.data as any)?.error || (b.data as any)?.error || (a.data as any)?.success === false || (b.data as any)?.success === false || (a.data as any)?.truncated || (b.data as any)?.truncated) { setFailed(true); return; }
      const expand = (data: any): Row[] => data?.analytics ? [
        ...data.analytics.months.map((m: any) => ({ date_trans: `${m.key}-01`, loan_amt: m.volume, amount: m.commission, deals: m.deals, kind: "month" })),
        ...data.analytics.lenders.map((l: any) => ({ institution: l.key, loan_amt: l.volume, kind: "lender" })),
        ...data.analytics.types.map((t: any) => ({ commission_type: t.type, amount: t.amount, kind: "type" })),
      ] : data?.rows ?? [];
      const next = {
        cy: expand(a.data),
        py: expand(b.data),
      };
      setCy(next.cy);
      setPy(next.py);
      writeStatsCache(cacheKey, next);
    })().catch(() => { if (!cancelled) setFailed(true); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cacheKey, refreshToken]);

  const months: MonthRow[] = useMemo(() => {
    if (!cy) return [];
    const monthFmt = new Intl.DateTimeFormat(fr ? "fr-CA" : "en-CA", { month: "short", timeZone: "America/Toronto" });
    const map = new Map<string, MonthRow>();
    const touch = (k: string): MonthRow => {
      let r = map.get(k);
      if (!r) {
        r = {
          key: k,
          label: monthFmt.format(new Date(`${k}-15T12:00:00`)).replace(".", ""),
          cyVolume: 0, pyVolume: 0, cyCommission: 0, pyCommission: 0,
          deals: 0, commPerDeal: 0, bps: 0, cyCum: 0, pyCum: 0,
        };
        map.set(k, r);
      }
      return r;
    };

    for (const row of cy) {
      const k = String(row.date_trans ?? "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(k)) continue;
      const r = touch(k);
      r.cyVolume += numOf(row.loan_amt);
      r.cyCommission += numOf(row.amount);
      r.deals += Number((row as any).deals ?? 0);
    }
    for (const row of py) {
      const raw = String(row.date_trans ?? "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(raw)) continue;
      const [y, m] = raw.split("-").map(Number);
      const k = `${y + 1}-${String(m).padStart(2, "0")}`;
      const r = touch(k);
      r.pyVolume += numOf(row.loan_amt);
      r.pyCommission += numOf(row.amount);
    }

    const list = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
    let cyCum = 0, pyCum = 0;
    for (const r of list) {
      cyCum += r.cyVolume; pyCum += r.pyVolume;
      r.cyCum = cyCum; r.pyCum = pyCum;
      r.commPerDeal = r.deals ? r.cyCommission / r.deals : 0;
      r.bps = r.cyVolume ? (r.cyCommission / r.cyVolume) * 10000 : 0;
    }
    return list;
  }, [cy, py, fr]);

  const lenders = useMemo(() => {
    if (!cy) return [];
    const map = new Map<string, { key: string; cyVolume: number; pyVolume: number }>();
    const bump = (name: string, field: "cyVolume" | "pyVolume", v: number) => {
      const k = name || "—";
      const r = map.get(k) ?? { key: k, cyVolume: 0, pyVolume: 0 };
      r[field] += v; map.set(k, r);
    };
    for (const r of cy) if ((r as any).kind === "lender") bump(String(r.institution ?? ""), "cyVolume", numOf(r.loan_amt));
    for (const r of py) if ((r as any).kind === "lender") bump(String(r.institution ?? ""), "pyVolume", numOf(r.loan_amt));
    return [...map.values()].sort((a, b) => b.cyVolume - a.cyVolume).slice(0, 8);
  }, [cy, py]);

  const byType = useMemo(() => {
    if (!cy) return [];
    const map = new Map<string, number>();
    for (const r of cy) {
      if ((r as any).kind !== "type") continue;
      const k = String(r.commission_type ?? "base");
      map.set(k, (map.get(k) ?? 0) + numOf(r.amount));
    }
    return [...map.entries()].map(([type, amount]) => ({ type, amount })).filter((d) => d.amount > 0);
  }, [cy]);
  const monthRows = useMemo(() => {
    let cumulative = 0;
    return months.map((month, index) => {
      cumulative += month.cyCommission;
      const previous = index > 0 ? months[index - 1].cyCommission : 0;
      return { ...month, cumulative, change: previous ? (month.cyCommission - previous) / previous : null };
    });
  }, [months]);
  const quarters = useMemo(() => {
    const values = new Map<string, { amount: number; deals: number }>();
    for (const month of months) {
      const key = `${month.key.slice(0, 4)}-Q${Math.floor((Number(month.key.slice(5, 7)) - 1) / 3) + 1}`;
      const current = values.get(key) ?? { amount: 0, deals: 0 };
      current.amount += month.cyCommission;
      current.deals += month.deals;
      values.set(key, current);
    }
    const rows = [...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, label: key.slice(5), ...value }));
    return rows.map((row, index) => ({ ...row, average: row.deals ? row.amount / row.deals : 0, change: index > 0 && rows[index - 1].amount ? (row.amount - rows[index - 1].amount) / rows[index - 1].amount : null }));
  }, [months]);
  const pct = (value: number | null) => value == null ? "—" : `${value >= 0 ? "▲" : "▼"} ${(Math.abs(value) * 100).toFixed(1)} %`;

  if (failed) {
    return (
      <p data-testid="commission-charts-unavailable" className="rounded-xl px-3 py-2.5 mb-3 text-[12px]" style={{ background: "rgba(240,180,41,0.10)", color: "var(--pp-text-secondary, #B4C6D8)" }}>
        {fr ? "Les graphiques sont temporairement indisponibles. Les totaux et dépôts ci-dessus restent accessibles." : "Charts are temporarily unavailable. The totals and deposits above remain available."}
      </p>
    );
  }

  if (!cy) {
    return (
      <div className="space-y-3 mb-3" data-testid="commission-charts-loading">
        {[0, 1].map((i) => (
          <div key={i} className="h-40 rounded-2xl animate-pulse" style={{ background: "var(--pp-bg-surface, #0A1628)" }} />
        ))}
      </div>
    );
  }

  if (months.length === 0) return null;

  return (
    <div data-testid="commission-charts">

      <div role="tablist" aria-label={fr ? "Rapports déboursés" : "Paid reports"} className="grid grid-cols-3 gap-1 mb-3">
        {([[
          "overview", fr ? "Vue d’ensemble" : "Overview",
        ], ["monthly", fr ? "Mensuel" : "Monthly"], ["quarterly", fr ? "Trimestriel" : "Quarterly"]] as const).map(([key, label]) => (
          <Button key={key} role="tab" aria-selected={report === key} variant={report === key ? "secondary" : "ghost"} size="sm" className="min-w-0 px-2 text-[11px]" onClick={() => setReport(key)}>{label}</Button>
        ))}
      </div>

      {report === "overview" && <><ChartCard title={fr ? "Volume mensuel — année courante vs précédente" : "Monthly volume — CY vs PY"} height={210}>
        <BarChart data={months} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(155,127,232,0.15)" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => compact(Number(v))} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => cad(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar name={fr ? "Cette année" : "This year"} dataKey="cyVolume" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
          <Bar name={fr ? "An dernier" : "Last year"} dataKey="pyVolume" fill={COLORS[6]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard title={fr ? "Commission mensuelle — année courante vs précédente" : "Monthly commission — CY vs PY"} height={210}>
        <BarChart data={months} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(155,127,232,0.15)" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => compact(Number(v))} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => cad(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar name={fr ? "Cette année" : "This year"} dataKey="cyCommission" fill={COLORS[5]} radius={[4, 4, 0, 0]} />
          <Bar name={fr ? "An dernier" : "Last year"} dataKey="pyCommission" fill={COLORS[6]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard title={fr ? "Volume cumulé — rythme" : "Cumulative volume — pace"} height={200}>
        <AreaChart data={months} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
          <defs>
            <linearGradient id="mgCy" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS[0]} stopOpacity={0.5} />
              <stop offset="100%" stopColor={COLORS[0]} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="mgPy" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS[6]} stopOpacity={0.4} />
              <stop offset="100%" stopColor={COLORS[6]} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(155,127,232,0.15)" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => compact(Number(v))} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => cad(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Area name={fr ? "An dernier" : "Last year"} dataKey="pyCum" stroke={COLORS[6]} fill="url(#mgPy)" strokeWidth={2} />
          <Area name={fr ? "Cette année" : "This year"} dataKey="cyCum" stroke={COLORS[0]} fill="url(#mgCy)" strokeWidth={2.2} />
        </AreaChart>
      </ChartCard>

      <ChartCard title={fr ? "Dossiers et commission par dossier" : "Deals and commission per deal"} height={200}>
        <ComposedChart data={months} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(155,127,232,0.15)" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis yAxisId="l" tick={axisTick} axisLine={false} tickLine={false} width={28} />
          <YAxis yAxisId="r" orientation="right" tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => compact(Number(v))} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar yAxisId="l" name={fr ? "Dossiers" : "Deals"} dataKey="deals" fill={COLORS[4]} radius={[4, 4, 0, 0]} />
          <Line yAxisId="r" name={fr ? "Comm./dossier" : "Comm./deal"} type="monotone" dataKey="commPerDeal" stroke={COLORS[3]} strokeWidth={2} dot={{ r: 2 }} />
        </ComposedChart>
      </ChartCard>

      {byType.length > 1 && (
        <ChartCard title={fr ? "Commission par type" : "Commission by type"} height={210}>
          <PieChart>
            <Pie data={byType} dataKey="amount" nameKey="type" innerRadius={45} outerRadius={78} paddingAngle={2} stroke="none">
              {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => cad(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </PieChart>
        </ChartCard>
      )}

      {lenders.length > 0 && (
        <ChartCard title={fr ? "Top prêteurs — volume" : "Top lenders — volume"} height={Math.max(180, lenders.length * 34)}>
          <BarChart data={lenders} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(155,127,232,0.15)" horizontal={false} />
            <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v) => compact(Number(v))} />
            <YAxis type="category" dataKey="key" tick={{ ...axisTick, fontSize: 9 }} axisLine={false} tickLine={false} width={72} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => cad(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar name={fr ? "Cette année" : "This year"} dataKey="cyVolume" fill={COLORS[0]} radius={[0, 4, 4, 0]} maxBarSize={16} />
            <Bar name={fr ? "An dernier" : "Last year"} dataKey="pyVolume" fill={COLORS[6]} radius={[0, 4, 4, 0]} maxBarSize={16} />
          </BarChart>
        </ChartCard>
      )}

      <ChartCard title={fr ? "BPS par mois (rentabilité)" : "BPS per month (yield)"} height={190}>
        <AreaChart data={months} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
          <defs>
            <linearGradient id="mgBps" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS[7]} stopOpacity={0.5} />
              <stop offset="100%" stopColor={COLORS[7]} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(155,127,232,0.15)" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => `${Number(v).toFixed(0)} bps`} />
          <Area name="BPS" dataKey="bps" stroke={COLORS[7]} fill="url(#mgBps)" strokeWidth={2} />
        </AreaChart>
      </ChartCard>
      </>}

      {report === "monthly" && <div className="rounded-2xl p-3 mb-3" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)" }}>
        <h3 className="text-[13px] font-semibold mb-3">{fr ? "Rapport déboursé mensuel" : "Monthly paid report"}</h3>
        <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-[11px]"><thead><tr><th className="text-left p-2">{fr ? "Mois" : "Month"}</th><th className="text-right p-2">{fr ? "Déboursé" : "Paid"}</th><th className="text-right p-2">{fr ? "Dossiers" : "Deals"}</th><th className="text-right p-2">{fr ? "Moyenne" : "Average"}</th><th className="text-right p-2">{fr ? "Variation" : "Change"}</th><th className="text-right p-2">{fr ? "Cumul" : "Cumulative"}</th></tr></thead><tbody>{monthRows.map((month) => <tr key={month.key} style={{ borderTop: "1px solid var(--pp-bg-border)" }}><td className="p-2 capitalize">{month.label} {month.key.slice(0, 4)}</td><td className="p-2 text-right">{cad(month.cyCommission)}</td><td className="p-2 text-right">{month.deals}</td><td className="p-2 text-right">{cad(month.commPerDeal)}</td><td className="p-2 text-right">{pct(month.change)}</td><td className="p-2 text-right">{cad(month.cumulative)}</td></tr>)}</tbody></table></div>
      </div>}

      {report === "quarterly" && <div className="rounded-2xl p-3 mb-3" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)" }}>
        <h3 className="text-[13px] font-semibold mb-3">{fr ? "Rapport déboursé trimestriel" : "Quarterly paid report"}</h3>
        <div className="h-[210px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={quarters}><CartesianGrid strokeDasharray="3 3" stroke="var(--pp-bg-border)" /><XAxis dataKey="label" tick={axisTick} /><YAxis tick={axisTick} tickFormatter={(value) => compact(Number(value))} /><Tooltip contentStyle={tooltipStyle} formatter={(value: any) => cad(Number(value))} /><Bar dataKey="amount" name={fr ? "Déboursé" : "Paid"} fill={COLORS[2]} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-[11px]"><thead><tr><th className="text-left p-2">{fr ? "Trimestre" : "Quarter"}</th><th className="text-right p-2">{fr ? "Déboursé" : "Paid"}</th><th className="text-right p-2">{fr ? "Dossiers" : "Deals"}</th><th className="text-right p-2">{fr ? "Moyenne" : "Average"}</th><th className="text-right p-2">{fr ? "Variation" : "Change"}</th></tr></thead><tbody>{quarters.map((quarter) => <tr key={quarter.key} style={{ borderTop: "1px solid var(--pp-bg-border)" }}><td className="p-2">{quarter.label} {quarter.key.slice(0, 4)}</td><td className="p-2 text-right">{cad(quarter.amount)}</td><td className="p-2 text-right">{quarter.deals}</td><td className="p-2 text-right">{cad(quarter.average)}</td><td className="p-2 text-right">{pct(quarter.change)}</td></tr>)}</tbody></table></div>
      </div>}
    </div>
  );
}
