// Audit commissions : chaque ligne de la base, sa source Maestro et la cause
// exacte de l'écart avec les totaux affichés.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, Download, AlertTriangle, ScrollText } from "lucide-react";
import { PAPageHeader } from "@/components/planipret/admin/PAPageShell";

type Row = {
  id: string;
  source: "register" | "maestro_live";
  number: string | null;
  date_trans: string | null;
  agent_name: string | null;
  broker_label: string | null;
  broker_user_id: string | null;
  institution: string | null;
  mortgage_type: string | null;
  commission_type: string | null;
  loan_amt: number;
  amount: number;
  in_volume: boolean;
  in_deals: boolean;
  in_commission: boolean;
  reason: string;
  synced_at: string | null;
};

type Payload = {
  ok: boolean;
  totals: { volume: number; deals: number; commission: number };
  counts: { register: number; maestro_live: number; total: number };
  duplicates: number;
  gaps: { reason: string; rows: number; amount: number }[];
  rows: Row[];
};

const cad = (n: number) =>
  n.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 });

export default function PACommissionAudit() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [brokerFilter, setBrokerFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.functions.invoke("pp-commission-audit", {
      body: { year },
    });
    if (err || !res?.ok) {
      setError("Impossible de charger l'audit des commissions.");
      setData(null);
    } else {
      setData(res as Payload);
    }
    setLoading(false);
  }, [year]);

  useEffect(() => { void load(); }, [load]);

  const brokers = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of data?.rows ?? []) {
      const label = r.broker_label ?? r.agent_name ?? "—";
      set.set(label, label);
    }
    return Array.from(set.keys()).sort();
  }, [data]);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => {
      const label = r.broker_label ?? r.agent_name ?? "—";
      if (brokerFilter !== "all" && label !== brokerFilter) return false;
      if (reasonFilter !== "all" && r.reason !== reasonFilter) return false;
      if (!s) return true;
      return (
        (r.number ?? "").toLowerCase().includes(s) ||
        (r.institution ?? "").toLowerCase().includes(s) ||
        label.toLowerCase().includes(s)
      );
    });
  }, [data, search, brokerFilter, reasonFilter]);

  const exportCsv = () => {
    const head = ["Date", "Dossier", "Courtier", "Source", "Institution", "Type", "Prêt", "Commission", "Volume", "Dossier compté", "Commission comptée", "Cause"];
    const body = rows.map((r) => [
      r.date_trans ?? "", r.number ?? "", r.broker_label ?? r.agent_name ?? "", r.source,
      r.institution ?? "", r.commission_type ?? "", r.loan_amt, r.amount,
      r.in_volume ? "oui" : "non", r.in_deals ? "oui" : "non", r.in_commission ? "oui" : "non", r.reason,
    ]);
    const csv = [head, ...body].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `audit-commissions-${year}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pa-page">
      <PAPageHeader
        icon={<ScrollText className="h-[18px] w-[18px]" />}
        title="Audit des commissions"
        subtitle="Chaque ligne de la base, sa provenance (registre importé ou API Maestro) et la règle qui explique l'écart."
        actions={
          <>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Rafraîchir
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
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

      {data && (
        <div className="grid gap-3 md:grid-cols-4">
          <Card><CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Volume retenu</p>
            <p className="text-xl font-semibold">{cad(data.totals.volume)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Dossiers uniques</p>
            <p className="text-xl font-semibold">{data.totals.deals}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Commission brute</p>
            <p className="text-xl font-semibold">{cad(data.totals.commission)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Lignes analysées</p>
            <p className="text-xl font-semibold">{data.counts.total}</p>
            <p className="text-xs text-muted-foreground">
              {data.counts.register} registre · {data.counts.maestro_live} Maestro · {data.duplicates} doublons
            </p>
          </CardContent></Card>
        </div>
      )}

      {data && (
        <Card>
          <CardHeader><CardTitle className="text-base">Causes des écarts</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.gaps.map((g) => (
              <button
                key={g.reason}
                onClick={() => setReasonFilter(reasonFilter === g.reason ? "all" : g.reason)}
                className={`w-full text-left flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${reasonFilter === g.reason ? "bg-muted" : ""}`}
              >
                <span>{g.reason}</span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {g.rows} lignes · {cad(g.amount)}
                </span>
              </button>
            ))}
            {!data.gaps.length && <p className="text-sm text-muted-foreground">Aucun écart : toutes les lignes comptent.</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6 grid gap-3 md:grid-cols-3">
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={brokerFilter} onChange={(e) => setBrokerFilter(e.target.value)}>
            <option value="all">Tous les courtiers</option>
            {brokers.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)}>
            <option value="all">Toutes les causes</option>
            {(data?.gaps ?? []).map((g) => <option key={g.reason} value={g.reason}>{g.reason}</option>)}
          </select>
          <Input placeholder="Dossier, institution ou courtier" value={search} onChange={(e) => setSearch(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Lignes ({rows.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2">Date</th>
                <th className="text-left">Dossier</th>
                <th className="text-left">Courtier</th>
                <th className="text-left">Source</th>
                <th className="text-left">Institution</th>
                <th className="text-left">Type</th>
                <th className="text-right">Prêt</th>
                <th className="text-right">Commission</th>
                <th className="text-left pl-3">Cause</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 500).map((r) => (
                <tr key={`${r.source}-${r.id}`} className="border-b last:border-0">
                  <td className="py-1.5 whitespace-nowrap">{r.date_trans ?? "—"}</td>
                  <td className="whitespace-nowrap">{r.number ?? "—"}</td>
                  <td className="whitespace-nowrap">{r.broker_label ?? r.agent_name ?? "—"}</td>
                  <td>
                    <Badge variant={r.source === "register" ? "secondary" : "outline"}>
                      {r.source === "register" ? "Registre" : "Maestro"}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap">{r.institution ?? "—"}</td>
                  <td className="whitespace-nowrap">{r.commission_type ?? "—"}</td>
                  <td className="text-right whitespace-nowrap">{r.loan_amt ? cad(r.loan_amt) : "—"}</td>
                  <td className="text-right whitespace-nowrap">{cad(r.amount)}</td>
                  <td className="pl-3 text-xs text-muted-foreground">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 500 && (
            <p className="text-xs text-muted-foreground pt-3">
              500 premières lignes affichées — exportez en CSV pour la liste complète.
            </p>
          )}
          {!loading && !rows.length && <p className="text-sm text-muted-foreground pt-3">Aucune ligne pour cette année.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
