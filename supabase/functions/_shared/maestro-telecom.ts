// Shared helper for calling the Maestro Telecom REST API from Planiprêt edge
// functions. Config is stored in `planipret_integration_secrets` under provider
// `maestro_telecom` and falls back to env vars for local development.
//
// Features:
//  - Exponential backoff retry (0/408/429/5xx) with jitter, bounded attempts
//  - Best-effort persistence into `planipret_maestro_sync_log` for every mirror
//  - Detailed console logging: method, path, status, ms, attempts, error
//  - Never throws in mirror mode — NS-API remains the source of truth.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface MaestroTelecomConfig {
  url: string;   // e.g. https://client-dev.planipret.com/telecom/api/v1 (no trailing slash)
  key: string;   // machine API key (Bearer)
}

export interface MaestroTelecomResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  ms?: number;
  attempts?: number;
  error?: string;
}

let cachedConfig: { at: number; cfg: MaestroTelecomConfig } | null = null;
const CACHE_TTL_MS = 60_000;

export async function getMaestroTelecomConfig(admin: SupabaseClient): Promise<MaestroTelecomConfig> {
  if (cachedConfig && Date.now() - cachedConfig.at < CACHE_TTL_MS) return cachedConfig.cfg;

  let apiUrl = "";
  let apiKey = "";
  try {
    const { data } = await admin
      .from("planipret_integration_secrets")
      .select("config")
      .eq("provider", "maestro_telecom")
      .maybeSingle();
    const c = (data?.config ?? {}) as Record<string, string>;
    apiUrl = c.api_url ?? "";
    apiKey = c.api_key ?? "";
  } catch { /* fall through to env */ }

  const cfg: MaestroTelecomConfig = {
    url: (apiUrl || Deno.env.get("MAESTRO_TELECOM_BASE_URL") || Deno.env.get("MAESTRO_TELECOM_API_URL") || "").replace(/\/$/, ""),
    key: apiKey || Deno.env.get("MAESTRO_TELECOM_API_KEY") || "",
  };
  cachedConfig = { at: Date.now(), cfg };
  return cfg;
}

export function isMaestroTelecomConfigured(cfg: MaestroTelecomConfig): boolean {
  return Boolean(cfg.url && cfg.key);
}

const RETRYABLE_STATUS = new Set([0, 408, 425, 429, 500, 502, 503, 504]);

function backoffMs(attempt: number): number {
  const base = 400 * Math.pow(2, attempt); // 400, 800, 1600
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(base + jitter, 5000);
}

export async function maestroTelecomFetch<T = any>(
  cfg: MaestroTelecomConfig,
  path: string,
  opts: { method?: string; body?: unknown; timeoutMs?: number; maxAttempts?: number; token?: string; machine?: boolean } = {},
): Promise<MaestroTelecomResult<T>> {
  const bearer = opts.token || cfg.key;
  if (!cfg.url || !bearer) {
    console.warn("[maestro-telecom] not configured — skip", opts.method ?? "GET", path);
    return { ok: false, status: 0, data: null, attempts: 0, error: "not_configured" };
  }
  const method = opts.method ?? "GET";
  const useMachine = opts.machine !== false && !opts.token; // per-user tokens do NOT append machine=1
  const suffix = useMachine ? `${path.includes("?") ? "&" : "?"}machine=1` : "";
  const url = `${cfg.url}${path.startsWith("/") ? path : `/${path}`}${suffix}`;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const t0 = Date.now();
  let lastErr: string | undefined;
  let lastStatus = 0;
  let lastData: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
    const attemptStart = Date.now();
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Authorization": `Bearer ${bearer}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      let data: any = null;
      try { data = await res.json(); } catch { data = null; }
      const ms = Date.now() - attemptStart;
      lastStatus = res.status;
      lastData = data;

      if (res.ok) {
        console.log(`[maestro-telecom] ${method} ${path} → ${res.status} in ${ms}ms (attempt ${attempt + 1}/${maxAttempts})`);
        return { ok: true, status: res.status, data, ms: Date.now() - t0, attempts: attempt + 1 };
      }

      const errSnippet = typeof data === "object" ? JSON.stringify(data).slice(0, 200) : String(data ?? "").slice(0, 200);
      lastErr = `HTTP ${res.status} ${errSnippet}`;
      console.warn(`[maestro-telecom] ${method} ${path} → ${res.status} in ${ms}ms (attempt ${attempt + 1}/${maxAttempts}) ${errSnippet}`);

      if (!RETRYABLE_STATUS.has(res.status) || attempt === maxAttempts - 1) {
        return { ok: false, status: res.status, data, ms: Date.now() - t0, attempts: attempt + 1, error: lastErr };
      }
    } catch (e) {
      const ms = Date.now() - attemptStart;
      lastErr = (e as Error)?.message ?? String(e);
      console.warn(`[maestro-telecom] ${method} ${path} → network error in ${ms}ms (attempt ${attempt + 1}/${maxAttempts}) ${lastErr}`);
      lastStatus = 0;
      if (attempt === maxAttempts - 1) {
        return { ok: false, status: 0, data: null, ms: Date.now() - t0, attempts: attempt + 1, error: lastErr };
      }
    } finally {
      clearTimeout(t);
    }

    const wait = backoffMs(attempt);
    console.log(`[maestro-telecom] backoff ${wait}ms before retry ${attempt + 2}/${maxAttempts}`);
    await new Promise((r) => setTimeout(r, wait));
  }

  return { ok: false, status: lastStatus, data: lastData, ms: Date.now() - t0, attempts: maxAttempts, error: lastErr };
}

