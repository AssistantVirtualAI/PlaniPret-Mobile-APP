// Shared helpers for Planiprêt NS-API v2 edge functions.
// IMPORTANT: AVA-only. Never used by Lemtel PBX functions.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

export const AVA_ORG_ID = "17d6507f-a9ca-409d-8e49-371d50332615";

export { corsHeaders };

export type NsContext = {
  userId: string;
  profileId: string;
  extension: string;
  nsDomain: string;
  maestroBrokerId: string | null;
};


let cachedToken: { token: string; exp: number } | null = null;

// ---- Circuit breaker (per edge-function instance) ----
type BreakerState = { failures: number; openedAt: number; lastError: string };
const breaker: BreakerState = { failures: 0, openedAt: 0, lastError: "" };
const BREAKER_THRESHOLD = 5;         // consecutive failures to trip
const BREAKER_COOLDOWN_MS = 30_000;  // stay open for 30s
export function nsBreakerStatus() {
  const openUntil = breaker.openedAt ? breaker.openedAt + BREAKER_COOLDOWN_MS : 0;
  return {
    open: openUntil > Date.now(),
    failures: breaker.failures,
    reopens_at: openUntil,
    last_error: breaker.lastError,
  };
}
export function nsBreakerReset() {
  breaker.failures = 0;
  breaker.openedAt = 0;
  breaker.lastError = "";
}
function breakerRecordFailure(msg: string) {
  breaker.failures += 1;
  breaker.lastError = msg;
  if (breaker.failures >= BREAKER_THRESHOLD) breaker.openedAt = Date.now();
}
function breakerRecordSuccess() {
  breaker.failures = 0;
  breaker.openedAt = 0;
  breaker.lastError = "";
}

type NsRuntimeConfig = {
  baseUrl: string;
  defaultDomain: string;
  apiKey: string;
};

async function getAdminNsConfig(): Promise<Partial<NsRuntimeConfig>> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !service) return {};
    const admin = createClient(url, service);
    const [{ data: cfg }, { data: secrets }] = await Promise.all([
      admin.from("planipret_integration_config").select("config_data").eq("integration_key", "ns_api").maybeSingle(),
      admin.from("planipret_integration_secrets").select("provider, config").in("provider", ["nsapi", "ns_api"]).limit(2),
    ]);
    const configData = (cfg?.config_data ?? {}) as Record<string, string>;
    const secretData = (((secrets ?? [])[0] as any)?.config ?? {}) as Record<string, string>;
    return {
      baseUrl: configData.base_url ?? secretData.base_url,
      defaultDomain: configData.domain ?? configData.default_domain ?? secretData.domain ?? secretData.default_domain,
      apiKey: configData.api_key ?? secretData.api_key,
    };
  } catch {
    return {};
  }
}

async function getRuntimeConfig(): Promise<NsRuntimeConfig> {
  const adminCfg = await getAdminNsConfig();
  const baseUrl = adminCfg.baseUrl ?? Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
  const defaultDomain = adminCfg.defaultDomain ?? Deno.env.get("NS_DEFAULT_DOMAIN") ?? Deno.env.get("NS_API_DOMAIN") ?? "planipret.ca";
  const apiKey = adminCfg.apiKey ?? Deno.env.get("NS_API_KEY") ?? "";
  if (!baseUrl) throw new Error("NS-API base URL not configured");
  if (!apiKey) throw new Error("NS_API_KEY not configured (NS-API v2 uses static Bearer key)");
  return { baseUrl, defaultDomain, apiKey };
}

export function getEnv() {
  const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
  const NS_API_USER = Deno.env.get("NS_API_USER");
  const NS_API_PASSWORD = Deno.env.get("NS_API_PASSWORD");
  const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? Deno.env.get("NS_API_DOMAIN") ?? "planipret.ca";
  return { NS_API_BASE_URL, NS_API_USER, NS_API_PASSWORD, NS_DEFAULT_DOMAIN };
}

async function nsBase() {
  // Tolerate either form: with or without trailing /ns-api/v2
  const raw = (await getRuntimeConfig()).baseUrl.replace(/\/$/, "");
  return raw.replace(/\/ns-api(\/v2)?$/, "");
}

export async function getNsJwt(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const staticKey = (await getRuntimeConfig()).apiKey;
  cachedToken = { token: staticKey, exp: Date.now() + 3600_000 };
  return staticKey;
}

