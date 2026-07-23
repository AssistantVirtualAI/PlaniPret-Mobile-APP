// Shared Maestro/Kanguru helper — used by all maestro-* edge functions.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

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
    .select("config")
    .eq("provider", "maestro")
    .maybeSingle();
  const c = (data?.config ?? {}) as Record<string, string>;
  return {
    url: (c.api_url ?? Deno.env.get("MAESTRO_API_URL") ?? "").replace(/\/$/, ""),
    key: c.api_key ?? Deno.env.get("MAESTRO_API_KEY") ?? "",
    accountId: c.account_id ?? Deno.env.get("MAESTRO_ACCOUNT_ID") ?? "",
    webhookSecret: c.webhook_secret ?? Deno.env.get("MAESTRO_WEBHOOK_SECRET") ?? "",
  };
}

/** Resolve broker token + maestro_broker_id for a given user (falls back to service key). */
export async function getBrokerAuth(
  admin: SupabaseClient,
  userId: string | null | undefined,
): Promise<{ token: string; brokerId: string | null; usingFallback: boolean }> {
  if (!userId) {
    const cfg = await getMaestroConfig(admin);
    return { token: cfg.key, brokerId: null, usingFallback: true };
  }
  const { data: profile } = await admin
    .from("planipret_profiles")
    .select("maestro_broker_token, maestro_broker_id, maestro_token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  const tokenValid =
    profile?.maestro_broker_token &&
    (!profile.maestro_token_expires_at ||
      new Date(profile.maestro_token_expires_at) > new Date());
  if (tokenValid) {
    return {
      token: profile!.maestro_broker_token!,
      brokerId: profile!.maestro_broker_id ?? null,
      usingFallback: false,
    };
  }
  const cfg = await getMaestroConfig(admin);
  return {
    token: cfg.key,
    brokerId: profile?.maestro_broker_id ?? null,
    usingFallback: true,
  };
}

interface CallOpts {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  token: string;
  body?: unknown;
  idempotencyKey?: string;
  accountId?: string;
}

export async function maestroFetch(cfg: MaestroConfig, opts: CallOpts) {
  if (!cfg.url) throw new Error("MAESTRO_API_URL missing");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
    "Content-Type": "application/json",
  };
  if (opts.accountId || cfg.accountId) {
    headers["X-Account-Id"] = opts.accountId ?? cfg.accountId;
  }
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  const res = await fetch(`${cfg.url}${opts.path}`, {
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
  return { ok: res.ok, status: res.status, data };
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
