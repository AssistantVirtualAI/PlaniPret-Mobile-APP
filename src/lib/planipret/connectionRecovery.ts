import { supabase } from "@/integrations/supabase/client";
import { retryWithBackoff } from "@/lib/planipret/retryBackoff";

export type ConnectionService = "ms365" | "maestro" | "elevenlabs";

export type ConnectionHealth = {
  service: ConnectionService;
  state: "ok" | "reconnecting" | "error" | "not_configured";
  detail: string;
  expires_at?: string | null;
  can_reconnect: boolean;
};

export type ConnectionsStatus = {
  healthy: boolean;
  checked_at: string;
  services: ConnectionHealth[];
};

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined;
}

/** Fetch real-time health for Microsoft 365, Maestro and ElevenLabs. */
export async function fetchConnectionsStatus(reconnect?: ConnectionService | "all"): Promise<ConnectionsStatus | null> {
  const { data, error } = await supabase.functions.invoke("pp-connections-status", {
    body: reconnect ? { reconnect } : {},
    headers: await authHeaders(),
  });
  if (error || !data || (data as any).error) return null;
  return data as ConnectionsStatus;
}

/**
 * Automatic recovery with exponential backoff. Used when a sync reports
 * `maestro_not_configured` or an expired token: we retry the silent refresh a
 * few times before asking the broker to re-authenticate.
 */
export async function recoverConnection(service: ConnectionService): Promise<{ ok: boolean; needsReauth: boolean; detail: string }> {
  try {
    const status = await retryWithBackoff(
      async () => {
        const res = await fetchConnectionsStatus(service);
        const svc = res?.services.find((s) => s.service === service);
        if (!svc || svc.state !== "ok") throw new Error(svc?.detail ?? "unreachable");
        return svc;
      },
      { attempts: 3, baseDelayMs: 2000, maxDelayMs: 20_000 },
    );
    return { ok: true, needsReauth: false, detail: status.detail };
  } catch (e: any) {
    const detail = String(e?.message ?? e);
    // A missing refresh token can never be fixed silently — full re-auth needed.
    const needsReauth = /not_configured|non lié|expiré|invalid_grant|reconnexion/i.test(detail);
    return { ok: false, needsReauth, detail };
  }
}

/** True when an error returned by a sync call should trigger auto-recovery. */
export function isMaestroAuthError(message?: string | null): boolean {
  if (!message) return false;
  return /maestro_not_configured|invalid_grant|token[_ ]expired|unauthorized|401/i.test(message);
}

export type AvaE2EResult = {
  healthy: boolean;
  checked_at: string;
  missing: string[];
  links: { id: string; label: string; ok: boolean; detail: string }[];
};

const E2E_KEY = "pp_ava_e2e_last";

/** Startup end-to-end verification of AVA chatbot / voice bot tool routing. */
export async function runAvaE2ECheck(): Promise<AvaE2EResult | null> {
  const { data, error } = await supabase.functions.invoke("pp-ava-e2e-check", {
    body: {},
    headers: await authHeaders(),
  });
  // A missing/undeployed function must never surface as a connection failure:
  // the end-to-end diagnostic is optional, so degrade silently on 404.
  if (error) {
    const msg = `${(error as any)?.message ?? ""} ${(error as any)?.context?.status ?? ""}`;
    if (/404|NOT_FOUND_FUNCTION_BLOB|not found/i.test(msg)) return null;
    return null;
  }
  if (!data || (data as any).error) return null;
  const result = data as AvaE2EResult;
  try {
    localStorage.setItem(E2E_KEY, JSON.stringify({ ...result, at: Date.now() }));
  } catch { /* storage unavailable */ }
  return result;
}

export function getLastAvaE2E(): (AvaE2EResult & { at: number }) | null {
  try {
    const raw = localStorage.getItem(E2E_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Runs the E2E check at most once every 6h to avoid boot overhead. */
export async function runAvaE2ECheckThrottled(): Promise<AvaE2EResult | null> {
  const last = getLastAvaE2E();
  if (last && Date.now() - last.at < 6 * 3600_000) return last;
  return runAvaE2ECheck();
}
