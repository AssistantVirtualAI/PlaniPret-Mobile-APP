import { useState } from "react";
import { FileDown } from "lucide-react";
import InfoTip from "@/components/planipret/broker/overview/InfoTip";
import type { YearlyBroker } from "./BrokerTopSellers";

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v || 0);
const fmtNum = (v: number) => new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(v || 0);

type Metric = "volume" | "commission" | "deals";

/** Per-broker × per-year matrix, so the firm can compare brokers over 2022→2026. */
export default function BrokerYearMatrix({
  lang, brokerYearly, years, onSelect,
}: {
  lang: "fr" | "en";
  brokerYearly: YearlyBroker[];
  years: number[];
  onSelect?: (brokerKey: string) => void;
}) {
  const isFr = lang === "fr";
  const [metric, setMetric] = useState<Metric>("volume");

  const val = (b: YearlyBroker, y: number) => b.cells.find((c) => c.year === y)?.[metric] ?? 0;
  const fmt = (v: number) => (metric === "deals" ? fmtNum(v) : fmtMoney(v));
  const totalOf = (b: YearlyBroker) =>
    metric === "volume" ? b.totalVolume : metric === "commission" ? b.totalCommission : b.totalDeals;

  const colTotals = years.map((y) => brokerYearly.reduce((a, b) => a + val(b, y), 0));
  const grand = brokerYearly.reduce((a, b) => a + totalOf(b), 0);
  const max = Math.max(1, ...brokerYearly.flatMap((b) => years.map((y) => val(b, y))));

  const exportCsv = () => {
    const head = ["courtier", ...years.map(String), "total"];
    const lines = brokerYearly.map((b) =>
      [`${b.firstName ?? ""} ${b.lastName ?? ""}`.trim() || b.broker,
        ...years.map((y) => Math.round(val(b, y) * 100) / 100),
        Math.round(totalOf(b) * 100) / 100].join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `courtiers-par-annee-${metric}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cellStyle = { padding: "7px 10px", textAlign: "right" as const, whiteSpace: "nowrap" as const, color: "var(--pp-text-primary)", borderBottom: "1px solid var(--pp-bg-border)" };

  return (
    <div className="pp-card" style={{ padding: 14, borderRadius: 14, marginTop: 12 }}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--pp-text-primary)" }}>
          {isFr ? "Évolution par courtier et par année" : "Broker evolution by year"}
        </div>
        <InfoTip
          text={isFr
            ? "Chaque cellule est l'année civile complète (1 jan → 31 déc) du registre importé, indépendamment de la période sélectionnée en haut de page. L'intensité de la couleur indique le poids de la cellule par rapport au meilleur résultat."
            : "Each cell is the full calendar year (Jan 1 → Dec 31) of the imported register, independent of the period selected at the top. Colour intensity shows the cell's weight against the best result."}
        />
        <div className="ml-auto flex items-center gap-1.5">
          {(["volume", "commission", "deals"] as Metric[]).map((m) => (
            <button key={m} onClick={() => setMetric(m)} className="px-2.5 py-1.5 rounded-lg"
              style={{
                fontSize: 12, fontWeight: 700,
                background: metric === m ? "var(--pp-brand-accent, #2F5FBF)" : "var(--pp-bg-elevated)",
                color: metric === m ? "#fff" : "var(--pp-text-secondary)",
                border: "1px solid var(--pp-bg-border)",
              }}>
              {m === "volume" ? "Volume" : m === "commission" ? "Comm." : (isFr ? "Doss." : "Deals")}
            </button>
          ))}
          <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
            style={{ fontSize: 12, fontWeight: 700, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}>
            <FileDown className="w-3.5 h-3.5" />CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12.5 }}>
          <thead>
            <tr>
              {[isFr ? "Courtier" : "Broker", ...years.map(String), "Total"].map((h, i) => (
                <th key={i} style={{
                  textAlign: i === 0 ? "left" : "right", padding: "8px 10px", fontSize: 11,
                  textTransform: "uppercase", letterSpacing: .3, color: "var(--pp-text-muted)", fontWeight: 800,
                  background: "linear-gradient(180deg, var(--pp-bg-elevated), transparent)",
                  borderBottom: "1px solid var(--pp-bg-border)",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {brokerYearly.map((b, ri) => (
              <tr key={b.brokerKey ?? `row-${ri}`}
                data-broker-key={b.brokerKey}
                onClick={() => b.linked !== false && b.brokerKey && onSelect?.(b.brokerKey)}
                style={{ background: ri % 2 ? "rgba(127,127,127,.045)" : "transparent", cursor: onSelect && b.linked !== false ? "pointer" : undefined }}>
                <td style={{ ...cellStyle, textAlign: "left", fontWeight: 700 }}>
                  {`${b.firstName ?? ""} ${b.lastName ?? ""}`.trim() || b.broker}
                  {b.linked === false && (
                    <span style={{ marginLeft: 6, fontSize: 10.5, color: "#f59e0b" }}>
                      {isFr ? "non rattaché" : "unlinked"}
                    </span>
                  )}
                </td>
                {years.map((y) => {
                  const v = val(b, y);
                  return (
                    <td key={y} style={{ ...cellStyle, background: v ? `rgba(91,143,249,${(0.06 + (v / max) * 0.28).toFixed(3)})` : undefined }}>
                      {v ? fmt(v) : "—"}
                    </td>
                  );
                })}
                <td style={{ ...cellStyle, fontWeight: 800 }}>{fmt(totalOf(b))}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...cellStyle, textAlign: "left", fontWeight: 900 }}>Total</td>
              {colTotals.map((v, i) => <td key={i} style={{ ...cellStyle, fontWeight: 800 }}>{fmt(v)}</td>)}
              <td style={{ ...cellStyle, fontWeight: 900 }}>{fmt(grand)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
