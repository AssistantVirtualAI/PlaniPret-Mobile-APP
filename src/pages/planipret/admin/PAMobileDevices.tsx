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
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const ACCENT = "#2E9BDC";
const SUCCESS = "#00D4AA";
const DANGER = "#E84C4C";
const WARNING = "#F6B44B";

const DICT = {
  fr: {
    pageTitle: "Devices mobiles",
    brokerCount: (n: number) => `${n} courtier${n > 1 ? "s" : ""}`,
    badgeSip: "Appareils SIP mobile + web",
    refresh: "Rafraîchir",
    syncDevices: "Synchroniser appareils",
    missingBtn: "Manquants",
    appReviewUser: "App Review User",
    statTotal: "Total",
    statOk: "OK",
    statMissing: "Manquants",
    statPartial: "Partiels",
    statError: "Erreurs",
    filterPlaceholder: "Filtrer nom, courriel, extension, device id…",
    syncingBanner: "Synchronisation bidirectionnelle en cours…",
    loadingBanner: "Chargement des appareils…",
    colBroker: "Courtier",
    colExt: "Ext.",
    colMobile: "Device mobile",
    colWidget: "Widget",
    colState: "État",
    colProvisioned: "Provisionné",
    colActions: "Actions",
    phone: "Téléphone",
    present: "présent",
    absent: "absent",
    secret: "Secret",
    yes: "oui",
    no: "non",
    notLinked: "non lié",
    err: "Err",
    fix: "Fix",
    test: "Test",
    noBroker: "Aucun courtier.",
    unitBrokers: "courtiers",
    testCallTitle: (name?: string | null) => `Appel test — ${name ?? ""}`,
    testCallDesc: (ext?: string) =>
      `Un appel va être déclenché vers l'extension ${ext ?? ""}. Le widget web et l'application mobile doivent sonner simultanément. Décrocher sur l'un doit couper l'autre.`,
    testCallIntroPrefix: "Un appel va être déclenché vers l'extension",
    testCallIntroMiddle: "Le widget web et l'application mobile doivent sonner",
    testCallIntroSimultaneous: "simultanément",
    testCallIntroSuffix: "Décrocher sur l'un doit couper l'autre.",
    callerIdLabel: "Numéro appelant (caller ID)",
    callerIdPlaceholder: "ex. 5145550100",
    stateLabel: "État",
    answeredByLabel: "Répondu par",
    sessionLabel: "session",
    close: "Fermer",
    launchCall: "Lancer l'appel",
    toastReportError: "Échec du rapport",
    toastInvalidReport: "Rapport invalide",
    toastBackfillError: "Backfill échoué",
    toastBackfillSuccess: "Backfill terminé",
    toastBackfillDetail: (created: number, skipped: number, errors: number) =>
      `Créés: ${created} · Ignorés: ${skipped} · Erreurs: ${errors}`,
    confirmAppReview: "Créer l'utilisateur App Review (demo@avastatistic.ca, ext 1999) ?",
    toastAppReviewError: "Provision AppReview échouée",
    toastAppReviewReady: "App Review prêt",
    toastUnknownError: "Erreur inconnue",
    toastDevicesCreated: (name?: string | null) => `✅ ${name ?? ""}: appareils créés`,
    toastProvisionError: (name?: string | null, msg?: string) => `❌ ${name ?? ""}: ${msg ?? ""}`,
    toastSyncDevicesError: "Sync appareils échouée",
    toastProvisionDevicesError: "Provisionnement appareils échoué",
    toastSyncDone: (succeeded: number, total: number) => `Sync terminée: ${succeeded}/${total} provisionnés`,
    triggering: "Déclenchement…",
    testCallError: "Appel test échoué",
    testCallFailed: (status?: string) => `Échec (${status ?? ""})`,
    ringingBoth: "Sonne sur les deux appareils…",
    testCallLaunched: "Appel test lancé",
    answeredByState: (who?: string) => `Répondu par ${who ?? "?"}`,
    endedState: (reason?: string) => `Terminé (${reason ?? "ok"})`,
  },
  en: {
    pageTitle: "Mobile devices",
    brokerCount: (n: number) => `${n} broker${n > 1 ? "s" : ""}`,
    badgeSip: "Mobile + web SIP devices",
    refresh: "Refresh",
    syncDevices: "Sync devices",
    missingBtn: "Missing",
    appReviewUser: "App Review User",
    statTotal: "Total",
    statOk: "OK",
    statMissing: "Missing",
    statPartial: "Partial",
    statError: "Errors",
    filterPlaceholder: "Filter name, email, extension, device id…",
    syncingBanner: "Two-way sync in progress…",
    loadingBanner: "Loading devices…",
    colBroker: "Broker",
    colExt: "Ext.",
    colMobile: "Mobile device",
    colWidget: "Widget",
    colState: "State",
    colProvisioned: "Provisioned",
    colActions: "Actions",
    phone: "Phone",
    present: "present",
    absent: "absent",
    secret: "Secret",
    yes: "yes",
    no: "no",
    notLinked: "not linked",
    err: "Err",
    fix: "Fix",
    test: "Test",
    noBroker: "No broker.",
    unitBrokers: "brokers",
    testCallTitle: (name?: string | null) => `Test call — ${name ?? ""}`,
    testCallDesc: (ext?: string) =>
      `A call will be triggered to extension ${ext ?? ""}. The web widget and the mobile app must ring simultaneously. Answering on one must hang up the other.`,
    testCallIntroPrefix: "A call will be triggered to extension",
    testCallIntroMiddle: "The web widget and the mobile app must ring",
    testCallIntroSimultaneous: "simultaneously",
    testCallIntroSuffix: "Answering on one must hang up the other.",
    callerIdLabel: "Caller number (caller ID)",
    callerIdPlaceholder: "e.g. 5145550100",
    stateLabel: "State",
    answeredByLabel: "Answered by",
    sessionLabel: "session",
    close: "Close",
    launchCall: "Launch call",
    toastReportError: "Report failed",
    toastInvalidReport: "Invalid report",
    toastBackfillError: "Backfill failed",
    toastBackfillSuccess: "Backfill complete",
    toastBackfillDetail: (created: number, skipped: number, errors: number) =>
      `Created: ${created} · Skipped: ${skipped} · Errors: ${errors}`,
    confirmAppReview: "Create the App Review user (demo@avastatistic.ca, ext 1999)?",
    toastAppReviewError: "AppReview provisioning failed",
    toastAppReviewReady: "App Review ready",
    toastUnknownError: "Unknown error",
    toastDevicesCreated: (name?: string | null) => `✅ ${name ?? ""}: devices created`,
    toastProvisionError: (name?: string | null, msg?: string) => `❌ ${name ?? ""}: ${msg ?? ""}`,
    toastSyncDevicesError: "Device sync failed",
    toastProvisionDevicesError: "Device provisioning failed",
    toastSyncDone: (succeeded: number, total: number) => `Sync complete: ${succeeded}/${total} provisioned`,
    triggering: "Triggering…",
    testCallError: "Test call failed",
    testCallFailed: (status?: string) => `Failed (${status ?? ""})`,
    ringingBoth: "Ringing on both devices…",
    testCallLaunched: "Test call launched",
    answeredByState: (who?: string) => `Answered by ${who ?? "?"}`,
    endedState: (reason?: string) => `Ended (${reason ?? "ok"})`,
  },
};

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

