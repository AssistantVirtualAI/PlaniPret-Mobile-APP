// Shared Maestro/Kanguru helper — used by all maestro-* edge functions.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getUserMaestroAccessToken } from "./maestro-oauth.ts";
import { resolveMaestroIdForUser } from "./maestro-broker-directory.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-maestro-signature",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export interface MaestroConfig {
  url: string;
  key: string;
  accountId: string;
  webhookSecret: string;
}

export async function getMaestroConfig(admin: SupabaseClient): Promise<MaestroConfig> {
  const { data } = await admin
    .from("planipret_integration_secrets")
    .select("provider, config")
    .in("provider", ["maestro_telecom", "maestro"]);
  const rows = Array.isArray(data) ? data : [];
  const telecom = rows.find((r: any) => r.provider === "maestro_telecom")?.config ?? {};
  const legacy = rows.find((r: any) => r.provider === "maestro")?.config ?? {};
  const c = { ...(legacy as Record<string, string>), ...(telecom as Record<string, string>) };
  const rawUrl = (c.api_url
      ?? c.base_url
      ?? Deno.env.get("MAESTRO_TELECOM_BASE_URL")
      ?? Deno.env.get("MAESTRO_TELECOM_API_URL")
      ?? Deno.env.get("MAESTRO_API_URL")
      ?? "").replace(/\/$/, "");
  return {
    // Shared maestro-* functions pass paths beginning with /api/v1. Scott's
    // configured Telecom base may already include /api/v1, so normalize once.
    url: rawUrl.replace(/\/api\/v1$/i, ""),
    key: c.api_key
      ?? Deno.env.get("MAESTRO_MACHINE_API_KEY")
      ?? Deno.env.get("MAESTRO_TELECOM_API_KEY")
      ?? Deno.env.get("MAESTRO_API_KEY")
      ?? "",
    accountId: c.account_id ?? Deno.env.get("MAESTRO_ACCOUNT_ID") ?? "",
    webhookSecret: c.webhook_secret ?? Deno.env.get("MAESTRO_WEBHOOK_SECRET") ?? "",
  };
}

/** Fallback broker id from the integration secrets store (machine-key mode). */
export async function fallbackBrokerId(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin
    .from("planipret_integration_secrets")
    .select("provider, config")
    .in("provider", ["maestro_telecom", "maestro"]);
  const rows = Array.isArray(data) ? data : [];
  const telecom = rows.find((r: any) => r.provider === "maestro_telecom")?.config ?? {};
  const legacy = rows.find((r: any) => r.provider === "maestro")?.config ?? {};
  const c = { ...(legacy as Record<string, unknown>), ...(telecom as Record<string, unknown>) };
  for (const k of ["broker_id", "maestro_broker_id", "user_id"]) {
    const v = (c as any)[k];
    if (v !== undefined && v !== null && String(v).trim() !== "" && /^\d+$/.test(String(v).trim())) {
      return String(v).trim();
    }
  }
  return null;
}

/**
 * Resolve the machine API key + the broker's numeric Maestro telecom user id.
 * NOTE: Scott's Telecom API only accepts the machine key (`Bearer <key>&machine=1`);
 * per-broker OAuth tokens are never used for these calls.
 */
