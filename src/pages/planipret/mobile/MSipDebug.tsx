import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Trash2, Copy, CheckCircle2, XCircle, AlertTriangle, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import { ppSipProvider, type PpSipEvent, type PpSipSnapshot } from "@/lib/planipret/sip/ppSipProvider";
import { exportSipStability, getSipStabilityReport, resetSipStability } from "@/lib/planipret/sip/sipStabilityMonitor";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { checkSipBackendRegistration, getLastSipBackendCheck, type SipBackendCheck } from "@/lib/planipret/sip/sipBackendCheck";
import { nativeSip, type SipRegistrationState, type NativeSipDiagnostics } from "@/lib/planipret/sip/nativeSipService";
import { getAppVersionInfo, type AppVersionInfo } from "@/lib/planipret/appVersion";
import { ensureForegroundOwnership, resetOwnershipRepairBackoff } from "@/lib/planipret/sip/sipOwnershipRepair";
import { Capacitor } from "@capacitor/core";

const STAGES = ["idle", "connecting", "connected", "registered"] as const;

const STATUS_COLOR: Record<string, string> = {
  idle: "#94A3B8",
  connecting: "#F59E0B",
  connected: "#3B82F6",
  registered: "#10B981",
  disconnected: "#94A3B8",
  error: "#EF4444",
};

function StageDot({ label, active, done, error }: { label: string; active: boolean; done: boolean; error?: boolean }) {
  const color = error ? "#EF4444" : done ? "#10B981" : active ? "#F59E0B" : "#94A3B8";
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: color, color: "#fff" }}>
        {error ? <XCircle className="w-4 h-4" /> : done ? <CheckCircle2 className="w-4 h-4" /> : active ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="w-2 h-2 rounded-full bg-white/70" />}
      </div>
      <span className="text-[10px] font-semibold" style={{ color: "var(--pp-text-secondary)" }}>{label}</span>
    </div>
  );
}

