import { useMemo, useState } from "react";
import { Search, ArrowUpDown, Download } from "lucide-react";

type Lang = "fr" | "en";

export type DealLine = {
  sourceRow: number;
  date: string | null;
  number: string | null;
  institution: string | null;
  mortgageType: string | null;
  term: string | null;
  commissionType: string | null;
  loanAmt: number;
  amount: number;
  countedInVolume: boolean;
  countedInDeals: boolean;
  broker?: string | null;
};

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(v || 0);

type SortKey = "date" | "number" | "institution" | "loanAmt" | "amount";

const PAGE = 25;

/** Workbook helper columns W/X: 1 when the row is counted in the period. */
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

/** Searchable, sortable, paginated deal table with CSV export. */
export default function RegisterDealsTable({ deals, lang }: { deals: DealLine[]; lang: Lang }) {
  const isFr = lang === "fr";
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("date");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle
      ? deals.filter((d) =>
          [d.number, d.institution, d.mortgageType, d.term, d.commissionType, d.date]
            .some((v) => String(v ?? "").toLowerCase().includes(needle)),
        )
      : deals;
    const sorted = [...base].sort((a, b) => {
      const va = a[sort] as any;
      const vb = b[sort] as any;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va ?? "").localeCompare(String(vb ?? "")) * dir;
    });
    return sorted;
  }, [deals, q, sort, dir]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * PAGE, current * PAGE + PAGE);

  const totals = useMemo(() => ({
    volume: filtered.filter((d) => d.countedInVolume).reduce((s, d) => s + d.loanAmt, 0),
    commission: filtered.reduce((s, d) => s + d.amount, 0),
    deals: filtered.filter((d) => d.countedInDeals).length,
  }), [filtered]);

  const toggle = (k: SortKey) => {
    if (k === sort) setDir((d) => (d === 1 ? -1 : 1));
    else { setSort(k); setDir(k === "date" ? -1 : 1); }
    setPage(0);
  };

  const exportCsv = () => {
    const head = ["date", "number", "institution", "mortgage_type", "term", "commission_type", "loan_amt", "amount", "in_volume", "in_deals"];
    const lines = [head.join(";")].concat(
      filtered.map((d) => [
        d.date ?? "", d.number ?? "", d.institution ?? "", d.mortgageType ?? "", d.term ?? "",
        d.commissionType ?? "", String(d.loanAmt ?? 0), String(d.amount ?? 0),
        d.countedInVolume ? "1" : "0", d.countedInDeals ? "1" : "0",
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")),
    );
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "commissions-dossiers.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const th = (label: string, key?: SortKey, align: "left" | "right" = "left") => (
    <th
      onClick={key ? () => toggle(key) : undefined}
      style={{
        textAlign: align, padding: "9px 10px", fontSize: 11, letterSpacing: .3, textTransform: "uppercase",
        color: "var(--pp-text-muted)", fontWeight: 800, cursor: key ? "pointer" : "default", whiteSpace: "nowrap",
      }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {key && <ArrowUpDown className="w-3 h-3" style={{ opacity: sort === key ? 1 : .3 }} />}
      </span>
    </th>
  );

  return (
    <div className="pp-card" style={{ padding: 14, borderRadius: 14, marginTop: 12 }}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", flex: "1 1 220px", maxWidth: 340 }}
        >
          <Search className="w-3.5 h-3.5" style={{ color: "var(--pp-text-muted)" }} />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder={isFr ? "Rechercher un dossier, prêteur…" : "Search a deal, lender…"}
            style={{ background: "transparent", border: 0, outline: "none", fontSize: 12.5, color: "var(--pp-text-primary)", width: "100%" }}
          />
        </div>
        <span style={{ fontSize: 11.5, color: "var(--pp-text-muted)" }}>
          {filtered.length} {isFr ? "lignes" : "rows"} · {totals.deals} {isFr ? "dossiers" : "deals"} · {fmtMoney(totals.volume)} · {fmtMoney(totals.commission)}
        </span>
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
            <tr style={{ background: "linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,0))" }}>
              {th(isFr ? "Date" : "Date", "date")}
              {th(isFr ? "Dossier" : "Deal", "number")}
              {th(isFr ? "Prêteur" : "Lender", "institution")}
              {th(isFr ? "Produit" : "Product")}
              {th(isFr ? "Terme" : "Term")}
              {th(isFr ? "Type" : "Type")}
              {th(isFr ? "Montant prêt" : "Loan", "loanAmt", "right")}
              {th(isFr ? "Commission" : "Commission", "amount", "right")}
              {th(isFr ? "Vol. unique (W)" : "Unique vol. (W)", undefined, "right")}
              {th(isFr ? "Doss. unique (X)" : "Unique deal (X)", undefined, "right")}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr
                key={`${d.sourceRow}-${d.number}-${d.commissionType}`}
                style={{
                  background: "linear-gradient(155deg, var(--pp-bg-elevated) 0%, var(--pp-bg-card) 100%)",
                  boxShadow: "0 6px 16px -14px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.05)",
                }}
              >
                <td style={{ padding: "9px 10px", fontSize: 12, color: "var(--pp-text-secondary)", whiteSpace: "nowrap" }}>{d.date ?? "—"}</td>
                <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 700, color: "var(--pp-text-primary)" }}>{d.number ?? "—"}</td>
                <td style={{ padding: "9px 10px", fontSize: 12, color: "var(--pp-text-secondary)" }}>{d.institution ?? "—"}</td>
                <td style={{ padding: "9px 10px", fontSize: 12, color: "var(--pp-text-secondary)" }}>{d.mortgageType ?? "—"}</td>
                <td style={{ padding: "9px 10px", fontSize: 12, color: "var(--pp-text-secondary)" }}>{d.term ?? "—"}</td>
                <td style={{ padding: "9px 10px", fontSize: 11.5 }}>
                  <span
                    className="px-1.5 py-0.5 rounded-md"
                    style={{
                      background: d.commissionType === "base" ? "rgba(68,114,196,.16)" : "rgba(255,192,0,.14)",
                      color: d.commissionType === "base" ? "#7FA6EE" : "#FFC000", fontWeight: 700,
                    }}
                  >
                    {d.commissionType ?? "—"}
                  </span>
                </td>
                <td style={{ padding: "9px 10px", fontSize: 12, textAlign: "right", color: d.countedInVolume ? "var(--pp-text-primary)" : "var(--pp-text-muted)" }}>
                  {fmtMoney(d.loanAmt)}
                </td>
                <td style={{ padding: "9px 10px", fontSize: 12, textAlign: "right", fontWeight: 800, color: "var(--pp-text-primary)" }}>
                  {fmtMoney(d.amount)}
                </td>
                <td style={{ padding: "9px 10px", fontSize: 11.5, textAlign: "right" }}><Flag on={d.countedInVolume} /></td>
                <td style={{ padding: "9px 10px", fontSize: 11.5, textAlign: "right" }}><Flag on={d.countedInDeals} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: 18, textAlign: "center", fontSize: 12.5, color: "var(--pp-text-muted)" }}>
                  {isFr ? "Aucun dossier pour cette recherche." : "No deal matches this search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <button
            onClick={() => setPage(Math.max(0, current - 1))}
            disabled={current === 0}
            className="px-2.5 py-1 rounded-lg"
            style={{ fontSize: 12, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)", opacity: current === 0 ? .5 : 1 }}
          >
            ‹
          </button>
          <span style={{ fontSize: 12, color: "var(--pp-text-muted)" }}>{current + 1} / {pages}</span>
          <button
            onClick={() => setPage(Math.min(pages - 1, current + 1))}
            disabled={current >= pages - 1}
            className="px-2.5 py-1 rounded-lg"
            style={{ fontSize: 12, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)", opacity: current >= pages - 1 ? .5 : 1 }}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
