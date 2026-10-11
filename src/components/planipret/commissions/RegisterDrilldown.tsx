import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Download, FileSpreadsheet } from "lucide-react";
import type { DealLine } from "./RegisterDealsTable";

type Lang = "fr" | "en";

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v || 0);
const fmtNum = (v: number) => new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(v || 0);

const MONTHS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dealsCsv(deals: DealLine[], filename: string) {
  const head = ["source_row", "date", "number", "broker", "institution", "mortgage_type", "term", "commission_type", "loan_amt", "amount", "in_volume", "in_deals"];
  const lines = [head.join(";")].concat(
    deals.map((d) => [
      String(d.sourceRow ?? ""), d.date ?? "", d.number ?? "", d.broker ?? "", d.institution ?? "",
      d.mortgageType ?? "", d.term ?? "", d.commissionType ?? "",
      String(d.loanAmt ?? 0), String(d.amount ?? 0),
      d.countedInVolume ? "1" : "0", d.countedInDeals ? "1" : "0",
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")),
  );
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Drill-down modal: opened by clicking a KPI, a chart series or a table row.
 * Shows the underlying deals with totals, a monthly chronology and the exact
 * source of every line (deposit-register row numbers), plus a CSV export.
 */
export default function RegisterDrilldown({
  open, onClose, lang, title, subtitle, deals, contextLabel,
}: {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  title: string;
  subtitle?: string;
  deals: DealLine[];
  contextLabel?: string;
}) {
  const isFr = lang === "fr";
  const MONTHS = isFr ? MONTHS_FR : MONTHS_EN;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const totals = useMemo(() => {
    const volume = deals.filter((d) => d.countedInVolume).reduce((s, d) => s + (d.loanAmt || 0), 0);
    const commission = deals.reduce((s, d) => s + (d.amount || 0), 0);
    const count = deals.filter((d) => d.countedInDeals).length;
    return {
      volume, commission, count,
      avg: count ? volume / count : 0,
      bps: volume ? (commission / volume) * 10000 : 0,
    };
  }, [deals]);

  const timeline = useMemo(() => {
    const map = new Map<string, { key: string; label: string; volume: number; commission: number; deals: number }>();
    for (const d of deals) {
      const dt = d.date ? new Date(d.date) : null;
      const key = dt && !Number.isNaN(dt.getTime())
        ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`
        : "—";
      const label = dt && !Number.isNaN(dt.getTime())
        ? `${MONTHS[dt.getMonth()]} ${String(dt.getFullYear()).slice(2)}`
        : (isFr ? "Sans date" : "No date");
      const cur = map.get(key) ?? { key, label, volume: 0, commission: 0, deals: 0 };
      if (d.countedInVolume) cur.volume += d.loanAmt || 0;
      cur.commission += d.amount || 0;
      if (d.countedInDeals) cur.deals += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [deals, MONTHS, isFr]);

  const maxVol = Math.max(1, ...timeline.map((t) => t.volume));

  const sources = useMemo(() => {
    const rows = deals.map((d) => d.sourceRow).filter((r) => Number.isFinite(r)) as number[];
    const lenders = Array.from(new Set(deals.map((d) => d.institution).filter(Boolean))) as string[];
    const brokers = Array.from(new Set(deals.map((d) => d.broker).filter(Boolean))) as string[];
    return {
      rows: rows.length,
      min: rows.length ? Math.min(...rows) : null,
      max: rows.length ? Math.max(...rows) : null,
      lenders, brokers,
    };
  }, [deals]);

  if (!open) return null;

  const kpis = [
    { l: "Volume", v: fmtMoney(totals.volume), c: "#4472C4" },
    { l: isFr ? "Dossiers" : "Deals", v: fmtNum(totals.count), c: "#70AD47" },
    { l: "Commission", v: fmtMoney(totals.commission), c: "#ED7D31" },
    { l: isFr ? "Dossier moyen" : "Avg deal", v: fmtMoney(totals.avg), c: "#FFC000" },
    { l: "BPS", v: `${totals.bps.toFixed(1)}`, c: "#8B5CF6" },
  ];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(4,8,18,.72)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "4vh 12px", overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pp-card w-full"
        style={{
          maxWidth: 960, borderRadius: 16, padding: 16,
          background: "var(--pp-bg-card, var(--pp-bg-elevated))",
          border: "1px solid var(--pp-bg-border)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--pp-text-primary)" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: "var(--pp-text-muted)", marginTop: 2 }}>{subtitle}</div>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => dealsCsv(deals, `drilldown-${title.replace(/[^\w-]+/g, "-").toLowerCase()}.csv`)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{ fontSize: 12, fontWeight: 700, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}
            >
              <Download className="w-3.5 h-3.5" />CSV
            </button>
            <button onClick={onClose} aria-label={isFr ? "Fermer" : "Close"}
              className="rounded-lg flex items-center justify-center"
              style={{ width: 30, height: 30, border: "1px solid var(--pp-bg-border)", background: "var(--pp-bg-elevated)", color: "var(--pp-text-muted)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Totals */}
        <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))" }}>
          {kpis.map((k) => (
            <div key={k.l} className="rounded-xl" style={{ padding: 10, border: "1px solid var(--pp-bg-border)", background: `linear-gradient(180deg, ${k.c}14, transparent)` }}>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: .4, fontWeight: 800, color: "var(--pp-text-muted)" }}>{k.l}</div>
              <div className="tabular-nums" style={{ fontSize: 17, fontWeight: 800, color: "var(--pp-text-primary)" }}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* Chronology */}
        <div className="mt-4">
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--pp-text-primary)", marginBottom: 6 }}>
            {isFr ? "Chronologie" : "Timeline"}
          </div>
          <div className="flex flex-col gap-1.5">
            {timeline.map((t) => (
              <div key={t.key} className="flex items-center gap-2">
                <span style={{ width: 62, fontSize: 11.5, color: "var(--pp-text-muted)" }}>{t.label}</span>
                <div className="flex-1 rounded-full overflow-hidden" style={{ height: 9, background: "rgba(127,127,127,.16)" }}>
                  <div style={{ width: `${(t.volume / maxVol) * 100}%`, height: "100%", background: "linear-gradient(90deg,#4472C4,#14B8A6)" }} />
                </div>
                <span className="tabular-nums" style={{ width: 110, textAlign: "right", fontSize: 11.5, color: "var(--pp-text-secondary)" }}>{fmtMoney(t.volume)}</span>
                <span className="tabular-nums" style={{ width: 90, textAlign: "right", fontSize: 11.5, color: "var(--pp-text-primary)", fontWeight: 700 }}>{fmtMoney(t.commission)}</span>
                <span className="tabular-nums" style={{ width: 46, textAlign: "right", fontSize: 11.5, color: "var(--pp-text-muted)" }}>{t.deals}</span>
              </div>
            ))}
            {timeline.length === 0 && (
              <div style={{ fontSize: 12.5, color: "var(--pp-text-muted)" }}>{isFr ? "Aucun dossier." : "No deal."}</div>
            )}
          </div>
        </div>

        {/* Deals table */}
        <div className="mt-4 overflow-x-auto" style={{ maxHeight: 320, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 3px", fontSize: 12 }}>
            <thead>
              <tr>
                {[isFr ? "Ligne" : "Row", "Date", isFr ? "Dossier" : "Deal", isFr ? "Prêteur" : "Lender", "Type", isFr ? "Prêt" : "Loan", "Commission"].map((h, i) => (
                  <th key={h} style={{ textAlign: i >= 5 ? "right" : "left", padding: "6px 8px", fontSize: 10.5, textTransform: "uppercase", color: "var(--pp-text-muted)", fontWeight: 800, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deals.map((d, i) => (
                <tr key={`${d.sourceRow}-${d.number}-${d.commissionType}-${i}`} style={{ background: "var(--pp-bg-elevated)" }}>
                  <td style={{ padding: "6px 8px", color: "var(--pp-text-muted)" }}>#{d.sourceRow}</td>
                  <td style={{ padding: "6px 8px", color: "var(--pp-text-secondary)", whiteSpace: "nowrap" }}>{d.date ?? "—"}</td>
                  <td style={{ padding: "6px 8px", fontWeight: 700, color: "var(--pp-text-primary)" }}>{d.number ?? "—"}</td>
                  <td style={{ padding: "6px 8px", color: "var(--pp-text-secondary)" }}>{d.institution ?? "—"}</td>
                  <td style={{ padding: "6px 8px", color: "var(--pp-text-secondary)" }}>{d.commissionType ?? "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--pp-text-secondary)" }}>{fmtMoney(d.loanAmt)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800, color: "var(--pp-text-primary)" }}>{fmtMoney(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sources */}
        <div className="mt-4 rounded-xl" style={{ padding: 10, border: "1px dashed var(--pp-bg-border)" }}>
          <div className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 800, color: "var(--pp-text-primary)" }}>
            <FileSpreadsheet className="w-3.5 h-3.5" />{isFr ? "Sources des données" : "Data sources"}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--pp-text-muted)", marginTop: 4, lineHeight: 1.6 }}>
            {isFr ? "Registre de dépôts (fichier Excel importé) — " : "Deposit register (imported Excel file) — "}
            {sources.rows} {isFr ? "lignes" : "rows"}
            {sources.min != null && <> · {isFr ? "lignes source" : "source rows"} #{sources.min}–#{sources.max}</>}
            {contextLabel && <> · {contextLabel}</>}
            <br />
            {isFr ? "Prêteurs" : "Lenders"}: {sources.lenders.join(", ") || "—"}
            {sources.brokers.length > 0 && <> · {isFr ? "Courtiers" : "Brokers"}: {sources.brokers.join(", ")}</>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