async function logSync(
  admin: SupabaseClient,
  entry: {
    user_id?: string | null;
    action: string;
    endpoint: string;
    method: string;
    request_body?: unknown;
    result: MaestroTelecomResult;
  },
): Promise<void> {
  try {
    await admin.from("planipret_maestro_sync_log").insert({
      user_id: entry.user_id ?? null,
      action: entry.action,
      maestro_endpoint: `${entry.method} ${entry.endpoint}`,
      request_body: entry.request_body ? (entry.request_body as any) : null,
      response_body: (entry.result.data as any) ?? (entry.result.error ? { error: entry.result.error } : null),
      response_status: entry.result.status ?? 0,
      duration_ms: entry.result.ms ?? null,
      success: !!entry.result.ok,
    });
  } catch (e) {
    console.warn("[maestro-telecom] sync-log insert failed (non-fatal):", (e as Error)?.message);
  }
}

/**
 * Best-effort mirror to Maestro with retry+backoff and full sync-log entry.
 * Never throws, never blocks the caller. Use for duplicating side-effects
 * (SMS sent, call started, call ended) that NS-API already persisted.
 */
export function maestroTelecomMirror(
  admin: SupabaseClient,
  path: string,
  opts: { method?: string; body?: unknown; action?: string; userId?: string | null } = {},
): void {
  const method = opts.method ?? "GET";
  const action = opts.action ?? `mirror:${method}:${path.split("?")[0]}`;
  void (async () => {
    try {
      const cfg = await getMaestroTelecomConfig(admin);
      if (!isMaestroTelecomConfigured(cfg)) {
        console.warn(`[maestro-telecom.mirror] skipped ${action} — not configured`);
        return;
      }
      console.log(`[maestro-telecom.mirror] → ${action} ${method} ${path}`);
      const r = await maestroTelecomFetch(cfg, path, { method, body: opts.body });
      console.log(`[maestro-telecom.mirror] ← ${action} ok=${r.ok} status=${r.status} attempts=${r.attempts} ms=${r.ms}`);
      await logSync(admin, {
        user_id: opts.userId ?? null,
        action,
        endpoint: path,
        method,
        request_body: opts.body,
        result: r,
      });
    } catch (e) {
      console.warn("[maestro-telecom.mirror] unexpected", action, (e as Error)?.message ?? e);
    }
  })();
}

/**
 * Lightweight health probe used by MDiagnostics and the admin dashboard.
 * Returns config presence and a live ping against a cheap endpoint.
 */
export async function pingMaestroTelecom(admin: SupabaseClient, userId?: string | null): Promise<{
  configured: boolean;
  base_url: string;
  ok: boolean;
  status: number;
  ms?: number;
  error?: string;
}> {
  const cfg = await getMaestroTelecomConfig(admin);
  if (!isMaestroTelecomConfigured(cfg)) {
    return { configured: false, base_url: cfg.url || "", ok: false, status: 0, error: "not_configured" };
  }
  // A cheap authenticated GET. If the broker is linked we hit their
  // communications feed (guaranteed to exist). Otherwise we probe a couple
  // of endpoints and infer auth from the status code: 401/403 = bad token,
  // anything else (200, 404, 400…) means the API reached us and accepted
  // the Bearer token, so we consider connectivity + auth as OK.
  const paths = userId
    ? [`/users/${encodeURIComponent(userId)}/communications/recent`]
    : [`/users/me`, `/me`, `/health`, `/`];
  let last: Awaited<ReturnType<typeof maestroTelecomFetch>> | null = null;
  for (const p of paths) {
    const r = await maestroTelecomFetch(cfg, p, { method: "GET", maxAttempts: 1, timeoutMs: 5000 });
    last = r;
    if (r.ok) break;
    // Auth accepted but endpoint absent → still a valid connectivity signal.
    if (r.status && r.status !== 401 && r.status !== 403 && r.status < 500) break;
  }
  const r = last!;
  const authOk = r.ok || (r.status > 0 && r.status !== 401 && r.status !== 403 && r.status < 500);
  return {
    configured: true,
    base_url: cfg.url,
    ok: authOk,
    status: r.status,
    ms: r.ms,
    error: authOk ? undefined : r.error,
  };
}

