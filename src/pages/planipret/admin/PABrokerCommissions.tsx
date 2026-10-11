// Commissions par courtier — même source validée que les pages Commissions :
// planipret-commission-reports (déboursées : summary/by_agent ; en attente :
// pending). Dossiers/volume = lignes Base du courtier, contrats uniques.
// Jamais mélanger déboursées et en attente; une erreur n'est jamais 0 $.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download, TrendingUp, TrendingDown, Minus, AlertTriangle, BarChart3, BriefcaseBusiness, Users, WalletCards, Landmark, CalendarDays, ChevronLeft } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PAPage, PAPageHeader, PACard, PATable, PAToolbar, PAStats, PAStat } from "@/components/planipret/admin/PAPageShell";
import { ppEdgeInvoke } from "@/lib/planipret/ppEdge";
import { useCommissionLive } from "@/hooks/useCommissionLive";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Kind = "paid" | "pending";
type Broker = { id: string; name: string };
type Row = { users_id: string; name: string; amount: number; files: number; volume: number };
type Month = { month: string; commission: number; files: number; volume: number };
type Split = { amount: number; files: number; volume: number };
type Detail = { total: number; files: number; volume: number; months: Month[]; personal?: Split | null; team?: Split | null; fetchedAt?: string | null };

const MONTHS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const cad = (n: number) => (n || 0).toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const exact = (n: number) => (n || 0).toLocaleString("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactCad = (n: number) => new Intl.NumberFormat("fr-CA", { notation: "compact", style: "currency", currency: "CAD", maximumFractionDigits: 1 }).format(n || 0);

function Delta({ cur, prev, fr }: { cur: number; prev: number; fr: boolean }) {
  if (!prev && !cur) return <span className="text-muted-foreground text-xs">—</span>;
  if (!prev) return <span className="text-xs text-emerald-600">{fr ? "Nouveau" : "New"}</span>;
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const Icon = pct > 0.5 ? TrendingUp : pct < -0.5 ? TrendingDown : Minus;
  const color = pct > 0.5 ? "text-emerald-600" : pct < -0.5 ? "text-destructive" : "text-muted-foreground";
  return <span className={`inline-flex items-center gap-1 text-xs ${color}`}><Icon className="h-3 w-3" />{pct >= 0 ? "+" : ""}{pct.toFixed(1)} %</span>;
}

async function report(body: Record<string, unknown>) {
  const r = await ppEdgeInvoke("planipret-commission-reports", body, { retries: 1, timeoutMs: 90_000 });
  const d = ((r as any)?.data ?? r) as any;
  if ((r as any)?.error || !d || d.ok !== true) throw new Error(d?.message ?? "unavailable");
  return d;
}

export default function PABrokerCommissions({ selfOnly = false }: { selfOnly?: boolean } = {}) {
  const { lang } = useMplanipretLang();
  const fr = lang !== "en";
  const MONTHS = fr ? MONTHS_FR : MONTHS_EN;
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [kind, setKind] = useState<Kind>("paid");
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [broker, setBroker] = useState<string>(""); // "" = tous les courtiers
  const [rows, setRows] = useState<Row[] | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailPy, setDetailPy] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [force, setForce] = useState(false);
  useCommissionLive(() => setReload((n) => n + 1));

  useEffect(() => {
    if (selfOnly) return;
    void (async () => {
      const { data } = await supabase.from("planipret_profiles")
        .select("full_name, maestro_broker_id").eq("maestro_connected", true).not("maestro_broker_id", "is", null).order("full_name");
      const seen = new Set<string>();
      setBrokers((data ?? []).filter((p: any) => { const id = String(p.maestro_broker_id); if (seen.has(id)) return false; seen.add(id); return true; })
        .map((p: any) => ({ id: String(p.maestro_broker_id), name: String(p.full_name ?? p.maestro_broker_id) })));
    })();
  }, [selfOnly]);

  // Two profiles can share one Maestro id: show the name Maestro reports.
  const syncNames = (list: Row[]) => setBrokers((prev) => prev.map((b) => {
    const hit = list.find((r) => r.users_id === b.id);
    return hit ? { ...b, name: hit.name } : b;
  }));
  const range = (y: number) => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
    const to = `${y}-12-31` > today ? today : `${y}-12-31`;
    return { date_from: `${y}-01-01`, date_to: to };
  };
  const allView = !selfOnly && !broker;

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    const f = force; setForce(false);
    (async () => {
      try {
        const scope = selfOnly || !broker ? {} : { users_id: broker };
        if (allView) {
          if (kind === "paid") {
            const d = await report({ action: "by_agent", filters: range(year), ...(f ? { force: true } : {}) });
            if (cancelled) return;
            const list = (d.agents ?? []).filter((a: any) => a.users_id != null).map((a: any) => ({ users_id: String(a.users_id), name: a.name, amount: a.total, files: a.files ?? 0, volume: a.loan_volume ?? 0 }));
            setRows(list); syncNames(list);
          } else {
            const d = await report({ action: "pending", filters: {}, ...(f ? { force: true } : {}) });
            if (cancelled) return;
            const list = (d.brokers ?? []).map((b: any) => ({ users_id: String(b.users_id), name: b.name, amount: b.amount, files: b.files ?? 0, volume: b.volume ?? 0 }));
            setRows(list); syncNames(list);
          }
          setDetail(null); setDetailPy(null);
          return;
        }
        if (kind === "paid") {
          const [c, p] = await Promise.all([
            report({ action: "summary", filters: { ...range(year), ...scope }, ...(f ? { force: true } : {}) }),
            report({ action: "summary", filters: { ...range(year - 1), ...scope } }).catch(() => null),
          ]);
          if (cancelled) return;
          const toD = (d: any): Detail => ({ total: d.summary.total_commission, files: d.summary.deal_count, volume: d.summary.total_loan_volume, months: d.summary.months ?? [], personal: d.paid_split?.personal ?? null, team: d.paid_split?.team ?? null, fetchedAt: d.cache?.fetched_at ?? null });
          setDetail(toD(c)); setDetailPy(p ? toD(p) : null);
        } else {
          const d = await report({ action: "pending", filters: scope, ...(f ? { force: true } : {}) });
          if (cancelled) return;
          const s = d.summary;
          setDetail({ total: s.official_total ?? s.total_commission, files: s.deal_count, volume: s.total_loan_volume, months: s.months ?? [], personal: s.split?.personal ?? null, team: s.split?.team ?? null, fetchedAt: d.cache?.fetched_at ?? null });
          setDetailPy(null);
        }
        setRows(null);
      } catch (e: any) {
        if (!cancelled) setError(fr ? "Chiffres indisponibles pour le moment. Les derniers chiffres valides restent affichés." : "Figures unavailable right now. The last valid figures stay on screen.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broker, year, kind, reload, selfOnly]);

  const brokerName = brokers.find((b) => b.id === broker)?.name ?? "";
  const sorted = useMemo(() => [...(rows ?? [])].sort((a, b) => b.amount - a.amount), [rows]);
  const totals = useMemo(() => sorted.reduce((t, r) => ({ amount: t.amount + r.amount, files: t.files + r.files, volume: t.volume + r.volume }), { amount: 0, files: 0, volume: 0 }), [sorted]);

  const monthRows = useMemo(() => {
    if (!detail) return [];
    if (kind === "pending") {
      // Recent months in detail; older dated rows grouped in one line.
      const from = `${thisYear - 1}-01`;
      const older = detail.months.filter((m) => m.month < from).reduce((t, m) => ({ month: "older", commission: t.commission + m.commission, files: t.files + m.files, volume: t.volume + m.volume }), { month: "older", commission: 0, files: 0, volume: 0 } as Month);
      const recent = detail.months.filter((m) => m.month >= from).map((m) => ({ key: m.month, label: `${MONTHS[Number(m.month.slice(5, 7)) - 1]} ${m.month.slice(0, 4)}`, cur: m, prev: null as Month | null }));
      return [...(older.commission || older.files ? [{ key: "older", label: fr ? `Avant ${thisYear - 1}` : `Before ${thisYear - 1}`, cur: older, prev: null as Month | null }] : []), ...recent];
    }
    return Array.from({ length: 12 }, (_, i) => {
      const mm = String(i + 1).padStart(2, "0");
      const cur = detail.months.find((m) => m.month === `${year}-${mm}`) ?? { month: `${year}-${mm}`, commission: 0, files: 0, volume: 0 };
      const prev = detailPy?.months.find((m) => m.month === `${year - 1}-${mm}`) ?? null;
      return { key: mm, label: MONTHS[i], cur, prev };
    });
  }, [detail, detailPy, kind, year, MONTHS]);

  const chartData = monthRows.map((m) => ({ name: m.label.slice(0, 3), commission: m.cur.commission, commissionPy: m.prev?.commission ?? 0, files: m.cur.files }));

  const exportCsv = () => {
    const lines: (string | number)[][] = allView
      ? [[fr ? "Courtier" : "Broker", "Commission", fr ? "Dossiers" : "Files", "Volume", fr ? "Moyenne" : "Average"], ...sorted.map((r) => [r.name, r.amount, r.files, r.volume, r.files ? Math.round((r.amount / r.files) * 100) / 100 : 0])]
      : [[fr ? "Mois" : "Month", "Commission", fr ? "Dossiers" : "Files", "Volume"], ...monthRows.map((m) => [m.label, m.cur.commission, m.cur.files, m.cur.volume])];
    const csv = lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url;
    a.download = `commissions-${kind}-${brokerName || (allView ? "tous" : "moi")}-${year}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const kindLabel = kind === "paid" ? (fr ? "Déboursées" : "Paid") : (fr ? "En attente" : "Pending");

  return (
    <PAPage>
      <PAPageHeader
        icon={<BarChart3 className="h-[18px] w-[18px]" />}
        title={fr ? "Commissions par courtier" : "Broker commissions"}
        subtitle={fr
          ? "Mêmes chiffres validés que la page Commissions : déboursées et en attente, dossiers et volume des lignes Base."
          : "Same validated figures as the Commissions page: paid and pending, files and volume from Base rows."}
      />

      <PAToolbar>
        <div className="inline-flex rounded-lg p-1" style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border)" }}>
          {(["paid", "pending"] as const).map((k) => (
            <Button key={k} type="button" variant="ghost" size="sm" onClick={() => setKind(k)} className="h-7 px-3 text-xs"
              aria-pressed={kind === k}
              style={kind === k ? { background: "var(--pp-brand-accent-2)", color: "var(--primary-foreground)" } : { color: "var(--pp-text-secondary)" }}>
              {k === "paid" ? (fr ? "Déboursées" : "Paid") : (fr ? "En attente" : "Pending")}
            </Button>
          ))}
        </div>
        {!selfOnly && (
          <label className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--pp-text-secondary)" }}>
            <Users className="h-4 w-4" /> {fr ? "Courtier" : "Broker"}
            <select aria-label={fr ? "Courtier" : "Broker"} value={broker} onChange={(e) => setBroker(e.target.value)}>
              <option value="">{fr ? "Tous les courtiers" : "All brokers"}</option>
              {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        {kind === "paid" && (
          <label className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--pp-text-secondary)" }}>
            <CalendarDays className="h-4 w-4" /> {fr ? "Année" : "Year"}
            <select aria-label={fr ? "Année" : "Year"} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setForce(true); setReload((n) => n + 1); }} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> {fr ? "Rafraîchir" : "Refresh"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        </div>
      </PAToolbar>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive mb-3">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {allView ? (
        <>
          <PAStats>
            <PAStat label={`${kindLabel}${kind === "paid" ? ` ${year}` : ""}`} value={exact(totals.amount)} icon={<WalletCards className="h-4 w-4" />} />
            <PAStat label={fr ? "Dossiers (Base)" : "Files (Base)"} value={totals.files.toLocaleString("fr-CA")} icon={<BriefcaseBusiness className="h-4 w-4" />} />
            <PAStat label={fr ? "Volume (Base)" : "Volume (Base)"} value={cad(totals.volume)} icon={<Landmark className="h-4 w-4" />} />
            <PAStat label={fr ? "Courtiers" : "Brokers"} value={String(sorted.length)} icon={<Users className="h-4 w-4" />} />
          </PAStats>
          <PACard title={`${fr ? "Tous les courtiers" : "All brokers"} — ${kindLabel}`} subtitle={fr ? "Cliquez sur un courtier pour voir son détail." : "Click a broker to see the detail."}>
            <PATable>
              <thead>
                <tr><th>#</th><th>{fr ? "Courtier" : "Broker"}</th><th className="text-right">Commission</th><th className="text-right">{fr ? "Dossiers" : "Files"}</th><th className="text-right">Volume</th><th className="text-right">{fr ? "Moyenne / dossier" : "Avg / file"}</th></tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={r.users_id} onClick={() => setBroker(r.users_id)} style={{ cursor: "pointer" }}>
                    <td>{i + 1}</td><td className="font-medium">{r.name}</td>
                    <td className="text-right tabular-nums">{exact(r.amount)}</td>
                    <td className="text-right tabular-nums">{r.files}</td>
                    <td className="text-right tabular-nums">{cad(r.volume)}</td>
                    <td className="text-right tabular-nums">{r.files ? cad(r.amount / r.files) : "—"}</td>
                  </tr>
                ))}
                {sorted.length > 0 && (
                  <tr className="font-semibold"><td /><td>Total</td><td className="text-right tabular-nums">{exact(totals.amount)}</td><td className="text-right tabular-nums">{totals.files}</td><td className="text-right tabular-nums">{cad(totals.volume)}</td><td className="text-right tabular-nums">{totals.files ? cad(totals.amount / totals.files) : "—"}</td></tr>
                )}
              </tbody>
            </PATable>
            {!loading && rows && sorted.length === 0 && !error && <p className="text-sm text-muted-foreground py-3">{fr ? "Aucune donnée pour cette sélection." : "No data for this selection."}</p>}
            {loading && !rows && <p className="text-sm text-muted-foreground py-3">{fr ? "Chargement…" : "Loading…"}</p>}
          </PACard>
        </>
      ) : (
        <>
          {!selfOnly && (
            <Button variant="ghost" size="sm" className="mb-2" onClick={() => setBroker("")}><ChevronLeft className="h-4 w-4 mr-1" />{fr ? "Tous les courtiers" : "All brokers"}</Button>
          )}
          <PAStats>
            <PAStat label={`${kindLabel}${kind === "paid" ? ` ${year}` : ""}`} value={detail ? exact(detail.total) : "…"} hint={kind === "paid" && detailPy ? `${year - 1} : ${cad(detailPy.total)}` : undefined} icon={<WalletCards className="h-4 w-4" />} />
            <PAStat label={fr ? "Dossiers (Base)" : "Files (Base)"} value={detail ? String(detail.files) : "…"} hint={kind === "paid" && detailPy ? `${year - 1} : ${detailPy.files}` : undefined} icon={<BriefcaseBusiness className="h-4 w-4" />} />
            <PAStat label={fr ? "Volume (Base)" : "Volume (Base)"} value={detail ? cad(detail.volume) : "…"} hint={kind === "paid" && detailPy ? `${year - 1} : ${cad(detailPy.volume)}` : undefined} icon={<Landmark className="h-4 w-4" />} />
            <PAStat label={fr ? "Moyenne / dossier" : "Avg / file"} value={detail?.files ? cad(detail.total / detail.files) : "—"} icon={<TrendingUp className="h-4 w-4" />} />
          </PAStats>

          {detail && (detail.personal || detail.team) && (
            <PACard title={fr ? "Personnel et équipe" : "Personal and team"}>
              <PATable>
                <thead><tr><th /><th className="text-right">Commission</th><th className="text-right">{fr ? "Dossiers" : "Files"}</th><th className="text-right">Volume</th></tr></thead>
                <tbody>
                  {detail.personal && <tr><td>{fr ? "Personnel" : "Personal"}</td><td className="text-right tabular-nums">{exact(detail.personal.amount)}</td><td className="text-right tabular-nums">{detail.personal.files}</td><td className="text-right tabular-nums">{cad(detail.personal.volume)}</td></tr>}
                  {detail.team && <tr><td>{fr ? "Équipe" : "Team"}</td><td className="text-right tabular-nums">{exact(detail.team.amount)}</td><td className="text-right tabular-nums">{detail.team.files}</td><td className="text-right tabular-nums">{cad(detail.team.volume)}</td></tr>}
                </tbody>
              </PATable>
            </PACard>
          )}

          <PACard title={`${brokerName || (fr ? "Mes commissions" : "My commissions")} — ${kindLabel}${kind === "paid" ? ` ${year} vs ${year - 1}` : ""}`}>
            <div style={{ height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,.18)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => compactCad(Number(v))} />
                  <Tooltip formatter={(v: any) => cad(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11.5 }} />
                  {kind === "paid" && <Bar name={String(year - 1)} dataKey="commissionPy" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />}
                  <Bar name={kind === "paid" ? String(year) : "Commission"} dataKey="commission" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <PATable>
              <thead>
                <tr><th>{fr ? "Mois" : "Month"}</th><th className="text-right">Commission</th>{kind === "paid" && <th className="text-right">{year - 1}</th>}{kind === "paid" && <th className="text-right">{fr ? "Écart" : "Change"}</th>}<th className="text-right">{fr ? "Dossiers" : "Files"}</th><th className="text-right">Volume</th></tr>
              </thead>
              <tbody>
                {monthRows.map((m) => (
                  <tr key={m.key}>
                    <td>{m.label}</td>
                    <td className="text-right tabular-nums">{exact(m.cur.commission)}</td>
                    {kind === "paid" && <td className="text-right tabular-nums">{exact(m.prev?.commission ?? 0)}</td>}
                    {kind === "paid" && <td className="text-right"><Delta cur={m.cur.commission} prev={m.prev?.commission ?? 0} fr={fr} /></td>}
                    <td className="text-right tabular-nums">{m.cur.files}</td>
                    <td className="text-right tabular-nums">{cad(m.cur.volume)}</td>
                  </tr>
                ))}
              </tbody>
            </PATable>
            {kind === "pending" && <p className="text-xs text-muted-foreground pt-2">{fr ? "Le total en attente est le total officiel Maestro; les mois répartissent les lignes datées." : "Pending total is Maestro's official total; months allocate dated rows."}</p>}
            {detail?.fetchedAt && <p className="text-xs text-muted-foreground pt-1">{fr ? "Mis à jour" : "Updated"} : {new Date(detail.fetchedAt).toLocaleString(fr ? "fr-CA" : "en-CA")}</p>}
          </PACard>
        </>
      )}
    </PAPage>
  );
}
