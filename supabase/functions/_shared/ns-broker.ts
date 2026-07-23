// Per-broker NS-API JWT helpers — AVA Planiprêt only.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

export { corsHeaders };
export const AVA_ORG_ID = "17d6507f-a9ca-409d-8e49-371d50332615";

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function nsEnv() {
  const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
  const NS_API_USER = Deno.env.get("NS_API_USER");
  const NS_API_PASSWORD = Deno.env.get("NS_API_PASSWORD");
  const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? Deno.env.get("NS_API_DOMAIN") ?? "planipret.ca";
  // Tolerate base URL with or without trailing /ns-api/v2 or /ns-api
  const base = NS_API_BASE_URL.replace(/\/$/, "").replace(/\/ns-api(\/v2)?$/, "");
  return {
    base,
    user: NS_API_USER,
    password: NS_API_PASSWORD,
    domain: NS_DEFAULT_DOMAIN,
  };
}

async function nsRuntimeConfig(admin?: ReturnType<typeof supaAdmin>) {
  let configData: Record<string, string> = {};
  let secretData: Record<string, string> = {};
  try {
    const db = admin ?? supaAdmin();
    const [{ data: cfg }, { data: secrets }] = await Promise.all([
      db.from("planipret_integration_config").select("config_data").eq("integration_key", "ns_api").maybeSingle(),
      db.from("planipret_integration_secrets").select("provider, config").in("provider", ["nsapi", "ns_api"]).limit(2),
    ]);
    configData = (cfg?.config_data ?? {}) as Record<string, string>;
    secretData = (((secrets ?? [])[0] as any)?.config ?? {}) as Record<string, string>;
  } catch { /* env fallback */ }
  const env = nsEnv();
  const rawBase = (configData.base_url ?? secretData.base_url ?? env.base).replace(/\/$/, "").replace(/\/ns-api(\/v2)?$/, "");
  const apiKey = configData.api_key ?? secretData.api_key ?? Deno.env.get("NS_API_KEY") ?? "";
  if (!apiKey) throw new Error("NS_API_KEY not configured");
  return {
    base: rawBase,
    domain: configData.domain ?? configData.default_domain ?? secretData.domain ?? secretData.default_domain ?? env.domain,
    apiKey,
  };
}

export function supaAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function authBroker(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const avaSessionHeaders = [
    req.headers.get("x-ava-session"),
    req.headers.get("X-Ava-Session"),
    req.headers.get("x-ava-session-fallback"),
    req.headers.get("X-Ava-Session-Fallback"),
  ].filter((v): v is string => !!v && !!v.trim());
  const admin = supaAdmin();
  let userId: string | null = null;

  const isConcreteAvaSession = (value: string) => {
    const v = value.trim();
    return !!v && !v.includes("{{") && !v.includes("}}") && v.split(".").length === 2;
  };

  // Preferred path: signed AVA session token (voice agent webhook path).
  for (const header of avaSessionHeaders) {
    if (!isConcreteAvaSession(header)) continue;
    try {
      const { verifyAvaSession } = await import("./ava-session.ts");
      const v = await verifyAvaSession(header.trim());
      if (v?.uid) { userId = v.uid; break; }
    } catch (_) { /* try next header / fall through to JWT */ }
  }

  // Fallback: Supabase user JWT (mobile/web app path).
  if (!userId) {
    if (!authHeader?.startsWith("Bearer ")) {
      return { error: jsonResponse({ success: false, error: "Unauthorized", code: 401 }, 401) };
    }
    const bearer = authHeader.replace("Bearer ", "");
    if (bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const body = await req.clone().json().catch(() => ({}));
      const bodyUserId = body?._user_id ?? body?.user_id ?? body?.broker_user_id;
      if (bodyUserId) userId = String(bodyUserId);
    }
  }

  if (!userId) {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims?.sub) {
      return { error: jsonResponse({ success: false, error: "Unauthorized", code: 401 }, 401) };
    }
    userId = claims.claims.sub as string;
  }

  const { data: isMember } = await admin.rpc("is_planipret_member", { _user_id: userId });
  if (isMember !== true) {
    return { error: jsonResponse({ success: false, error: "Accès non autorisé", code: 403 }, 403) };
  }
  const { data: profile } = await admin
    .from("planipret_profiles")
    .select("id, extension, ns_extension, ns_domain, role, ns_jwt, ns_refresh_token, ns_jwt_expires_at, organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile || profile.organization_id !== AVA_ORG_ID) {
    return { error: jsonResponse({ success: false, error: "Profil introuvable", code: 404 }, 404) };
  }
  profile.extension = profile.extension || profile.ns_extension;
  return { admin, userId, profile };
}

export async function requirePlanipretAdmin(req: Request) {
  const res = await authBroker(req);
  if ("error" in res) return res;
  if ((res as any).profile.role !== "admin") {
    return { error: jsonResponse({ success: false, error: "Accès refusé", code: 403 }, 403) };
  }
  return res;
}

// OAuth2 flows removed — NS-API v2 uses a static Bearer key (NS_API_KEY).
// Kept as stubs so any legacy caller falls back to the static key.
export async function obtainBrokerJwt(_extension: string): Promise<{ token: string; refresh: string | null; expiresIn: number }> {
  const staticKey = (await nsRuntimeConfig()).apiKey;
  return { token: staticKey, refresh: null, expiresIn: 3600 };
}

export async function refreshBrokerJwt(_refreshToken: string): Promise<{ token: string; refresh: string | null; expiresIn: number }> {
  return obtainBrokerJwt("");
}

export async function ensureBrokerJwt(
  _admin: ReturnType<typeof supaAdmin>,
  _profile: { id: string; extension: string; ns_jwt: string | null; ns_refresh_token: string | null; ns_jwt_expires_at: string | null },
): Promise<string> {
  return (await nsRuntimeConfig(_admin)).apiKey;
}

export async function nsBrokerFetch(
  admin: ReturnType<typeof supaAdmin>,
  profile: any,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const env = await nsRuntimeConfig(admin);
  const url = path.startsWith("http") ? path : `${env.base}/ns-api/v2${path.startsWith("/") ? path : `/${path}`}`;
  let token = await ensureBrokerJwt(admin, profile);
  const doFetch = (t: string) =>
    fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`,
        ...(init.headers ?? {}),
      },
    });
  let res = await doFetch(token);
  if (res.status === 401) {
    profile.ns_jwt = null;
    profile.ns_jwt_expires_at = null;
    token = await ensureBrokerJwt(admin, profile);
    res = await doFetch(token);
  }
  return res;
}

export function nsPath(domain: string, extension: string, sub = "") {
  return `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(extension)}${sub}`;
}

/** Insert one row in planipret_audit_log. Never throws. */
export async function logAudit(
  admin: ReturnType<typeof supaAdmin>,
  req: Request,
  entry: {
    user_id?: string | null;
    admin_id?: string | null;
    action: string;
    resource_type?: string | null;
    resource_id?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? req.headers.get("cf-connecting-ip") ?? null;
    const ua = req.headers.get("user-agent") ?? null;
    await admin.from("planipret_audit_log").insert({
      user_id: entry.user_id ?? null,
      admin_id: entry.admin_id ?? null,
      action: entry.action,
      resource_type: entry.resource_type ?? null,
      resource_id: entry.resource_id ?? null,
      ip_address: ip,
      user_agent: ua,
      metadata: entry.metadata ?? {},
    });
  } catch (_e) { /* swallow */ }
}
