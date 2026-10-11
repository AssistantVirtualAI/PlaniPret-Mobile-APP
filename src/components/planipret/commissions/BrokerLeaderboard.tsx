import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Trophy, TrendingUp, TrendingDown } from "lucide-react";

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v || 0);
const fmtNum = (v: number) => new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(v || 0);
const fmtBps = (v: number) => `${(v || 0).toFixed(1)} BPS`;
const fmtPct = (v: number | string) => (typeof v === "number" ? `${(v * 100).toFixed(1)} %` : String(v ?? "—"));

const tooltipStyle = {
  background: "rgba(10,16,30,.92)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 10,
  color: "#fff",
  fontSize: 12,
  backdropFilter: "blur(8px)",
} as const;

function Delta({ value }: { value: number | string }) {
  if (typeof value !== "number") return <span style={{ fontSize: 11.5, color: "var(--pp-text-muted)" }}>{value}</span>;
  const up = value >= 0;
  return (
    <span className="inline-flex items-center gap-0.5" style={{ fontSize: 11.5, fontWeight: 700, color: up ? "#16a34a" : "#ef4444" }}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {(value * 100).toFixed(1)} %
    </span>
  );
}

export default function BrokerLeaderboard({
  lang, brokers, periodLabel, onSelect,
}: {
  lang: "fr" | "en";
  brokers: any[];
  periodLabel?: string;
  onSelect?: (brokerKey: string) => void;
}) {
  const isFr = lang === "fr";
  const top = brokers.slice(0, 10).map((b) => ({ ...b, name: `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim() || b.broker }));

  return (
    <>
      <div className="pp-card" style={{ padding: 14, borderRadius: 14, marginTop: 12 }}>
        <div className="flex items-center justify-between mb-2">
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--pp-text-primary)" }}>
            {isFr ? "Top 10 courtiers — volume" : "Top 10 brokers — volume"}
          </div>
          {periodLabel && <span style={{ fontSize: 11.5, color: "var(--pp-text-muted)" }}>{periodLabel}</span>}
        </div>
        <div style={{ height: 340 }}>
          <ResponsiveContainer>
            <BarChart data={top} layout="vertical" margin={{ left: 40 }}>
              <defs>
                <linearGradient id="gBroker" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#2F5FBF" /><stop offset="100%" stopColor="#5B8FF9" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,.18)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "var(--pp-text-muted)" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "var(--pp-text-muted)" }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [fmtMoney(Number(v)), n]} />
              <Legend wrapperStyle={{ fontSize: 11.5 }} />
              <Bar name={isFr ? "Volume" : "Volume"} dataKey="volume" fill="url(#gBroker)" radius={[0, 6, 6, 0]} />
              <Bar name={isFr ? "Volume N-1" : "PY volume"} dataKey="pyVolume" fill="#A5A5A5" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="pp-card" style={{ padding: 14, borderRadius: 14, marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: "var(--pp-text-primary)" }}>
          {isFr ? "Classement complet des courtiers" : "Full broker ranking"}
        </div>
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12.5 }}>
            <thead>
              <tr>
                {["#", isFr ? "Courtier" : "Broker", "Volume", isFr ? "Doss." : "Deals", "Commission",
                  isFr ? "Doss. moy." : "Avg deal", "BPS", "% vol.", isFr ? "Vol. N-1" : "PY vol.", "YoY vol.", "YoY comm."]
                  .map((h, i) => (
                    <th key={i} style={{
                      textAlign: i <= 1 ? "left" : "right", padding: "8px 10px", fontSize: 11,
                      textTransform: "uppercase", letterSpacing: .3, color: "var(--pp-text-muted)", fontWeight: 800,
                      background: "linear-gradient(180deg, var(--pp-bg-elevated), transparent)",
                      borderBottom: "1px solid var(--pp-bg-border)",
                    }}>{h}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {brokers.map((b, ri) => (
                <tr
                  key={b.brokerKey ?? `row-${ri}`}
                  data-broker-key={b.brokerKey}
                  onClick={() => b.linked !== false && b.brokerKey && onSelect?.(b.brokerKey)}
                  style={{ background: ri % 2 ? "rgba(127,127,127,.045)" : "transparent", cursor: onSelect && b.linked !== false ? "pointer" : undefined }}
                >
                  {[
                    b.rank <= 3
                      ? <span key="r" className="inline-flex items-center gap-1" style={{ fontWeight: 800 }}>
                          <Trophy className="w-3 h-3" style={{ color: b.rank === 1 ? "#FFC000" : b.rank === 2 ? "#C0C0C0" : "#CD7F32" }} />{b.rank}
                        </span>
                      : b.rank,
                    <span key="n" className="flex flex-col" style={{ lineHeight: 1.25 }}>
                      <span style={{ fontWeight: 600 }}>
                        {b.firstName || b.lastName ? `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim() : b.broker}
                      </span>
                      <span style={{ fontSize: 10.5, color: b.maestroBrokerId ? "var(--pp-text-muted)" : "#f59e0b" }}>
                        {b.maestroBrokerId ? `Maestro ${b.maestroBrokerId}` : (isFr ? "Maestro ID manquant" : "Missing Maestro ID")}
                      </span>
                    </span>,

                    fmtMoney(b.volume), fmtNum(b.deals), fmtMoney(b.commission),
                    fmtMoney(b.avgDeal), fmtBps(b.bps), fmtPct(b.sharePct), fmtMoney(b.pyVolume),
                    <Delta key="a" value={b.volumeYoy} />, <Delta key="c" value={b.commissionYoy} />,
                  ].map((c, ci) => (
                    <td key={ci} style={{
                      padding: "7px 10px", textAlign: ci <= 1 ? "left" : "right", whiteSpace: "nowrap",
                      color: "var(--pp-text-primary)", borderBottom: "1px solid var(--pp-bg-border)",
                    }}>{c as any}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
