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
import { supabase } from "@/integrations/supabase/client";

export type SipBackendCheck = {
  ok: boolean;
  healthy: boolean;
  extension?: string;
  registration?: {
    mobile_aor: string;
    /**
     * true = AOR seen registered, false = probes answered and AOR absent,
     * null = PBX registrations unreadable (403 / wrong endpoint / network).
     * Callers MUST only act on an explicit `false`: treating null as "not
     * registered" caused a hard transport rebuild mid-ring while the portal
     * actually showed 113M and 113W registered.
     */
    mobile_registered: boolean | null;
    registered_aors: string[];
    count: number;
    probes_answered?: boolean;
    probe_statuses?: number[];
    /**
     * Core node that accepted the last REGISTER. NetSapiens routes the inbound
     * INVITE to that node (docs/netsapiens/devices.md), so a device registered
     * on a non-core node reads as `registered` yet never rings.
     */
    core_server?: string | null;
    core_server_ok?: boolean;
    registration_contact?: string | null;
    registration_user_agent?: string | null;
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
      const { data, error } = await supabase.functions.invoke("pp-sip-registration-check", { body: {} });
      if (error || !data?.ok) return null;
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
