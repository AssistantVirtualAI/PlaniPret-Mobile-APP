// Resilient edge-function invoke for telephony (calls + SMS).
//
// On flaky mobile networks / WebViews, supabase.functions.invoke can fail at
// the transport layer ("Failed to send a request to the Edge Function") before
// the request ever reaches the server. That surfaced as "the dial button does
// nothing" and "the text is never sent". This helper retries the request with a
// plain fetch (explicit URL + Authorization header + timeout) so a single
// transient network hiccup no longer kills the action.
import { supabase } from "@/integrations/supabase/client";
import {
  COMMISSION_CACHE_FNS, commissionCacheKey, dedupeCommission, isCommissionCacheable, isGoodCommissionPayload,
  readCommissionCache, writeCommissionCache,
} from "./commissionClientCache";

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type PpEdgeResult<T = any> = { data: T | null; error: { message: string; status?: number } | null };

function isTransport(err: any): boolean {
  const m = String(err?.message ?? err ?? "");
  return /failed to send|failed to fetch|networkerror|load failed|timeout|aborted/i.test(m);
}

async function rawInvoke<T>(fn: string, body: any, token: string | null, timeoutMs: number): Promise<PpEdgeResult<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    const txt = await res.text();
    let parsed: any = null;
    try { parsed = txt ? JSON.parse(txt) : null; } catch { parsed = txt; }
    if (!res.ok) {
      const msg = (parsed && typeof parsed === "object" && (parsed.error || parsed.message)) || `HTTP ${res.status}`;
      return { data: parsed, error: { message: String(msg), status: res.status } };
    }
    return { data: parsed as T, error: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Invoke an edge function with automatic transport-level retry.
 * Business errors (non-2xx from the function) are returned, not retried.
 */
export async function ppEdgeInvoke<T = any>(
  fn: string,
  body: any,
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<PpEdgeResult<T>> {
  // Commission figures (paid + pending): serve a validated copy < 15 min old
  // instantly; only good answers are cached, per signed-in user.
  if (isCommissionCacheable(fn, body)) {
    let uid = "";
    try { uid = (await supabase.auth.getSession()).data.session?.user?.id ?? ""; } catch { /* anonymous */ }
    if (uid) {
      const key = commissionCacheKey(uid, fn, body);
      const hit = readCommissionCache(key, uid);
      if (hit) return { data: hit as T, error: null };
      return dedupeCommission(key, async () => {
        const r = await ppEdgeInvokeRaw<T>(fn, body, opts);
        if (!r.error && isGoodCommissionPayload(r.data)) writeCommissionCache(key, uid, r.data);
        return r;
      });
    }
  }
  // Explicit refresh: bypass the copy, then store the fresh answer under the
  // normal (non-forced) key so the next open is instant.
  if (COMMISSION_CACHE_FNS.has(fn) && (body?.force === true || body?.refresh === true)) {
    const r = await ppEdgeInvokeRaw<T>(fn, body, opts);
    try {
      const uid = (await supabase.auth.getSession()).data.session?.user?.id ?? "";
      const { force: _f, refresh: _r, ...plain } = body ?? {};
      if (uid && !r.error && isGoodCommissionPayload(r.data) && isCommissionCacheable(fn, plain)) {
        writeCommissionCache(commissionCacheKey(uid, fn, plain), uid, r.data);
      }
    } catch { /* cache is best effort */ }
    return r;
  }
  return ppEdgeInvokeRaw<T>(fn, body, opts);
}

async function ppEdgeInvokeRaw<T = any>(
  fn: string,
  body: any,
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<PpEdgeResult<T>> {
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  // A caller that specifies a timeout explicitly opts out of the SDK-first
  // path: Supabase's invoke does not accept an AbortSignal, so it can remain
  // pending after the screen has changed. Use the authenticated fetch path
  // from the first attempt to honour the caller's time budget.
  const mustHonorTimeout = opts.timeoutMs !== undefined;

  let token: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? null;
  } catch { /* anonymous */ }

  let lastError: { message: string; status?: number } | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt === 0 && !mustHonorTimeout) {
        const { data, error } = await supabase.functions.invoke(fn, { body });
        if (!error) return { data: data as T, error: null };
        if (!isTransport(error)) {
          const status = (error as any)?.context?.status;
          return { data: (data as T) ?? null, error: { message: error.message, status } };
        }
        lastError = { message: error.message };
      } else {
        const r = await rawInvoke<T>(fn, body, token, timeoutMs);
        if (!r.error) return r;
        if (r.error.status) return r; // real server answer → don't retry
        lastError = r.error;
      }
    } catch (e: any) {
      if (!isTransport(e)) return { data: null, error: { message: e?.message || "Edge call failed" } };
      lastError = { message: e?.message || "Network error" };
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return { data: null, error: lastError ?? { message: "Network error" } };
}

/** Extensions (2–6 digits) stay raw; everything else becomes E.164. */
export function ppNormalizeDestination(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  if (!s.startsWith("+") && digits.length >= 2 && digits.length <= 6) return digits;
  if (s.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}
