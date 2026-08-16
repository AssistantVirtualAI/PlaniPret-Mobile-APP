/**
 * Boucle de reconnexion robuste partagée par le chatbot (WebSocket) et le
 * voicebot AVA (WebRTC/WebSocket ElevenLabs).
 *
 * Garanties :
 *  - backoff exponentiel + jitter, plafonné (réseau cellulaire instable)
 *  - « génération » : une tentative périmée ne peut jamais réécrire l'état
 *  - codes fatals (1000 fermeture normale, 1008 policy) => pas de retry
 *  - reprise immédiate quand le navigateur repasse `online`
 *  - `stop()` idempotent, annule tout timer en vol (aucune fuite / freeze)
 */

export interface ReconnectOptions {
  /** Ouvre la session. Doit rejeter en cas d'échec. */
  connect: (attempt: number) => Promise<void>;
  /** Nombre max de tentatives après une coupure (défaut 5). */
  maxAttempts?: number;
  /** Délai de base en ms (défaut 800). */
  baseDelayMs?: number;
  /** Plafond du délai en ms (défaut 8000). */
  maxDelayMs?: number;
  /** Codes de fermeture qui ne doivent PAS déclencher de retry. */
  fatalCodes?: number[];
  onStateChange?: (state: ReconnectState, info: { attempt: number; error?: unknown }) => void;
  /** Injection pour les tests. */
  now?: () => number;
  setTimeoutFn?: (fn: () => void, ms: number) => any;
  clearTimeoutFn?: (id: any) => void;
  random?: () => number;
}

export type ReconnectState = "idle" | "connecting" | "connected" | "waiting" | "failed" | "stopped";

export interface ReconnectController {
  start(): Promise<void>;
  /** À appeler sur `onDisconnect` du transport. */
  notifyDisconnected(code?: number, reason?: string): void;
  stop(): void;
  readonly state: ReconnectState;
  readonly attempts: number;
}

const DEFAULT_FATAL = [1000, 1008];

export function createReconnectLoop(opts: ReconnectOptions): ReconnectController {
  const maxAttempts = opts.maxAttempts ?? 5;
  const base = opts.baseDelayMs ?? 800;
  const cap = opts.maxDelayMs ?? 8000;
  const fatal = opts.fatalCodes ?? DEFAULT_FATAL;
  const setT = opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = opts.clearTimeoutFn ?? ((id) => clearTimeout(id));
  const rnd = opts.random ?? Math.random;

  let generation = 0;
  let attempts = 0;
  let state: ReconnectState = "idle";
  let timer: any = null;
  let stopped = false;
  let onlineHandler: (() => void) | null = null;

  const setState = (s: ReconnectState, error?: unknown) => {
    state = s;
    try { opts.onStateChange?.(s, { attempt: attempts, error }); } catch { /* noop */ }
  };

  const clearTimer = () => { if (timer != null) { clearT(timer); timer = null; } };

  const bindOnline = () => {
    if (onlineHandler || typeof window === "undefined" || !window.addEventListener) return;
    onlineHandler = () => {
      if (stopped || state !== "waiting") return;
      clearTimer();
      void attempt();
    };
    window.addEventListener("online", onlineHandler);
  };
  const unbindOnline = () => {
    if (onlineHandler && typeof window !== "undefined") window.removeEventListener("online", onlineHandler);
    onlineHandler = null;
  };

  const delayFor = (n: number) => {
    const exp = Math.min(cap, base * Math.pow(2, Math.max(0, n - 1)));
    return Math.round(exp * (0.7 + rnd() * 0.6)); // jitter ±30 %
  };

  async function attempt(): Promise<void> {
    if (stopped) return;
    const myGen = ++generation;
    attempts += 1;
    setState("connecting");
    try {
      await opts.connect(attempts);
      if (stopped || myGen !== generation) return; // tentative périmée
      attempts = 0;
      setState("connected");
    } catch (e) {
      if (stopped || myGen !== generation) return;
      schedule(e);
    }
  }

  function schedule(error?: unknown) {
    if (stopped) return;
    if (attempts >= maxAttempts) { setState("failed", error); return; }
    setState("waiting", error);
    bindOnline();
    clearTimer();
    timer = setT(() => { timer = null; void attempt(); }, delayFor(attempts));
  }

  return {
    start() { stopped = false; attempts = 0; return attempt(); },
    notifyDisconnected(code?: number) {
      if (stopped) return;
      if (typeof code === "number" && fatal.includes(code)) { setState("stopped"); return; }
      generation += 1; // invalide toute tentative en vol
      schedule(new Error(`disconnected${code != null ? `:${code}` : ""}`));
    },
    stop() {
      stopped = true;
      generation += 1;
      clearTimer();
      unbindOnline();
      setState("stopped");
    },
    get state() { return state; },
    get attempts() { return attempts; },
  };
}