export default function MSipDebug() {
  const navigate = useNavigate();
  const { t, lang } = useMplanipretLang();
  const [snap, setSnap] = useState<PpSipSnapshot>(() => ppSipProvider.getSnapshot());
  const [events, setEvents] = useState<PpSipEvent[]>(() => ppSipProvider.getEvents());
  const [pbx, setPbx] = useState<SipBackendCheck | null>(() => getLastSipBackendCheck());
  const [nativeState, setNativeState] = useState<SipRegistrationState>(() => nativeSip.getState());
  const [repairing, setRepairing] = useState(false);
  const [diag, setDiag] = useState<NativeSipDiagnostics | null>(() => nativeSip.getDiagnostics());
  const [version, setVersion] = useState<AppVersionInfo | null>(null);

  useEffect(() => { setDiag(nativeSip.getDiagnostics()); }, [nativeState, pbx]);
  useEffect(() => { void getAppVersionInfo().then(setVersion).catch(() => undefined); }, []);

  useEffect(() => {
    const us = ppSipProvider.subscribe(setSnap);
    const ue = ppSipProvider.subscribeEvents(setEvents);
    return () => { us(); ue(); };
  }, []);

  useEffect(() => {
    const onNativeState = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: SipRegistrationState }>).detail;
      if (detail?.state) setNativeState(detail.state);
    };
    window.addEventListener("sip-registration-state", onNativeState);
    void nativeSip.refreshState().then((state) => {
      if (state?.registered) setNativeState("registered");
    });
    return () => window.removeEventListener("sip-registration-state", onNativeState);
  }, []);

  // Live PBX-side truth on page entry and foreground resume only.
  useEffect(() => {
    let alive = true;
    const run = async (force = false) => {
      const res = await checkSipBackendRegistration({ force });
      if (alive && res) setPbx(res);
    };
    run(true);
    const onVis = () => { if (document.visibilityState === "visible") run(true); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const cfg = ppSipProvider.getConfig();
  const nativePlatform = Capacitor.isNativePlatform();
  const pbxRegistered = Boolean(pbx?.registration?.mobile_registered);
  const status = nativePlatform
    ? (nativeState === "registered" || pbxRegistered
      ? "registered"
      : nativeState === "failed" ? "error" : nativeState === "unavailable" ? "disconnected" : nativeState)
    : (pbxRegistered && snap.status !== "registered" ? "registered" : snap.status);
  const rawIdx = STAGES.indexOf(status as any);
  const currentIdx = rawIdx >= 0 ? rawIdx : 0;
  const nativeUnavailable = nativePlatform && nativeState === "unavailable";
  const isError = status === "error" && !nativeUnavailable;
  const pbxDomain = pbx?.registration?.mobile_aor?.split("@")[1] ?? null;
  const serverColor = pbxRegistered ? "#10B981" : pbx ? "#F59E0B" : "#94A3B8";
  const serverLabel = pbxRegistered
    ? (lang === "fr" ? "CONNECTÉ" : "CONNECTED")
    : pbx
      ? (lang === "fr" ? "SERVEUR OK" : "SERVER OK")
      : (lang === "fr" ? "VÉRIFICATION" : "CHECKING");

  const repair = async () => {
    if (repairing) return;
    setRepairing(true);
    try {
      if (nativePlatform) await nativeSip.repairRegistration();
      else await ppSipProvider.forceReregister?.();
      // Reprise de la ligne si le service d'arrière-plan la tient encore.
      resetOwnershipRepairBackoff();
      await ensureForegroundOwnership().catch(() => undefined);
      const res = await checkSipBackendRegistration({ force: true, minIntervalMs: 0 });
      if (res) setPbx(res);
      toast(nativeSip.isRegistered() || res?.registration?.mobile_registered
        ? (lang === "fr" ? "Ligne mobile enregistrée" : "Mobile line registered")
        : t("screens.sipDebug.reregisterSent"));
    } finally {
      setRepairing(false);
    }
  };


  const copy = async () => {
    const payload = [
      `${t("screens.sipDebug.statusLabel")}: ${snap.status}`,
      `${t("screens.sipDebug.errorLabel")}: ${snap.errorCause ?? "-"}`,
      `${t("screens.sipDebug.extLabel")}: ${cfg?.sipUsername ?? "-"}@${cfg?.sipDomain ?? "-"}`,
      `${t("screens.sipDebug.wssLabel")}: ${cfg?.wssUrl ?? "-"}`,
      `${t("screens.sipDebug.lastRegisterLabel")}: ${snap.lastRegistrationAt ? new Date(snap.lastRegistrationAt).toISOString() : "-"}`,
      "",
      ...events.map((e) => `${new Date(e.time).toISOString()} [${e.level}] ${e.event}${e.detail ? " — " + e.detail : ""}`),
    ].join("\n");
    try { await navigator.clipboard.writeText(payload); toast.success(t("screens.sipDebug.copied")); }
    catch { toast.error(t("screens.sipDebug.copyFailed")); }
  };

  return (
    <div className="p-4 pb-24 space-y-4" style={{ background: "var(--pp-bg-deep)", minHeight: "100%" }}>
      <header className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="flex items-center justify-center rounded-full active:scale-95"
          style={{ width: 32, height: 32, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }} aria-label={t("screens.sipDebug.back")}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="flex-1 font-bold" style={{ fontSize: 18, color: "var(--pp-text-primary)" }}>{t("screens.sipDebug.title")}</h1>
        <button onClick={copy} className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
          <Copy className="w-3 h-3" /> {t("screens.sipDebug.copy")}
        </button>
        <button onClick={() => { ppSipProvider.clearEvents(); }} className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
          <Trash2 className="w-3 h-3" /> {t("screens.sipDebug.clear")}
        </button>
        <button onClick={() => { void repair(); }} disabled={repairing} className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold disabled:opacity-60"
          style={{ background: "var(--pp-brand-accent)", color: "#fff" }}>
          <RefreshCw className={`w-3 h-3 ${repairing ? "animate-spin" : ""}`} /> {t("screens.sipDebug.reregister")}
        </button>
      </header>

      {/* Status card */}
      <section className="pp-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4" style={{ color: STATUS_COLOR[status] }} />
          <span className="font-bold text-sm" style={{ color: "var(--pp-text-primary)" }}>{t("screens.sipDebug.stateTitle")}</span>
          <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: STATUS_COLOR[status], color: "#fff" }}>
            {status.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {STAGES.map((s, i) => (
            <StageDot key={s} label={s} active={!isError && currentIdx === i && s !== "registered"} done={!isError && ((status === "registered" && currentIdx >= i) || currentIdx > i)} error={isError && i === Math.min(currentIdx, STAGES.length - 1)} />
          ))}
        </div>

        {(isError || (nativeUnavailable && status !== "registered")) && (
          <div className="flex items-start gap-2 p-2 rounded-lg"
            style={{ background: nativeUnavailable ? "rgba(59,130,246,0.08)" : "rgba(239,68,68,0.08)", color: nativeUnavailable ? "#3B82F6" : "#EF4444" }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="text-[12px]">
              {nativeUnavailable
                ? (lang === "fr"
                  ? "Aperçu web : le module d'appel natif n'est pas chargé. Les appels passent en mode REST. Installez l'app pour le SIP natif."
                  : "Web preview: the native calling module is not loaded. Calls use REST mode. Install the app for native SIP.")
                : snap.errorCause ?? (lang === "fr" ? "Échec de l’inscription SIP native" : "Native SIP registration failed")}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
          <div><span className="opacity-60">{t("screens.sipDebug.extShort")}</span> {cfg?.sipUsername ?? pbx?.extension ?? "—"}</div>
          <div><span className="opacity-60">{t("screens.sipDebug.domainShort")}</span> {cfg?.sipDomain ?? pbxDomain ?? "—"}</div>
          <div className="col-span-2 truncate"><span className="opacity-60">{t("screens.sipDebug.wssShort")}</span> {cfg?.wssUrl ?? "—"}</div>
          <div className="col-span-2"><span className="opacity-60">{t("screens.sipDebug.lastRegistration")}</span> {snap.lastRegistrationAt ? new Date(snap.lastRegistrationAt).toLocaleTimeString(lang === "fr" ? "fr-CA" : "en-CA") : "—"}</div>
        </div>
      </section>

      {/* Moteur d'appel : diagnostic honnête (d'où vient l'état affiché) */}
      {nativePlatform && (
        <section className="pp-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4" style={{ color: diag?.pluginPresent ? "#10B981" : "#EF4444" }} />
            <span className="font-bold text-sm" style={{ color: "var(--pp-text-primary)" }}>
              {lang === "fr" ? "Moteur d'appel" : "Calling engine"}
            </span>
            <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold"
              style={{ background: diag?.registered ? "#10B981" : diag?.pluginPresent ? "#F59E0B" : "#EF4444", color: "#fff" }}>
              {diag?.registered
                ? (lang === "fr" ? "ACTIF" : "ACTIVE")
                : diag?.pluginPresent
                  ? (lang === "fr" ? "PRÉSENT" : "PRESENT")
                  : (lang === "fr" ? "ABSENT" : "MISSING")}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
            <div><span className="opacity-60">{lang === "fr" ? "Moteur natif" : "Native engine"}</span>{" "}
              {diag?.pluginPresent ? (lang === "fr" ? "présent" : "present") : (lang === "fr" ? "absent du binaire" : "missing from binary")}</div>
            <div><span className="opacity-60">{lang === "fr" ? "Ligne du moteur" : "Engine line"}</span> {diag?.username ?? "—"}</div>
            <div className="col-span-2"><span className="opacity-60">{lang === "fr" ? "Motif" : "Reason"}</span> {diag?.failure ?? "—"}</div>
            <div className="col-span-2"><span className="opacity-60">{lang === "fr" ? "Version installée" : "Installed version"}</span>{" "}
              {version ? `${version.native}${version.ota ? ` + ${version.ota}` : ""}` : "—"}</div>
          </div>
          {diag && !diag.pluginPresent && (
            <p className="text-[11px]" style={{ color: "#F59E0B" }}>
              {lang === "fr"
                ? "Le moteur d'appel natif n'est pas dans cette version installée : les appels passent par la ligne navigateur (application ouverte)."
                : "The native calling engine is not in this installed build: calls use the browser line (app open only)."}
            </p>
          )}
        </section>
      )}

      {/* Phone system (server-side truth) */}
      <section className="pp-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4" style={{ color: serverColor }} />
          <span className="font-bold text-sm" style={{ color: "var(--pp-text-primary)" }}>
            {lang === "fr" ? "Système téléphonique" : "Phone system"}
          </span>
          <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: serverColor, color: "#fff" }}>
            {serverLabel}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
          <div><span className="opacity-60">{lang === "fr" ? "Serveur" : "Server"}</span> {pbx ? (lang === "fr" ? "joignable" : "reachable") : "—"}</div>
          <div><span className="opacity-60">{lang === "fr" ? "Inscriptions" : "Registrations"}</span> {pbx?.registration?.count ?? 0}</div>
          <div className="col-span-2 truncate"><span className="opacity-60">AOR</span> {pbx?.registration?.mobile_aor ?? "—"}</div>
          <div><span className="opacity-60">Push</span> {pbx?.push?.token_present ? (lang === "fr" ? "actif" : "active") : (lang === "fr" ? "absent" : "missing")}</div>
          <div><span className="opacity-60">{lang === "fr" ? "Abonnement appels" : "Call subscription"}</span> {pbx?.call_subscription ? (lang === "fr" ? "actif" : "active") : "—"}</div>
          <div><span className="opacity-60">{lang === "fr" ? "Ligne tenue par" : "Line held by"}</span>{" "}
            {pbx?.registration?.holder === "app"
              ? (lang === "fr" ? "l'application" : "the app")
              : pbx?.registration?.holder === "background"
                ? (lang === "fr" ? "service d'arrière-plan" : "background service")
                : "—"}
          </div>
          <div><span className="opacity-60">{lang === "fr" ? "Depuis" : "Since"}</span>{" "}
            {pbx?.registration?.registered_at
              ? new Date(pbx.registration.registered_at).toLocaleTimeString(lang === "fr" ? "fr-CA" : "en-CA")
              : "—"}
          </div>
        </div>
        {pbx?.registration?.holder === "background" && (
          <button onClick={() => { void repair(); }} disabled={repairing}
            className="w-full py-2 rounded-lg text-[12px] font-semibold disabled:opacity-60"
            style={{ background: "var(--pp-brand-accent)", color: "#fff" }}>
            {lang === "fr" ? "Réparer maintenant" : "Repair now"}
          </button>
        )}
        {!pbxRegistered && (
          <p className="text-[11px]" style={{ color: "#F59E0B" }}>
            {lang === "fr"
              ? "Aucun appareil inscrit : ouvrez l'app installée jusqu'à l'état « Enregistré » pour recevoir les appels."
              : "No device registered: open the installed app until it shows “Registered” to receive calls."}
          </p>
        )}
      </section>



      {/* 24h stability soak */}
      <StabilityCard />

      {/* Event log */}
      <section className="pp-card p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-sm" style={{ color: "var(--pp-text-primary)" }}>{t("screens.sipDebug.eventsTitle")}</span>
          <span className="text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>{events.length}</span>
        </div>
        {events.length === 0 ? (
          <p className="text-[12px] py-4 text-center" style={{ color: "var(--pp-text-secondary)" }}>{t("screens.sipDebug.noEvents")}</p>
        ) : (
          <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
            {events.map((e, i) => {
              const color = e.level === "error" ? "#EF4444" : e.level === "warn" ? "#F59E0B" : "var(--pp-text-secondary)";
              return (
                <li key={i} className="text-[11px] font-mono py-1 px-2 rounded" style={{ background: "var(--pp-bg-elevated)", color }}>
                  <span className="opacity-60">{new Date(e.time).toLocaleTimeString(lang === "fr" ? "fr-CA" : "en-CA")}</span>{" "}
                  <span className="font-bold">{e.event}</span>
                  {e.detail ? <span className="opacity-80"> — {e.detail}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StabilityCard() {
  const { t } = useMplanipretLang();
  const [report, setReport] = useState(() => getSipStabilityReport());
  useEffect(() => {
    const t = setInterval(() => setReport(getSipStabilityReport()), 15000);
    return () => clearInterval(t);
  }, []);
  const V: Record<string, string> = { stable: "#10B981", degraded: "#F59E0B", unstable: "#EF4444", collecting: "#3B82F6" };
  return (
    <section className="pp-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Radio className="w-4 h-4" style={{ color: V[report.verdict] }} />
        <span className="font-bold text-sm" style={{ color: "var(--pp-text-primary)" }}>{t("screens.sipDebug.stabilityTitle")}</span>
        <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: V[report.verdict], color: "#fff" }}>
          {report.verdict.toUpperCase()}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
        <div><span className="opacity-60">{t("screens.sipDebug.windowLabel")}</span> {report.windowHours.toFixed(1)} h</div>
        <div><span className="opacity-60">{t("screens.sipDebug.registersOkLabel")}</span> {report.counts.registered}</div>
        <div><span className="opacity-60">{t("screens.sipDebug.wsDisconnectLabel")}</span> {report.counts.ws_disconnect}</div>
        <div><span className="opacity-60">{t("screens.sipDebug.registrationFailedLabel")}</span> {report.counts.registration_failed}</div>
        <div className="col-span-2"><span className="opacity-60">{t("screens.sipDebug.longestGapLabel")}</span> {(report.longestGapMs / 60000).toFixed(1)} {t("screens.sipDebug.minutesShort")}</div>
      </div>
      <div className="flex gap-2">
        <button onClick={async () => { try { await navigator.clipboard.writeText(exportSipStability()); toast.success(t("screens.sipDebug.reportCopied")); } catch { toast.error(t("screens.sipDebug.copyFailed")); } }}
          className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
          {t("screens.sipDebug.exportReport")}
        </button>
        <button onClick={() => { resetSipStability(); setReport(getSipStabilityReport()); toast(t("screens.sipDebug.testRestarted")); }}
          className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold" style={{ background: "var(--pp-brand-accent)", color: "#fff" }}>
          {t("screens.sipDebug.startNewTest")}
        </button>
      </div>
    </section>
  );
}
