import { useMemo, useState } from "react";
import { Crown, Medal, Award, FileDown } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import InfoTip from "@/components/planipret/broker/overview/InfoTip";

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v || 0);
const fmtNum = (v: number) => new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(v || 0);

const tooltipStyle = {
  background: "rgba(10,16,30,.92)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 10,
  color: "#fff",
  fontSize: 12,
  backdropFilter: "blur(8px)",
} as const;

type Metric = "volume" | "commission" | "deals";

export type YearlyBroker = {
  broker: string;
  /** Stable opaque identity (brokerId) — the only value sent to drill-down. */
  brokerKey?: string;
  linked?: boolean;
  maestroBrokerId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  brokerUserId?: string | null;
  cells: { year: number; volume: number; deals: number; commission: number; bps: number; avgDeal: number }[];
  totalVolume: number;
  totalDeals: number;
  totalCommission: number;
};

function label(b: YearlyBroker) {
  const n = `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim();
  return n || b.broker;
}

const PODIUM = ["#FFC000", "#C0C0C0", "#CD7F32"];

/**
 * Top sellers podium + ranked bars for a given year (or all years combined),
 * driven by the per-broker × per-year matrix returned by pp-commission-stats.
 */
export default function BrokerTopSellers({
  lang, brokerYearly, years, year, onYear, onSelect,
}: {
  lang: "fr" | "en";
  brokerYearly: YearlyBroker[];
  years: number[];
  year: number | "all";
  onYear: (y: number | "all") => void;
  onSelect?: (brokerKey: string) => void;
}) {
  const isFr = lang === "fr";
  const [metric, setMetric] = useState<Metric>("volume");

  const rows = useMemo(() => {
    const pick = (b: YearlyBroker) => {
      if (year === "all") {
        return { volume: b.totalVolume, deals: b.totalDeals, commission: b.totalCommission };
      }
      const c = b.cells.find((x) => x.year === year);
      return { volume: c?.volume ?? 0, deals: c?.deals ?? 0, commission: c?.commission ?? 0 };
    };
    return brokerYearly
      .map((b) => {
        const v = pick(b);
        return {
          broker: b.broker,
          brokerKey: b.brokerKey,
          linked: b.linked,
          name: label(b),
          ...v,
          avgDeal: v.deals ? v.volume / v.deals : 0,
          bps: v.volume ? (v.commission / v.volume) * 10000 : 0,
        };
      })
      .filter((r) => r.volume || r.deals || r.commission)
      .sort((a, b) => (b[metric] as number) - (a[metric] as number))
      .map((r, i) => ({ rank: i + 1, ...r }));
  }, [brokerYearly, year, metric]);

  const total = rows.reduce((a, r) => a + (r[metric] as number), 0);
  const fmt = (v: number) => (metric === "deals" ? fmtNum(v) : fmtMoney(v));

  const exportCsv = () => {
    const head = ["rang", "courtier", "annee", "volume", "dossiers", "commission", "dossier_moyen", "bps", "part_%"];
    const lines = rows.map((r) => [
      r.rank, r.name, year === "all" ? "2022-2026" : year,
      Math.round(r.volume), r.deals, Math.round(r.commission * 100) / 100,
      Math.round(r.avgDeal), Math.round(r.bps * 10) / 10,
      total ? Math.round(((r[metric] as number) / total) * 1000) / 10 : 0,
    ].join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `top-courtiers-${year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const metricLabel = metric === "volume" ? "Volume" : metric === "commission" ? "Commission" : (isFr ? "Dossiers" : "Deals");

  return (
    <div className="pp-card" style={{ padding: 14, borderRadius: 14, marginTop: 12 }}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--pp-text-primary)" }}>
          {isFr ? "Top vendeurs" : "Top sellers"}
        </div>
        <InfoTip
          text={isFr
            ? "Classement des courtiers pour l'année choisie. Le volume dédoublonne contrat + prêteur + type de prêt; les dossiers comptent les numéros de contrat uniques; la commission additionne base, bonus et ajustements."
            : "Broker ranking for the selected year. Volume dedupes contract + lender + mortgage type; deals count unique contract numbers; commission sums base, bonus and adjustments."}
        />

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <select
            value={String(year)}
            onChange={(e) => onYear(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="px-2 py-1.5 rounded-lg"
            style={{ fontSize: 12, fontWeight: 700, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" }}
          >
            <option value="all">{isFr ? "Toutes les années" : "All years"}</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>

          {(["volume", "commission", "deals"] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className="px-2.5 py-1.5 rounded-lg"
              style={{
                fontSize: 12, fontWeight: 700,
                background: metric === m ? "var(--pp-brand-accent, #2F5FBF)" : "var(--pp-bg-elevated)",
                color: metric === m ? "#fff" : "var(--pp-text-secondary)",
                border: "1px solid var(--pp-bg-border)",
              }}
            >
              {m === "volume" ? "Volume" : m === "commission" ? "Comm." : (isFr ? "Doss." : "Deals")}
            </button>
          ))}

          <button
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
            style={{ fontSize: 12, fontWeight: 700, opacity: rows.length ? 1 : .5, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}
          >
            <FileDown className="w-3.5 h-3.5" />CSV
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--pp-text-muted)", padding: "18px 4px" }}>
          {isFr ? "Aucune donnée pour cette année." : "No data for this year."}
        </div>
      ) : (
        <>
          <div className="grid gap-2.5 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
            {rows.slice(0, 3).map((r, i) => (
              <div
                key={r.brokerKey ?? `top-${i}`}
                data-broker-key={r.brokerKey}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onClick={() => r.linked !== false && r.brokerKey && onSelect?.(r.brokerKey)}
                onKeyDown={(e) => { if (onSelect && r.linked !== false && r.brokerKey && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(r.brokerKey); } }}
                className={`ov3d-card${onSelect ? " pp-drillable" : ""}`}
                style={{
                  padding: 12, borderRadius: 14,
                  border: `1px solid ${PODIUM[i]}55`,
                  background: `linear-gradient(160deg, ${PODIUM[i]}1f, transparent 65%), var(--pp-bg-elevated)`,
                }}
                title={isFr ? "Voir les dossiers de ce courtier" : "View this broker's deals"}
              >
                <div className="flex items-center gap-1.5" style={{ color: PODIUM[i], fontWeight: 900, fontSize: 12 }}>
                  {i === 0 ? <Crown className="w-4 h-4" /> : i === 1 ? <Medal className="w-4 h-4" /> : <Award className="w-4 h-4" />}
                  #{r.rank} · {metricLabel}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--pp-text-primary)", marginTop: 4 }}>{r.name}</div>
                <div style={{ fontSize: 19, fontWeight: 900, color: "var(--pp-text-primary)", marginTop: 2 }}>
                  {fmt(r[metric] as number)}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--pp-text-secondary)", marginTop: 2 }}>
                  {fmtMoney(r.volume)} · {fmtNum(r.deals)} {isFr ? "doss." : "deals"} · {fmtMoney(r.commission)}
                </div>
                <div style={{ fontSize: 11, color: "var(--pp-text-muted)", marginTop: 2 }}>
                  {total ? `${(((r[metric] as number) / total) * 100).toFixed(1)} % ${isFr ? "du total" : "of total"}` : "—"}
                </div>
              </div>
            ))}
          </div>

          <div style={{ height: Math.max(180, Math.min(rows.length, 12) * 30 + 40) }}>
            <ResponsiveContainer>
              <BarChart data={rows.slice(0, 12)} layout="vertical" margin={{ left: 30, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,.18)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--pp-text-muted)" }}
                  tickFormatter={(v) => (metric === "deals" ? fmtNum(Number(v)) : `${Math.round(Number(v) / 1000)}k`)} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "var(--pp-text-muted)" }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmt(Number(v)), metricLabel]} />
                <Bar dataKey={metric} radius={[0, 6, 6, 0]} onClick={(d: any) => { const p = d?.payload; if (p?.brokerKey && p.linked !== false) onSelect?.(p.brokerKey); }}>
                  {rows.slice(0, 12).map((r, i) => (
                    <Cell key={r.brokerKey ?? `bar-${i}`} fill={i < 3 ? PODIUM[i] : "#5B8FF9"} cursor={onSelect ? "pointer" : undefined} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
