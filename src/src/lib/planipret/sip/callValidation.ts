/**
 * Harnais de validation des appels iOS (PJSIP + CallKit).
 *
 * Deux scénarios scriptés, exécutables depuis l'écran « SIP Debug » :
 *
 *  - sortant : makeCall(ext de test) → ringing → connected → hangup → ended
 *  - entrant : attente de l'INVITE → answer (CallKit) → connected → hangup → ended
 *
 * Chaque étape est chronométrée et produit un verdict pass/fail exportable.
 */
import { Capacitor } from "@capacitor/core";
import { nativeSip } from "./nativeSipService";

export type StepStatus = "pending" | "running" | "pass" | "fail" | "skipped";

export interface ValidationStep {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
  ms?: number;
}

export interface ValidationRun {
  scenario: "outbound" | "inbound";
  extension: string;
  startedAt: number;
  finishedAt?: number;
  steps: ValidationStep[];
  verdict: "running" | "pass" | "fail";
}

type Listener = (run: ValidationRun) => void;

const CONNECT_TIMEOUT_MS = 30_000;
const INBOUND_WAIT_MS = 60_000;
const END_TIMEOUT_MS = 10_000;
const TALK_MS = 3_000;

const isConnected = (s: string) => ["connected", "confirmed", "answered", "active"].includes(s);
const isRinging = (s: string) => ["ringing", "early", "calling", "progress", "outgoing"].includes(s);
const isEnded = (s: string) => ["disconnected", "ended", "terminated", "failed"].includes(s);

function waitFor(
  eventName: string,
  predicate: (detail: any) => boolean,
  timeoutMs: number,
): Promise<{ ok: boolean; detail?: any }> {
  return new Promise((resolve) => {
    let done = false;
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (done || !predicate(detail)) return;
      done = true;
      cleanup();
      resolve({ ok: true, detail });
    };
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      resolve({ ok: false });
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener(eventName, onEvent as EventListener);
    };
    window.addEventListener(eventName, onEvent as EventListener);
  });
}

const callKitAvailable = () => {
  try {
    return !!(window as any)?.Capacitor?.Plugins?.PpVoipCall;
  } catch {
    return false;
  }
};

