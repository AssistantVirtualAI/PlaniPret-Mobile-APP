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

/**
 * Authenticated Edge Function call.
 * - no session   -> skipped, `unauthorized: true`, `pp:auth-required` emitted
 * - 401 response -> `unauthorized: true`, `pp:auth-required` emitted
 */
export async function invokeEdge<T = any>(
  functionName: string,
  body: Record<string, unknown> = {},
  opts: { silent?: boolean } = {},
): Promise<EdgeInvokeResult<T>> {
  const token = await getValidAccessToken();
  if (!token) {
    if (!opts.silent) emitAuthRequired("no_session");
    return { data: null, error: { message: "unauthenticated", status: 401 }, unauthorized: true };
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

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