/** Digits-only comparison helper. */
function digits(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

/** Verify that a telecom user id really exists (GET /users/{id}/sip). */
export async function verifyTelecomUserId(cfg: MaestroConfig, id: string): Promise<any | null> {
  if (!cfg.url || !cfg.key || !/^\d+$/.test(id)) return null;
  try {
    const r = await fetch(`${cfg.url}/api/v1/users/${id}/sip?machine=1`, {
      headers: { Authorization: `Bearer ${cfg.key}` },
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return j?.sip ? j.sip : null;
  } catch {
    return null;
  }
}

const RESOLVE_COOLDOWN = new Map<string, number>();

export interface BrokerAuthDiag {
  user_id: string | null;
  profile_found: boolean;
  matched_by: "user_id" | "profile_id" | null;
  profile_id: string | null;
  stored_broker_id: string | null;
  stored_broker_id_valid: boolean | null;
  sip_probe_attempted: boolean;
  sip_probe_result: string | null;
  cooldown_active: boolean;
  used_fallback: boolean;
  token_source?: "oauth" | "machine";
  reason: string;
}

/**
 * Discover the broker's numeric Maestro telecom user id by probing
 * `GET /users/{id}/sip` and matching the SIP extension or phone number to the
 * broker's Planiprêt profile. Persists the result on the profile.
 */
export async function resolveBrokerIdFromTelecom(
  admin: SupabaseClient,
  userId: string,
  cfg: MaestroConfig,
  maxId = 250,
  diag?: BrokerAuthDiag,
): Promise<string | null> {
  const note = (r: string) => { if (diag) diag.sip_probe_result = r; console.warn(`[maestro.brokerId] sip-resolve user=${userId} → ${r}`); };
  if (!cfg.url || !cfg.key) { note("telecom_not_configured"); return null; }
  const last = RESOLVE_COOLDOWN.get(userId) ?? 0;
  if (Date.now() - last < 10 * 60_000) {
    if (diag) diag.cooldown_active = true;
    note(`cooldown_active (retry in ${Math.ceil((10 * 60_000 - (Date.now() - last)) / 1000)}s)`);
    return null;
  }
  RESOLVE_COOLDOWN.set(userId, Date.now());
  if (diag) diag.sip_probe_attempted = true;

  const profile = await loadBrokerProfile(admin, userId);
  const ext = String(profile?.extension ?? "").trim();
  const phone = digits(profile?.phone);
  if (!profile) { note("no_profile_for_sip_match"); return null; }
  if (!ext && !phone) { note("profile_has_no_extension_and_no_phone"); return null; }

  const match = async (id: number): Promise<string | null> => {
    const sip = await verifyTelecomUserId(cfg, String(id));
    if (!sip) return null;
    const sipUser = String(sip.sip_username ?? "").trim();
    const pu = sip.provider_user ?? {};
    const pNums = [digits(pu.phone_number), digits(pu.sms_number)].filter(Boolean);
    const extMatch = ext && (sipUser === ext || String(pu.provider_external_user_id ?? "") === ext);
    const phoneMatch = phone && pNums.some((n) => n.endsWith(phone.slice(-10)));
    return extMatch || phoneMatch ? String(id) : null;
  };

  for (let start = 1; start <= maxId; start += 25) {
    const ids = Array.from({ length: Math.min(25, maxId - start + 1) }, (_, i) => start + i);
    const found = (await Promise.all(ids.map(match))).find(Boolean);
    if (found) {
      await admin.from("planipret_profiles").update({ maestro_broker_id: found }).eq("id", profile.id);
      if (diag) diag.sip_probe_result = `matched_id_${found}`;
      console.log(`[maestro.brokerId] resolved broker id ${found} for user ${userId} (ext=${ext || "-"} phone=${phone || "-"})`);
      return found;
    }
  }
  note(`no_sip_match_in_1..${maxId} (ext=${ext || "-"} phone=${phone || "-"})`);
  return null;
}

/**
 * `planipret_phone_calls.user_id` sometimes holds the auth user id and
 * sometimes the `planipret_profiles.id` — resolve both.
 */
export async function loadBrokerProfile(
  admin: SupabaseClient,
  userId: string,
  diag?: BrokerAuthDiag,
): Promise<{ id: string; maestro_broker_id: string | null; extension: string | null; phone: string | null } | null> {
  const cols = "id, user_id, maestro_broker_id, extension, phone";
  // planipret_phone_calls.user_id may hold either auth.users.id or the profile id.
  const both = await admin.from("planipret_profiles").select(cols).or(`user_id.eq.${userId},id.eq.${userId}`).limit(2);
  const rows = (both.data ?? []) as any[];
  const hit = rows.find((r) => r.user_id === userId) ?? rows[0];
  if (hit) {
    if (diag) {
      diag.profile_found = true;
      diag.matched_by = hit.user_id === userId ? "user_id" : "profile_id";
      diag.profile_id = hit.id;
    }
    return hit;
  }
  if (diag) { diag.profile_found = false; diag.matched_by = null; }
  return null;

}

/**
 * Resolve the machine API key + the broker's numeric Maestro telecom user id.
 * NOTE: Scott's Telecom API only accepts the machine key (`Bearer <key>&machine=1`);
 * per-broker OAuth tokens are never used for these calls.
 */
export async function getBrokerAuth(
  admin: SupabaseClient,
  userId: string | null | undefined,
  preferOAuth = false,
): Promise<{ token: string; brokerId: string | null; usingFallback: boolean; machine: boolean; diag: BrokerAuthDiag }> {
  const cfg = await getMaestroConfig(admin);
  const diag: BrokerAuthDiag = {
    user_id: userId ?? null,
    profile_found: false,
    matched_by: null,
    profile_id: null,
    stored_broker_id: null,
    stored_broker_id_valid: null,
    sip_probe_attempted: false,
    sip_probe_result: null,
    cooldown_active: false,
    used_fallback: false,
    token_source: "machine",
    reason: "ok",
  };
  let brokerId: string | null = null;
  if (!userId) diag.reason = "no_user_id_on_record";

  if (userId) {
    const profile = await loadBrokerProfile(admin, userId, diag);
    if (!profile) {
      diag.reason = "no_planipret_profile_matches_user_id_or_profile_id";
      console.warn(`[maestro.brokerId] no profile for ${userId} (searched planipret_profiles.user_id then .id)`);
    }
    brokerId = profile?.maestro_broker_id ? String(profile.maestro_broker_id).trim() : null;
    diag.stored_broker_id = brokerId;

    if (brokerId && !/^\d+$/.test(brokerId)) {
      console.warn(`[maestro.brokerId] stored broker id "${brokerId}" is not numeric — ignored`);
      diag.stored_broker_id_valid = false;
      diag.reason = "stored_broker_id_not_numeric";
      brokerId = null;
    } else if (brokerId) {
      // Trust the stored numeric id. Never probe /users/{id}/sip to validate it:
      // a network hiccup there would discard a perfectly valid broker id.
      diag.stored_broker_id_valid = true;
      diag.reason = "ok";
    }
    // Prefer the Maestro broker directory (email match) before falling back to
    // the expensive /users/{id}/sip probing loop.
    if (!brokerId) {
      const dir = await resolveMaestroIdForUser(admin, userId).catch(() => null);
      if (dir?.maestro_broker_id) {
        brokerId = dir.maestro_broker_id;
        diag.sip_probe_result = `directory_match_${dir.matched_by ?? "email"}`;
      }
    }
    if (!brokerId) brokerId = await resolveBrokerIdFromTelecom(admin, userId, cfg, 250, diag);
    if (brokerId) diag.reason = "ok";

  }

  if (!brokerId) {
    // The global fallback broker id is ONLY valid when no user is attached to
    // the record. Using it for a known user would push that broker's calls,
    // recordings and transcripts into somebody else's Maestro account.
    if (!userId) {
      brokerId = await fallbackBrokerId(admin);
      diag.used_fallback = !!brokerId;
      if (brokerId) diag.reason = "using_global_fallback_broker_id_no_user";
    } else {
      diag.reason = diag.reason === "ok" ? "broker_id_unresolved_for_user" : diag.reason;
      console.warn(`[maestro.brokerId] no broker id for user ${userId} — global fallback refused (would cross-post to another broker)`);
    }
    if (!brokerId && diag.reason === "ok") diag.reason = "no_broker_id_anywhere";
  }

  if (!brokerId) {
    console.error(`[maestro.brokerId] UNRESOLVED user=${userId ?? "-"} ${JSON.stringify(diag)}`);
  }
  let token = cfg.key;
  let machine = true;
  if (preferOAuth && userId) {
    const oauthToken = await getUserMaestroAccessToken(admin, userId).catch((e) => {
      console.warn("[maestro.auth] OAuth token unavailable", (e as Error).message);
      return null;
    });
    if (oauthToken) {
      token = oauthToken;
      machine = false;
      diag.token_source = "oauth";
    }
  }
  return { token, brokerId, usingFallback: diag.used_fallback, machine, diag };
}



/**
 * Telecom REST API auth (Scott's spec): the machine API key + the broker's
 * numeric Maestro telecom user id. Broker OAuth tokens are NOT accepted by
 * `/telecom/api/v1` — it only authenticates `Bearer <machine key>&machine=1`.
 */
export async function telecomAuth(
  admin: SupabaseClient,
  userId: string | null | undefined,
  preferOAuth = false,
): Promise<{ token: string; brokerId: string | null; usingFallback: boolean; machine: boolean; diag: BrokerAuthDiag }> {
  return await getBrokerAuth(admin, userId, preferOAuth);
}





interface CallOpts {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  token: string;
  body?: unknown;
  idempotencyKey?: string;
  accountId?: string;
  brokerId?: string | null;
  machine?: boolean;
}

/**
 * Rewrite `/api/v1/<rest>` into `/api/v1/users/<brokerId>/<rest>` so every
 * push lands under the broker's own Maestro account.
 */
export function brokerScopedPath(brokerId: string | null | undefined, path: string): string {
  if (!brokerId) return path;
  if (path.includes("/users/")) return path;
  const m = path.match(/^\/api\/v1\/(.*)$/);
  if (!m) return path;
  return `/api/v1/users/${encodeURIComponent(String(brokerId))}/${m[1]}`;
}


export async function maestroFetch(cfg: MaestroConfig, opts: CallOpts) {
  if (!cfg.url) throw new Error("MAESTRO_API_URL missing");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (opts.accountId || cfg.accountId) {
    headers["X-Account-Id"] = opts.accountId ?? cfg.accountId;
  }
  if (opts.brokerId) headers["X-Broker-Id"] = String(opts.brokerId);
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  // Scott's Telecom REST API authenticates the machine API key only when
  // `?machine=1` is present — always append it.
  const suffix = opts.machine === false ? "" : `${opts.path.includes("?") ? "&" : "?"}machine=1`;
  const endpoint = `${cfg.url}${opts.path}${suffix}`;
  const res = await fetch(endpoint, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  const raw = typeof data?.raw === "string" ? data.raw : "";
  const contentType = res.headers.get("content-type") ?? "";
  const htmlLogin = /text\/html/i.test(contentType) || /<html|<body|form-signin|\/login/i.test(raw);
  return { ok: res.ok && !htmlLogin, status: res.status, data: htmlLogin ? { error: "maestro_html_login_response", raw } : data, endpoint };
}

/**
 * Broker-first call: hits `/api/v1/users/<brokerId>/...` and transparently
 * falls back to the account-level path when Maestro doesn't expose the
 * broker-scoped route (404/405).
 */
export async function maestroFetchScoped(
  cfg: MaestroConfig,
  opts: CallOpts & { brokerId?: string | null },
) {
  const scoped = brokerScopedPath(opts.brokerId, opts.path);
  if (scoped !== opts.path) {
    const r = await maestroFetch(cfg, { ...opts, path: scoped });
    if (r.ok || (r.status !== 404 && r.status !== 405)) return { ...r, path: scoped };
  }
  const r = await maestroFetch(cfg, opts);
  return { ...r, path: opts.path };
}

export function summarizeMaestroFailure(status: number, data: any): { error: string; detail: string; permanent: boolean } {
  const raw = typeof data?.raw === "string" ? data.raw : JSON.stringify(data ?? {}).slice(0, 500);
  const lower = raw.toLowerCase();
  if (status === 404) {
    const html = lower.includes("<html") || lower.includes("<title>");
    return {
      error: "maestro_endpoint_not_found",
      detail: html
        ? "Configured Maestro URL returns an HTML 404 page; the telecom API prefix is not being served."
        : "Maestro returned 404 for this endpoint.",
      permanent: true,
    };
  }
  if (status === 401 || status === 403) {
    return { error: "maestro_auth_failed", detail: `Maestro rejected the token with HTTP ${status}.`, permanent: true };
  }
  if (status === 0) {
    return { error: "maestro_unreachable", detail: "Maestro could not be reached from the backend.", permanent: false };
  }
  return { error: "maestro_error", detail: `Maestro returned HTTP ${status}.`, permanent: status >= 400 && status < 500 };
}


/** Update one step in the pipeline_state JSON column on planipret_phone_calls. */
export async function setPipelineStep(
  admin: SupabaseClient,
  callId: string,
  step: "cdr" | "transcript" | "ai" | "maestro",
  state: "pending" | "running" | "done" | "error",
  extra?: Record<string, unknown>,
) {
  const { data } = await admin
    .from("planipret_phone_calls")
    .select("pipeline_state")
    .eq("id", callId)
    .maybeSingle();
  const current = (data?.pipeline_state ?? {}) as Record<string, unknown>;
  const next = {
    ...current,
    [step]: { state, at: new Date().toISOString(), ...(extra ?? {}) },
  };
  await admin
    .from("planipret_phone_calls")
    .update({ pipeline_state: next })
    .eq("id", callId);
}

/** Audit log helper. */
export async function maestroAudit(
  admin: SupabaseClient,
  action: string,
  payload: Record<string, unknown>,
) {
  try {
    await admin.from("planipret_audit_log").insert({
      action: `maestro_${action}`,
      payload,
    });
  } catch (e) {
    console.warn("maestroAudit failed", action, e);
  }
}

/** HMAC-SHA256 hex digest for inbound webhook signature verification. */
export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  const s = String(input).replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) return s;
  if (s.length === 10) return `+1${s}`;
  if (s.length === 11 && s.startsWith("1")) return `+${s}`;
  return s.startsWith("+") ? s : `+${s}`;
}

/** Insert a row into planipret_pipeline_logs (debug per call). */
export async function pipelineLog(
  admin: SupabaseClient,
  args: {
    call_id: string | null;
    user_id: string | null;
    step: string;
    status: "started" | "success" | "error" | "skipped";
    duration_ms?: number;
    payload?: unknown;
    error_message?: string;
  },
) {
  try {
    await admin.from("planipret_pipeline_logs").insert({
      call_id: args.call_id,
      user_id: args.user_id,
      step: args.step,
      status: args.status,
      duration_ms: args.duration_ms ?? null,
      payload: args.payload ?? null,
      error_message: args.error_message ?? null,
    });
  } catch (e) {
    console.warn("pipelineLog failed", e);
  }
}

/** Insert/append to low-level Maestro API sync log. */
export async function maestroSyncLog(
  admin: SupabaseClient,
  args: {
    user_id?: string | null;
    action: string;
    endpoint: string;
    request_body?: unknown;
    response_status: number;
    response_body?: unknown;
    duration_ms: number;
    success: boolean;
  },
) {
  try {
    await admin.from("planipret_maestro_sync_log").insert({
      user_id: args.user_id ?? null,
      action: args.action,
      maestro_endpoint: args.endpoint,
      request_body: args.request_body ?? null,
      response_status: args.response_status,
      response_body: args.response_body ?? null,
      duration_ms: args.duration_ms,
      success: args.success,
    });
  } catch (e) {
    console.warn("maestroSyncLog failed", e);
  }
}

/** Update pipeline_* columns on the call row (step / error / timestamps). */
export async function updateCallPipeline(
  admin: SupabaseClient,
  callId: string,
  patch: {
    step?: string;
    error?: string | null;
    started?: boolean;
    completed?: boolean;
    extra?: Record<string, unknown>;
  },
) {
  const update: Record<string, unknown> = { ...(patch.extra ?? {}) };
  if (patch.step !== undefined) update.pipeline_step = patch.step;
  if (patch.error !== undefined) update.pipeline_error = patch.error;
  if (patch.started) update.pipeline_started_at = new Date().toISOString();
  if (patch.completed) update.pipeline_completed_at = new Date().toISOString();
  if (Object.keys(update).length === 0) return;
  await admin.from("planipret_phone_calls").update(update).eq("id", callId);
}

/** Broadcast a pipeline update over the per-user ai-insights channel. */
export async function broadcastPipeline(
  admin: SupabaseClient,
  userId: string | null | undefined,
  event: string,
  payload: Record<string, unknown>,
) {
  if (!userId) return;
  try {
    await admin.channel(`ai-insights:${userId}`).send({
      type: "broadcast",
      event,
      payload,
    });
  } catch (e) {
    console.warn("broadcastPipeline failed", e);
  }
}

/** Upsert into planipret_maestro_clients cache. */
export async function cacheMaestroClient(
  admin: SupabaseClient,
  args: {
    user_id: string;
    maestro_client_id: string;
    phone_e164?: string | null;
    full_name?: string | null;
    company?: string | null;
    email?: string | null;
    mortgage_stage?: string | null;
    preferred_lang?: string | null;
    tags?: unknown;
  },
) {
  try {
    await admin
      .from("planipret_maestro_clients")
      .upsert(
        {
          user_id: args.user_id,
          maestro_client_id: args.maestro_client_id,
          phone_e164: args.phone_e164 ?? null,
          full_name: args.full_name ?? null,
          company: args.company ?? null,
          email: args.email ?? null,
          mortgage_stage: args.mortgage_stage ?? null,
          preferred_lang: args.preferred_lang ?? "fr",
          tags: args.tags ?? [],
          cached_at: new Date().toISOString(),
        },
        { onConflict: "user_id,phone_e164" },
      );
  } catch (e) {
    console.warn("cacheMaestroClient failed", e);
  }
}
