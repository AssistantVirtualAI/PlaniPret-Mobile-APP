import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/context/OrganizationContext";
import { AVA_OWNER_USER_ID, AVA_ORG_ID, LEMTEL_ORG_ID, estimateCostUSD } from "@/lib/avaOwner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Row = {
  organization_id: string | null;
  provider: string | null;
  model: string | null;
  status: string | null;
  created_at: string;
};

const RANGES = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 } as const;
type RangeKey = keyof typeof RANGES;

export default function AIUsage() {
  const { user, loading: authLoading } = useAuth();
  const { selectedOrgId } = useOrganization();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("30d");
  const [scope, setScope] = useState<"current" | "all">("current");

  const isOwner = user?.id === AVA_OWNER_USER_ID;

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - RANGES[range] * 86400_000).toISOString();
      let q = supabase
        .from("ai_request_audit_log")
        .select("organization_id, provider, model, status, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (scope === "current" && selectedOrgId) q = q.eq("organization_id", selectedOrgId);
      const { data, error } = await q;
      if (!cancelled) {
        if (error) console.error(error);
        setRows((data as Row[]) ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOwner, selectedOrgId, range, scope]);

  const stats = useMemo(() => {
    const byModel = new Map<string, { count: number; ok: number; err: number; cost: number }>();
    let total = 0, totalCost = 0, ok = 0, err = 0;
    for (const r of rows) {
      const m = r.model ?? "unknown";
      const e = byModel.get(m) ?? { count: 0, ok: 0, err: 0, cost: 0 };
      e.count += 1;
      if (r.status === "success" || r.status === "ok") e.ok += 1;
      else if (r.status) e.err += 1;
      const c = estimateCostUSD(r.model, 1);
      e.cost += c;
      totalCost += c;
      total += 1;
      if (r.status === "success" || r.status === "ok") ok += 1;
      else if (r.status) err += 1;
      byModel.set(m, e);
    }
    return { byModel: [...byModel.entries()].sort((a, b) => b[1].cost - a[1].cost), total, totalCost, ok, err };
  }, [rows]);

  if (authLoading) return null;
  if (!isOwner) return <Navigate to="/platform" replace />;

  const orgLabel = selectedOrgId === AVA_ORG_ID ? "AVA Main Dashboard" : selectedOrgId === LEMTEL_ORG_ID ? "Lemtel Communications" : "Current org";

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">AI Usage & Cost</h1>
          <p className="text-sm text-muted-foreground">
            Estimated Lovable AI Gateway spend. Private — visible only to the workspace owner.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={scope} onValueChange={(v) => setScope(v as any)}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current org ({orgLabel})</SelectItem>
              <SelectItem value="all">All organizations</SelectItem>
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.keys(RANGES).map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Total requests</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{loading ? "…" : stats.total.toLocaleString()}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Estimated cost</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">${loading ? "…" : stats.totalCost.toFixed(4)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Successful</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-500">{loading ? "…" : stats.ok}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Errors</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-red-500">{loading ? "…" : stats.err}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Breakdown by model</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Requests</TableHead>
              <TableHead className="text-right">Success</TableHead>
              <TableHead className="text-right">Errors</TableHead>
              <TableHead className="text-right">Estimated cost (USD)</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {stats.byModel.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No data</TableCell></TableRow>
              )}
              {stats.byModel.map(([model, m]) => (
                <TableRow key={model}>
                  <TableCell><Badge variant="outline">{model}</Badge></TableCell>
                  <TableCell className="text-right">{m.count}</TableCell>
                  <TableCell className="text-right text-emerald-500">{m.ok}</TableCell>
                  <TableCell className="text-right text-red-500">{m.err}</TableCell>
                  <TableCell className="text-right font-mono">${m.cost.toFixed(4)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground mt-3">
            Cost is estimated from request count × average tokens × model rate. For exact billing, see Lovable Cloud → AI balance.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
