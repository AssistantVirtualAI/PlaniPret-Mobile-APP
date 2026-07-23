// Returns SIP credentials for the authenticated softphone user.
// Reads the SIP password from pbx_softphone_users.sip_password (or
// pbx_extensions.raw_data.password as fallback) and returns the fixed
// Lemtel FusionPBX SIP/WSS endpoint.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const te = new TextEncoder();
const td = new TextDecoder();
const b64 = {
  enc: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)),
  dec: (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
};
async function importAesKey(secret: string) {
  const material = await crypto.subtle.digest("SHA-256", te.encode(secret));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encryptSecret(value: string) {
  const secret = Deno.env.get("PBX_SECRETS_KEY") || Deno.env.get("PBX_ENCRYPTION_KEY") || "";
  if (!secret || !value) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importAesKey(secret), te.encode(value)));
  return `aesgcm:${b64.enc(iv)}:${b64.enc(cipher)}`;
}
async function decryptSecret(value?: string | null) {
  if (!value?.startsWith("aesgcm:")) return value || "";
  const secret = Deno.env.get("PBX_SECRETS_KEY") || Deno.env.get("PBX_ENCRYPTION_KEY") || "";
  if (!secret) return "";
  const [, ivB64, cipherB64] = value.split(":");
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64.dec(ivB64) }, await importAesKey(secret), b64.dec(cipherB64));
    return td.decode(plain);
  } catch (_e) {
    return "";
  }
}
async function safeAudit(client: any, row: Record<string, unknown>) {
  try { await client.from("audit_logs").insert(row); } catch { /* non-fatal */ }
}

