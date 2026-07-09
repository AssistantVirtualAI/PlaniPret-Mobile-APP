import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, RefreshCw, PhoneCall, CheckCircle2, AlertTriangle, XCircle, Zap, Search, Smartphone, MonitorSmartphone, ShieldCheck } from "lucide-react";
import Pagination from "@/components/planipret/admin/Pagination";

const ACCENT = "#2E9BDC";
const SUCCESS = "#00D4AA";
const DANGER = "#E84C4C";
const WARNING = "#F6B44B";

type Row = {
  broker_id: string;
  full_name: string | null;
  email: string | null;
  ns_extension: string;
  ns_domain: string;
  ns_mobile_device_id: string | null;
  ns_widget_device_id: string | null;
  target_mobile_id: string;
  ns_mobile_exists: boolean;
  ns_widget_exists: boolean;
  ns_reachable: boolean;
  ns_status: number;
  has_vault_secret: boolean;
  provisioned_at: string | null;
  last_error: { at: string; details: any } | null;
  state: "ok" | "missing" | "error" | "partial";
};

type Stats = { total: number; ok: number; missing: number; error: number; partial: number };

function StatePill({ state }: { state: Row["state"] }) {
  const cfg = state === "ok"
    ? { label: "OK", color: SUCCESS, icon: CheckCircle2 }
    : state === "missing"
      ? { label: "Manquant", color: DANGER, icon: XCircle }
      : state === "error"
        ? { label: "Erreur", color: DANGER, icon: AlertTriangle }
        : { label: "Partiel", color: WARNING, icon: AlertTriangle };
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium leading-none" style={{ background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}33` }}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

export default function PAMobileDevices() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, ok: 0, missing: 0, error: 0, partial: 0 });
  const [filter, setFilter] = useState("");
  const [testBroker, setTestBroker] = useState<Row | null>(null);
  const [fromNumber, setFromNumber] = useState("");
  const [testing, setTesting] = useState(false);
  const [testSessionId, setTestSessionId] = useState<string | null>(null);
  const [testState, setTestState] = useState<string | null>(null);
  const [answeredBy, setAnsweredBy] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [syncingDevices, setSyncingDevices] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("pp-mobile-device-status", { body: {} });
    setLoading(false);
    if (error) { toast.error("Échec du rapport", { description: error.message }); return; }
    if (!data?.ok) { toast.error("Rapport invalide", { description: data?.error }); return; }
    setRows(data.rows ?? []);
    setStats(data.stats ?? { total: 0, ok: 0, missing: 0, error: 0, partial: 0 });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const backfill = useCallback(async () => {
    setBackfilling(true);
    const { data, error } = await supabase.functions.invoke("pp-backfill-mobile-devices", { body: {} });
    setBackfilling(false);
    if (error) { toast.error("Backfill échoué", { description: error.message }); return; }
    toast.success("Backfill terminé", {
      description: `Créés: ${data?.created ?? 0} · Ignorés: ${data?.skipped ?? 0} · Erreurs: ${data?.errors ?? 0}`,
    });
    refresh();
  }, [refresh]);

  const provisionAppReview = useCallback(async () => {
    if (!confirm("Créer l'utilisateur App Review (demo@avastatistic.ca, ext 1999) ?")) return;
    const { data, error } = await supabase.functions.invoke("pp-appreview-provision", { body: {} });
    if (error) { toast.error("Provision AppReview échouée", { description: error.message }); return; }
    if (!data?.success) { toast.error("Provision AppReview échouée", { description: data?.error || data?.detail || JSON.stringify(data) }); return; }
    const login = data.login;
    toast.success("App Review prêt", {
      description: `${login?.email} / ${login?.password} · ext ${login?.extension}@${login?.domain}`,
      duration: 20000,
    });
    try { await navigator.clipboard.writeText(`${login?.email} / ${login?.password}`); } catch { /* noop */ }
    refresh();
  }, [refresh]);

  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const provisionOne = useCallback(async (broker: Row) => {
    setProvisioningId(broker.broker_id);
    const { data, error } = await supabase.functions.invoke("ns-provision-broker-devices", {
      body: { broker_id: broker.broker_id, bulk: false },
    });
    setProvisioningId(null);
    if (error || !data?.success) {
      const msg = data?.result?.error || data?.result?.db_error || data?.error || error?.message || "Erreur inconnue";
      toast.error(`❌ ${broker.full_name}: ${msg}`);
      return;
    }
    toast.success(`✅ ${broker.full_name}: appareils créés`);
    refresh();
  }, [refresh]);

  const syncDevices = useCallback(async () => {
    setSyncingDevices(true);
    const report = await supabase.functions.invoke("pp-mobile-device-status", { body: { sync: true } });
    if (report.error || !(report.data as any)?.ok) {
      setSyncingDevices(false);
      toast.error("Sync appareils échouée", { description: (report.data as any)?.error || report.error?.message });
      return;
    }
    setRows((report.data as any).rows ?? []);
    setStats((report.data as any).stats ?? { total: 0, ok: 0, missing: 0, error: 0, partial: 0 });
    const provision = await supabase.functions.invoke("ns-provision-broker-devices", { body: { bulk: true, batch_size: 8 } });
    setSyncingDevices(false);
    if (provision.error || !(provision.data as any)?.success) {
      toast.error("Provisionnement appareils échoué", { description: (provision.data as any)?.error || provision.error?.message });
      return;
    }
    toast.success(`Sync terminée: ${(provision.data as any)?.succeeded ?? 0}/${(provision.data as any)?.total ?? 0} provisionnés`);
    refresh();
  }, [refresh]);

  const startTest = useCallback(async () => {
    if (!testBroker) return;
    setTesting(true);
    setTestState("Déclenchement…");
    setAnsweredBy(null);
    const { data, error } = await supabase.functions.invoke("pp-mobile-testcall", {
      body: { broker_id: testBroker.broker_id, from_number: fromNumber || undefined },
    });
    setTesting(false);
    if (error || !data?.ok) {
      toast.error("Appel test échoué", { description: error?.message || data?.error });
      setTestState(`Échec (${data?.ns_status ?? ""})`);
      return;
    }
    setTestSessionId(data.test_session_id);
    setTestState("Sonne sur les deux appareils…");
    toast.success("Appel test lancé", { description: data.tip });
  }, [testBroker, fromNumber]);

  // Realtime: watch the test session to prove parallel ring + collision handling.
  useEffect(() => {
    if (!testSessionId) return;
    const ch = supabase
      .channel(`test-call-${testSessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "planipret_call_sessions", filter: `call_id=eq.${testSessionId}` },
        (payload: any) => {
          const r = payload.new ?? payload.old ?? {};
          setAnsweredBy(r.answered_by ?? null);
          if (r.state === "active") setTestState(`Répondu par ${r.answered_by ?? "?"}`);
          else if (r.state === "ended") setTestState(`Terminé (${r.ended_reason ?? "ok"})`);
          else if (r.state === "ringing") setTestState("Sonne sur les deux appareils…");
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [testSessionId]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.full_name, r.email, r.ns_extension, r.ns_mobile_device_id, r.ns_widget_device_id]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, filter]);

  useEffect(() => { setPage(1); }, [filter, pageSize]);
  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );


  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--pp-text-primary)" }}>Devices mobiles</h2>
          <span className="rounded-full px-2 py-1" style={{ fontSize: 11, background: "var(--pp-bg-elevated)", color: "var(--pp-text-secondary)", border: "1px solid var(--pp-bg-border-2)" }}>
            {stats.total} courtier{stats.total > 1 ? "s" : ""}
          </span>
          <span className="hidden rounded-full px-2 py-1 sm:inline-flex" style={{ fontSize: 11, background: `${ACCENT}12`, color: ACCENT, border: `1px solid ${ACCENT}33` }}>
            Appareils SIP mobile + web
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={refresh} disabled={loading} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)", opacity: loading ? 0.65 : 1 }}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Rafraîchir
          </button>
          <button onClick={syncDevices} disabled={syncingDevices} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)", opacity: syncingDevices ? 0.65 : 1 }}>
            {syncingDevices ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Synchroniser appareils
          </button>
          <button onClick={backfill} disabled={backfilling} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)", opacity: backfilling ? 0.65 : 1 }}>
            {backfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Manquants
          </button>
          <button onClick={provisionAppReview} className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: ACCENT, color: "#fff" }}>
            App Review User
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {([
          { k: "total", label: "Total", icon: MonitorSmartphone, color: "var(--pp-text-primary)" },
          { k: "ok", label: "OK", icon: CheckCircle2, color: SUCCESS },
          { k: "missing", label: "Manquants", icon: XCircle, color: DANGER },
          { k: "partial", label: "Partiels", icon: AlertTriangle, color: WARNING },
          { k: "error", label: "Erreurs", icon: AlertTriangle, color: DANGER },
        ] as const).map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.k} className="pp-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span style={{ fontSize: 11, color: "var(--pp-text-muted)", lineHeight: 1.5 }}>{s.label}</span>
                <Icon className="h-3.5 w-3.5" style={{ color: s.color }} />
              </div>
              <div className="mt-2 tabular-nums" style={{ fontSize: 20, lineHeight: 1.1, fontWeight: 600, color: s.color }}>
                {loading && !rows.length ? <span className="inline-block h-5 w-10 animate-pulse rounded" style={{ background: "var(--pp-bg-elevated)" }} /> : ((stats as any)[s.k] ?? 0)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--pp-text-muted)" }} />
          <Input
            placeholder="Filtrer nom, courriel, extension, device id…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
          />
        </div>
        {(loading || syncingDevices) && (
          <span className="text-xs" style={{ color: "var(--pp-text-muted)" }}>
            {syncingDevices ? "Synchronisation bidirectionnelle en cours…" : "Chargement des appareils…"}
          </span>
        )}
      </div>

      <div className="pp-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed text-sm">
            <thead style={{ background: "var(--pp-bg-elevated)" }}>
              <tr className="text-left" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--pp-text-faint)" }}>
                <th className="w-[24%] p-3">Courtier</th>
                <th className="w-[8%] p-3">Ext.</th>
                <th className="w-[22%] p-3">Device mobile</th>
                <th className="w-[18%] p-3">Widget</th>
                <th className="w-[10%] p-3">État</th>
                <th className="w-[10%] p-3">Provisionné</th>
                <th className="w-[8%] p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && Array.from({ length: 7 }).map((_, i) => (
                <tr key={`sk-${i}`} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="p-3"><div className="h-3 w-4/5 animate-pulse rounded" style={{ background: "var(--pp-bg-elevated)" }} /></td>
                  ))}
                </tr>
              ))}
              {paged.map((r) => (
                <tr key={r.broker_id} className="transition hover:bg-white/[0.02]" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <td className="p-3 align-top">
                    <div className="break-words" style={{ fontWeight: 500, lineHeight: 1.45, color: "var(--pp-text-primary)" }}>{r.full_name ?? "—"}</div>
                    <div className="mt-1 break-all" style={{ fontSize: 11, lineHeight: 1.45, color: "var(--pp-text-muted)" }}>{r.email}</div>
                  </td>
                  <td className="p-3 align-top tabular-nums" style={{ fontSize: 12, color: "var(--pp-text-secondary)" }}>{r.ns_extension}</td>
                  <td className="p-3 align-top">
                    <div className="flex items-start gap-2">
                      <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: r.ns_mobile_exists ? SUCCESS : DANGER }} />
                      <div className="min-w-0">
                        <div className="break-all font-mono" style={{ fontSize: 12, lineHeight: 1.45, color: "var(--pp-text-primary)" }}>{r.ns_mobile_device_id ?? r.target_mobile_id}</div>
                        <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--pp-text-muted)" }}>Téléphone: {r.ns_mobile_exists ? "présent" : "absent"} · Secret: {r.has_vault_secret ? "oui" : "non"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 align-top">
                    <div className="break-all font-mono" style={{ fontSize: 12, lineHeight: 1.45, color: "var(--pp-text-primary)" }}>{r.ns_widget_device_id ?? "—"}</div>
                    <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--pp-text-muted)" }}>{r.ns_widget_exists ? "présent" : (r.ns_widget_device_id ? "absent" : "non lié")}</div>
                  </td>
                  <td className="p-3 align-top"><StatePill state={r.state} /></td>
                  <td className="p-3 align-top" style={{ fontSize: 11, lineHeight: 1.5, color: "var(--pp-text-secondary)" }}>
                    {r.provisioned_at ? new Date(r.provisioned_at).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    {r.last_error && <div style={{ color: DANGER }}>Err: {new Date(r.last_error.at).toLocaleDateString("fr-CA")}</div>}
                  </td>
                  <td className="p-3 align-top text-right">
                    <div className="flex flex-col items-end gap-1.5">
                      {(r.state === "missing" || r.state === "partial" || r.state === "error") && (
                        <button onClick={() => provisionOne(r)} disabled={provisioningId === r.broker_id || !r.ns_extension} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium" style={{ background: `${ACCENT}16`, color: ACCENT, border: `1px solid ${ACCENT}33`, opacity: provisioningId === r.broker_id ? 0.65 : 1 }}>
                          {provisioningId === r.broker_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />} Fix
                        </button>
                      )}
                      <button onClick={() => { setTestBroker(r); setTestSessionId(null); setTestState(null); setAnsweredBy(null); }} disabled={!r.ns_extension} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
                        <PhoneCall className="h-3.5 w-3.5" /> Test
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: "var(--pp-text-faint)" }}>Aucun courtier.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          loading={loading || syncingDevices}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          unit="courtiers"
        />
      </div>


      <Dialog open={!!testBroker} onOpenChange={(o) => { if (!o) setTestBroker(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appel test — {testBroker?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Un appel va être déclenché vers l'extension <code>{testBroker?.ns_extension}</code>. Le widget web et
              l'application mobile doivent sonner <strong>simultanément</strong>. Décrocher sur l'un doit
              couper l'autre.
            </p>
            <div>
              <label className="text-xs text-muted-foreground">Numéro appelant (caller ID)</label>
              <Input
                value={fromNumber}
                onChange={(e) => setFromNumber(e.target.value)}
                placeholder="ex. 5145550100"
              />
            </div>
            {testState && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div><span className="font-medium">État :</span> {testState}</div>
                {answeredBy && <div className="text-xs text-muted-foreground">Répondu par : {answeredBy}</div>}
                {testSessionId && <div className="text-[10px] text-muted-foreground">session {testSessionId}</div>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTestBroker(null)}>Fermer</Button>
            <Button onClick={startTest} disabled={testing}>
              {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PhoneCall className="mr-2 h-4 w-4" />}
              Lancer l'appel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
