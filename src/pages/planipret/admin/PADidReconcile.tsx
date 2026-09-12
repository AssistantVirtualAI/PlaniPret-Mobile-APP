import { PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, PlayCircle, AlertTriangle, CheckCircle2, Mail } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

interface Row {
  email: string | null;
  name: string | null;
  extension: string | null;
  maestro_broker_id: string | null;
  maestro_extension: string | null;
  ns_dids: string[];
  maestro_did: string | null;
  maestro_sms_did: string | null;
  maestro_status: string;
  status: string;
}

interface ReportRow {
  id: string;
  created_at: string;
  domain: string;
  broker_count: number;
  mismatch_count: number;
  alert_sent: boolean;
  alert_error: string | null;
  triggered_by: string;
}

const STATUS_STYLE: Record<string, string> = {
  match: "bg-emerald-100 text-emerald-800",
  did_mismatch: "bg-red-100 text-red-800",
  extension_mismatch: "bg-red-100 text-red-800",
  no_maestro_did: "bg-amber-100 text-amber-800",
  no_ns_did: "bg-amber-100 text-amber-800",
  no_extension: "bg-slate-100 text-slate-700",
};

export default function PADidReconcile() {
  const { lang } = useMplanipretLang();
  const fr = lang !== "en";
  const t = useMemo(
    () => ({
      title: fr ? "Réconciliation DID" : "DID reconciliation",
      sub: fr
        ? "Compare les extensions/DID NetSapiens avec les provider_user Maestro et signale les écarts. Lecture seule."
        : "Compares NetSapiens extensions/DIDs with Maestro provider_user mappings and highlights mismatches. Read-only.",
      refresh: fr ? "Actualiser" : "Refresh",
      runJob: fr ? "Lancer le job + alerte" : "Run job + alert",
      brokers: fr ? "Courtiers" : "Brokers",
      mismatches: fr ? "Écarts" : "Mismatches",
      nsDids: fr ? "DID NetSapiens" : "NetSapiens DIDs",
      orphans: fr ? "DID sans extension" : "DIDs without extension",
      broker: fr ? "Courtier" : "Broker",
      ns: fr ? "NS poste / DID" : "NS ext / DID",
      maestro: fr ? "Maestro poste / DID SMS" : "Maestro ext / SMS DID",
      status: fr ? "État" : "Status",
      history: fr ? "Historique des rapports" : "Report history",
      none: fr ? "Aucun rapport" : "No reports",
      onlyMismatch: fr ? "Écarts seulement" : "Mismatches only",
      all: fr ? "Tout" : "All",
      search: fr ? "Rechercher un courtier…" : "Search a broker…",
      alerted: fr ? "Alerte envoyée" : "Alert sent",
    }),
    [fr],
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [orphans, setOrphans] = useState<string[]>([]);
  const [nsCount, setNsCount] = useState(0);
  const [brokerCount, setBrokerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [onlyMismatch, setOnlyMismatch] = useState(true);
  const [q, setQ] = useState("");
  const [reports, setReports] = useState<ReportRow[]>([]);

  const loadReports = useCallback(async () => {
    const { data } = await supabase
      .from("planipret_did_reconcile_reports")
      .select("id, created_at, domain, broker_count, mismatch_count, alert_sent, alert_error, triggered_by")
      .order("created_at", { ascending: false })
      .limit(15);
    setReports((data ?? []) as ReportRow[]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pp-did-reconcile", {
        body: { only_mismatch: false },
      });
      if (error) throw new Error(error.message);
      const d: any = data ?? {};
      if (d.error) throw new Error(d.error);
      setRows((d.rows ?? []) as Row[]);
      setSummary(d.summary ?? {});
      setOrphans(d.orphan_ns_dids ?? []);
      setNsCount(d.ns_did_count ?? 0);
      setBrokerCount(d.broker_count ?? 0);
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); void loadReports(); }, [load, loadReports]);

  const runJob = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pp-did-reconcile-job", { body: {} });
      if (error) throw new Error(error.message);
      const d: any = data ?? {};
      if (d.error) throw new Error(d.error);
      toast.success(
        fr
          ? `${d.mismatch_count} écart(s) — ${d.alert_sent ? "alerte envoyée" : "aucune alerte"}`
          : `${d.mismatch_count} mismatch(es) — ${d.alert_sent ? "alert sent" : "no alert"}`,
      );
      if (d.alert_error) toast.warning(String(d.alert_error));
      await Promise.all([load(), loadReports()]);
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setRunning(false);
    }
  };

  const mismatchCount = rows.filter((r) => r.status !== "match").length;
  const visible = rows.filter((r) => {
    if (onlyMismatch && r.status === "match") return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return `${r.name ?? ""} ${r.email ?? ""} ${r.extension ?? ""}`.toLowerCase().includes(s);
  });

  return (
    <div className="pa-page">
      <PAPageHeader
        icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
        title={t.title}
        subtitle={t.sub}
        actions={
          <>
            <Button variant="outline" onClick={() => { void load(); void loadReports(); }} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {t.refresh}
            </Button>
            <Button onClick={runJob} disabled={running}>
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
              {t.runJob}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: t.brokers, value: brokerCount },
          { label: t.mismatches, value: mismatchCount },
          { label: t.nsDids, value: nsCount },
          { label: t.orphans, value: orphans.length },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="text-2xl font-semibold">{c.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="max-w-xs" placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
          <Button size="sm" variant={onlyMismatch ? "default" : "outline"} onClick={() => setOnlyMismatch(true)}>{t.onlyMismatch}</Button>
          <Button size="sm" variant={!onlyMismatch ? "default" : "outline"} onClick={() => setOnlyMismatch(false)}>{t.all}</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-3">{t.broker}</th>
                <th className="py-2 pr-3">{t.ns}</th>
                <th className="py-2 pr-3">{t.maestro}</th>
                <th className="py-2 pr-3">{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={`${r.email}-${r.extension}`} className="border-t">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{r.name ?? r.email}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </td>
                  <td className="py-2 pr-3">
                    {r.extension ?? "—"} / {r.ns_dids?.length ? r.ns_dids.join(", ") : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {r.maestro_extension ?? "—"} / {r.maestro_sms_did ?? "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[r.status] ?? "bg-slate-100 text-slate-700"}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!visible.length && !loading && (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 inline mr-1" />{fr ? "Aucun écart" : "No mismatch"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {orphans.length > 0 && (
          <div className="text-xs text-amber-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5" />
            <span>{t.orphans}: {orphans.join(", ")}</span>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-medium mb-3">{t.history}</h2>
        <div className="space-y-2">
          {reports.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 text-sm border-t pt-2 first:border-t-0 first:pt-0">
              <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString(fr ? "fr-CA" : "en-CA")}</span>
              <Badge variant={r.mismatch_count ? "destructive" : "secondary"}>{r.mismatch_count} {t.mismatches.toLowerCase()}</Badge>
              <span className="text-xs text-muted-foreground">{r.broker_count} {t.brokers.toLowerCase()} · {r.triggered_by}</span>
              {r.alert_sent && <span className="text-xs text-emerald-700 flex items-center gap-1"><Mail className="w-3 h-3" />{t.alerted}</span>}
              {r.alert_error && <span className="text-xs text-amber-700">{r.alert_error}</span>}
            </div>
          ))}
          {!reports.length && <div className="text-sm text-muted-foreground">{t.none}</div>}
        </div>
      </Card>
    </div>
  );
}
