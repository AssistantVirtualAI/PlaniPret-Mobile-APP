import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Trash2, Copy, CheckCircle2, XCircle, AlertTriangle, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import { ppSipProvider, type PpSipEvent, type PpSipSnapshot } from "@/lib/planipret/sip/ppSipProvider";
import { exportSipStability, getSipStabilityReport, resetSipStability } from "@/lib/planipret/sip/sipStabilityMonitor";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { isPjsipEnabled, nativeOwnsAor, setPjsipEnabled } from "@/lib/planipret/sip/aorArbitration";
import { nativeSip } from "@/lib/planipret/sip/nativeSipService";
import { runPjsipRegisterProbe, PJSIP_PROBE_PORT, PJSIP_PROBE_SERVER, type PjsipProbeResult } from "@/lib/native/PpPjsipProbe";
import CallValidationCard from "@/components/planipret/mobile/CallValidationCard";

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

  useEffect(() => {
    const us = ppSipProvider.subscribe(setSnap);
    const ue = ppSipProvider.subscribeEvents(setEvents);
    return () => { us(); ue(); };
  }, []);

  const cfg = ppSipProvider.getConfig();
  const rawIdx = STAGES.indexOf(snap.status as any);
  const currentIdx = rawIdx >= 0 ? rawIdx : 0;
  const isError = snap.status === "error";

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
          <Radio className="w-4 h-4" style={{ color: STATUS_COLOR[snap.status] }} />
          <span className="font-bold text-sm" style={{ color: "var(--pp-text-primary)" }}>{t("screens.sipDebug.stateTitle")}</span>
          <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: STATUS_COLOR[snap.status], color: "#fff" }}>
            {snap.status.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {STAGES.map((s, i) => (
            <StageDot key={s} label={s} active={!isError && currentIdx === i && s !== "registered"} done={!isError && ((snap.status === "registered" && currentIdx >= i) || currentIdx > i)} error={isError && i === Math.min(currentIdx, STAGES.length - 1)} />
          ))}
        </div>

        {snap.errorCause && (
          <div className="flex items-start gap-2 p-2 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444" }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="text-[12px]">{snap.errorCause}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
          <div><span className="opacity-60">{t("screens.sipDebug.extShort")}</span> {cfg?.sipUsername ?? "—"}</div>
          <div><span className="opacity-60">{t("screens.sipDebug.domainShort")}</span> {cfg?.sipDomain ?? "—"}</div>
          <div className="col-span-2 truncate"><span className="opacity-60">{t("screens.sipDebug.wssShort")}</span> {cfg?.wssUrl ?? "—"}</div>
          <div className="col-span-2"><span className="opacity-60">{t("screens.sipDebug.lastRegistration")}</span> {snap.lastRegistrationAt ? new Date(snap.lastRegistrationAt).toLocaleTimeString(lang === "fr" ? "fr-CA" : "en-CA") : "—"}</div>
        </div>
      </section>


      {/* État réel du moteur natif (les champs WSS ci-dessus restent vides
          quand PJSIP possède l'AOR : ce n'est pas une panne). */}
      <NativeEngineCard />

      {/* 24h stability soak */}
      {/* Interrupteur PJSIP (sans rebuild) */}
      <PjsipToggleCard />

      {/* Sonde PJSIP native (manuelle) */}
      <PjsipProbeCard />


      <CallValidationCard />
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

/**
 * État réel du moteur natif PJSIP.
 *
 * Sur iOS, PJSIP possède `<ext>M` et la pile JsSIP n'est jamais configurée :
 * la carte d'état plus haut affiche donc `IDLE` avec Ext/Domaine vides même
 * quand tout va bien. Cette carte montre l'état vrai et permet de relancer
 * l'initialisation (utile après une réinstallation de l'app).
 */
function NativeEngineCard() {
  const [state, setState] = useState(() => ({
    available: nativeSip.isAvailable(),
    registered: nativeSip.isRegistered(),
    username: nativeSip.getUsername(),
    extension: nativeSip.getExtension(),
    engineState: nativeSip.getState(),
  }));
  const [repairing, setRepairing] = useState(false);

  const refresh = () => setState({
    available: nativeSip.isAvailable(),
    registered: nativeSip.isRegistered(),
    username: nativeSip.getUsername(),
    extension: nativeSip.getExtension(),
    engineState: nativeSip.getState(),
  });

  useEffect(() => {
    const id = setInterval(() => { void nativeSip.refreshState().finally(refresh); }, 10000);
    return () => clearInterval(id);
  }, []);

  const repair = async () => {
    setRepairing(true);
    try {
      const ok = await Promise.race([
        nativeSip.repairRegistration(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 55_000)),
      ]);
      refresh();
      ok
        ? toast.success("Moteur natif enregistré")
        : toast.error("Le SIP ne s’est pas enregistré. Vérifiez le réseau puis réessayez.");
    } catch (e: any) {
      toast.error(e?.message ?? "Réparation échouée");
    } finally {
      setRepairing(false);
    }
  };

  const color = state.registered ? "#10B981" : state.available ? "#F59E0B" : "#EF4444";

  return (
    <section className="pp-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Radio className="w-4 h-4" style={{ color }} />
        <span className="font-bold text-sm" style={{ color: "var(--pp-text-primary)" }}>Moteur natif PJSIP</span>
        <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: color, color: "#fff" }}>
          {state.registered ? "REGISTERED" : state.engineState.toUpperCase()}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
        <div><span className="opacity-60">AOR</span> {state.username ?? "—"}</div>
        <div><span className="opacity-60">Poste</span> {state.extension ?? "—"}</div>
        <div className="col-span-2"><span className="opacity-60">Plugin</span> {state.available ? "disponible" : "absent"}</div>
      </div>
      <button
        onClick={repair}
        disabled={repairing}
        className="w-full py-2 rounded-lg text-[12px] font-semibold disabled:opacity-60"
        style={{ background: "var(--pp-brand-accent)", color: "#fff" }}
      >
        {repairing ? "Réparation…" : "Réparer / réenregistrer le SIP"}
      </button>
    </section>
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

/** Sonde PJSIP native — REGISTER TLS 5061, déclenchement manuel uniquement. */
const PJSIP_PROBE_LAST_OK_KEY = "pp.pjsip.probe.last-ok.v1";

function PjsipProbeCard() {
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState<PjsipProbeResult | null>(null);
  const [lastOk, setLastOk] = useState<string | null>(() => {
    try { return localStorage.getItem(PJSIP_PROBE_LAST_OK_KEY); } catch { return null; }
  });

  const run = async () => {
    setRunning(true);
    setRes(null);
    try {
      const out = await runPjsipRegisterProbe();
      setRes(out);
      // Validation stricte : seul un 200 OK sur le transport TLS compte.
      const validated = out.ok && out.code === 200 && out.transport === "TLS";
      if (validated) {
        const stamp = new Date().toISOString();
        try { localStorage.setItem(PJSIP_PROBE_LAST_OK_KEY, stamp); } catch { /* noop */ }
        setLastOk(stamp);
        toast.success(`PJSIP validé — REGISTER 200 OK en TLS ${PJSIP_PROBE_PORT} (${out.elapsedMs ?? "?"} ms)`);
      } else if (out.ok) {
        toast.error(`PJSIP: réponse ${out.code ?? "?"} sur ${out.transport ?? "?"} — attendu 200 OK / TLS`);
      } else {
        toast.error(`PJSIP: ${out.reason}`);
      }
    } finally {
      setRunning(false);
    }
  };

  const validated = !!res && res.ok && res.code === 200 && res.transport === "TLS";
  const color = res ? (validated ? "#10B981" : "#EF4444") : "#94A3B8";

  return (
    <section className="pp-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Radio className="w-4 h-4" style={{ color }} />
        <span className="font-bold text-sm" style={{ color: "var(--pp-text-primary)" }}>Sonde PJSIP native (TLS)</span>
      </div>
      <p className="text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
        Vérifie que le moteur PJSIP est lié et enregistré en TLS sur {PJSIP_PROBE_SERVER}:{PJSIP_PROBE_PORT}.
        Si la registration native est déjà active, elle est rapportée telle quelle — aucun second
        enregistrement n'est créé.

      </p>
      {res && (
        <div className="text-[11px] font-mono p-2 rounded space-y-1" style={{ background: "var(--pp-bg-elevated)", color }}>
          {res.aor ? <div className="opacity-70">{res.aor}</div> : null}
          <div>{res.code ? `SIP ${res.code} — ` : ""}{res.reason}{res.elapsedMs ? ` (${res.elapsedMs} ms)` : ""}</div>
          <div className="font-bold">
            {validated
              ? `✅ VALIDÉ — 200 OK en TLS ${PJSIP_PROBE_PORT}`
              : `❌ NON VALIDÉ — attendu 200 OK en TLS ${PJSIP_PROBE_PORT}`}
          </div>
        </div>
      )}
      {lastOk && !res && (
        <div className="text-[11px]" style={{ color: "#10B981" }}>
          Dernière validation TLS 5061 : {new Date(lastOk).toLocaleString("fr-CA")}
        </div>
      )}
      <button onClick={run} disabled={running}
        className="w-full py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-60"
        style={{ background: "var(--pp-brand-accent)", color: "#fff" }}>
        {running ? "REGISTER en cours…" : "Lancer la sonde PJSIP"}
      </button>
    </section>
  );
}

/**
 * Interrupteur persistant `pp_pjsip_enabled` : permet de désactiver le moteur
 * PJSIP natif (repli JsSIP) sans recompiler l'application.
 */
function PjsipToggleCard() {
  const [enabled, setEnabled] = useState<boolean>(() => isPjsipEnabled());
  const [owner, setOwner] = useState<string>(() => (nativeOwnsAor() ? "PJSIP (natif)" : "JsSIP (legacy)"));

  useEffect(() => {
    const tick = setInterval(() => setOwner(nativeOwnsAor() ? "PJSIP (natif)" : "JsSIP (legacy)"), 2000);
    return () => clearInterval(tick);
  }, []);

  const toggle = async () => {
    const next = !enabled;
    // Désactiver PJSIP pendant qu'il détient l'AOR renvoie le device en WSS et
    // fait sonner dans le vide : on exige une confirmation explicite.
    if (!next && nativeOwnsAor()) {
      const ok = window.confirm(
        "PJSIP détient actuellement l'enregistrement SIP (TLS 5061). Le désactiver rebascule le poste en WebSocket et les appels entrants risquent d'aller à la messagerie. Continuer ?"
      );
      if (!ok) return;
    }
    setEnabled(next);
    await setPjsipEnabled(next);
    toast.success(next ? "PJSIP activé (redémarrer l'app)" : "PJSIP désactivé — repli JsSIP actif");
  };


  return (
    <section className="pp-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-bold text-sm" style={{ color: "var(--pp-text-primary)" }}>Moteur PJSIP natif</span>
        <button
          onClick={toggle}
          className="text-[11px] font-bold px-3 py-1.5 rounded-lg"
          style={{ background: enabled ? "#10B981" : "#94A3B8", color: "#fff" }}
        >
          {enabled ? "Activé" : "Désactivé"}
        </button>
      </div>
      <p className="text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
        Propriétaire de l'AOR : <span className="font-bold">{owner}</span> — clé <code>pp_pjsip_enabled</code>
      </p>
    </section>
  );
}
