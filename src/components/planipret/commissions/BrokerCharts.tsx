import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from "recharts";
import { CHART_COLORS } from "./ui/chartTheme";

type B = { broker: string; brokerKey?: string; firstName?: string; lastName?: string; volume?: number; deals?: number; commission?: number; avgDeal?: number };

const money = (v: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v || 0);
const k = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`);
const tip = { contentStyle: { background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", borderRadius: 10, fontSize: 12 } };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)" }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, color: "var(--pp-text-primary)" }}>{title}</div>
      <div style={{ width: "100%", height: 260 }}>{children}</div>
    </div>
  );
}

/** Figures come straight from the server's broker rows — no client re-aggregation. */
export default function BrokerCharts({ brokers, lang, onSelect }: { brokers: B[]; lang: "fr" | "en"; onSelect?: (key: string) => void }) {
  const fr = lang === "fr";
  const rows = (brokers ?? [])
    .map((b) => ({ ...b, name: `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim() || b.broker, commission: Number(b.commission ?? 0), volume: Number(b.volume ?? 0), deals: Number(b.deals ?? 0), avgDeal: Number(b.avgDeal ?? 0) }))
    .filter((b) => b.commission || b.volume || b.deals);
  if (!rows.length) return null;
  const byComm = [...rows].sort((a, b) => b.commission - a.commission);
  const top = byComm.slice(0, 8);
  const other = byComm.slice(8).reduce((s, b) => s + b.commission, 0);
  const pie = other > 0 ? [...top.map((b) => ({ name: b.name, value: b.commission })), { name: fr ? "Autres" : "Others", value: other }] : top.map((b) => ({ name: b.name, value: b.commission }));
  const top12 = byComm.slice(0, 12);
  const click = (d: any) => d?.brokerKey && onSelect?.(d.brokerKey);
  const axis = { fontSize: 10.5, fill: "var(--pp-text-muted)" };

  return (
    <div className="grid gap-3 my-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
      <Card title={fr ? "Part des commissions par courtier" : "Commission share by broker"}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
              {pie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip {...tip} formatter={(v: any, n: any) => [money(Number(v)), n]} />
            <Legend wrapperStyle={{ fontSize: 10.5 }} />
          </PieChart>
        </ResponsiveContainer>
      </Card>
      <Card title={fr ? "Volume vs commission" : "Volume vs commission"}>
        <ResponsiveContainer>
          <BarChart data={top12} margin={{ left: 0, right: 8, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="name" tick={axis} angle={-35} textAnchor="end" interval={0} height={60} />
            <YAxis yAxisId="v" tick={axis} tickFormatter={k} />
            <YAxis yAxisId="c" orientation="right" tick={axis} tickFormatter={k} />
            <Tooltip {...tip} formatter={(v: any, n: any) => [money(Number(v)), n]} />
            <Legend wrapperStyle={{ fontSize: 10.5 }} />
            <Bar yAxisId="v" dataKey="volume" name={fr ? "Volume" : "Volume"} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} onClick={click} />
            <Bar yAxisId="c" dataKey="commission" name="Commission" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} onClick={click} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card title={fr ? "Dossiers par courtier" : "Deals by broker"}>
        <ResponsiveContainer>
          <BarChart data={[...rows].sort((a, b) => b.deals - a.deals).slice(0, 12)} layout="vertical" margin={{ left: 4, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis type="number" tick={axis} />
            <YAxis type="category" dataKey="name" width={120} tick={axis} />
            <Tooltip {...tip} />
            <Bar dataKey="deals" name={fr ? "Dossiers" : "Deals"} fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} onClick={click} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card title={fr ? "Dossier moyen par courtier" : "Average deal by broker"}>
        <ResponsiveContainer>
          <BarChart data={[...rows].filter((b) => b.avgDeal > 0).sort((a, b) => b.avgDeal - a.avgDeal).slice(0, 12)} layout="vertical" margin={{ left: 4, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis type="number" tick={axis} tickFormatter={k} />
            <YAxis type="category" dataKey="name" width={120} tick={axis} />
            <Tooltip {...tip} formatter={(v: any) => [money(Number(v)), fr ? "Dossier moyen" : "Avg deal"]} />
            <Bar dataKey="avgDeal" name={fr ? "Dossier moyen" : "Avg deal"} fill={CHART_COLORS[3]} radius={[0, 4, 4, 0]} onClick={click} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