async function repairVertoRoutingForMobile(opts: {
  supabaseUrl: string;
  serviceRoleKey: string;
  organizationId: string;
  domainUuid?: string | null;
  extension: string;
}) {
  try {
    const res = await fetch(`${opts.supabaseUrl}/functions/v1/fusionpbx-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: opts.serviceRoleKey,
        Authorization: `Bearer ${opts.serviceRoleKey}`,
      },
      body: JSON.stringify({
        action: "repair-verto-extension-routing",
        organization_id: opts.organizationId,
        params: {
          domain_uuid: opts.domainUuid || undefined,
          extension: opts.extension,
        },
      }),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok && data?.ok !== false, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error)?.message || String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const reqId = crypto.randomUUID().slice(0, 8);
  const log = (...args: unknown[]) => console.log(`[softphone-credentials ${reqId}]`, ...args);
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error(`[softphone-credentials ${reqId}] missing env`, {
        hasUrl: !!SUPABASE_URL,
        hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY,
      });
      return json({
        error: "MISSING_ENV",
        message: "Server misconfigured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
        details: { hasUrl: !!SUPABASE_URL, hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY },
      }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      log("missing Authorization header");
      return json({ error: "unauthorized" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    // Admin client without auth header for sensitive reads (bypasses RLS).
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const user = userData?.user;
    if (userErr) log("auth.getUser error", userErr.message);
    if (!user) {
      log("no authenticated user");
      return json({ error: "unauthorized" }, 401);
    }
    log("authenticated user", { id: user.id, email: user.email });

    const url = new URL(req.url);
    let requestedPlatform = (url.searchParams.get("platform") || req.headers.get("x-ava-platform") || "app").toLowerCase();
    if (req.method !== "GET") {
      const body = await req.clone().json().catch(() => ({}));
      requestedPlatform = String((body as any)?.platform || requestedPlatform).toLowerCase();
    }
    const platform = ["desktop", "mobile"].includes(requestedPlatform) ? requestedPlatform : "app";

    // Retry the lookup — PostgREST occasionally returns transient
    // "schema cache" errors during DB restarts which must NOT be treated as
    // "no softphone account" (that would wrongly tell the user to contact admin).
    let sp: any = null;
    let spErr: any = null;
    let lastErrIsTransient = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await supabaseAdmin
        .from("pbx_softphone_users")
        .select("extension, organization_id, extension_id, display_name, sip_password, sip_domain, wss_url, app_access_enabled, desktop_access_enabled, mobile_access_enabled")
        .eq("portal_user_id", user.id)
        .maybeSingle();
      sp = res.data;
      spErr = res.error;
      if (sp) { spErr = null; break; }
      const msg = String(spErr?.message || "").toLowerCase();
      lastErrIsTransient = /schema cache|timeout|temporar|connection|shutting down|try again|fetch failed/.test(msg);
      if (spErr && !lastErrIsTransient) break;
      if (!spErr) break; // no row, no error → genuinely missing
      log(`lookup retry ${attempt + 1} after transient error`, spErr.message);
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
    if (spErr) log("lookup by portal_user_id error", spErr.message);
    log("lookup by portal_user_id", { found: !!sp, extension: sp?.extension });

    // SECURITY: removed extension-300 fallback that leaked SIP credentials to unrelated users.

    if (!sp) {
      if (spErr && lastErrIsTransient) {
        log("transient DB error, asking client to retry");
        return json({
          error: "DB_UNAVAILABLE",
          message: "Database is temporarily unavailable. Please retry in a moment.",
          retryable: true,
        }, 503);
      }
      log("NO_SOFTPHONE_ACCOUNT");
      return json({ error: "NO_SOFTPHONE_ACCOUNT", message: "Contact your administrator to enable softphone" }, 404);
    }

    const platformAllowed = sp.app_access_enabled !== false
      && (platform !== "desktop" || sp.desktop_access_enabled !== false)
      && (platform !== "mobile" || sp.mobile_access_enabled !== false);
    if (!platformAllowed) {
      log("SOFTPHONE_ACCESS_DISABLED", { platform, extension: sp.extension });
      return json({
        error: "SOFTPHONE_ACCESS_DISABLED",
        platform,
        message: "Your administrator has disabled access to this app on this platform.",
      }, 403);
    }

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name, domain, fusionpbx_domain_uuid, fusionpbx_domain_name")
      .eq("id", sp.organization_id)
      .maybeSingle();
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", sp.organization_id)
      .maybeSingle();
    const role = roleRow?.role || "agent";
    const admin = role === "org_admin" || role === "super_admin" || role === "manager";

    // Per-domain endpoints. A softphone user can override the SIP/WSS host, otherwise the organization/PBX domain is used.
    const sipDomain = sp.sip_domain || org?.fusionpbx_domain_name || org?.domain || Deno.env.get("FUSIONPBX_SIP_DOMAIN") || "lemtel.lemtel.tel";
    // Known-working WSS endpoints (must be ws:// or wss:// — JsSIP rejects sip://).
    // Mirrors the mobile app configuration: WSS 7443 primary, alternate node fallback.
    const WORKING_PRIMARY = "wss://pbxnode.lemtel.tel:7443";
    const WORKING_FALLBACK = "wss://node.lemtelcloud.net:7443";
    const rawWss = sp.wss_url || Deno.env.get("FUSIONPBX_WSS_URL") || WORKING_PRIMARY;
    // Sanitize: if a legacy sip:// value is stored, drop it and use the known-good primary.
    const wssUrl = /^wss?:\/\//i.test(rawWss) ? rawWss : WORKING_PRIMARY;
    const wssUrls = Array.from(new Set([
      wssUrl,
      WORKING_PRIMARY,
      WORKING_FALLBACK,
    ].filter((u) => u && /^wss?:\/\//i.test(u))));

    let password = "";
    let passwordSource: "encrypted_softphone_user" | "plain_softphone_user" | "extension_password" | "extension_raw_data" | "fusionpbx_proxy" | "none" = "none";
    const rawSipPwd: string | null = sp.sip_password || null;
    if (rawSipPwd) {
      const decrypted = await decryptSecret(rawSipPwd);
      if (decrypted) {
        password = decrypted;
        passwordSource = rawSipPwd.startsWith("aesgcm:") ? "encrypted_softphone_user" : "plain_softphone_user";
      }
    }
    const { data: ext } = await supabaseAdmin
      .from("pbx_extensions")
      .select("id, password, raw_data")
      .eq("organization_id", sp.organization_id)
      .eq("extension", sp.extension)
      .maybeSingle();
    const extPwd = (ext as any)?.password || (ext?.raw_data as any)?.password || (ext?.raw_data as any)?.sip_password || "";
    if (!password && extPwd) {
      password = extPwd;
      passwordSource = (ext as any)?.password ? "extension_password" : "extension_raw_data";
    }

    // Fallback: ask FusionPBX directly via proxy, then persist for next time.
    if (!password) {
      try {
        const { data: fp } = await supabase.functions.invoke("fusionpbx-proxy", {
          body: { action: "get-extension", extension: sp.extension },
        });
        const fpExtension = (fp as any)?.extension || (fp as any)?.extensions?.[0] || (fp as any)?.data?.extensions?.[0] || (Array.isArray(fp) ? (fp as any)[0] : null);
        const fpPwd = fpExtension?.password
          || fpExtension?.sip_password
          || (fp as any)?.password
          || (fp as any)?.data?.password
          || "";
        if (fpPwd) {
          password = fpPwd;
          passwordSource = "fusionpbx_proxy";
          await supabaseAdmin
            .from("pbx_softphone_users")
            .update({ sip_password: fpPwd })
            .eq("portal_user_id", user.id);
        }
      } catch (_e) { /* non-fatal */ }
    }

    if (!password) {
      return json({
        error: "NO_SIP_PASSWORD",
        message: "Your extension is missing a SIP password. Contact your administrator or open the portal to configure it.",
      }, 424);
    }


    let vertoRoutingRepair: any = null;
    if (platform === "mobile") {
      vertoRoutingRepair = await repairVertoRoutingForMobile({
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        organizationId: sp.organization_id,
        domainUuid: org?.fusionpbx_domain_uuid,
        extension: sp.extension,
      });
      log("verto routing repair", {
        extension: sp.extension,
        ok: vertoRoutingRepair?.ok,
        status: vertoRoutingRepair?.status,
        already_had_verto: vertoRoutingRepair?.data?.previous_dial_string_has_verto,
      });
    }

    await safeAudit(supabaseAdmin, {
      organization_id: sp.organization_id,
      user_id: user.id,
      action: "softphone_credentials_accessed",
      resource_type: "pbx_softphone",
      metadata: { extension: sp.extension, credential_source: (sp as any).sip_password_encrypted ? "encrypted" : "legacy" },
    });

    return json({
      // SIP
      extension: sp.extension,
      display_name: sp.display_name || sp.extension,
      displayName: sp.display_name || sp.extension,
      sip_domain: sipDomain,
      sipDomain,
      wss_url: wssUrl,
      wssUrl,
      wss_urls: wssUrls,
      wssUrls,
      sip_password: password,
      password,
      password_source: passwordSource,
      passwordSource,
      sip_uri: `sip:${sp.extension}@${sipDomain}`,
      sipUri: `sip:${sp.extension}@${sipDomain}`,
      auth_username: sp.extension,
      authUsername: sp.extension,
      // App config
      platform,
      app_access_enabled: sp.app_access_enabled !== false,
      desktop_access_enabled: sp.desktop_access_enabled !== false,
      mobile_access_enabled: sp.mobile_access_enabled !== false,
      portal_url: Deno.env.get("AVA_PORTAL_URL") || "https://avastatistic.ca",
      organization_id: sp.organization_id,
      organization_name: org?.name || undefined,
      fusionpbx_domain_uuid: org?.fusionpbx_domain_uuid || undefined,
      role,
      data_scope: admin ? "domain_admin" : "extension_user",
      permissions: { admin, can_manage_numbers: admin, can_manage_agents: admin, can_manage_users: role === "org_admin" || role === "super_admin", can_manage_routing: admin, can_view_domain_reports: admin },
      // User
      email: user.email,
      user_id: user.id,
      // Flags
      can_record: true,
      can_sms: true,
      can_ai: true,
      verto_routing_repair: vertoRoutingRepair ? {
        ok: !!vertoRoutingRepair.ok,
        status: vertoRoutingRepair.status,
        dial_string_has_verto: vertoRoutingRepair.data?.dial_string_has_verto === true,
      } : undefined,
      mock: false,
    });
  } catch (err) {
    console.error("softphone-credentials error", err);
    return json({ error: String(err) }, 500);
  }
});