export async function nsFetch(path: string, init: RequestInit = {}, opts: { functionName?: string } = {}) {
  // Short-circuit if breaker is open
  const bs = nsBreakerStatus();
  if (bs.open) {
    return new Response(
      JSON.stringify({
        error: "NS-API circuit breaker open",
        degraded: true,
        breaker_open: true,
        reopens_at: bs.reopens_at,
        last_error: bs.last_error,
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  let token: string;
  try {
    token = await getNsJwt();
  } catch (e) {
    breakerRecordFailure((e as Error).message);
    return new Response(
      JSON.stringify({ error: (e as Error).message, degraded: true }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
  const url = `${await nsBase()}/ns-api/v2${path}`;
  const method = (init.method ?? "GET").toUpperCase();
  const t0 = Date.now();
  console.log(`[${opts.functionName ?? "nsFetch"}][NS] ${method} ${path}`);
  const doFetch = async (bearer: string) => {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15_000);
        try {
          return await fetch(url, {
            ...init,
            signal: ctrl.signal,
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${bearer}`,
              ...(init.headers ?? {}),
            },
          });
        } finally {
          clearTimeout(timer);
        }
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  };
  let res: Response;
  try {
    res = await doFetch(token);
  } catch (e) {
    breakerRecordFailure((e as Error).message);
    return new Response(
      JSON.stringify({ error: (e as Error).message, degraded: true }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // 401 → drop cached token, refresh once and retry
  if (res.status === 401) {
    cachedToken = null;
    try {
      const fresh = await getNsJwt();
      res = await doFetch(fresh);
    } catch (e) {
      breakerRecordFailure((e as Error).message);
      return new Response(
        JSON.stringify({ error: (e as Error).message, degraded: true, unauthorized: true }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    // If still 401 after refresh, surface it as a hard 401 (do not trip breaker)
    if (res.status === 401) {
      return new Response(
        JSON.stringify({ error: "NS-API unauthorized after token refresh", unauthorized: true }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // Track breaker on 5xx / success
  if (res.status >= 500) breakerRecordFailure(`HTTP ${res.status}`);
  else if (res.ok) breakerRecordSuccess();

  // Fire & forget log to planipret_ns_request_log
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const [pathOnly, qs] = path.split("?");
    const query_params: Record<string, string> = {};
    if (qs) for (const [k, v] of new URLSearchParams(qs)) query_params[k] = v;
    admin.from("planipret_ns_request_log").insert({
      function_name: opts.functionName ?? "shared",
      method,
      path: pathOnly,
      query_params: qs ? query_params : null,
      full_url: url,
      status: res.status,
      duration_ms: Date.now() - t0,
      ok: res.ok,
      error: res.ok ? null : `HTTP ${res.status}`,
    }).then(() => {}, () => {});
  } catch { /* ignore */ }
  return res;
}

/**
 * Authenticates the caller via Supabase JWT, ensures the user is a Planiprêt
 * member of the AVA organization, and returns their NS-API extension/domain.
 */
export async function requirePlanipretBroker(
  req: Request,
): Promise<{ ctx: NsContext; supabase: ReturnType<typeof createClient>; userClient: ReturnType<typeof createClient> } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const token = authHeader.replace("Bearer ", "");
  let userId: string | null = null;

  // Server-to-server path used by AVA tools. The service token may only act for
  // an explicit broker user id, then the normal Planiprêt membership/profile
  // checks below still apply.
  if (token === SUPABASE_SERVICE_ROLE_KEY) {
    const body = await req.clone().json().catch(() => ({}));
    userId = body?._user_id ?? body?.user_id ?? body?.broker_user_id ?? null;
    if (userId) userId = String(userId);
  } else {
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = claimsData.claims.sub as string;
  }

  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized — broker user required" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // App-separation guard: block Lemtel-only users outright
  const { data: lemtelOnly } = await supabase.rpc("is_lemtel_only", { _user_id: userId });
  if (lemtelOnly === true) {
    return new Response(JSON.stringify({ error: "forbidden_wrong_app", app: "lemtel" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // AVA scope check via security definer helper
  const { data: isMember, error: rpcErr } = await supabase.rpc("is_planipret_member", {
    _user_id: userId,
  });
  if (rpcErr || isMember !== true) {
    return new Response(JSON.stringify({ error: "Forbidden — Planiprêt access only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: profile, error: profErr } = await supabase
    .from("planipret_profiles")
    .select("id, extension, ns_extension, ns_domain, organization_id, maestro_broker_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profErr || !profile) {
    return new Response(JSON.stringify({ error: "Planiprêt profile not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (profile.organization_id !== AVA_ORG_ID) {
    return new Response(JSON.stringify({ error: "Wrong organization scope" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const extension = profile.extension || profile.ns_extension;
  if (!extension || !profile.ns_domain) {
    // Soft response: profile not yet linked to NS extension.
    // Returning 200 + needs_link lets the UI render an empty state instead of blanking.
    return new Response(
      JSON.stringify({
        ok: true,
        needs_link: true,
        items: [],
        count: 0,
        data: [],
        error: "Extension or NS domain missing on profile",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return {
    ctx: {
      userId,
      profileId: profile.id,
      extension,
      nsDomain: profile.ns_domain,
      maestroBrokerId: (profile as any).maestro_broker_id ?? null,
    },
    supabase,
    userClient,
  };
}


export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
