import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/context/OrganizationContext";

type Health = {
  id: string;
  source: string;
  status: string;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  updated_at: string;
};

type Job = {
  id: string;
  source: string;
  target: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  rows_in: number | null;
  rows_out: number | null;
  retries: number;
  error: string | null;
};

export default function SyncHealthCenter() {
  const { selectedOrgId } = useOrganization();
  const { toast } = useToast();
  const [health, setHealth] = useState<Health[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!selectedOrgId) return;
    const [{ data: h }, { data: j }] = await Promise.all([
      supabase
        .from("telecom_sync_health")
        .select("*")
        .eq("organization_id", selectedOrgId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("telecom_sync_jobs")
        .select("*")
        .eq("organization_id", selectedOrgId)
        .order("started_at", { ascending: false })
        .limit(30),
    ]);
    setHealth((h as Health[]) ?? []);
    setJobs((j as Job[]) ?? []);
  };

  useEffect(() => {
    load();
    if (!selectedOrgId) return;
    const ch = supabase
      .channel(`sync-health-${selectedOrgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "telecom_sync_health",
          filter: `organization_id=eq.${selectedOrgId}`,
        },
        load,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "telecom_sync_jobs",
          filter: `organization_id=eq.${selectedOrgId}`,
        },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  const reconcile = async () => {
    if (!selectedOrgId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(
        "reconcile_pbx_call_records" as any,
        { _org_id: selectedOrgId },
      );
      if (error) throw error;
      toast({
        title: "Réconciliation terminée",
        description: `${(data as any)?.duplicates_removed ?? 0} doublons supprimés`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const overall = health.length === 0
    ? "unknown"
    : health.some((h) => h.status === "error" || h.consecutive_failures > 3)
    ? "error"
    : health.some((h) => h.status === "degraded")
    ? "degraded"
    : "healthy";

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" /> Sync Health Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Statut en temps réel de la synchronisation téléphonie ↔ portail.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <OverallBadge status={overall} />
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" /> Rafraîchir
          </Button>
          <Button size="sm" onClick={reconcile} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Réconcilier
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sources de synchronisation</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Dernier succès</TableHead>
                <TableHead>Dernière erreur</TableHead>
                <TableHead className="text-right">Échecs consécutifs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    Aucune source enregistrée pour le moment.
                  </TableCell>
                </TableRow>
              ) : (
                health.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.source}</TableCell>
                    <TableCell>
                      <StatusBadge status={h.status} />
                    </TableCell>
                    <TableCell className="text-xs">{fmt(h.last_success_at)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[260px]">
                      {h.last_error_at ? `${fmt(h.last_error_at)} · ${h.last_error ?? ""}` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={h.consecutive_failures > 0 ? "destructive" : "secondary"}>
                        {h.consecutive_failures}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Derniers jobs (30)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Cible</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Démarré</TableHead>
                <TableHead>Durée</TableHead>
                <TableHead>Lignes (in/out)</TableHead>
                <TableHead>Erreur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    Aucun job récent.
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="font-medium">{j.source}</TableCell>
                    <TableCell>{j.target ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={j.status} />
                    </TableCell>
                    <TableCell className="text-xs">{fmt(j.started_at)}</TableCell>
                    <TableCell className="text-xs">{duration(j.started_at, j.finished_at)}</TableCell>
                    <TableCell className="text-xs">
                      {j.rows_in ?? 0} / {j.rows_out ?? 0}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[220px]">
                      {j.error ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function OverallBadge({ status }: { status: string }) {
  if (status === "healthy")
    return (
      <Badge className="bg-green-600">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Sain
      </Badge>
    );
  if (status === "degraded")
    return (
      <Badge className="bg-amber-500">
        <AlertCircle className="h-3 w-3 mr-1" /> Dégradé
      </Badge>
    );
  if (status === "error")
    return (
      <Badge variant="destructive">
        <AlertCircle className="h-3 w-3 mr-1" /> Erreur
      </Badge>
    );
  return <Badge variant="secondary">Inconnu</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const s = (status ?? "").toLowerCase();
  if (s === "healthy" || s === "success" || s === "completed")
    return <Badge className="bg-green-600">{status}</Badge>;
  if (s === "running" || s === "pending")
    return <Badge variant="secondary">{status}</Badge>;
  if (s === "degraded") return <Badge className="bg-amber-500">{status}</Badge>;
  if (s === "error" || s === "failed") return <Badge variant="destructive">{status}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR");
}

function duration(start: string, end: string | null) {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}
