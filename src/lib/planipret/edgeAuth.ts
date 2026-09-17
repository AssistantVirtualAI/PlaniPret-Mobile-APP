// Single source of truth for the auth guard around Supabase Edge Function calls.
// Every caller uses `invokeEdge` instead of duplicating its own
// "getSession() -> bail out" snippet. On a missing/expired session, or on a 401
// from the function, we emit `pp:auth-required` so the shell can show a clear
// message and send the user back to the login screen.
import { supabase } from "@/integrations/supabase/client";

export const AUTH_REQUIRED_EVENT = "pp:auth-required";

export interface EdgeInvokeResult<T = any> {
  data: T | null;
  error: { message: string; status?: number } | null;
  /** true when the call was skipped or rejected for auth reasons */
  unauthorized: boolean;
}

function emitAuthRequired(reason: "no_session" | "expired") {
  try {
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT, { detail: { reason } }));
  } catch { /* non-browser env (tests/SSR) */ }
}

/** Returns a valid access token, refreshing it when it is about to expire. */
export async function getValidAccessToken(): Promise<string | null> {
  try {
    let { data: { session } } = await supabase.auth.getSession();
    const nowSec = Math.floor(Date.now() / 1000);
    if (!session || (session.expires_at && session.expires_at - nowSec < 120)) {
      const refreshed = await supabase.auth.refreshSession().catch(() => null);
      session = refreshed?.data?.session ?? session;
    }
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

export function isUnauthorized(error: unknown): boolean {
  const err = error as { message?: string; status?: number; context?: { status?: number } } | null;
  const status = err?.status ?? err?.context?.status;
  return status === 401 || /\b401\b|unauthorized/i.test(err?.message || "");
}

async function invokeWithTimeout<T>(
  functionName: string,
  body: Record<string, unknown>,
  token: string,
  timeoutMs: number,
): Promise<EdgeInvokeResult<T>> {
  const baseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "");
  if (!baseUrl || !publishableKey) {
    return { data: null, error: { message: "edge_configuration_unavailable" }, unauthorized: false };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: T | null = null;
    try { payload = text ? JSON.parse(text) as T : null; } catch { /* contract error handled below */ }
    if (!response.ok) {
      const message = payload && typeof payload === "object"
        ? String((payload as Record<string, unknown>).error ?? (payload as Record<string, unknown>).message ?? `HTTP ${response.status}`)
        : `HTTP ${response.status}`;
      const error = { message, status: response.status };
      if (isUnauthorized(error)) return { data: null, error, unauthorized: true };
      return { data: null, error, unauthorized: false };
    }
    return { data: payload, error: null, unauthorized: false };
  } catch (error: unknown) {
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "edge_timeout"
      : error instanceof Error ? error.message : "edge_request_failed";
    return { data: null, error: { message }, unauthorized: false };
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Authenticated Edge Function call.
 * - no session   -> skipped, `unauthorized: true`, `pp:auth-required` emitted
 * - 401 response -> `unauthorized: true`, `pp:auth-required` emitted
 */
export async function invokeEdge<T = any>(
  functionName: string,
  body: Record<string, unknown> = {},
  opts: { silent?: boolean; timeoutMs?: number } = {},
): Promise<EdgeInvokeResult<T>> {
  const token = await getValidAccessToken();
  if (!token) {
    if (!opts.silent) emitAuthRequired("no_session");
    return { data: null, error: { message: "unauthenticated", status: 401 }, unauthorized: true };
  }

  const result = opts.timeoutMs
    ? await invokeWithTimeout<T>(functionName, body, token, opts.timeoutMs)
    : await (async () => {
        const { data, error } = await supabase.functions.invoke(functionName, {
          body,
          headers: { Authorization: `Bearer ${token}` },
        });
        return { data: (data ?? null) as T | null, error: error ? { message: error.message, status: (error as any)?.context?.status } : null, unauthorized: false };
      })();

  const { data, error } = result;

  if (error && isUnauthorized(error)) {
    if (!opts.silent) emitAuthRequired("expired");
    return { data: null, error: { message: error.message, status: 401 }, unauthorized: true };
  }
  if (error) return { data: null, error: { message: error.message }, unauthorized: false };
  return { data: (data ?? null) as T, error: null, unauthorized: false };
}

/** Subscribe to auth-required events; returns an unsubscribe function. */
export function onAuthRequired(handler: (reason: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent)?.detail?.reason ?? "no_session");
  window.addEventListener(AUTH_REQUIRED_EVENT, listener);
  return () => window.removeEventListener(AUTH_REQUIRED_EVENT, listener);
}
