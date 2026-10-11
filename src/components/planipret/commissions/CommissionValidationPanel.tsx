import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Users } from "lucide-react";

const money = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n || 0);

interface BrokerDir {
  user_id: string;
  full_name: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  maestro_broker_id: string | null;
}

interface Props {
  isFr: boolean;
  call: (payload: any) => Promise<any>;
}

export default function CommissionValidationPanel({ isFr, call }: Props) {
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>(null);
  const [brokers, setBrokers] = useState<BrokerDir[]>([]);
  const [assign, setAssign] = useState<Record<string, { brokerUserId: string; maestroId: string }>>({});

  const load = async () => {
    setBusy(true);
    try {
      const [rep, dir] = await Promise.all([call({ action: "validate" }), call({ action: "brokers.list" })]);
      setData(rep);
      setBrokers(dir.brokers ?? []);
    } catch { /* ignore */ } finally { setBusy(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const redispatch = async () => {
    setBusy(true);
    try { await call({ action: "redispatch" }); await load(); } finally { setBusy(false); }
  };

  const linkBroker = async (rawName: string) => {
    const a = assign[rawName];
    if (!a?.brokerUserId && !a?.maestroId) return;
    const b = brokers.find((x) => x.user_id === a.brokerUserId);
    setBusy(true);
    try {
      await call({
        action: "alias.upsert",
        rawName,
        brokerUserId: a.brokerUserId || null,
        maestroBrokerId: a.maestroId || b?.maestro_broker_id || null,
        firstName: b?.first_name ?? null,
        lastName: b?.last_name ?? null,
      });
      await call({ action: "redispatch" });
      await load();
    } finally { setBusy(false); }
  };

  const r = data?.report;
  const checks = useMemo(() => {
    if (!r) return [];
    const eq = (a: number, b: number) => Math.abs((a || 0) - (b || 0)) < 1;
    return [
      { label: isFr ? "Aucune ligne orpheline" : "No orphan rows", ok: r.orphanRows === 0, detail: `${r.orphanRows}` },
      { label: isFr ? "Volume courtiers = volume global" : "Broker volume = global", ok: eq(r.brokerVolumeSum, r.totalVolume), detail: `${money(r.brokerVolumeSum)} / ${money(r.totalVolume)}` },
      { label: isFr ? "Commissions courtiers = global" : "Broker commission = global", ok: eq(r.brokerCommissionSum, r.totalCommission), detail: `${money(r.brokerCommissionSum)} / ${money(r.totalCommission)}` },
      { label: isFr ? "Dossiers courtiers = global" : "Broker deals = global", ok: r.brokerDealsSum === r.totalDeals, detail: `${r.brokerDealsSum} / ${r.totalDeals}` },
      { label: isFr ? "Lignes avec date valide" : "Rows with valid date", ok: r.noDate === 0, detail: `${r.noDate} ${isFr ? "sans date" : "missing"}` },
      { label: isFr ? "Identité (prénom / nom)" : "Identity (first / last name)", ok: r.rows > 0 && r.withNames === r.rows, detail: `${r.withNames} / ${r.rows}` },
      { label: isFr ? "Maestro ID rattaché" : "Maestro ID linked", ok: r.withMaestroId > 0, detail: `${r.withMaestroId} / ${r.rows}` },
    ];
  }, [r, isFr]);

  return (
    <div className="pp-card mt-3" style={{ padding: 16 }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2" style={{ fontSize: 13.5, fontWeight: 800 }}>
          <ShieldCheck className="w-4 h-4" style={{ color: "var(--pp-brand-accent-2)" }} />
          {isFr ? "Revalidation & dispatch courtiers" : "Revalidation & broker dispatch"}
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={busy} className="px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", fontSize: 12.5, fontWeight: 600 }}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {isFr ? "Revalider" : "Revalidate"}
          </button>
          <button onClick={redispatch} disabled={busy} className="px-3 py-1.5 rounded-lg"
            style={{ background: "var(--pp-brand-accent-2)", color: "#fff", fontSize: 12.5, fontWeight: 700 }}>
            {isFr ? "Re-dispatcher" : "Re-dispatch"}
          </button>
        </div>
      </div>

      {!r && !busy && (
        <div className="mt-3" style={{ fontSize: 12.5, color: "var(--pp-text-muted)" }}>
          {isFr ? "Aucune donnée en base — importez le registre." : "No data yet — import the register."}
        </div>
      )}

      {r && (
        <>
          <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))" }}>
            {[
              [isFr ? "Lignes" : "Rows", String(r.rows)],
              [isFr ? "Dispatchées" : "Dispatched", `${r.dispatchedRows}`],
              [isFr ? "Volume" : "Volume", money(r.totalVolume)],
              [isFr ? "Commissions" : "Commission", money(r.totalCommission)],
              [isFr ? "Dossiers" : "Deals", String(r.totalDeals)],
              [isFr ? "Courtiers" : "Brokers", String(data.brokers?.length ?? 0)],
            ].map(([k, v]) => (
              <div key={k} className="px-3 py-2 rounded-lg"
                style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)" }}>
                <div style={{ fontSize: 11, color: "var(--pp-text-muted)", fontWeight: 600 }}>{k}</div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{v}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
            {checks.map((c) => (
              <div key={c.label} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", fontSize: 12 }}>
                {c.ok
                  ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--pp-success,#16a34a)" }} />
                  : <AlertTriangle className="w-3.5 h-3.5" style={{ color: "var(--pp-warning,#f59e0b)" }} />}
                <span style={{ fontWeight: 600 }}>{c.label}</span>
                <span style={{ marginLeft: "auto", color: "var(--pp-text-muted)" }}>{c.detail}</span>
              </div>
            ))}
          </div>

          {r.anomalyCounts && Object.keys(r.anomalyCounts).length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 700 }}>
                <AlertTriangle className="w-3.5 h-3.5" style={{ color: "var(--pp-warning,#f59e0b)" }} />
                {isFr ? "Anomalies détectées" : "Detected anomalies"}
                <span style={{ color: "var(--pp-text-muted)", fontWeight: 600 }}>({r.anomalyTotal})</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(r.anomalyCounts as Record<string, number>)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => (
                    <span key={k} className="px-2.5 py-1 rounded-lg" style={{
                      fontSize: 11.5, fontWeight: 700,
                      background: "rgba(245,158,11,.14)", color: "#f59e0b",
                      border: "1px solid rgba(245,158,11,.25)",
                    }}>{k.replace(/_/g, " ")} · {v}</span>
                  ))}
              </div>
              {Array.isArray(data.anomalies) && data.anomalies.length > 0 && (
                <div className="mt-2 overflow-x-auto" style={{ maxHeight: 220, overflowY: "auto" }}>
                  <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "var(--pp-text-muted)", textAlign: "left" }}>
                        {[isFr ? "Ligne source" : "Source row", isFr ? "Année" : "Year", isFr ? "Contrat" : "Contract",
                          isFr ? "Agent" : "Agent", isFr ? "Anomalie" : "Anomaly", isFr ? "Détail" : "Detail"].map((h) => (
                          <th key={h} style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.anomalies.slice(0, 200).map((a: any, i: number) => (
                        <tr key={i} style={{ borderTop: "1px solid var(--pp-bg-border)" }}>
                          <td style={{ padding: "5px 8px" }}>{a.sourceRow ?? "—"}</td>
                          <td style={{ padding: "5px 8px" }}>{a.year ?? "—"}</td>
                          <td style={{ padding: "5px 8px" }}>{a.number ?? "—"}</td>
                          <td style={{ padding: "5px 8px" }}>{a.agent ?? "—"}</td>
                          <td style={{ padding: "5px 8px", fontWeight: 600 }}>{String(a.kind).replace(/_/g, " ")}</td>
                          <td style={{ padding: "5px 8px", color: "var(--pp-text-muted)" }}>{a.detail || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}



          <div className="mt-4">
            <div className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 700 }}>
              <Users className="w-3.5 h-3.5" />{isFr ? "Courtiers rattachés" : "Linked brokers"}
            </div>
            <div className="mt-2 overflow-x-auto">
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "var(--pp-text-muted)", textAlign: "left" }}>
                    {[isFr ? "Nom fichier" : "File name", isFr ? "Prénom" : "First", isFr ? "Nom" : "Last",
                      "Maestro ID", isFr ? "Méthode" : "Method", isFr ? "Dossiers" : "Deals", "Volume", "Comm."].map((h) => (
                      <th key={h} style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.brokers ?? []).map((b: any) => (
                    <tr key={b.agent_key} style={{ borderTop: "1px solid var(--pp-bg-border)" }}>
                      <td style={{ padding: "5px 8px", whiteSpace: "nowrap", fontWeight: 600 }}>{b.raw_name}</td>
                      <td style={{ padding: "5px 8px" }}>{b.first_name ?? "—"}</td>
                      <td style={{ padding: "5px 8px" }}>{b.last_name ?? "—"}</td>
                      <td style={{ padding: "5px 8px", color: b.maestro_broker_id ? undefined : "var(--pp-warning,#f59e0b)" }}>
                        {b.maestro_broker_id ?? (isFr ? "manquant" : "missing")}
                      </td>
                      <td style={{ padding: "5px 8px", color: "var(--pp-text-muted)" }}>{b.match_method ?? "—"}</td>
                      <td style={{ padding: "5px 8px" }}>{b.deals}</td>
                      <td style={{ padding: "5px 8px" }}>{money(b.volume)}</td>
                      <td style={{ padding: "5px 8px" }}>{money(b.commission)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {(data.unmatchedDetail ?? []).length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--pp-warning,#f59e0b)" }}>
                <AlertTriangle className="w-3.5 h-3.5" />
                {isFr ? "Non rattachés" : "Unlinked"} ({data.unmatchedDetail.length})
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {data.unmatchedDetail.map((u: any) => (
                  <div key={u.agent_key} className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 160 }}>{u.raw_name}</span>
                    <span style={{ fontSize: 11.5, color: "var(--pp-text-muted)" }}>
                      {u.rows} {isFr ? "lignes" : "rows"} · {money(u.commission)}
                    </span>
                    <select
                      value={assign[u.raw_name]?.brokerUserId ?? ""}
                      onChange={(e) => setAssign({ ...assign, [u.raw_name]: { brokerUserId: e.target.value, maestroId: assign[u.raw_name]?.maestroId ?? "" } })}
                      className="px-2 py-1 rounded-md"
                      style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)", fontSize: 12 }}
                    >
                      <option value="">{isFr ? "— Choisir un courtier —" : "— Pick a broker —"}</option>
                      {brokers.map((b) => (
                        <option key={b.user_id} value={b.user_id}>{b.full_name ?? b.email}</option>
                      ))}
                    </select>
                    <input
                      placeholder="Maestro ID"
                      value={assign[u.raw_name]?.maestroId ?? ""}
                      onChange={(e) => setAssign({ ...assign, [u.raw_name]: { brokerUserId: assign[u.raw_name]?.brokerUserId ?? "", maestroId: e.target.value } })}
                      className="px-2 py-1 rounded-md"
                      style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)", fontSize: 12, width: 140 }}
                    />
                    <button onClick={() => linkBroker(u.raw_name)} disabled={busy}
                      className="px-2.5 py-1 rounded-md"
                      style={{ background: "var(--pp-brand-accent-2)", color: "#fff", fontSize: 12, fontWeight: 700 }}>
                      {isFr ? "Associer" : "Link"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