export class CallValidator {
  private run: ValidationRun | null = null;
  private listeners = new Set<Listener>();
  private aborted = false;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    if (this.run) fn(this.snapshot()!);
    return () => this.listeners.delete(fn);
  }

  snapshot(): ValidationRun | null {
    return this.run ? { ...this.run, steps: this.run.steps.map((s) => ({ ...s })) } : null;
  }

  private emit() {
    const snap = this.snapshot();
    if (snap) this.listeners.forEach((fn) => fn(snap));
  }

  private set(id: string, patch: Partial<ValidationStep>) {
    const step = this.run?.steps.find((s) => s.id === id);
    if (!step) return;
    Object.assign(step, patch);
    this.emit();
  }

  private async step(id: string, fn: () => Promise<{ ok: boolean; detail?: string }>) {
    if (this.aborted) {
      this.set(id, { status: "skipped", detail: "annulé" });
      return false;
    }
    const t0 = Date.now();
    this.set(id, { status: "running" });
    let res: { ok: boolean; detail?: string };
    try {
      res = await fn();
    } catch (e: any) {
      res = { ok: false, detail: String(e?.message ?? e) };
    }
    this.set(id, { status: res.ok ? "pass" : "fail", detail: res.detail, ms: Date.now() - t0 });
    return res.ok;
  }

  abort() {
    this.aborted = true;
    void nativeSip.hangup();
  }

  isRunning() {
    return this.run?.verdict === "running";
  }

  /** Appel sortant vers l'extension de test, décroché distant puis raccrochage. */
  async runOutbound(extension: string) {
    const ext = extension.trim();
    this.aborted = false;
    this.run = {
      scenario: "outbound",
      extension: ext,
      startedAt: Date.now(),
      verdict: "running",
      steps: [
        { id: "env", label: "Environnement natif (PJSIP + CallKit)", status: "pending" },
        { id: "reg", label: "Extension enregistrée (TLS 5061)", status: "pending" },
        { id: "dial", label: `Appel sortant vers ${ext || "?"}`, status: "pending" },
        { id: "ring", label: "Sonnerie distante (180/183)", status: "pending" },
        { id: "answer", label: "Décroché distant (200 OK / média)", status: "pending" },
        { id: "hangup", label: "Fin d'appel via CallKit (BYE)", status: "pending" },
      ],
    };
    this.emit();

    if (!(await this.step("env", async () => this.checkEnv()))) return this.finish();
    if (!(await this.step("reg", async () => this.checkRegistered()))) return this.finish();

    // On arme les attentes avant de composer : l'état peut arriver très vite.
    const ringing = waitFor("sip-call-state", (d) => isRinging(String(d?.state ?? "")), CONNECT_TIMEOUT_MS);
    const connected = waitFor("sip-call-state", (d) => isConnected(String(d?.state ?? "")), CONNECT_TIMEOUT_MS);

    if (
      !(await this.step("dial", async () => {
        if (!ext) return { ok: false, detail: "extension de test vide" };
        const ok = await nativeSip.makeCall(ext);
        return { ok, detail: ok ? "INVITE envoyé" : "makeCall refusé (moteur natif indisponible ?)" };
      }))
    )
      return this.finish();

    await this.step("ring", async () => {
      const r = await ringing;
      return { ok: r.ok, detail: r.ok ? `state=${r.detail?.state}` : "aucun 180/183 en 30 s" };
    });

    const connectedOk = await this.step("answer", async () => {
      const r = await connected;
      return { ok: r.ok, detail: r.ok ? `state=${r.detail?.state}` : "pas de 200 OK en 30 s" };
    });

    if (connectedOk) await new Promise((r) => setTimeout(r, TALK_MS));

    await this.step("hangup", async () => this.hangupAndConfirm());
    return this.finish();
  }

  /** Attend un appel entrant, décroche via CallKit, puis raccroche. */
  async runInbound(extension: string) {
    const ext = extension.trim();
    this.aborted = false;
    this.run = {
      scenario: "inbound",
      extension: ext,
      startedAt: Date.now(),
      verdict: "running",
      steps: [
        { id: "env", label: "Environnement natif (PJSIP + CallKit)", status: "pending" },
        { id: "reg", label: "Extension enregistrée (TLS 5061)", status: "pending" },
        { id: "invite", label: `En attente d'un appel depuis ${ext || "l'extension de test"}`, status: "pending" },
        { id: "answer", label: "Décroché via CallKit (200 OK)", status: "pending" },
        { id: "media", label: "Appel établi (média actif)", status: "pending" },
        { id: "hangup", label: "Fin d'appel via CallKit (BYE)", status: "pending" },
      ],
    };
    this.emit();

    if (!(await this.step("env", async () => this.checkEnv()))) return this.finish();
    if (!(await this.step("reg", async () => this.checkRegistered()))) return this.finish();

    const incoming = await this.stepIncoming();
    if (!incoming) return this.finish();

    const connected = waitFor("sip-call-state", (d) => isConnected(String(d?.state ?? "")), CONNECT_TIMEOUT_MS);

    if (
      !(await this.step("answer", async () => {
        const ok = await nativeSip.answer();
        return { ok, detail: ok ? "answerCall accepté" : "answerCall refusé (no_active_call ?)" };
      }))
    )
      return this.finish();

    const mediaOk = await this.step("media", async () => {
      const r = await connected;
      return { ok: r.ok, detail: r.ok ? `state=${r.detail?.state}` : "pas d'état connecté en 30 s" };
    });

    if (mediaOk) await new Promise((r) => setTimeout(r, TALK_MS));

    await this.step("hangup", async () => this.hangupAndConfirm());
    return this.finish();
  }

  private async stepIncoming() {
    return this.step("invite", async () => {
      const r = await waitFor("sip-incoming-call", () => true, INBOUND_WAIT_MS);
      if (!r.ok) return { ok: false, detail: "aucun INVITE reçu en 60 s" };
      const from = r.detail?.remoteNumber || r.detail?.remoteName || "inconnu";
      return { ok: true, detail: `INVITE de ${from}` };
    });
  }

  private async checkEnv(): Promise<{ ok: boolean; detail: string }> {
    if (!Capacitor.isNativePlatform()) return { ok: false, detail: "hors application native (web)" };
    const pjsipOk = Capacitor.isPluginAvailable("PpPjsip");
    const voipOk = callKitAvailable();
    const parts = [`PJSIP ${pjsipOk ? "OK" : "absent"}`, `CallKit ${voipOk ? "OK" : "absent"}`];
    return { ok: pjsipOk && voipOk, detail: parts.join(" · ") };
  }

  private async checkRegistered(): Promise<{ ok: boolean; detail: string }> {
    const snap = await nativeSip.refreshState();
    if (!snap) return { ok: false, detail: "getState indisponible" };
    return {
      ok: !!snap.registered,
      detail: `${snap.username || "?"} — ${snap.registered ? "registered" : "non enregistré"}`,
    };
  }

  private async hangupAndConfirm(): Promise<{ ok: boolean; detail: string }> {
    const ended = waitFor("sip-call-state", (d) => isEnded(String(d?.state ?? "")), END_TIMEOUT_MS);
    const ok = await nativeSip.hangup();
    const r = await ended;
    if (!ok && !r.ok) return { ok: false, detail: "hangup refusé et aucun état terminé" };
    return { ok: r.ok || ok, detail: r.ok ? `state=${r.detail?.state}` : "raccroché (CallKit fermé)" };
  }

  private finish() {
    if (!this.run) return null;
    this.run.finishedAt = Date.now();
    this.run.verdict = this.run.steps.some((s) => s.status === "fail") ? "fail" : "pass";
    this.emit();
    return this.snapshot();
  }
}

export const callValidator = new CallValidator();

export function formatValidationReport(run: ValidationRun): string {
  const head = `Validation ${run.scenario === "inbound" ? "appel entrant" : "appel sortant"} — ext ${run.extension} — ${run.verdict.toUpperCase()}`;
  const lines = run.steps.map(
    (s) => `[${s.status.toUpperCase()}] ${s.label}${s.detail ? ` — ${s.detail}` : ""}${s.ms != null ? ` (${s.ms} ms)` : ""}`,
  );
  return [head, new Date(run.startedAt).toISOString(), "", ...lines].join("\n");
}
