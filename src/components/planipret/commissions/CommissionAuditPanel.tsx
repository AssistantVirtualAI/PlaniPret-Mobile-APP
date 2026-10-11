import { useMemo, useState } from "react";
import { ShieldCheck, Search, Download, Info } from "lucide-react";

type Lang = "fr" | "en";

export type AuditIncluded = {
  sourceRow: number;
  date: string | null;
  number: string | null;
  institution: string | null;
  mortgageType: string | null;
  term: string | null;
  broker: string | null;
  loanAmt: number;
  amount: number;
  uniqueVolume: 0 | 1;
  uniqueDeal: 0 | 1;
};

export type AuditExcluded = {
  sourceRow: number;
  date: string | null;
  number: string | null;
  institution: string | null;
  mortgageType: string | null;
  broker: string | null;
  commissionType: string | null;
  loanAmt: number;
  amount: number;
  reason: string;
  reasonLabel: string;
};

export type CommissionAudit = {
  periodLabel?: string;
  scannedRows: number;
  uniqueVolumeRows: number;
  uniqueDealRows: number;
  volume: number;
  commission: number;
  excludedRows: number;
  byReason: { reason: string; label: string; rows: number; loanAmt: number; commission: number }[];
  included: AuditIncluded[];
  excluded: AuditExcluded[];
  truncated?: { included: boolean; excluded: boolean };
};

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v || 0);

const REASON_EN: Record<string, string> = {
  duplicate_amount: "Exact repeat (contract + lender + type + amount already counted)",
  reversal_cancelled: "Cancelled by a matching negative reversal",
  reversal_row: "Negative reversal row (cancels a funding)",
  adjustment: "Maestro adjustment row (is_adjustment = 1)",
  insurance: "Insurance commission (always excluded)",
  non_base: "Commission type ≠ base (bonus, bonus2, perform) — commission still counted",
  no_loan_amount: "No usable loan amount",
};

const PAGE = 25;

const cell = (align: "left" | "right" = "left"): React.CSSProperties => ({
  padding: "8px 10px", fontSize: 12, textAlign: align, color: "var(--pp-text-secondary)", whiteSpace: "nowrap",
});

const thStyle: React.CSSProperties = {
  padding: "8px 10px", fontSize: 11, letterSpacing: .3, textTransform: "uppercase",
  color: "var(--pp-text-muted)", fontWeight: 800, whiteSpace: "nowrap", textAlign: "left",
};

function Flag({ on }: { on: boolean }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded-md"
      style={{
        fontSize: 11, fontWeight: 800,
        background: on ? "rgba(22,163,74,.16)" : "rgba(148,163,184,.14)",
        color: on ? "#22c55e" : "var(--pp-text-muted)",
      }}
    >
      {on ? "1" : "0"}
    </span>
  );
}

/**
 * Audit view: lists the rows that make up the unique Volume / Deals of the
 * selected period (helper columns W/X) and explains why every other row was
 * excluded (exact repeats, reversals, adjustments, insurance).
 */
