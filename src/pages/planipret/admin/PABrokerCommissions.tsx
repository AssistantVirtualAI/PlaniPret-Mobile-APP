// Vue par courtier : chiffre d'affaires, volume et dossiers par mois, avec
// comparaison au mois précédent.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download, TrendingUp, TrendingDown, Minus, AlertTriangle, BarChart3 } from "lucide-react";
import { PAPageHeader } from "@/components/planipret/admin/PAPageShell";

type Month = { month: number; volume: number; deals: number; commission: number };

const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

const cad = (n: number) => n.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

function Delta({ cur, prev }: { cur: number; prev: number }) {
  if (!prev && !cur) return <span className="text-muted-foreground text-xs">—</span>;
  if (!prev) return <span className="text-xs text-emerald-600">Nouveau</span>;
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const Icon = pct > 0.5 ? TrendingUp : pct < -0.5 ? TrendingDown : Minus;
  const color = pct > 0.5 ? "text-emerald-600" : pct < -0.5 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${color}`}>
      <Icon className="h-3 w-3" />{pct >= 0 ? "+" : ""}{pct.toFixed(1)} %
    </span>
  );
}

export default function PABrokerCommissions() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [brokers, setBrokers] = useState<{ id: string; name: string }[]>([]);
  const [broker, setBroker] = useState<string>("");
  const [monthly, setMonthly] = useState<Month[]>([]);
  const [monthlyPy, setMonthlyPy] = useState<Month[]>([]);
  const [totals, setTotals] = useState<{ volume: number; deals: number; commission: number } | null>(null);
  const [totalsPy, setTotalsPy] = useState<{ volume: number; deals: number; commission: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("planipret_profiles")
        .select("user_id, full_name")
        .not("user_id", "is", null)
        .order("full_name");
      const list = (data ?? [])
        .filter((p: any) => p.user_id)
        .map((p: any) => ({ id: p.user_id as string, name: (p.full_name as string) ?? p.user_id }));
      setBrokers(list);
      if (list.length && !broker) setBroker(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!broker) return;
    setLoading(true);
    setError(null);
    const [cur, py] = await Promise.all([
      supabase.functions.invoke("pp-commission-audit", { body: { year, broker_user_id: broker } }),
      supabase.functions.invoke("pp-commission-audit", { body: { year: year - 1, broker_user_id: broker } }),
    ]);
    if (cur.error || !(cur.data as any)?.ok) {
      setError("Impossible de charger les chiffres de ce courtier.");
      setMonthly([]); setTotals(null); setMonthlyPy([]); setTotalsPy(null);
    } else {
      setMonthly((cur.data as any).monthly ?? []);
      setTotals((cur.data as any).totals ?? null);
      const pyOk = !py.error && (py.data as any)?.ok;
      setMonthlyPy(pyOk ? ((py.data as any).monthly ?? []) : []);
      setTotalsPy(pyOk ? ((py.data as any).totals ?? null) : null);
    }
    setLoading(false);
  }, [broker, year]);

  useEffect(() => { void load(); }, [load]);

  const brokerName = useMemo(() => brokers.find((b) => b.id === broker)?.name ?? "", [brokers, broker]);

  const pyOf = (month: number) => monthlyPy.find((x) => x.month === month) ?? null;

  const exportCsv = () => {
    const head = [
      "Mois",
      `Chiffre d'affaires ${year}`, `Chiffre d'affaires ${year - 1}`, "Écart % (a/a)",
      `Volume ${year}`, `Volume ${year - 1}`,
      `Dossiers ${year}`, `Dossiers ${year - 1}`,
    ];
    const body = monthly.map((m) => {
      const prev = pyOf(m.month);
      const pct = prev && prev.commission ? ((m.commission - prev.commission) / Math.abs(prev.commission)) * 100 : "";
      return [
        MONTHS[m.month - 1],
        m.commission, prev?.commission ?? 0, pct === "" ? "" : `${pct.toFixed(1)} %`,
        m.volume, prev?.volume ?? 0,
        m.deals, prev?.deals ?? 0,
      ];
    });
    const csv = [head, ...body].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `commissions-${brokerName || "courtier"}-${year}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pa-page">
      <PAPageHeader
        icon={<BarChart3 className="h-[18px] w-[18px]" />}
        title="Commissions par courtier"
        subtitle="Chiffre d'affaires, volume et nombre de dossiers mois par mois, comparés au même mois de l'année précédente."
        actions={
          <>
            <select className="h-9 rounded-md border bg-background px-3 text-sm" value={broker} onChange={(e) => setBroker(e.target.value)}>
              {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select className="h-9 rounded-md border bg-background px-3 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Rafraîchir
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!monthly.length}>
              <Download className="h-4 w-4 mr-2" /> CSV
            </Button>
          </>
        }
      />

      {error && (
        <Card><CardContent className="pt-6 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </CardContent></Card>
      )}

      {totals && (
        <div className="grid gap-3 md:grid-cols-3">
          <Card><CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Chiffre d'affaires {year}</p>
            <p className="text-xl font-semibold">{cad(totals.commission)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {year - 1} : {cad(totalsPy?.commission ?? 0)} <Delta cur={totals.commission} prev={totalsPy?.commission ?? 0} />
            </p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Volume de prêts</p>
            <p className="text-xl font-semibold">{cad(totals.volume)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {year - 1} : {cad(totalsPy?.volume ?? 0)} <Delta cur={totals.volume} prev={totalsPy?.volume ?? 0} />
            </p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Dossiers</p>
            <p className="text-xl font-semibold">{totals.deals}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {year - 1} : {totalsPy?.deals ?? 0} <Delta cur={totals.deals} prev={totalsPy?.deals ?? 0} />
            </p>
          </CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">{brokerName} — {year} vs {year - 1}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2">Mois</th>
                <th className="text-right">CA {year}</th>
                <th className="text-right pl-3">CA {year - 1}</th>
                <th className="text-right pl-3">Écart</th>
                <th className="text-right pl-3">Volume {year}</th>
                <th className="text-right pl-3">Volume {year - 1}</th>
                <th className="text-right pl-3">Écart</th>
                <th className="text-right pl-3">Dossiers {year}</th>
                <th className="text-right pl-3">Dossiers {year - 1}</th>
                <th className="text-right pl-3">Écart</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => {
                const prev = pyOf(m.month);
                return (
                  <tr key={m.month} className="border-b last:border-0">
                    <td className="py-1.5">{MONTHS[m.month - 1]}</td>
                    <td className="text-right">{cad(m.commission)}</td>
                    <td className="text-right pl-3 text-muted-foreground">{cad(prev?.commission ?? 0)}</td>
                    <td className="text-right pl-3"><Delta cur={m.commission} prev={prev?.commission ?? 0} /></td>
                    <td className="text-right pl-3">{cad(m.volume)}</td>
                    <td className="text-right pl-3 text-muted-foreground">{cad(prev?.volume ?? 0)}</td>
                    <td className="text-right pl-3"><Delta cur={m.volume} prev={prev?.volume ?? 0} /></td>
                    <td className="text-right pl-3">{m.deals}</td>
                    <td className="text-right pl-3 text-muted-foreground">{prev?.deals ?? 0}</td>
                    <td className="text-right pl-3"><Delta cur={m.deals} prev={prev?.deals ?? 0} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && !monthly.length && <p className="text-sm text-muted-foreground pt-3">Aucune donnée pour ce courtier.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
