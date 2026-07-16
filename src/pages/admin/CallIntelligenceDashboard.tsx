import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Activity, AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";

const STATUS_META = {
  queued:     { label: "Queued",     icon: Clock,          cls: "text-slate-500" },
  processing: { label: "Processing", icon: Loader2,        cls: "text-blue-500" },
  analyzed:   { label: "Analyzed",   icon: CheckCircle2,   cls: "text-emerald-500" },
  skipped:    { label: "Skipped",    icon: CheckCircle2,   cls: "text-emerald-400" },
  failed:     { label: "Failed",     icon: XCircle,        cls: "text-red-500" },
} as const;

type Range = 1 | 7 | 30;

export default function CallIntelligenceDashboard() {
  const [days, setDays] = useState<Range>(7);
  const since = useMemo(() => new Date(Date.now() - days * 86400000).toISOString(), [days]);

  const stats = useQuery({
    queryKey: ["call-intel-stats", days],
    queryFn: async () => {
      const { data } = await supabase
        .from("call_intel_pipeline_stats" as any)
        .select("*")
        .gte("day", since);
      return (data as any[]) ?? [];
    },
  });

  const failures = useQuery({
    queryKey: ["call-intel-failures", days],
    queryFn: async () => {
      const { data } = await supabase
        .from("call_intel_failure_reasons" as any)
        .select("*")
        .gte("day", since)
        .order("count", { ascending: false })
        .limit(20);
      return (data as any[]) ?? [];
    },
  });

  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of stats.data ?? []) map[r.status] = (map[r.status] ?? 0) + Number(r.count);
    return map;
  }, [stats.data]);

  const failureTotals = useMemo(() => {
    const map = new Map<string, { error: string; count: number; pipeline: string | null }>();
    for (const r of failures.data ?? []) {
      const key = `${r.error}::${r.pipeline ?? ""}`;
      const prev = map.get(key) ?? { error: r.error, pipeline: r.pipeline, count: 0 };
      prev.count += Number(r.count);
      map.set(key, prev);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [failures.data]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6" /> Call Intelligence Pipeline</h1>
          <p className="text-sm text-muted-foreground">Processing stats and failure reasons for AI summarization & coaching.</p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as Range)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24 hours</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((s) => {
          const M = STATUS_META[s];
          return (
            <Card key={s}>
              <CardContent className="p-4">
                <div className={`flex items-center gap-2 text-xs uppercase tracking-wide ${M.cls}`}>
                  <M.icon className="h-3.5 w-3.5" /> {M.label}
                </div>
                <div className="text-3xl font-bold mt-2">{totals[s] ?? 0}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Top failure reasons</CardTitle>
        </CardHeader>
        <CardContent>
          {failures.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!failures.isLoading && failureTotals.length === 0 && <div className="text-sm text-muted-foreground">No failures in this period 🎉</div>}
          <div className="space-y-2">
            {failureTotals.map((f) => (
              <div key={`${f.error}-${f.pipeline}`} className="flex items-center justify-between border rounded-md p-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-xs">{f.pipeline ?? "—"}</Badge>
                  <span className="truncate">{f.error}</span>
                </div>
                <Badge variant="destructive">{f.count}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Daily breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground overflow-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className="py-1 pr-3">Day</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1 pr-3 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {(stats.data ?? []).map((r: any, i: number) => (
                  <tr key={i} className="border-t">
                    <td className="py-1 pr-3">{new Date(r.day).toLocaleDateString()}</td>
                    <td className="py-1 pr-3">{r.status}</td>
                    <td className="py-1 pr-3 text-right">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
