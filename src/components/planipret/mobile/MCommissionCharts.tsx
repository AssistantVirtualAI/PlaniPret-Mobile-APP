// Graphiques de commissions mobiles — parité avec le portail (RegisterCommissions).
// Les données proviennent uniquement de l'action `deposits` de
// `planipret-commission-reports` (année courante + même fenêtre l'an dernier).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, ComposedChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const CHART_ROWS = 250;

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
}: {
  filters: Record<string, unknown>;
  lang?: string;
}) {
  const fr = lang !== "en";
  const [cy, setCy] = useState<Row[] | null>(null);
  const [py, setPy] = useState<Row[]>([]);
  const [failed, setFailed] = useState(false);

  const from = String((filters as any).date_from ?? "");
  const to = String((filters as any).date_to ?? "");
  const key = JSON.stringify(filters);

  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    setCy(null); setFailed(false);

    const call = (f: Record<string, unknown>) =>
      supabase.functions.invoke("planipret-commission-reports", {
        body: { action: "deposits", filters: { ...f, page: 1, per_page: CHART_ROWS } },
      });

    (async () => {
      const [a, b] = await Promise.all([
        call(filters),
        call({ ...filters, date_from: shiftYear(from, -1), date_to: shiftYear(to, -1) }),
      ]);
      if (cancelled) return;
      if (a.error || (a.data as any)?.error) { setFailed(true); return; }
      setCy(((a.data as any)?.rows ?? []) as Row[]);
      setPy((!b.error && ((b.data as any)?.rows ?? [])) || []);
    })().catch(() => { if (!cancelled) setFailed(true); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

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
      r.deals += 1;
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
    for (const r of cy) bump(String(r.institution ?? ""), "cyVolume", numOf(r.loan_amt));
    for (const r of py) bump(String(r.institution ?? ""), "pyVolume", numOf(r.loan_amt));
    return [...map.values()].sort((a, b) => b.cyVolume - a.cyVolume).slice(0, 8);
  }, [cy, py]);

  const byType = useMemo(() => {
    if (!cy) return [];
    const map = new Map<string, number>();
    for (const r of cy) {
      const k = String(r.commission_type ?? "base");
      map.set(k, (map.get(k) ?? 0) + numOf(r.amount));
    }
    return [...map.entries()].map(([type, amount]) => ({ type, amount })).filter((d) => d.amount > 0);
  }, [cy]);

  if (failed) return null;

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

  const truncated = cy.length >= CHART_ROWS;

  return (
    <div data-testid="commission-charts">
      {truncated && (
        <p className="text-[11px] mb-2" style={{ color: "#F0B429" }}>
          {fr
            ? `Graphiques basés sur les ${CHART_ROWS} dépôts les plus récents de la période.`
            : `Charts based on the ${CHART_ROWS} most recent deposits of the period.`}
        </p>
      )}

      <ChartCard title={fr ? "Volume mensuel — année courante vs précédente" : "Monthly volume — CY vs PY"} height={210}>
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

      <ChartCard title={fr ? "Commission mensuelle — CY vs PY" : "Monthly commission — CY vs PY"} height={210}>
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

      <ChartCard title={fr ? "Dossiers vs commission par dossier" : "Deals vs commission per deal"} height={200}>
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
    </div>
  );
}
