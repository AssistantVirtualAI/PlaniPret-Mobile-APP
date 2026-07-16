import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, ShieldAlert, CheckCircle2, AlertTriangle, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { TelephonyLayout } from "@/components/telephony/TelephonyLayout";
import { usePbxRealtime } from "@/hooks/usePbxRealtime";

const LEMTEL_ORG_ID = "71755d33-ed64-4ad5-a828-61c9d2029eb7";

type EntityRow = { entity: string; table: string; mirror: number; remote: number; drift: number; error: string | null };
type DriftResp = { ok: boolean; checked_at?: string; summary?: { total_drift: number; entities_with_drift: number; errors: number }; entities?: EntityRow[]; error?: string };
type Job = { id: string; kind: string; status: string; started_at: string; finished_at: string | null; stats: any; error: string | null };

export default function TelephonySyncHealth() {
  const [drift, setDrift] = useState<DriftResp | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  usePbxRealtime(["pbx_sync_jobs"], ["pbx-sync-jobs"]);

  const loadJobs = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("pbx_sync_jobs")
      .select("id,kind,status,started_at,finished_at,stats,error")
      .eq("organization_id", LEMTEL_ORG_ID)
      .order("started_at", { ascending: false })
      .limit(20);
    setJobs(data || []);
  }, []);

  const runDrift = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pbx-drift-detector", {
        body: { organizationId: LEMTEL_ORG_ID },
      });
      if (error) throw error;
      setDrift(data as DriftResp);
    } catch (e: any) {
      setDrift({ ok: false, error: e?.message || "Failed" });
    } finally {
      setLoading(false);
      loadJobs();
    }
  }, [loadJobs]);

  const syncAll = useCallback(async () => {
    setSyncing(true);
    try {
      await supabase.functions.invoke("realtime-sync", {
        body: { kind: "all", organizationId: LEMTEL_ORG_ID },
      });
    } finally {
      setSyncing(false);
      loadJobs();
      runDrift();
    }
  }, [loadJobs, runDrift]);

  useEffect(() => { loadJobs(); runDrift(); }, [loadJobs, runDrift]);

  const summary = drift?.summary;
  const healthy = summary && summary.errors === 0 && summary.total_drift === 0;

  return (
    <TelephonyLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" /> Sync Health
            </h1>
            <p className="text-sm text-muted-foreground">
              Real-time drift detection between Supabase mirror tables and FusionPBX.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={runDrift} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Detect drift
            </Button>
            <Button onClick={syncAll} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} /> Sync all & re-check
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Overall Status</CardTitle></CardHeader>
            <CardContent>
              {drift?.error ? (
                <Badge variant="destructive" className="gap-1"><ShieldAlert className="h-3 w-3" /> {drift.error}</Badge>
              ) : healthy ? (
                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1"><CheckCircle2 className="h-3 w-3" /> In sync</Badge>
              ) : summary ? (
                <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 gap-1"><AlertTriangle className="h-3 w-3" /> Drift detected</Badge>
              ) : (
                <span className="text-muted-foreground text-sm">Pending…</span>
              )}
              {drift?.checked_at && <div className="text-xs text-muted-foreground mt-2">Checked {formatDistanceToNow(new Date(drift.checked_at), { addSuffix: true })}</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Total drift (rows)</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">{summary?.total_drift ?? "—"}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Entities with drift</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">{summary?.entities_with_drift ?? "—"}</div></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Per-entity drift</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead className="text-right">Mirror</TableHead>
                  <TableHead className="text-right">FusionPBX</TableHead>
                  <TableHead className="text-right">Drift</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drift?.entities?.map((e) => (
                  <TableRow key={e.entity}>
                    <TableCell className="font-mono text-xs">{e.entity}</TableCell>
                    <TableCell className="text-right">{e.mirror}</TableCell>
                    <TableCell className="text-right">{e.remote}</TableCell>
                    <TableCell className="text-right font-semibold">{e.drift}</TableCell>
                    <TableCell>
                      {e.error ? <Badge variant="destructive" className="text-xs">{e.error}</Badge>
                        : e.drift === 0 ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">OK</Badge>
                        : <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">Drift</Badge>}
                    </TableCell>
                  </TableRow>
                )) || (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No data yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent sync jobs</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => {
                  const dur = j.finished_at ? Math.round((new Date(j.finished_at).getTime() - new Date(j.started_at).getTime()) / 1000) : null;
                  return (
                    <TableRow key={j.id}>
                      <TableCell className="font-mono text-xs">{j.kind}</TableCell>
                      <TableCell>
                        <Badge variant={j.status === "error" ? "destructive" : j.status === "running" ? "secondary" : "default"} className="text-xs capitalize">{j.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(j.started_at), { addSuffix: true })}</TableCell>
                      <TableCell className="text-xs">{dur != null ? `${dur}s` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[280px]">
                        {j.error || (j.stats ? JSON.stringify(j.stats) : "—")}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {jobs.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No sync jobs yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </TelephonyLayout>
  );
}