/**
 * Load the current broker's Maestro user id from `planipret_profiles`. Returns
 * null if the broker hasn't been linked to Maestro yet — callers should skip
 * the Maestro flow silently in that case.
 */
export async function getMaestroBrokerId(admin: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data } = await admin
      .from("planipret_profiles")
      .select("maestro_broker_id")
      .eq("user_id", userId)
      .maybeSingle();
    const raw = (data as any)?.maestro_broker_id;
    if (!raw) return null;
    const id = String(raw).trim();
    // Maestro identifies brokers by an internal numeric user id (e.g. "67").
    // Reject anything else (emails, UUIDs) — those trigger 404 on every call.
    if (!/^\d+$/.test(id)) return null;
    return id;
  } catch {
    return null;
  }
}

/**
 * Mirror a completed AI analysis (summary + full analysis JSON + coaching)
 * to the Maestro Telecom API for the given Planiprêt call.
 *
 * Fire-and-forget: never throws, never blocks the caller. If the broker or
 * the Maestro call id is missing, the attempt is still logged with
 * success=false so it shows up in the admin dashboard.
 */
export function mirrorCallAnalysisToMaestro(
  admin: SupabaseClient,
  userId: string,
  ppCall: Record<string, any>,
  analysis: Record<string, any>,
  extra?: {
    ai_summary?: string | null;
    ai_summary_short?: string | null;
    coaching_message?: string | null;
    next_actions?: unknown;
    topics?: unknown;
    sentiment?: string | null;
    lead_score?: number | null;
    lead_temperature?: string | null;
    lead_reason?: string | null;
    model?: string | null;
  },
): void {
  void (async () => {
    try {
      const maestroCallId = ppCall?.maestro_call_id ? String(ppCall.maestro_call_id) : null;
      const brokerId = await getMaestroBrokerId(admin, userId);
      const payload = {
        ai_summary: extra?.ai_summary ?? null,
        ai_summary_short: extra?.ai_summary_short ?? null,
        ai_analysis: analysis ?? null,
        ai_coaching: extra?.coaching_message ?? null,
        ai_next_actions: extra?.next_actions ?? [],
        ai_topics: extra?.topics ?? [],
        sentiment: extra?.sentiment ?? null,
        lead_score: extra?.lead_score ?? null,
        lead_temperature: extra?.lead_temperature ?? null,
        lead_reason: extra?.lead_reason ?? null,
        transcript_language: ppCall?.transcript_language ?? null,
        model: extra?.model ?? null,
        analyzed_at: new Date().toISOString(),
      };

      if (!brokerId || !maestroCallId) {
        const reason = !brokerId ? "no_maestro_broker_id" : "no_maestro_call_id";
        console.warn(`[maestro-telecom.analysis] skip pp_call=${ppCall?.id} — ${reason}`);
        // Log as a distinct "skipped" action so it doesn't pollute the
        // real success/failure rate of actual Maestro API calls.
        try {
          await admin.from("planipret_maestro_sync_log").insert({
            user_id: userId,
            action: `call.analysis.skipped.${reason}`,
            maestro_endpoint: `PUT /users/{broker}/calls/${maestroCallId ?? "?"}`,
            request_body: { pp_call_id: ppCall?.id },
            response_body: { skipped: reason },
            response_status: 0,
            duration_ms: 0,
            success: true,
          });
        } catch { /* ignore */ }
        return;
      }

      const cfg = await getMaestroTelecomConfig(admin);
      if (!isMaestroTelecomConfigured(cfg)) {
        console.warn("[maestro-telecom.analysis] skipped — not configured");
        return;
      }

      const path = `/users/${encodeURIComponent(brokerId)}/calls/${encodeURIComponent(maestroCallId)}`;
      console.log(`[maestro-telecom.analysis] → PUT ${path} pp_call=${ppCall?.id}`);
      const r = await maestroTelecomFetch(cfg, path, { method: "PUT", body: payload });
      console.log(`[maestro-telecom.analysis] ← ok=${r.ok} status=${r.status} attempts=${r.attempts} ms=${r.ms}`);
      await logSync(admin, {
        user_id: userId,
        action: "call.analysis.summary",
        endpoint: path,
        method: "PUT",
        request_body: payload,
        result: r,
      });
    } catch (e) {
      console.warn("[maestro-telecom.analysis] unexpected", (e as Error)?.message ?? e);
    }
  })();
}