function StatePill({ state, t }: { state: Row["state"]; t: (typeof DICT)["fr"] }) {
  const cfg = state === "ok"
    ? { label: "OK", color: SUCCESS, icon: CheckCircle2 }
    : state === "missing"
      ? { label: t.statMissing, color: DANGER, icon: XCircle }
      : state === "error"
        ? { label: t.statError, color: DANGER, icon: AlertTriangle }
        : { label: t.statPartial, color: WARNING, icon: AlertTriangle };
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium leading-none" style={{ background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}33` }}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

export default function PAMobileDevices() {
  const { lang } = useMplanipretLang();
  const t = DICT[lang];
  const dateLocale = lang === "en" ? "en-CA" : "fr-CA";
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
    if (error) { toast.error(t.toastReportError, { description: error.message }); return; }
    if (!data?.ok) { toast.error(t.toastInvalidReport, { description: data?.error }); return; }
    setRows(data.rows ?? []);
    setStats(data.stats ?? { total: 0, ok: 0, missing: 0, error: 0, partial: 0 });
  }, [t]);

  useEffect(() => { refresh(); }, [refresh]);

  const backfill = useCallback(async () => {
    setBackfilling(true);
    const { data, error } = await supabase.functions.invoke("pp-backfill-mobile-devices", { body: {} });
    setBackfilling(false);
    if (error) { toast.error(t.toastBackfillError, { description: error.message }); return; }
    toast.success(t.toastBackfillSuccess, {
      description: t.toastBackfillDetail(data?.created ?? 0, data?.skipped ?? 0, data?.errors ?? 0),
    });
    refresh();
  }, [refresh, t]);

  const provisionAppReview = useCallback(async () => {
    if (!confirm(t.confirmAppReview)) return;
    const { data, error } = await supabase.functions.invoke("pp-appreview-provision", { body: {} });
    if (error) { toast.error(t.toastAppReviewError, { description: error.message }); return; }
    if (!data?.success) { toast.error(t.toastAppReviewError, { description: data?.error || data?.detail || JSON.stringify(data) }); return; }
    const login = data.login;
    toast.success(t.toastAppReviewReady, {
      description: `${login?.email} / ${login?.password} · ext ${login?.extension}@${login?.domain}`,
      duration: 20000,
    });
    try { await navigator.clipboard.writeText(`${login?.email} / ${login?.password}`); } catch { /* noop */ }
    refresh();
  }, [refresh, t]);

  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const provisionOne = useCallback(async (broker: Row) => {
    setProvisioningId(broker.broker_id);
    const { data, error } = await supabase.functions.invoke("ns-provision-broker-devices", {
      body: { broker_id: broker.broker_id, bulk: false },
    });
    setProvisioningId(null);
    if (error || !data?.success) {
      const msg = data?.result?.error || data?.result?.db_error || data?.error || error?.message || t.toastUnknownError;
      toast.error(t.toastProvisionError(broker.full_name, msg));
      return;
    }
    toast.success(t.toastDevicesCreated(broker.full_name));
    refresh();
  }, [refresh, t]);

  const syncDevices = useCallback(async () => {
    setSyncingDevices(true);
    const report = await supabase.functions.invoke("pp-mobile-device-status", { body: { sync: true } });
    if (report.error || !(report.data as any)?.ok) {
      setSyncingDevices(false);
      toast.error(t.toastSyncDevicesError, { description: (report.data as any)?.error || report.error?.message });
      return;
    }
    setRows((report.data as any).rows ?? []);
    setStats((report.data as any).stats ?? { total: 0, ok: 0, missing: 0, error: 0, partial: 0 });
    const provision = await supabase.functions.invoke("ns-provision-broker-devices", { body: { bulk: true, batch_size: 8 } });
    setSyncingDevices(false);
    if (provision.error || !(provision.data as any)?.success) {
      toast.error(t.toastProvisionDevicesError, { description: (provision.data as any)?.error || provision.error?.message });
      return;
    }
    toast.success(t.toastSyncDone((provision.data as any)?.succeeded ?? 0, (provision.data as any)?.total ?? 0));
    refresh();
  }, [refresh, t]);

  const startTest = useCallback(async () => {
    if (!testBroker) return;
    setTesting(true);
    setTestState(t.triggering);
    setAnsweredBy(null);
    const { data, error } = await supabase.functions.invoke("pp-mobile-testcall", {
      body: { broker_id: testBroker.broker_id, from_number: fromNumber || undefined },
    });
    setTesting(false);
    if (error || !data?.ok) {
      toast.error(t.testCallError, { description: error?.message || data?.error });
      setTestState(t.testCallFailed(data?.ns_status));
      return;
    }
    setTestSessionId(data.test_session_id);
    setTestState(t.ringingBoth);
    toast.success(t.testCallLaunched, { description: data.tip });
  }, [testBroker, fromNumber, t]);

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
          if (r.state === "active") setTestState(t.answeredByState(r.answered_by));
          else if (r.state === "ended") setTestState(t.endedState(r.ended_reason));
          else if (r.state === "ringing") setTestState(t.ringingBoth);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [testSessionId, t]);

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
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--pp-text-primary)" }}>{t.pageTitle}</h2>
          <span className="rounded-full px-2 py-1" style={{ fontSize: 11, background: "var(--pp-bg-elevated)", color: "var(--pp-text-secondary)", border: "1px solid var(--pp-bg-border-2)" }}>
            {t.brokerCount(stats.total)}
          </span>
          <span className="hidden rounded-full px-2 py-1 sm:inline-flex" style={{ fontSize: 11, background: `${ACCENT}12`, color: ACCENT, border: `1px solid ${ACCENT}33` }}>
            {t.badgeSip}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={refresh} disabled={loading} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)", opacity: loading ? 0.65 : 1 }}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {t.refresh}
          </button>
          <button onClick={syncDevices} disabled={syncingDevices} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)", opacity: syncingDevices ? 0.65 : 1 }}>
            {syncingDevices ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {t.syncDevices}
          </button>
          <button onClick={backfill} disabled={backfilling} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)", opacity: backfilling ? 0.65 : 1 }}>
            {backfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} {t.missingBtn}
          </button>
          <button onClick={provisionAppReview} className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: ACCENT, color: "#fff" }}>
            {t.appReviewUser}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {([
          { k: "total", label: t.statTotal, icon: MonitorSmartphone, color: "var(--pp-text-primary)" },
          { k: "ok", label: t.statOk, icon: CheckCircle2, color: SUCCESS },
          { k: "missing", label: t.statMissing, icon: XCircle, color: DANGER },
          { k: "partial", label: t.statPartial, icon: AlertTriangle, color: WARNING },
          { k: "error", label: t.statError, icon: AlertTriangle, color: DANGER },
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
            placeholder={t.filterPlaceholder}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
          />
        </div>
        {(loading || syncingDevices) && (
          <span className="text-xs" style={{ color: "var(--pp-text-muted)" }}>
            {syncingDevices ? t.syncingBanner : t.loadingBanner}
          </span>
        )}
      </div>

      <div className="pp-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed text-sm">
            <thead style={{ background: "var(--pp-bg-elevated)" }}>
              <tr className="text-left" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--pp-text-faint)" }}>
                <th className="w-[24%] p-3">{t.colBroker}</th>
                <th className="w-[8%] p-3">{t.colExt}</th>
                <th className="w-[22%] p-3">{t.colMobile}</th>
                <th className="w-[18%] p-3">{t.colWidget}</th>
                <th className="w-[10%] p-3">{t.colState}</th>
                <th className="w-[10%] p-3">{t.colProvisioned}</th>
                <th className="w-[8%] p-3 text-right">{t.colActions}</th>
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
                        <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--pp-text-muted)" }}>{t.phone}: {r.ns_mobile_exists ? t.present : t.absent} · {t.secret}: {r.has_vault_secret ? t.yes : t.no}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 align-top">
                    <div className="break-all font-mono" style={{ fontSize: 12, lineHeight: 1.45, color: "var(--pp-text-primary)" }}>{r.ns_widget_device_id ?? "—"}</div>
                    <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--pp-text-muted)" }}>{r.ns_widget_exists ? t.present : (r.ns_widget_device_id ? t.absent : t.notLinked)}</div>
                  </td>
                  <td className="p-3 align-top"><StatePill state={r.state} t={t} /></td>
                  <td className="p-3 align-top" style={{ fontSize: 11, lineHeight: 1.5, color: "var(--pp-text-secondary)" }}>
                    {r.provisioned_at ? new Date(r.provisioned_at).toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" }) : "—"}
                    {r.last_error && <div style={{ color: DANGER }}>{t.err}: {new Date(r.last_error.at).toLocaleDateString(dateLocale)}</div>}
                  </td>
                  <td className="p-3 align-top text-right">
                    <div className="flex flex-col items-end gap-1.5">
                      {(r.state === "missing" || r.state === "partial" || r.state === "error") && (
                        <button onClick={() => provisionOne(r)} disabled={provisioningId === r.broker_id || !r.ns_extension} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium" style={{ background: `${ACCENT}16`, color: ACCENT, border: `1px solid ${ACCENT}33`, opacity: provisioningId === r.broker_id ? 0.65 : 1 }}>
                          {provisioningId === r.broker_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />} {t.fix}
                        </button>
                      )}
                      <button onClick={() => { setTestBroker(r); setTestSessionId(null); setTestState(null); setAnsweredBy(null); }} disabled={!r.ns_extension} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
                        <PhoneCall className="h-3.5 w-3.5" /> {t.test}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={7} className="p-8 text-center" style={{ color: "var(--pp-text-faint)" }}>{t.noBroker}</td></tr>
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
          unit={t.unitBrokers}
        />
      </div>


      <Dialog open={!!testBroker} onOpenChange={(o) => { if (!o) setTestBroker(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.testCallTitle(testBroker?.full_name)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              {t.testCallIntroPrefix} <code>{testBroker?.ns_extension}</code>. {t.testCallIntroMiddle}{" "}
              <strong>{t.testCallIntroSimultaneous}</strong>. {t.testCallIntroSuffix}
            </p>
            <div>
              <label className="text-xs text-muted-foreground">{t.callerIdLabel}</label>
              <Input
                value={fromNumber}
                onChange={(e) => setFromNumber(e.target.value)}
                placeholder={t.callerIdPlaceholder}
              />
            </div>
            {testState && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div><span className="font-medium">{t.stateLabel} :</span> {testState}</div>
                {answeredBy && <div className="text-xs text-muted-foreground">{t.answeredByLabel} : {answeredBy}</div>}
                {testSessionId && <div className="text-[10px] text-muted-foreground">{t.sessionLabel} {testSessionId}</div>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTestBroker(null)}>{t.close}</Button>
            <Button onClick={startTest} disabled={testing}>
              {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PhoneCall className="mr-2 h-4 w-4" />}
              {t.launchCall}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
