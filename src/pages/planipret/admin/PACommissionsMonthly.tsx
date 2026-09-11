import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Download, Loader2, Lock, RefreshCw } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, fmtNum, CHART_COLORS } from "@/lib/planipret/commissionStats";

type MonthRow = {
  month: number;
  cyVolume: number; cyDeals: number; cyCommission: number;
  pyVolume: number; pyDeals: number; pyCommission: number;
  volumeYoy: number | null; dealYoy: number | null; commissionYoy: number | null;
  avgDeal: number; bps: number; commissionPerDeal: number;
};

const MONTHS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const pct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${(v * (Math.abs(v) <= 5 ? 100 : 1)).toFixed(1)} %`;

export default function PACommissionsMonthly() {
  const { lang } = useMplanipretLang();
  const isFr = lang !== "en";
  const months = isFr ? MONTHS_FR : MONTHS_EN;

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [agent, setAgent] = useState<string>("all");
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setAllowed(false); return; }
      const [{ data: profile }, { data: isSuper }] = await Promise.all([
        supabase.from("planipret_profiles").select("role").eq("user_id", user.id).maybeSingle(),
        supabase.rpc("is_super_admin", { _user_id: user.id }),
      ]);
      if (!cancelled) setAllowed(profile?.role === "admin" || isSuper === true);
    })();
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const { data: res, error: err } = await supabase.functions.invoke("pp-commission-stats", {
      body: {
        year, month: 12, scope: "all", granularity: "ytd", periodIndex: 12,
        // Isolation courtier : identique au reste des rapports, le serveur
        // ne renvoie que les lignes de ce courtier.
        agent: agent === "all" ? null : agent,
      },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
    if (err) { setError(err.message); setLoading(false); return; }
    if ((res as any)?.error) { setError(String((res as any).error)); setLoading(false); return; }
    setData(res);
    setLoading(false);
  }, [year, agent]);

  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  const monthly: MonthRow[] = useMemo(() => (data?.monthly ?? []) as MonthRow[], [data]);
  const agents: string[] = useMemo(() => (data?.availableAgents ?? []) as string[], [data]);
  const years: number[] = useMemo(() => {
    const list = ((data?.availableYears ?? []) as number[]).filter(Boolean);
    const now = new Date().getFullYear();
    return Array.from(new Set([...list, now, now - 1, now - 2])).sort((a, b) => b - a);
  }, [data]);

  const totals = useMemo(() => monthly.reduce(
    (a, m) => ({
      cyVolume: a.cyVolume + m.cyVolume, cyDeals: a.cyDeals + m.cyDeals, cyCommission: a.cyCommission + m.cyCommission,
      pyVolume: a.pyVolume + m.pyVolume, pyDeals: a.pyDeals + m.pyDeals, pyCommission: a.pyCommission + m.pyCommission,
    }),
    { cyVolume: 0, cyDeals: 0, cyCommission: 0, pyVolume: 0, pyDeals: 0, pyCommission: 0 },
  ), [monthly]);

  const best = useMemo(() => {
    if (!monthly.length) return null;
    return monthly.reduce((a, b) => (b.cyCommission > a.cyCommission ? b : a));
  }, [monthly]);

  const chart = useMemo(() => monthly.map((m) => ({
    name: months[m.month - 1].slice(0, 3),
    [isFr ? "Commission" : "Commission"]: Math.round(m.cyCommission),
    [isFr ? "An dernier" : "Last year"]: Math.round(m.pyCommission),
  })), [monthly, months, isFr]);

  const exportCsv = () => {
    const head = isFr
      ? ["Mois", "Volume", "Dossiers", "Commission brute", "Volume A-1", "Dossiers A-1", "Commission A-1", "Écart commission %"]
      : ["Month", "Volume", "Deals", "Gross commission", "Volume PY", "Deals PY", "Commission PY", "Commission change %"];
    const lines = monthly.map((m) => [
      months[m.month - 1], Math.round(m.cyVolume), m.cyDeals, m.cyCommission.toFixed(2),
      Math.round(m.pyVolume), m.pyDeals, m.pyCommission.toFixed(2),
      m.commissionYoy == null ? "" : (m.commissionYoy * (Math.abs(m.commissionYoy) <= 5 ? 100 : 1)).toFixed(1),
    ]);
    const csv = [head, ...lines].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `commissions-${agent === "all" ? "tous" : agent.replace(/\s+/g, "-")}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (allowed === null) {
    return <PAPage><div className="py-16 text-center text-sm text-muted-foreground">…</div></PAPage>;
  }
  if (!allowed) {
    return (
      <PAPage>
        <div className="py-20 flex flex-col items-center gap-3 text-center">
          <Lock className="w-8 h-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{isFr ? "Page restreinte" : "Restricted page"}</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            {isFr
              ? "Les commissions ne sont pas accessibles pour votre compte."
              : "Commissions are not available for your account."}
          </p>
        </div>
      </PAPage>
    );
  }

  return (
    <PAPage>
      <PAPageHeader
        icon={<CalendarRange className="w-5 h-5" />}
        title={isFr ? "Commissions par mois" : "Commissions by month"}
        subtitle={isFr
          ? "Comparaison mois par mois, par courtier, avec l'année précédente"
          : "Month-by-month comparison, per broker, against last year"}
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select value={agent} onValueChange={setAgent}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder={isFr ? "Courtier" : "Broker"} />
          </SelectTrigger>
          <SelectContent className="max-h-[320px]">
            <SelectItem value="all">{isFr ? "Tous les courtiers" : "All brokers"}</SelectItem>
            {agents.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span className="ml-2">{isFr ? "Actualiser" : "Refresh"}</span>
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!monthly.length}>
          <Download className="w-4 h-4" /><span className="ml-2">CSV</span>
        </Button>
      </div>

      {error && (
        <Card className="mb-4 border-destructive/40">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        {[
          { label: isFr ? "Volume de l'année" : "Year volume", value: fmtMoney(totals.cyVolume), sub: `${isFr ? "A-1" : "PY"} ${fmtMoney(totals.pyVolume)}` },
          { label: isFr ? "Dossiers" : "Deals", value: fmtNum(totals.cyDeals), sub: `${isFr ? "A-1" : "PY"} ${fmtNum(totals.pyDeals)}` },
          { label: isFr ? "Commission brute" : "Gross commission", value: fmtMoney(totals.cyCommission), sub: `${isFr ? "A-1" : "PY"} ${fmtMoney(totals.pyCommission)}` },
          { label: isFr ? "Meilleur mois" : "Best month", value: best ? months[best.month - 1] : "—", sub: best ? fmtMoney(best.cyCommission) : "" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="py-4">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="text-xl font-semibold mt-1">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-4">
        <CardContent className="py-4">
          <div className="text-sm font-medium mb-3">
            {isFr ? "Commission par mois — année courante vs précédente" : "Commission by month — current vs previous year"}
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <Tooltip formatter={(v) => fmtMoney(Number(v))} />
                <Legend />
                <Bar dataKey={isFr ? "Commission" : "Commission"} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                <Bar dataKey={isFr ? "An dernier" : "Last year"} fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                {[
                  isFr ? "Mois" : "Month",
                  isFr ? "Volume" : "Volume",
                  isFr ? "Dossiers" : "Deals",
                  isFr ? "Commission brute" : "Gross commission",
                  isFr ? "Commission A-1" : "Commission PY",
                  isFr ? "Écart" : "Change",
                ].map((h) => <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{months[m.month - 1]}</td>
                  <td className="px-3 py-2">{fmtMoney(m.cyVolume)}</td>
                  <td className="px-3 py-2">{fmtNum(m.cyDeals)}</td>
                  <td className="px-3 py-2 font-medium">{fmtMoney(m.cyCommission)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtMoney(m.pyCommission)}</td>
                  <td className={`px-3 py-2 ${Number(m.commissionYoy) > 0 ? "text-emerald-500" : Number(m.commissionYoy) < 0 ? "text-destructive" : ""}`}>
                    {pct(m.commissionYoy)}
                  </td>
                </tr>
              ))}
              {!monthly.length && !loading && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  {isFr ? "Aucune commission pour cette sélection." : "No commission for this selection."}
                </td></tr>
              )}
            </tbody>
            {monthly.length > 0 && (
              <tfoot>
                <tr className="border-t bg-muted/30 font-medium">
                  <td className="px-3 py-2">{isFr ? "Total" : "Total"}</td>
                  <td className="px-3 py-2">{fmtMoney(totals.cyVolume)}</td>
                  <td className="px-3 py-2">{fmtNum(totals.cyDeals)}</td>
                  <td className="px-3 py-2">{fmtMoney(totals.cyCommission)}</td>
                  <td className="px-3 py-2">{fmtMoney(totals.pyCommission)}</td>
                  <td className="px-3 py-2">
                    {pct(totals.pyCommission ? (totals.cyCommission - totals.pyCommission) / totals.pyCommission : null)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>
    </PAPage>
  );
}
