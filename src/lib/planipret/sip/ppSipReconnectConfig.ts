import defaults from "@/config/ppSipReconnect.json";

/**
 * SIP reconnection strategy — single source of truth for the JS provider,
 * the softphone hook and the native iOS/Android keep-alive plugins.
 *
 * Precedence (last wins):
 *   1. `src/config/ppSipReconnect.json`  (checked-in defaults)
 *   2. Vite env vars `VITE_PP_SIP_*`     (per-environment overrides)
 *   3. `localStorage["pp_sip_reconnect"]` JSON (field debugging, no rebuild)
 */
export type PpSipReconnectConfig = {
  /** First retry delay after a socket drop (exponential from here). */
  socketBackoffMinMs: number;
  /** Hard cap for the socket retry delay. */
  socketBackoffMaxMs: number;
  /** Attempts before the delay stops growing. */
  socketBackoffMaxAttempts: number;
  /** Delay before we verify the retry actually reached `registered`. */
  socketVerifyDelayMs: number;
  /** Base delay for REGISTER retries (multiplied by the failure count). */
  registerRetryBaseMs: number;
  /** Hard cap for REGISTER retries. */
  registerRetryMaxMs: number;
  /** Delay before re-REGISTER after an `unregistered` event. */
  reRegisterDelayMs: number;
  /** REGISTER expiry advertised to the PBX (seconds). */
  registerExpiresSec: number;
  /** SIP keep-alive (OPTIONS/ping) period. */
  keepAliveMs: number;
  /** How often the iOS VoIP push token is re-verified. */
  voipTokenCheckMs: number;
  /** Native (iOS/Android) backoff floor. */
  nativeBackoffMinMs: number;
  /** Native (iOS/Android) backoff cap. */
  nativeBackoffMaxMs: number;
  /** Native delay before checking the retry succeeded. */
  nativeVerifyDelayMs: number;
  /** Native keep-alive REGISTER heartbeat (seconds). */
  nativeHeartbeatSec: number;
  /** REGISTER expiry used by the native background contact (seconds). */
  nativeRegisterExpiresSec: number;
};

const ENV_KEYS: Record<keyof PpSipReconnectConfig, string> = {
  socketBackoffMinMs: "VITE_PP_SIP_BACKOFF_MIN_MS",
  socketBackoffMaxMs: "VITE_PP_SIP_BACKOFF_MAX_MS",
  socketBackoffMaxAttempts: "VITE_PP_SIP_BACKOFF_MAX_ATTEMPTS",
  socketVerifyDelayMs: "VITE_PP_SIP_VERIFY_DELAY_MS",
  registerRetryBaseMs: "VITE_PP_SIP_REGISTER_RETRY_MS",
  registerRetryMaxMs: "VITE_PP_SIP_REGISTER_RETRY_MAX_MS",
  reRegisterDelayMs: "VITE_PP_SIP_REREGISTER_DELAY_MS",
  registerExpiresSec: "VITE_PP_SIP_REGISTER_EXPIRES_SEC",
  keepAliveMs: "VITE_PP_SIP_KEEPALIVE_MS",
  voipTokenCheckMs: "VITE_PP_SIP_VOIP_TOKEN_CHECK_MS",
  nativeBackoffMinMs: "VITE_PP_SIP_NATIVE_BACKOFF_MIN_MS",
  nativeBackoffMaxMs: "VITE_PP_SIP_NATIVE_BACKOFF_MAX_MS",
  nativeVerifyDelayMs: "VITE_PP_SIP_NATIVE_VERIFY_DELAY_MS",
  nativeHeartbeatSec: "VITE_PP_SIP_NATIVE_HEARTBEAT_SEC",
  nativeRegisterExpiresSec: "VITE_PP_SIP_NATIVE_REGISTER_EXPIRES_SEC",
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readOverrides(): Partial<PpSipReconnectConfig> {
  const out: Partial<PpSipReconnectConfig> = {};
  const env = (typeof import.meta !== "undefined" ? (import.meta as any).env : undefined) ?? {};
  for (const key of Object.keys(ENV_KEYS) as (keyof PpSipReconnectConfig)[]) {
    const n = num(env[ENV_KEYS[key]]);
    if (n !== null) out[key] = n;
  }
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("pp_sip_reconnect") : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const key of Object.keys(ENV_KEYS) as (keyof PpSipReconnectConfig)[]) {
        const n = num(parsed[key]);
        if (n !== null) out[key] = n;
      }
    }
  } catch { /* ignore malformed local override */ }
  return out;
}

let cached: PpSipReconnectConfig | null = null;

const SAFE_MINIMUMS: Partial<PpSipReconnectConfig> = {
  socketBackoffMinMs: 5000,
  socketVerifyDelayMs: 15000,
  reRegisterDelayMs: 5000,
  registerExpiresSec: 1800,
  keepAliveMs: 45000,
  nativeBackoffMinMs: 5000,
  nativeVerifyDelayMs: 15000,
  nativeHeartbeatSec: 300,
  nativeRegisterExpiresSec: 1800,
};

function withSafeMinimums(config: PpSipReconnectConfig): PpSipReconnectConfig {
  const out = { ...config };
  for (const key of Object.keys(SAFE_MINIMUMS) as (keyof PpSipReconnectConfig)[]) {
    const floor = SAFE_MINIMUMS[key];
    if (typeof floor === "number" && out[key] < floor) out[key] = floor;
  }
  return out;
}

export function getPpSipReconnectConfig(): PpSipReconnectConfig {
  if (!cached) cached = withSafeMinimums({ ...(defaults as PpSipReconnectConfig), ...readOverrides() });
  return cached;
}

/** Re-read env + localStorage (used after a live override in the debug UI). */
export function reloadPpSipReconnectConfig(): PpSipReconnectConfig {
  cached = null;
  return getPpSipReconnectConfig();
}

/** Hard floor for any WSS reconnect delay — guarantees we never go back to 1000ms. */
export const PP_SIP_RECONNECT_FLOOR_MS = 5000;

/** Exponential backoff delay, clamped to [min, max]. */
export function ppSipBackoffDelay(attempt: number, min: number, max: number): number {
  const safeAttempt = Math.max(1, attempt);
  const safeMin = Math.max(PP_SIP_RECONNECT_FLOOR_MS, min);
  const safeMax = Math.max(safeMin, max);
  return Math.min(safeMax, safeMin * 2 ** (safeAttempt - 1));
}