export default function CommissionAuditPanel({ audit, lang }: { audit?: CommissionAudit | null; lang: Lang }) {
  const isFr = lang === "fr";
  const [view, setView] = useState<"included" | "excluded">("included");
  const [reason, setReason] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const label = (r: { reason: string; label: string }) => (isFr ? r.label : REASON_EN[r.reason] ?? r.label);

  const rows = useMemo(() => {
    if (!audit) return [] as (AuditIncluded | AuditExcluded)[];
    const needle = q.trim().toLowerCase();
    const base: (AuditIncluded | AuditExcluded)[] =
      view === "included"
        ? audit.included
        : audit.excluded.filter((e) => !reason || e.reason === reason);
    if (!needle) return base;
    return base.filter((d) =>
      [d.number, d.institution, d.mortgageType, d.broker, d.date]
        .some((v) => String(v ?? "").toLowerCase().includes(needle)),
    );
  }, [audit, view, reason, q]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const slice = rows.slice(current * PAGE, current * PAGE + PAGE);

  const exportCsv = () => {
    if (!audit) return;
    const head = view === "included"
      ? ["date", "number", "institution", "mortgage_type", "term", "broker", "loan_amt", "amount", "unique_volume_W", "unique_deal_X"]
      : ["date", "number", "institution", "mortgage_type", "broker", "commission_type", "loan_amt", "amount", "reason", "reason_label"];
    const body = rows.map((d: any) => (view === "included"
      ? [d.date, d.number, d.institution, d.mortgageType, d.term, d.broker, d.loanAmt, d.amount, d.uniqueVolume, d.uniqueDeal]
      : [d.date, d.number, d.institution, d.mortgageType, d.broker, d.commissionType, d.loanAmt, d.amount, d.reason, d.reasonLabel]
    ).map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"));
    const blob = new Blob(["\uFEFF" + [head.join(";"), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commissions-audit-${view}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!audit) {
    return (
      <div className="pp-card" style={{ padding: 16, borderRadius: 14, marginTop: 12 }}>
        <p style={{ fontSize: 12.5, color: "var(--pp-text-muted)" }}>
          {isFr ? "Aucune donnée d'audit pour cette période." : "No audit data for this period."}
        </p>
      </div>
    );
  }

  const kpi = (title: string, value: string) => (
    <div className="rounded-xl" style={{ padding: "10px 12px", background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)" }}>
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: .4, color: "var(--pp-text-muted)", fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: "var(--pp-text-primary)" }}>{value}</div>
    </div>
  );

  return (
    <div className="pp-card" style={{ padding: 14, borderRadius: 14, marginTop: 12 }}>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4" style={{ color: "var(--pp-brand-accent-2)" }} />
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--pp-text-primary)" }}>
          {isFr ? "Audit des calculs" : "Calculation audit"}
        </h3>
        {audit.periodLabel && (
          <span style={{ fontSize: 11.5, color: "var(--pp-text-muted)" }}>· {audit.periodLabel}</span>
        )}
      </div>

      <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        {kpi(isFr ? "Lignes analysées" : "Rows scanned", String(audit.scannedRows))}
        {kpi(isFr ? "Volume unique (W)" : "Unique volume (W)", String(audit.uniqueVolumeRows))}
        {kpi(isFr ? "Dossiers uniques (X)" : "Unique deals (X)", String(audit.uniqueDealRows))}
        {kpi("Volume", fmtMoney(audit.volume))}
        {kpi("Commission", fmtMoney(audit.commission))}
        {kpi(isFr ? "Lignes exclues" : "Excluded rows", String(audit.excludedRows))}
      </div>

      {audit.byReason.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {audit.byReason.map((r) => (
            <button
              key={r.reason}
              onClick={() => { setView("excluded"); setReason(reason === r.reason ? "" : r.reason); setPage(0); }}
              title={label(r)}
              className="px-2 py-1 rounded-lg text-left"
              style={{
                fontSize: 11.5, fontWeight: 700,
                background: reason === r.reason ? "var(--pp-brand-accent-2)" : "var(--pp-bg-elevated)",
                color: reason === r.reason ? "#fff" : "var(--pp-text-secondary)",
                border: "1px solid var(--pp-bg-border)", maxWidth: 320,
              }}
            >
              {label(r)} · {r.rows}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--pp-bg-border)" }}>
          {(["included", "excluded"] as const).map((v) => (
            <button
              key={v}
              onClick={() => { setView(v); setPage(0); }}
              style={{
                fontSize: 12, fontWeight: 700, padding: "6px 10px",
                background: view === v ? "var(--pp-brand-accent-2)" : "var(--pp-bg-elevated)",
                color: view === v ? "#fff" : "var(--pp-text-secondary)",
              }}
            >
              {v === "included"
                ? (isFr ? `Comptées (${audit.included.length})` : `Counted (${audit.included.length})`)
                : (isFr ? `Exclues (${audit.excluded.length})` : `Excluded (${audit.excluded.length})`)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", flex: "1 1 200px", maxWidth: 320 }}>
          <Search className="w-3.5 h-3.5" style={{ color: "var(--pp-text-muted)" }} />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder={isFr ? "Rechercher un dossier, prêteur…" : "Search a deal, lender…"}
            style={{ background: "transparent", border: 0, outline: "none", fontSize: 12.5, color: "var(--pp-text-primary)", width: "100%" }}
          />
        </div>

        <button
          onClick={exportCsv}
          className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
          style={{ fontSize: 12, fontWeight: 700, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}
        >
          <Download className="w-3.5 h-3.5" />CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px" }}>
          <thead>
            <tr>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>{isFr ? "Dossier" : "Deal"}</th>
              <th style={thStyle}>{isFr ? "Prêteur" : "Lender"}</th>
              <th style={thStyle}>{isFr ? "Produit" : "Product"}</th>
              <th style={thStyle}>{isFr ? "Courtier" : "Broker"}</th>
              <th style={{ ...thStyle, textAlign: "right" }}>{isFr ? "Montant prêt" : "Loan"}</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Commission</th>
              {view === "included" ? (
                <>
                  <th style={{ ...thStyle, textAlign: "right" }}>W</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>X</th>
                </>
              ) : (
                <th style={thStyle}>{isFr ? "Raison de l'exclusion" : "Exclusion reason"}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {slice.map((d: any) => (
              <tr key={`${view}-${d.sourceRow}-${d.number}`}
                style={{ background: "linear-gradient(155deg, var(--pp-bg-elevated) 0%, var(--pp-bg-card) 100%)" }}>
                <td style={cell()}>{d.date ?? "—"}</td>
                <td style={{ ...cell(), fontWeight: 700, color: "var(--pp-text-primary)" }}>{d.number ?? "—"}</td>
                <td style={cell()}>{d.institution ?? "—"}</td>
                <td style={cell()}>{d.mortgageType ?? "—"}</td>
                <td style={cell()}>{d.broker ?? "—"}</td>
                <td style={cell("right")}>{fmtMoney(d.loanAmt)}</td>
                <td style={{ ...cell("right"), fontWeight: 800, color: "var(--pp-text-primary)" }}>{fmtMoney(d.amount)}</td>
                {view === "included" ? (
                  <>
                    <td style={cell("right")}><Flag on={d.uniqueVolume === 1} /></td>
                    <td style={cell("right")}><Flag on={d.uniqueDeal === 1} /></td>
                  </>
                ) : (
                  <td style={{ ...cell(), whiteSpace: "normal", maxWidth: 320 }}>
                    {isFr ? d.reasonLabel : REASON_EN[d.reason] ?? d.reasonLabel}
                  </td>
                )}
              </tr>
            ))}
            {slice.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 18, textAlign: "center", fontSize: 12.5, color: "var(--pp-text-muted)" }}>
                  {isFr ? "Aucune ligne." : "No rows."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <button onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0}
            className="px-2.5 py-1 rounded-lg"
            style={{ fontSize: 12, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)", opacity: current === 0 ? .5 : 1 }}>‹</button>
          <span style={{ fontSize: 12, color: "var(--pp-text-muted)" }}>{current + 1} / {pages}</span>
          <button onClick={() => setPage(Math.min(pages - 1, current + 1))} disabled={current >= pages - 1}
            className="px-2.5 py-1 rounded-lg"
            style={{ fontSize: 12, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)", opacity: current >= pages - 1 ? .5 : 1 }}>›</button>
        </div>
      )}

      {(audit.truncated?.included || audit.truncated?.excluded) && (
        <p className="mt-2 inline-flex items-center gap-1.5" style={{ fontSize: 11, color: "var(--pp-text-muted)" }}>
          <Info className="w-3 h-3" />
          {isFr ? "Affichage limité aux 1000 premières lignes de chaque liste." : "Display limited to the first 1000 rows of each list."}
        </p>
      )}
    </div>
  );
}
