import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Trash2, Copy, CheckCircle2, XCircle, AlertTriangle, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import { ppSipProvider, type PpSipEvent, type PpSipSnapshot } from "@/lib/planipret/sip/ppSipProvider";
import { exportSipStability, getSipStabilityReport, resetSipStability } from "@/lib/planipret/sip/sipStabilityMonitor";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { checkSipBackendRegistration, getLastSipBackendCheck, type SipBackendCheck } from "@/lib/planipret/sip/sipBackendCheck";

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

  useEffect(() => {
    const us = ppSipProvider.subscribe(setSnap);
    const ue = ppSipProvider.subscribeEvents(setEvents);
    return () => { us(); ue(); };
  }, []);

  // Live PBX-side truth: the local stack can be idle while the extension is
  // really registered (native engine / other client). Poll the server.
  useEffect(() => {
    let alive = true;
    const run = async (force = false) => {
      const res = await checkSipBackendRegistration({ force });
      if (alive && res) setPbx(res);
    };
    run(true);
    const id = setInterval(() => run(false), 30_000);
    const onVis = () => { if (document.visibilityState === "visible") run(true); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const cfg = ppSipProvider.getConfig();
  const pbxRegistered = Boolean(pbx?.registration?.mobile_registered || (pbx?.registration?.count ?? 0) > 0);
  const status = pbxRegistered && snap.status !== "registered" ? "registered" : snap.status;
  const rawIdx = STAGES.indexOf(status as any);
  const currentIdx = rawIdx >= 0 ? rawIdx : 0;
  const isError = status === "error";


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
        <button onClick={() => { ppSipProvider.forceReregister?.(); toast(t("screens.sipDebug.reregisterSent")); }} className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
          style={{ background: "var(--pp-brand-accent)", color: "#fff" }}>
          <RefreshCw className="w-3 h-3" /> {t("screens.sipDebug.reregister")}
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

        {snap.errorCause && (
          <div className="flex items-start gap-2 p-2 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444" }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="text-[12px]">{snap.errorCause}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
          <div><span className="opacity-60">{t("screens.sipDebug.extShort")}</span> {cfg?.sipUsername ?? pbx?.extension ?? "—"}</div>
          <div><span className="opacity-60">{t("screens.sipDebug.domainShort")}</span> {cfg?.sipDomain ?? "—"}</div>
          <div className="col-span-2 truncate"><span className="opacity-60">{t("screens.sipDebug.wssShort")}</span> {cfg?.wssUrl ?? "—"}</div>
          <div className="col-span-2"><span className="opacity-60">{t("screens.sipDebug.lastRegistration")}</span> {snap.lastRegistrationAt ? new Date(snap.lastRegistrationAt).toLocaleTimeString(lang === "fr" ? "fr-CA" : "en-CA") : "—"}</div>
        </div>
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
