import { useState } from "react";
import { CalendarOff, ChevronDown } from "lucide-react";

type UndatedRow = {
  broker: string | null;
  number: string | null;
  institution: string | null;
  commissionType: string | null;
  fiscalYear: number | null;
  amount: number;
  loanAmt: number;
};

export type UndatedPayload = {
  count: number;
  amount: number;
  loanAmt: number;
  impactPct: number;
  byBroker: { broker: string; count: number; amount: number; loanAmt: number; years: number[] }[];
  rows: UndatedRow[];
};

const money = (n: number, isFr: boolean) =>
  new Intl.NumberFormat(isFr ? "fr-CA" : "en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n || 0);

/**
 * Lists the Maestro transactions without `date_trans`. They are excluded from
 * commissions, deals, volume and YoY — this panel shows what they would weigh.
 */
export default function UndatedTransactionsPanel({
  lang,
  data,
}: {
  lang: "fr" | "en";
  data?: UndatedPayload | null;
}) {
  const isFr = lang !== "en";
  const [open, setOpen] = useState(false);
  if (!data || !data.count) return null;

  const pct = `${(data.impactPct * 100).toFixed(2)} %`;

  return (
    <div
      className="pp-hide-export rounded-xl mb-3"
      style={{ border: "1px solid var(--pp-bg-border)", background: "var(--pp-bg-elevated)" }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <CalendarOff className="w-4 h-4" style={{ color: "var(--pp-brand-accent-2)" }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--pp-text-primary)" }}>
          {isFr ? "Transactions Maestro sans date" : "Maestro transactions without a date"}
        </span>
        <span style={{ fontSize: 12, color: "var(--pp-text-secondary)" }}>
          {data.count} {isFr ? "ligne(s)" : "row(s)"} · {money(data.amount, isFr)} ·{" "}
          {isFr ? `impact ${pct} des commissions` : `impact ${pct} of commissions`}
        </span>
        <ChevronDown
          className="w-4 h-4 ml-auto"
          style={{ color: "var(--pp-text-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}
        />
      </button>

      {open && (
        <div className="px-3 pb-3">
          <p style={{ fontSize: 11.5, color: "var(--pp-text-muted)", marginBottom: 8 }}>
            {isFr
              ? "Ces lignes sont exclues des commissions, dossiers, volume et de la comparaison annuelle."
              : "These rows are excluded from commissions, deals, volume and the year-over-year comparison."}
          </p>

          <div className="overflow-x-auto">
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--pp-text-muted)", textAlign: "left" }}>
                  <th style={{ padding: "4px 6px" }}>{isFr ? "Courtier" : "Broker"}</th>
                  <th style={{ padding: "4px 6px" }}>{isFr ? "Années" : "Years"}</th>
                  <th style={{ padding: "4px 6px", textAlign: "right" }}>{isFr ? "Lignes" : "Rows"}</th>
                  <th style={{ padding: "4px 6px", textAlign: "right" }}>{isFr ? "Montant exclu" : "Excluded amount"}</th>
                </tr>
              </thead>
              <tbody>
                {data.byBroker.map((b) => (
                  <tr key={b.broker} style={{ borderTop: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}>
                    <td style={{ padding: "4px 6px", fontWeight: 700, color: "var(--pp-text-primary)" }}>{b.broker}</td>
                    <td style={{ padding: "4px 6px" }}>{b.years.join(", ") || "—"}</td>
                    <td style={{ padding: "4px 6px", textAlign: "right" }}>{b.count}</td>
                    <td style={{ padding: "4px 6px", textAlign: "right" }}>{money(b.amount, isFr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details style={{ marginTop: 10 }}>
            <summary style={{ fontSize: 12, fontWeight: 700, color: "var(--pp-text-secondary)", cursor: "pointer" }}>
              {isFr ? "Voir le détail des lignes" : "See row details"}
            </summary>
            <div className="overflow-x-auto" style={{ maxHeight: 320, overflowY: "auto", marginTop: 6 }}>
              <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "var(--pp-text-muted)", textAlign: "left" }}>
                    <th style={{ padding: "4px 6px" }}>{isFr ? "Dossier" : "Deal"}</th>
                    <th style={{ padding: "4px 6px" }}>{isFr ? "Courtier" : "Broker"}</th>
                    <th style={{ padding: "4px 6px" }}>{isFr ? "Prêteur" : "Lender"}</th>
                    <th style={{ padding: "4px 6px" }}>Type</th>
                    <th style={{ padding: "4px 6px" }}>{isFr ? "Année" : "Year"}</th>
                    <th style={{ padding: "4px 6px", textAlign: "right" }}>{isFr ? "Montant" : "Amount"}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={`${r.number}-${r.commissionType}-${i}`} style={{ borderTop: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}>
                      <td style={{ padding: "4px 6px", fontWeight: 700, color: "var(--pp-text-primary)" }}>{r.number ?? "—"}</td>
                      <td style={{ padding: "4px 6px" }}>{r.broker ?? "—"}</td>
                      <td style={{ padding: "4px 6px" }}>{r.institution ?? "—"}</td>
                      <td style={{ padding: "4px 6px" }}>{r.commissionType ?? "—"}</td>
                      <td style={{ padding: "4px 6px" }}>{r.fiscalYear ?? "—"}</td>
                      <td style={{ padding: "4px 6px", textAlign: "right" }}>{money(r.amount, isFr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
