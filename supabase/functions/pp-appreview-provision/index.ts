// pp-appreview-provision — creates the demo App Review Supabase user +
// planipret_profiles row + NS-API SIP devices (mobile & widget).
// All admin DB writes go through SERVICE_ROLE to bypass RLS.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const AVA_ORG_ID = "17d6507f-a9ca-409d-8e49-371d50332615";

const pickNsUser = (u: any) => String(u?.user ?? u?.extension ?? u?.subscriber_login ?? u?.user_id ?? u?.id ?? "").trim();

async function nsJson(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function nsUserExists(baseUrl: string, headers: HeadersInit, domain: string, ext: string) {
  const direct = await nsJson(`${baseUrl}/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}`, { headers });
  if (direct.ok && direct.data) return { exists: true, status: direct.status, source: "direct", data: direct.data };

  let offset = 0;
  const limit = 200;
  for (let page = 0; page < 20; page++) {
    const listed = await nsJson(`${baseUrl}/domains/${encodeURIComponent(domain)}/users?limit=${limit}&offset=${offset}`, { headers });
    if (!listed.ok) break;
    const arr = Array.isArray(listed.data) ? listed.data : (listed.data?.users ?? []);
    if (arr.some((u: any) => pickNsUser(u) === ext)) return { exists: true, status: listed.status, source: "list" };
    if (!arr.length || arr.length < limit) break;
    offset += limit;
  }
  return { exists: false, status: direct.status, source: "none", data: direct.data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Read all secrets INSIDE the handler (never at module scope)
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const NS_API_KEY = Deno.env.get("NS_API_KEY");
  const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
  const NS_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";

  console.log("=== pp-appreview-provision ===", {
    SUPABASE_URL: !!SUPABASE_URL, SERVICE_ROLE: !!SERVICE_ROLE, ANON_KEY: !!ANON_KEY,
    NS_API_KEY: !!NS_API_KEY, NS_API_BASE_URL, NS_DOMAIN,
  });

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "missing_service_role", detail: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured" }, 500);
  }

  try {
    // Verify caller is an authenticated admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY ?? SERVICE_ROLE, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (!caller) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: callerProfile } = await admin
      .from("planipret_profiles").select("role,organization_id").or(`user_id.eq.${caller.id},id.eq.${caller.id}`).maybeSingle();
    const callerRole = (callerProfile?.role ?? "").toLowerCase();
    let isAdmin = ["admin", "super_admin", "owner", "planipret_admin"].includes(callerRole);
    if (!isAdmin) {
      try { const { data } = await admin.rpc("is_planipret_admin", { _user_id: caller.id }); if (data) isAdmin = true; } catch { /* ignore */ }
    }
    if (!isAdmin) {
      try { const { data } = await admin.rpc("is_super_admin", { _user_id: caller.id }); if (data) isAdmin = true; } catch { /* ignore */ }
    }
    if (!isAdmin) return json({ error: "forbidden", detail: "admin role required" }, 403);

    const body: any = await req.json().catch(() => ({}));
    const APP_REVIEW_EMAIL = String(body?.email ?? "demo@avastatistic.ca");
    const APP_REVIEW_PASSWORD = String(body?.password ?? "DemoPass2026!");
    const APP_REVIEW_NAME = String(body?.name ?? "Demo Reviewer");
    const APP_REVIEW_EXT = String(body?.extension ?? "1999");
    const APP_REVIEW_DOMAIN = String(body?.domain ?? NS_DOMAIN);

    const results: Record<string, any> = {};
    const organizationId = callerProfile?.organization_id ?? AVA_ORG_ID;

    // STEP A: Supabase auth user (idempotent)
    const { data: existingUsers } = await admin.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u) => u.email?.toLowerCase() === APP_REVIEW_EMAIL.toLowerCase());
    let authUserId: string;

    if (existing) {
      authUserId = existing.id;
      results.auth_user = { existed: true, id: authUserId };
    } else {
      const { data: newUser, error: cErr } = await admin.auth.admin.createUser({
        email: APP_REVIEW_EMAIL,
        password: APP_REVIEW_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: APP_REVIEW_NAME, role: "broker" },
      });
      if (cErr || !newUser?.user) return json({ step: "A", error: "auth_create_failed", detail: cErr?.message }, 500);
      authUserId = newUser.user.id;
      results.auth_user = { created: true, id: authUserId };
    }

    // STEP B: planipret_profiles insert-or-update (no unique constraint on user_id)
    const profilePayload = {
      user_id: authUserId,
      organization_id: organizationId,
      full_name: APP_REVIEW_NAME,
      email: APP_REVIEW_EMAIL,
      role: "broker",
      extension: APP_REVIEW_EXT,
      ns_extension: APP_REVIEW_EXT,
      ns_domain: APP_REVIEW_DOMAIN,
      ns_sip_username: APP_REVIEW_EXT,
      mobile_app_enabled: true,
      voice_agent_enabled: false,
      ns_linked: true,
      ns_linked_at: new Date().toISOString(),
    };
    const { data: existingProfile } = await admin
      .from("planipret_profiles")
      .select("id")
      .eq("user_id", authUserId)
      .maybeSingle();
    let pErr: any = null;
    let profileId = existingProfile?.id ?? null;
    if (existingProfile?.id) {
      ({ error: pErr } = await admin.from("planipret_profiles").update(profilePayload).eq("id", existingProfile.id));
    } else {
      const inserted = await admin.from("planipret_profiles").insert(profilePayload).select("id").maybeSingle();
      pErr = inserted.error;
      profileId = inserted.data?.id ?? null;
    }
    if (pErr) return json({ step: "B", error: "profile_upsert_failed", detail: pErr.message }, 500);
    try {
      await admin.from("user_roles").upsert({
        user_id: authUserId,
        organization_id: organizationId,
        role: "planipret_broker",
      }, { onConflict: "user_id,organization_id" });
    } catch { /* ignore */ }
    results.profile = { upserted: true, user_id: authUserId };

    // STEP C: NS-API devices
    if (NS_API_KEY) {
      const nsHeaders = { Authorization: `Bearer ${NS_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" };
      // Deterministic SIP password
      const enc = new TextEncoder().encode(authUserId + "planipret-demo-2026");
      const hash = await crypto.subtle.digest("SHA-256", enc);
      const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const sipPassword = `Pp${hex.substring(0, 12)}!`;

      // C0: Ensure the NS-API user (extension) exists — never return success until verified in the phone system.
      let userCheck = await nsUserExists(NS_API_BASE_URL, nsHeaders, APP_REVIEW_DOMAIN, APP_REVIEW_EXT);
      if (!userCheck.exists) {
        const createUser = await nsJson(`${NS_API_BASE_URL}/domains/${encodeURIComponent(APP_REVIEW_DOMAIN)}/users?synchronous=yes`, {
          method: "POST",
          headers: nsHeaders,
          body: JSON.stringify({
            user: APP_REVIEW_EXT,
            "name-first-name": "Demo",
            "name-last-name": "Reviewer",
            "directory-name": APP_REVIEW_NAME,
            "email-address": APP_REVIEW_EMAIL,
            "user-scope": "Basic User",
            "time-zone": "America/Montreal",
            "language-token": "en_US",
            "voicemail-enabled": "yes",
            "recording-configuration": "yes-with-transcription-and-sentiment",
            "dial-policy": "US and Canada",
            "user-password": sipPassword,
            password: sipPassword,
          }),
        });
        results.ns_user_create = { ok: createUser.ok, status: createUser.status, data: createUser.data };
        if (!createUser.ok && createUser.status !== 409) {
          return json({ step: "C0", error: "ns_user_create_failed", status: createUser.status, detail: createUser.data }, 500);
        }
        userCheck = await nsUserExists(NS_API_BASE_URL, nsHeaders, APP_REVIEW_DOMAIN, APP_REVIEW_EXT);
      }
      results.ns_user = userCheck;
      if (!userCheck.exists) {
        return json({ step: "C0_VERIFY", error: "ns_user_not_verified", detail: results.ns_user_create ?? userCheck }, 502);
      }

      const listRes = await fetch(`${NS_API_BASE_URL}/domains/${encodeURIComponent(APP_REVIEW_DOMAIN)}/users/${encodeURIComponent(APP_REVIEW_EXT)}/devices`, { headers: nsHeaders });
      const existingDevs = listRes.ok ? (await listRes.json().catch(() => [])) : [];
      const arr = Array.isArray(existingDevs) ? existingDevs : [];

      const createDev = async (suffix: string, model: string) => {
        const id = `${APP_REVIEW_EXT}_${suffix}`;
        const exists = arr.some((d: any) => (d?.device ?? d?.aor ?? "").toString().toLowerCase().includes(suffix));
        if (exists) return { existed: true, id };
        const r = await fetch(`${NS_API_BASE_URL}/domains/${encodeURIComponent(APP_REVIEW_DOMAIN)}/users/${encodeURIComponent(APP_REVIEW_EXT)}/devices`, {
          method: "POST", headers: nsHeaders,
          body: JSON.stringify({ device: id, "authentication-key": sipPassword, "device-provisioning-protocol": "sip", "device-model": model }),
        });
        const data = await r.json().catch(() => ({}));
        return { created: r.ok, status: r.status, id, data };
      };

      results.mobile_device = await createDev("mobile", "Mobile Softphone");
      results.widget_device = await createDev("web", "Web Softphone");
      if (!(results.mobile_device.created || results.mobile_device.existed) || !(results.widget_device.created || results.widget_device.existed)) {
        return json({ step: "C1", error: "ns_device_create_failed", detail: { mobile: results.mobile_device, widget: results.widget_device } }, 502);
      }

      const secretName = profileId ? `pp_sip_${profileId}_mobile` : null;
      if (secretName) {
        try {
          await admin.rpc("create_planipret_sip_secret", { _name: secretName, _value: sipPassword, _broker_id: profileId });
        } catch { /* optional */ }
      }

      await admin.from("planipret_profiles").update({
        ns_mobile_device_id: `${APP_REVIEW_EXT}_mobile`,
        ns_widget_device_id: `${APP_REVIEW_EXT}_web`,
        ...(secretName ? { ns_sip_password_ref_mobile: secretName } : {}),
      }).eq("user_id", authUserId);

      results.sip_credentials = {
        sip_username: APP_REVIEW_EXT,
        sip_domain: APP_REVIEW_DOMAIN,
        sip_password: sipPassword,
      };
    } else {
      return json({ error: "ns_api_key_missing", detail: "Impossible de confirmer la création dans le système téléphonique." }, 500);
    }

    return json({
      success: true,
      auth_user_id: authUserId,
      login: { email: APP_REVIEW_EMAIL, password: APP_REVIEW_PASSWORD, extension: APP_REVIEW_EXT, domain: APP_REVIEW_DOMAIN },
      results,
    });
  } catch (e: any) {
    console.error("RUNTIME ERROR", e?.message, e?.stack);
    return json({ error: e?.message ?? String(e), stack: e?.stack, type: e?.constructor?.name }, 500);
  }
});
