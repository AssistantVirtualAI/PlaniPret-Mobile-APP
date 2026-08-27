/**
 * Backend registration fallback check.
 *
 * The client can believe it is registered while NetSapiens holds no live
 * REGISTER binding (WSS drained in background, stale AOR, expired VoIP token).
 * On every foreground resume we ask the backend for the REAL state and
 * self-heal: force a re-REGISTER and/or re-upload the PushKit token.
 *
 * READ-ONLY on NetSapiens — never touches routing, answering rules or DIDs.
 */
import { invokeEdge } from "@/lib/planipret/edgeAuth";

export type SipBackendCheck = {
  ok: boolean;
  healthy: boolean;
  extension?: string;
  registration?: {
    mobile_aor: string;
    mobile_registered: boolean;
    registered_aors: string[];
    count: number;
  };
  push?: {
    device_push_enabled: boolean | null;
    token_present: boolean;
    token_environment: string | null;
    token_age_hours: number | null;
  };
  call_subscription?: boolean;
  actions?: string[];
};

let lastCheckAt = 0;
let inFlight: Promise<SipBackendCheck | null> | null = null;
let lastResult: SipBackendCheck | null = null;

export function getLastSipBackendCheck() {
  return lastResult;
}

/**
 * Single-flight + throttled (default 20s) so transient iOS foreground blips
 * don't hammer the edge function.
 */
export async function checkSipBackendRegistration(
  opts: { force?: boolean; minIntervalMs?: number } = {},
): Promise<SipBackendCheck | null> {
  const minInterval = opts.minIntervalMs ?? 20_000;
  const now = Date.now();
  if (inFlight) return inFlight;
  if (!opts.force && now - lastCheckAt < minInterval) return lastResult;

  lastCheckAt = now;
  inFlight = (async () => {
    try {
      // Background poll: stay silent so it never bounces the user to login.
      const { data, error, unauthorized } = await invokeEdge<SipBackendCheck & { ok?: boolean }>(
        "pp-sip-registration-check", {}, { silent: true },
      );
      if (unauthorized || error || !data?.ok) return null;
      lastResult = data as SipBackendCheck;
      return lastResult;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
