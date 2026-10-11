import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Download, CheckCircle2, MinusCircle } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

type Lang = "fr" | "en";

const money = (v: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(Number(v) || 0);
const num = (v: number) => new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(Number(v) || 0);
const bps = (v: number) => `${(Number(v) || 0).toFixed(1)} BPS`;

const tooltipStyle = {
  background: "rgba(10,16,30,.92)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 10,
  color: "#fff",
  fontSize: 12,
  backdropFilter: "blur(8px)",
} as const;

const cell = (align: "left" | "right"): React.CSSProperties => ({
  padding: "7px 10px",
  textAlign: align,
  whiteSpace: "nowrap",
  color: "var(--pp-text-primary)",
  borderBottom: "1px solid var(--pp-bg-border)",
});

export default function BrokerDrilldown({
  lang, detail, loading, error, onClose,
}: {
  lang: Lang;
  detail: any | null;
  loading: boolean;
  error?: string | null;
  onClose: () => void;
}) {
  const isFr = lang === "fr";
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => { setTypeFilter(""); }, [detail?.agent, detail?.window?.start, detail?.window?.end]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const lines: any[] = detail?.lines ?? [];
  const filteredLines = useMemo(
    () => (typeFilter ? lines.filter((l) => (l.commissionType ?? "") === typeFilter) : lines),
    [lines, typeFilter],
  );

  const exportCsv = () => {
    const head = ["source_row", "date", "contrat", "institution", "type_pret", "terme", "type_commission", "montant_pret", "commission", "compte_volume", "compte_dossier", "source", "champ_commission", "champ_volume"];
    const body = filteredLines.map((l) => [
      l.sourceRow, l.date ?? "", l.number ?? "", l.institution ?? "", l.mortgageType ?? "", l.term ?? "",
      l.commissionType ?? "", l.loanAmt ?? "", l.amount ?? "", l.countedInVolume ? "oui" : "non",
      l.countedInDeals ? "oui" : "non", l.provenanceSource, l.provenanceField, l.volumeField,
    ]);
    const csv = [head, ...body].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `detail-${(detail?.agent ?? "courtier").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(3,7,18,.55)", backdropFilter: "blur(2px)" }} />
      <aside
        className="pp-card"
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0,
          width: "min(880px, 96vw)", borderRadius: 0,
          background: "var(--pp-bg-card)", borderLeft: "1px solid var(--pp-bg-border)",
          display: "flex", flexDirection: "column",
          boxShadow: "-24px 0 60px -30px rgba(0,0,0,.7)",
        }}
      >
        <header className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--pp-text-primary)" }}>
              {[detail?.firstName, detail?.lastName].filter(Boolean).join(" ") || detail?.agent || (isFr ? "Courtier" : "Broker")}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--pp-text-muted)" }}>
              {detail?.periodLabel} · {detail?.window?.start} → {detail?.window?.end}
              {detail?.maestroBrokerId ? ` · Maestro ${detail.maestroBrokerId}` : ""}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--pp-text-muted)" }} />}
            <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{ fontSize: 12, fontWeight: 700, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}>
              <Download className="w-3.5 h-3.5" />CSV
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)" }}>
              <X className="w-4 h-4" style={{ color: "var(--pp-text-secondary)" }} />
            </button>
          </div>
        </header>

        <div className="px-4 py-3" style={{ overflowY: "auto", flex: 1 }}>
          {error && <div style={{ fontSize: 12.5, color: "#ef4444" }}>{error}</div>}
          {!detail && loading && (
            <div style={{ padding: 40, textAlign: "center", color: "var(--pp-text-muted)" }}>
              <Loader2 className="w-5 h-5 animate-spin inline" />
            </div>
          )}

          {detail && (
            <>
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
                {[
                  [isFr ? "Volume" : "Volume", money(detail.kpi.volume), money(detail.kpiPy.volume)],
                  [isFr ? "Dossiers" : "Deals", num(detail.kpi.deals), num(detail.kpiPy.deals)],
                  ["Commissions", money(detail.kpi.commission), money(detail.kpiPy.commission)],
                  [isFr ? "Dossier moyen" : "Avg deal", money(detail.kpi.avgDeal), money(detail.kpiPy.avgDeal)],
                  ["BPS", bps(detail.kpi.bps), bps(detail.kpiPy.bps)],
                ].map(([label, v, py]) => (
                  <div key={label as string} className="px-3 py-2 rounded-xl"
                    style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)" }}>
                    <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: .3, color: "var(--pp-text-muted)", fontWeight: 800 }}>{label}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: "var(--pp-text-primary)" }}>{v}</div>
                    <div style={{ fontSize: 10.5, color: "var(--pp-text-muted)" }}>N-1 : {py}</div>
                  </div>
                ))}
              </div>

              <Block title={isFr ? "Commissions par type" : "Commissions by type"}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      {[isFr ? "Type" : "Type", isFr ? "Lignes" : "Rows", isFr ? "Dossiers" : "Deals", "Volume", "Commission"].map((h, i) => (
                        <th key={h} style={{ ...cell(i === 0 ? "left" : "right"), fontSize: 10.5, textTransform: "uppercase", color: "var(--pp-text-muted)", fontWeight: 800 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.byType ?? []).map((t: any, i: number) => (
                      <tr key={t.type} style={{ background: i % 2 ? "rgba(127,127,127,.045)" : "transparent", cursor: "pointer" }}
                        onClick={() => setTypeFilter(typeFilter === t.type ? "" : t.type)}>
                        <td style={{ ...cell("left"), fontWeight: typeFilter === t.type ? 800 : 600 }}>{t.type || "—"}</td>
                        <td style={cell("right")}>{num(t.rows)}</td>
                        <td style={cell("right")}>{num(t.deals)}</td>
                        <td style={cell("right")}>{money(t.volume)}</td>
                        <td style={cell("right")}>{money(t.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Block>

              <Block title={isFr ? "Par période (mois)" : "By period (month)"}>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={detail.byPeriod ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,.18)" vertical={false} />
                      <XAxis dataKey="period" tick={{ fontSize: 10.5, fill: "var(--pp-text-muted)" }} />
                      <YAxis tick={{ fontSize: 10.5, fill: "var(--pp-text-muted)" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [money(Number(v)), n]} />
                      <Legend wrapperStyle={{ fontSize: 11.5 }} />
                      <Bar name={isFr ? "Volume" : "Volume"} dataKey="volume" fill="#4472C4" radius={[5, 5, 0, 0]} />
                      <Bar name="Commission" dataKey="commission" fill="#ED7D31" radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Block>

              <Block
                title={isFr ? "Dossiers et provenance" : "Deals and provenance"}
                right={
                  <div className="flex items-center gap-1.5">
                    {typeFilter && (
                      <button onClick={() => setTypeFilter("")} className="px-2 py-1 rounded-lg"
                        style={{ fontSize: 11, fontWeight: 700, background: "var(--pp-brand-accent-2)", color: "#fff" }}>
                        {typeFilter} ✕
                      </button>
                    )}
                    <span style={{ fontSize: 11.5, color: "var(--pp-text-muted)" }}>{num(filteredLines.length)} {isFr ? "lignes" : "rows"}</span>
                  </div>
                }
              >
                <div className="overflow-x-auto" style={{ maxHeight: 420, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
                    <thead>
                      <tr>
                        {[isFr ? "Date" : "Date", isFr ? "Contrat" : "Contract", isFr ? "Prêteur" : "Lender", isFr ? "Type" : "Type",
                          isFr ? "Terme" : "Term", isFr ? "Comm. type" : "Comm. type", isFr ? "Montant prêt" : "Loan amount",
                          "Commission", isFr ? "Vol." : "Vol.", isFr ? "Doss." : "Deal", isFr ? "Provenance" : "Provenance"].map((h, i) => (
                          <th key={h} style={{
                            position: "sticky", top: 0, zIndex: 1, textAlign: i < 6 ? "left" : "right",
                            padding: "8px 10px", fontSize: 10.5, textTransform: "uppercase", letterSpacing: .3,
                            color: "var(--pp-text-muted)", fontWeight: 800,
                            background: "var(--pp-bg-card)", borderBottom: "1px solid var(--pp-bg-border)",
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLines.slice(0, 600).map((l, i) => (
                        <tr key={`${l.sourceRow}-${i}`} style={{ background: i % 2 ? "rgba(127,127,127,.045)" : "transparent" }}>
                          <td style={cell("left")}>{l.date ?? "—"}</td>
                          <td style={cell("left")}>{l.number ?? "—"}</td>
                          <td style={cell("left")}>{l.institution ?? "—"}</td>
                          <td style={cell("left")}>{l.mortgageType ?? "—"}</td>
                          <td style={cell("left")}>{l.term ?? "—"}</td>
                          <td style={cell("left")}>{l.commissionType ?? "—"}</td>
                          <td style={cell("right")}>{l.loanAmt == null ? "—" : money(Number(l.loanAmt))}</td>
                          <td style={cell("right")}>{l.amount == null ? "—" : money(Number(l.amount))}</td>
                          <td style={cell("right")}>{l.countedInVolume
                            ? <CheckCircle2 className="w-3.5 h-3.5 inline" style={{ color: "#16a34a" }} />
                            : <MinusCircle className="w-3.5 h-3.5 inline" style={{ color: "var(--pp-text-muted)" }} />}</td>
                          <td style={cell("right")}>{l.countedInDeals
                            ? <CheckCircle2 className="w-3.5 h-3.5 inline" style={{ color: "#16a34a" }} />
                            : <MinusCircle className="w-3.5 h-3.5 inline" style={{ color: "var(--pp-text-muted)" }} />}</td>
                          <td style={{ ...cell("right"), fontSize: 10.5, color: "var(--pp-text-muted)" }}>
                            {l.provenanceSource} · {l.provenanceField} / {l.volumeField}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {detail.truncated && (
                  <div style={{ fontSize: 11.5, color: "var(--pp-text-muted)", marginTop: 6 }}>
                    {isFr ? "Liste tronquée à 2000 lignes." : "List truncated to 2000 rows."}
                  </div>
                )}
              </Block>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Block({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-xl" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", padding: 12 }}>
      <div className="flex items-center justify-between mb-2">
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--pp-text-primary)" }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}
