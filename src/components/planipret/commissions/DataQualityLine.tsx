import { useState } from "react";

export type DataQuality = {
  received: number;
  counted_files: number;
  reasons: Record<string, number>;
  duplicates: number;
  conflicting_loans: number;
  unknown_types: string[];
  missing_rows: number;
  excluded_samples?: Array<{ reason: string; contract: string; type: string; amount: number; loan: number; date: string | null }>;
};

const LABELS: Record<string, [string, string]> = {
  counted: ["comptées", "counted"],
  not_base: ["hors base (bonus, override…)", "non-base (bonus, override…)"],
  team_file: ["dossiers d'équipe", "team files"],
  undated: ["sans date", "undated"],
  zero_loan: ["prêt à 0 $", "zero loan"],
  no_contract: ["sans contrat", "no contract"],
  duplicate: ["doublons", "duplicates"],
  non_numeric: ["montant non numérique", "non-numeric amount"],
};

/** Shows exactly how Maestro rows were read: received, counted, set aside and why. */
export default function DataQualityLine({ dq, ai, fr }: { dq?: DataQuality | null; ai?: { summary?: string; anomalies?: Array<{ detail: string; severity: string }> } | null; fr: boolean }) {
  const [open, setOpen] = useState(false);
  if (!dq) return null;
  const l = (k: string) => (LABELS[k]?.[fr ? 0 : 1] ?? k);
  const parts = Object.entries(dq.reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${l(k)}`);
  return (
    <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <strong style={{ color: "var(--pp-text-primary)" }}>{fr ? "Qualité des données" : "Data quality"}</strong>
        <span>{dq.received} {fr ? "lignes reçues" : "rows received"} · {dq.counted_files} {fr ? "dossiers comptés" : "files counted"}</span>
        {dq.missing_rows > 0 && <span style={{ color: "var(--pp-warning)" }}>{dq.missing_rows} {fr ? "lignes non renvoyées par Maestro" : "rows not returned by Maestro"}</span>}
        <button type="button" onClick={() => setOpen((v) => !v)} className="ml-auto font-bold underline">{open ? (fr ? "Masquer" : "Hide") : (fr ? "Détail" : "Detail")}</button>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <div>{parts.join(" · ")}</div>
          {(dq.conflicting_loans > 0 || dq.unknown_types.length > 0) && (
            <div style={{ color: "var(--pp-warning)" }}>
              {dq.conflicting_loans > 0 && <>{dq.conflicting_loans} {fr ? "contrats avec plusieurs montants de prêt" : "contracts with several loan amounts"}. </>}
              {dq.unknown_types.length > 0 && <>{fr ? "Types inconnus" : "Unknown types"} : {dq.unknown_types.join(", ")}</>}
            </div>
          )}
          {ai?.summary && <div><strong>Claude :</strong> {ai.summary}</div>}
          {ai?.anomalies?.filter((a) => a.severity !== "info").map((a, i) => <div key={i}>• {a.detail}</div>)}
          {!!dq.excluded_samples?.length && (
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-[10px]">
                <thead><tr className="text-left"><th>{fr ? "Raison" : "Reason"}</th><th>{fr ? "Contrat" : "Contract"}</th><th>Type</th><th className="text-right">{fr ? "Prêt" : "Loan"}</th><th>Date</th></tr></thead>
                <tbody>{dq.excluded_samples.map((r, i) => <tr key={i}><td>{l(r.reason)}</td><td>{r.contract}</td><td>{r.type}</td><td className="text-right">{r.loan.toLocaleString(fr ? "fr-CA" : "en-CA")}</td><td>{r.date ?? "—"}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
