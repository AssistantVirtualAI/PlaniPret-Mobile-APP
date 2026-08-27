/**
 * Métriques REGISTER TLS — détection rapide des régressions en production.
 *
 * Mesure la latence de bout en bout du REGISTER (envoi → 200 OK) et compte les
 * incidents connus : challenge 407 tardif, PJSIP_EBUSY (REGISTER concurrent),
 * watchdog (serveur muet) et échecs génériques.
 *
 * Les logs sont structurés (une ligne JSON par évènement, préfixe
 * `[SIP-METRICS]`) pour être filtrables dans Xcode / logcat.
 */

export type RegisterOutcome = "ok" | "ebusy" | "watchdog" | "error";

export interface RegisterSample {
  attemptId: string;
  transport: string;
  outcome: RegisterOutcome;
  /** ms entre l'envoi du REGISTER et le résultat final. */
  latencyMs: number;
  /** ms avant réception du challenge 407 (null si aucun). */
  challengeMs: number | null;
  reason?: string;
  at: number;
}

export interface RegisterMetricsSnapshot {
  total: number;
  ok: number;
  failures: number;
  challenge407: number;
  ebusy: number;
  watchdog: number;
  errors: number;
  successRate: number;
  latency: { min: number; p50: number; p95: number; max: number; avg: number };
  challengeLatency: { p50: number; p95: number; max: number };
  slowChallenges: number; // 407 reçus après 10 s (cellulaire lent)
  lastSample: RegisterSample | null;
}

const MAX_SAMPLES = 100;
/** Au-delà, le 407 est considéré « lent » (cellulaire) et journalisé en warn. */
export const SLOW_CHALLENGE_MS = 10_000;

const samples: RegisterSample[] = [];
const counters = { challenge407: 0, ebusy: 0, watchdog: 0, errors: 0 };

type Listener = (s: RegisterMetricsSnapshot) => void;
const listeners = new Set<Listener>();

function now(): number {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function log(event: string, payload: Record<string, unknown>) {
  const line = JSON.stringify({ evt: `sip.register.${event}`, ts: new Date().toISOString(), ...payload });
  if (event === "failure") console.error("[SIP-METRICS]", line);
  else if (event === "slow_challenge") console.warn("[SIP-METRICS]", line);
  else console.log("[SIP-METRICS]", line);
}

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

export function registerMetricsSnapshot(): RegisterMetricsSnapshot {
  const lat = samples.map((s) => s.latencyMs).sort((a, b) => a - b);
  const ch = samples.map((s) => s.challengeMs).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
  const ok = samples.filter((s) => s.outcome === "ok").length;
  return {
    total: samples.length,
    ok,
    failures: samples.length - ok,
    challenge407: counters.challenge407,
    ebusy: counters.ebusy,
    watchdog: counters.watchdog,
    errors: counters.errors,
    successRate: samples.length ? Math.round((ok / samples.length) * 100) : 0,
    latency: {
      min: lat.length ? Math.round(lat[0]) : 0,
      p50: pct(lat, 50),
      p95: pct(lat, 95),
      max: lat.length ? Math.round(lat[lat.length - 1]) : 0,
      avg: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0,
    },
    challengeLatency: { p50: pct(ch, 50), p95: pct(ch, 95), max: ch.length ? Math.round(ch[ch.length - 1]) : 0 },
    slowChallenges: samples.filter((s) => (s.challengeMs ?? 0) >= SLOW_CHALLENGE_MS).length,
    lastSample: samples.length ? samples[samples.length - 1] : null,
  };
}

export function subscribeRegisterMetrics(fn: Listener): () => void {
  listeners.add(fn);
  fn(registerMetricsSnapshot());
  return () => { listeners.delete(fn); };
}

function emit() {
  const snap = registerMetricsSnapshot();
  listeners.forEach((l) => { try { l(snap); } catch { /* noop */ } });
}

export interface RegisterTracker {
  readonly attemptId: string;
  /** Challenge 407 reçu. */
  challenge(code?: number): void;
  /** 200 OK. */
  success(): void;
  /** Échec : classe automatiquement EBUSY / watchdog / erreur. */
  failure(reason: unknown): RegisterOutcome;
}

let seq = 0;

/** Démarre le chronomètre d'une tentative de REGISTER. */
export function trackRegisterAttempt(transport = "TLS"): RegisterTracker {
  const attemptId = `reg_${Date.now().toString(36)}_${(++seq).toString(36)}`;
  const t0 = now();
  let challengeMs: number | null = null;
  let done = false;

  log("start", { attemptId, transport });

  const finish = (outcome: RegisterOutcome, reason?: string) => {
    if (done) return outcome;
    done = true;
    const sample: RegisterSample = {
      attemptId, transport, outcome,
      latencyMs: Math.round(now() - t0),
      challengeMs, reason, at: Date.now(),
    };
    samples.push(sample);
    if (samples.length > MAX_SAMPLES) samples.shift();
    log(outcome === "ok" ? "success" : "failure", { ...sample });
    emit();
    return outcome;
  };

  return {
    attemptId,
    challenge(code = 407) {
      if (challengeMs != null) return;
      challengeMs = Math.round(now() - t0);
      counters.challenge407 += 1;
      const evt = challengeMs >= SLOW_CHALLENGE_MS ? "slow_challenge" : "challenge";
      log(evt, { attemptId, code, challengeMs });
      emit();
    },
    success() { finish("ok"); },
    failure(reason: unknown) {
      const msg = String((reason as any)?.message ?? reason ?? "error");
      const outcome: RegisterOutcome = /EBUSY/i.test(msg)
        ? "ebusy"
        : /watchdog|timeout|timed?.?out/i.test(msg)
          ? "watchdog"
          : "error";
      if (outcome === "ebusy") counters.ebusy += 1;
      else if (outcome === "watchdog") counters.watchdog += 1;
      else counters.errors += 1;
      return finish(outcome, msg);
    },
  };
}

/** Réinitialise compteurs et échantillons (tests / redémarrage de session). */
export function resetRegisterMetrics(): void {
  samples.length = 0;
  counters.challenge407 = 0;
  counters.ebusy = 0;
  counters.watchdog = 0;
  counters.errors = 0;
  emit();
}

/** Ligne de synthèse à journaliser périodiquement (diagnostic terrain). */
export function logRegisterMetricsSummary(context = "periodic"): RegisterMetricsSnapshot {
  const snap = registerMetricsSnapshot();
  log("summary", { context, ...snap });
  return snap;
}
