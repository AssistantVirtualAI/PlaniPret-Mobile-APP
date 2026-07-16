import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import type { ServiceFinance } from "@/lib/planipret/pricing";
import { SERVICE_META, computeTotals, fmtMoney } from "@/lib/planipret/pricing";

const TooltipDark = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "var(--pp-text-primary)" }}>
      {label && <div style={{ color: "var(--pp-text-muted)", marginBottom: 4 }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color || p.fill }} />
          <span>{p.name}: <strong>{typeof p.value === "number" ? fmtMoney(p.value) : p.value}</strong></span>
        </div>
      ))}
    </div>
  );
};

export function RevenueBreakdown({ rows }: { rows: ServiceFinance[] }) {
  const totals = computeTotals(rows);
  const donut = rows.map((r) => ({ name: SERVICE_META[r.service].label, value: r.profit, color: SERVICE_META[r.service].color }));
  const bars = rows.map((r) => ({
    name: SERVICE_META[r.service].label,
    Revenus: r.revenue,
    Coûts: r.cost,
    Profit: r.profit,
    color: SERVICE_META[r.service].color,
  }));

  return (
    <div className="pp-card" style={{ padding: 20 }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)" }}>Performance financière mensuelle</h2>
          <p style={{ fontSize: 11, color: "var(--pp-text-faint)" }} className="mt-0.5">Revenus, coûts et profit par service</p>
        </div>
        <div className="text-right">
          <div style={{ fontSize: 10, color: "var(--pp-text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Projection annuelle</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#00D4AA" }} className="tabular-nums">{fmtMoney(totals.annualProfit)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Donut profit */}
        <div className="lg:col-span-2 relative">
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={92} paddingAngle={3} stroke="none">
                  {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip content={<TooltipDark />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span style={{ fontSize: 10, color: "var(--pp-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Profit total</span>
            <span style={{ fontSize: 24, fontWeight: 700, color: "#00D4AA" }} className="tabular-nums">{fmtMoney(totals.profit)}</span>
            <span style={{ fontSize: 10, color: "var(--pp-text-muted)" }}>/ mois</span>
          </div>
          <div className="flex flex-wrap justify-center gap-3 mt-2">
            {donut.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                <span style={{ fontSize: 10, color: "var(--pp-text-muted)" }}>{d.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar chart breakdown */}
        <div className="lg:col-span-3">
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={bars} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="#4A7FA5" fontSize={10} />
                <YAxis stroke="#4A7FA5" fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<TooltipDark />} cursor={{ fill: "rgba(46,155,220,0.06)" }} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#8FA8C0" }} />
                <Bar dataKey="Revenus" fill="#2E9BDC" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Coûts" fill="#E84C4C" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Profit" fill="#00D4AA" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4" style={{ borderTop: "1px solid var(--pp-bg-border-2)" }}>
        <TotalCell label="MRR" value={fmtMoney(totals.revenue)} color="#2E9BDC" />
        <TotalCell label="Coûts mensuels" value={fmtMoney(totals.cost)} color="#E84C4C" />
        <TotalCell label="Profit mensuel" value={fmtMoney(totals.profit)} color="#00D4AA" emphasis />
        <TotalCell label="Marge globale" value={`${totals.marginPct.toFixed(1)}%`} color="#9B7FE8" />
      </div>
    </div>
  );
}

function TotalCell({ label, value, color, emphasis }: { label: string; value: string; color: string; emphasis?: boolean }) {
  return (
    <div className="flex flex-col">
      <span style={{ fontSize: 10, color: "var(--pp-text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontSize: emphasis ? 22 : 18, fontWeight: 700, color }} className="tabular-nums">{value}</span>
    </div>
  );
}
