import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ComposedChart, Line, Cell,
} from "recharts";
import type { ReactNode } from "react";

const PALETTE = ["#5B8FF9", "#00D4AA", "#FFB020", "#9B7FE8", "#F56C6C", "#36CFC9", "#73D13D", "#FF85C0"];

const money = (value: number) => new Intl.NumberFormat("fr-CA", {
  style: "currency", currency: "CAD", maximumFractionDigits: 0,
}).format(Number(value) || 0);
const number = (value: number) => new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(Number(value) || 0);

const tooltipStyle = {
  background: "rgba(10,16,30,.94)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 10,
  color: "#fff",
  fontSize: 12,
  backdropFilter: "blur(8px)",
} as const;

function shortName(value: string) {
  return value.length > 17 ? `${value.slice(0, 16)}…` : value;
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pp-card" style={{ padding: 14, borderRadius: 14, minWidth: 0 }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, color: "var(--pp-text-primary)", marginBottom: 8 }}>{title}</h3>
      <div style={{ height: 272 }}>{children}</div>
    </section>
  );
}

/**
 * Four visualizations built directly from the canonical broker register rows.
 * No endpoint or financial aggregation is called here: visual figures always
 * remain identical to the detailed table below.
 */
export default function BrokerVisualSummary({
  lang, brokers, onSelect,
}: {
  lang: "fr" | "en";
  brokers: any[];
  onSelect?: (brokerKey: string) => void;
}) {
  const fr = lang === "fr";
  const totalCommission = brokers.reduce((sum, broker) => sum + (Number(broker.commission) || 0), 0) || 1;
  const rows = brokers
    .map((broker) => {
      const name = `${broker.firstName ?? ""} ${broker.lastName ?? ""}`.trim() || String(broker.broker ?? "—");
      const commission = Number(broker.commission) || 0;
      const volume = Number(broker.volume) || 0;
      const deals = Number(broker.deals) || 0;
      return {
        brokerKey: broker.brokerKey,
        linked: broker.linked !== false,
        name,
        short: shortName(name),
        volume,
        commission,
        deals,
        avgDeal: Number(broker.avgDeal) || (deals ? volume / deals : 0),
        commissionShare: (commission / totalCommission) * 100,
      };
    })
    .filter((broker) => broker.volume || broker.commission || broker.deals)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 8);

  const select = (row: any) => {
    if (row?.linked && row?.brokerKey) onSelect?.(String(row.brokerKey));
  };
  const selectChartDatum = (event: any) => select(event?.payload ?? event);
  const yAxis = { type: "category" as const, dataKey: "short", width: 94, tick: { fontSize: 10.5, fill: "var(--pp-text-muted)" } };
  const grid = { strokeDasharray: "3 3", stroke: "rgba(127,127,127,.18)", horizontal: false };

  if (!rows.length) return null;

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", marginTop: 12 }}>
      <ChartCard title={fr ? "Part des commissions — top 8" : "Commission share — top 8"}>
        <ResponsiveContainer>
          <BarChart data={[...rows].sort((a, b) => b.commissionShare - a.commissionShare)} layout="vertical" margin={{ left: 2, right: 24 }}>
            <CartesianGrid {...grid} />
            <XAxis type="number" tick={{ fontSize: 10.5, fill: "var(--pp-text-muted)" }} tickFormatter={(value) => `${Number(value).toFixed(0)} %`} />
            <YAxis {...yAxis} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value: any, _name: any, item: any) => [`${Number(value).toFixed(1)} % · ${money(Number(item?.payload?.commission))}`, fr ? "Part" : "Share"]} />
            <Bar dataKey="commissionShare" radius={[0, 6, 6, 0]} onClick={selectChartDatum}>
              {rows.map((row, index) => <Cell key={row.brokerKey ?? row.name} fill={PALETTE[index % PALETTE.length]} cursor={row.linked && onSelect ? "pointer" : undefined} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={fr ? "Volume et commission — top 8" : "Volume and commission — top 8"}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ left: 2, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,.18)" />
            <XAxis dataKey="short" tick={{ fontSize: 10, fill: "var(--pp-text-muted)" }} interval={0} angle={-16} textAnchor="end" height={48} />
            <YAxis yAxisId="volume" tick={{ fontSize: 10.5, fill: "var(--pp-text-muted)" }} tickFormatter={(value) => `${Math.round(Number(value) / 1000000)} M`} width={44} />
            <YAxis yAxisId="commission" orientation="right" tick={{ fontSize: 10.5, fill: "var(--pp-text-muted)" }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)} k`} width={44} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value: any, name: any) => [money(Number(value)), name]} />
            <Legend wrapperStyle={{ fontSize: 10.5, paddingTop: 4 }} />
            <Bar yAxisId="volume" name="Volume" dataKey="volume" fill="#5B8FF9" radius={[5, 5, 0, 0]} onClick={selectChartDatum} />
            <Line yAxisId="commission" name="Commission" dataKey="commission" stroke="#FFB020" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} onClick={selectChartDatum} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={fr ? "Dossiers par courtier — top 8" : "Deals by broker — top 8"}>
        <ResponsiveContainer>
          <BarChart data={[...rows].sort((a, b) => b.deals - a.deals)} layout="vertical" margin={{ left: 2, right: 12 }}>
            <CartesianGrid {...grid} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10.5, fill: "var(--pp-text-muted)" }} />
            <YAxis {...yAxis} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value: any) => [number(Number(value)), fr ? "Dossiers" : "Deals"]} />
            <Bar dataKey="deals" fill="#00D4AA" radius={[0, 6, 6, 0]} onClick={selectChartDatum} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={fr ? "Dossier moyen — top 8" : "Average deal — top 8"}>
        <ResponsiveContainer>
          <BarChart data={[...rows].sort((a, b) => b.avgDeal - a.avgDeal)} layout="vertical" margin={{ left: 2, right: 12 }}>
            <CartesianGrid {...grid} />
            <XAxis type="number" tick={{ fontSize: 10.5, fill: "var(--pp-text-muted)" }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)} k`} />
            <YAxis {...yAxis} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value: any) => [money(Number(value)), fr ? "Dossier moyen" : "Average deal"]} />
            <Bar dataKey="avgDeal" fill="#9B7FE8" radius={[0, 6, 6, 0]} onClick={selectChartDatum} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
