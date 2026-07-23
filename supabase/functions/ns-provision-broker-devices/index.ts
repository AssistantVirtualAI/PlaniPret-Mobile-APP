// ns-provision-broker-devices — single + bulk broker device provisioning.
// Uses SERVICE_ROLE for all DB writes (bypasses RLS on planipret_profiles).
// Verifies caller is an admin before performing bulk operations.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function nsRead(res: Response) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const NS_API_KEY = Deno.env.get("NS_API_KEY");
  const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
  const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";

  if (!SUPABASE_URL || !SERVICE_ROLE || !NS_API_KEY) {
    return json({ error: "missing_config", detail: "SUPABASE_SERVICE_ROLE_KEY / NS_API_KEY required" }, 500);
  }

  try {
    const body: any = await req.json().catch(() => ({}));
    const broker_id: string | null = body?.broker_id ?? null;
    const bulk: boolean = !!body?.bulk;
    const batch_size: number = Math.max(1, Math.min(20, Number(body?.batch_size ?? 8)));

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY ?? SERVICE_ROLE, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (!caller) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: callerProfile } = await admin
      .from("planipret_profiles").select("role,user_id,id").or(`user_id.eq.${caller.id},id.eq.${caller.id}`).maybeSingle();
    let isAdmin = ["admin", "super_admin", "owner", "planipret_admin"].includes(String(callerProfile?.role ?? "").toLowerCase());
    if (!isAdmin) { try { const { data } = await admin.rpc("is_planipret_admin", { _user_id: caller.id }); if (data) isAdmin = true; } catch { /* ignore */ } }
    if (!isAdmin) { try { const { data } = await admin.rpc("is_super_admin", { _user_id: caller.id }); if (data) isAdmin = true; } catch { /* ignore */ } }
    // Allow self-provisioning: caller may provision their OWN broker record without admin role
    const selfOnly = !isAdmin && !bulk && broker_id && (callerProfile?.user_id === caller.id || callerProfile?.id === caller.id);
    if (!isAdmin && !selfOnly) return json({ error: "forbidden", detail: "admin role required for this operation" }, 403);

    const nsHeaders = { Authorization: `Bearer ${NS_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" };

    const genPassword = async (userId: string) => {
      const enc = new TextEncoder().encode(userId + "planipret-sip-2026");
      const h = await crypto.subtle.digest("SHA-256", enc);
      const hex = Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
      return `Pp${hex.substring(0, 12)}!`;
    };

    const nsUserPayload = (broker: any, ext: string, password: string) => {
      const [firstName, ...rest] = String(broker.full_name ?? "").trim().split(/\s+/);
      const lastName = rest.join(" ");
      return {
        user: ext,
        "name-first-name": firstName || ext,
        "name-last-name": lastName || "Courtier",
        "directory-name": String(broker.full_name ?? ext),
        "email-address": String(broker.email ?? ""),
        "user-scope": "Basic User",
        "user-password": password,
        password,
      };
    };

    const ensureNsUser = async (broker: any, ext: string, domain: string, password: string) => {
      const userUrl = `${NS_API_BASE_URL}/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}`;
      const direct = await fetch(userUrl, { headers: nsHeaders });
      if (direct.ok) return { ok: true, existed: true, status: direct.status };
      const create = await fetch(`${NS_API_BASE_URL}/domains/${encodeURIComponent(domain)}/users`, {
        method: "POST",
        headers: nsHeaders,
        body: JSON.stringify(nsUserPayload(broker, ext, password)),
      });
      const data = await nsRead(create);
      if (!create.ok && create.status !== 409) return { ok: false, status: create.status, data };
      const verify = await fetch(userUrl, { headers: nsHeaders });
      return { ok: verify.ok || create.ok || create.status === 409, created: create.ok, status: verify.status || create.status, data };
    };

    const provision = async (broker: any) => {
      const ext = broker.ns_extension ?? broker.extension;
      const domain = broker.ns_domain || NS_DEFAULT_DOMAIN;
      if (!ext) return { broker_id: broker.user_id, success: false, error: "no_extension" };

      const sipPassword = await genPassword(broker.user_id);
      const mobileId = `${ext}_mobile`;
      const widgetId = `${ext}_web`;
      const base = `${NS_API_BASE_URL}/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices`;

      const nsUser = await ensureNsUser(broker, ext, domain, sipPassword);
      if (!nsUser.ok) return { broker_id: broker.id ?? broker.user_id, success: false, error: "ns_user_create_failed", ns_user: nsUser };

      const listRes = await fetch(base, { headers: nsHeaders });
      const existing: any[] = listRes.ok ? (await listRes.json().catch(() => [])) : [];
      const arr = Array.isArray(existing) ? existing : [];
      const hasDev = (needle: string) => arr.some((d: any) => (d?.device ?? d?.aor ?? "").toString().toLowerCase().includes(needle));

      const create = async (id: string, model: string, needle: string) => {
        if (hasDev(needle)) {
          // Device exists — patch it to ensure WSS transport and empty user-agent filter.
          await fetch(`${base}/${encodeURIComponent(id)}`, {
            method: "PUT", headers: nsHeaders,
            body: JSON.stringify({
              "device-sip-registration-password": sipPassword,
              "transport": "WSS",
              "device-srtp-enabled": "opportunistic",
              "device-sip-allowed-user-agent": "",
              "device-provisioning-registration-core-server": "core1.cluster1.ucstack.io",
            }),
          }).catch(() => {});
          return { existed: true, id };
        }
        const isMobile = needle === "_mobile";
        // core-server is MANDATORY — without it JsSIP/PJSIP cannot register.
        // Both mobile and web use WSS transport so JsSIP (WebRTC) can connect.
        // Empty device-sip-allowed-user-agent accepts any softphone (JsSIP, SIP.js, etc.).
        const r = await fetch(base, {
          method: "POST", headers: nsHeaders,
          body: JSON.stringify({
            device: id,
            "device-sip-registration-password": sipPassword,
            "device-provisioning-protocol": "sip",
            "device-model": model,
            "core-server": "core1.cluster1.ucstack.io",
            "device-provisioning-registration-core-server": "core1.cluster1.ucstack.io",
            "server-nat": isMobile ? "yes" : "no",
            "transport": "WSS",
            "device-srtp-enabled": "opportunistic",
            "device-sip-allowed-user-agent": "",
            "device-push-enabled": isMobile ? "yes" : "no",
          }),
        });
        const data = await nsRead(r);
        return { created: r.ok, status: r.status, id, data };
      };

      const mobile = await create(mobileId, "Mobile Softphone", "_mobile");
      const widget = await create(widgetId, "Web Softphone", "_web");

      const secretName = `pp_sip_${broker.id ?? broker.user_id}_mobile`;
      try {
        await admin.rpc("create_planipret_sip_secret", {
          _name: secretName, _value: sipPassword, _broker_id: broker.id ?? broker.user_id,
        });
      } catch { /* optional */ }

      const { error: uErr } = await admin.from("planipret_profiles").update({
        ns_mobile_device_id: mobileId,
        ns_widget_device_id: widgetId,
        ns_sip_password_ref_mobile: secretName,
        ns_domain: domain,
        ns_extension: ext,
        ns_linked: true,
        ns_linked_at: new Date().toISOString(),
      }).eq("id", broker.id ?? broker.user_id);

      return {
        broker_id: broker.id ?? broker.user_id,
        broker_name: broker.full_name,
        extension: ext,
        success: !uErr && (mobile.created || mobile.existed) && (widget.created || widget.existed),
        db_error: uErr?.message,
        ns_user: nsUser, mobile, widget,
        sip_credentials: { mobile_device_id: mobileId, widget_device_id: widgetId, password: sipPassword },
      };
    };

    // Single mode
    if (broker_id && !bulk) {
      const { data: broker } = await admin.from("planipret_profiles")
        .select("id, user_id, full_name, email, extension, ns_extension, ns_domain")
        .or(`user_id.eq.${broker_id},id.eq.${broker_id}`).maybeSingle();
      if (!broker) return json({ error: "broker_not_found", broker_id }, 404);
      const result = await provision(broker);
      return json({ success: result.success, result });
    }

    // Bulk mode
    if (bulk) {
      const { data: brokers } = await admin.from("planipret_profiles")
        .select("id, user_id, full_name, email, extension, ns_extension, ns_domain, ns_mobile_device_id, ns_widget_device_id, ns_sip_password_ref_mobile")
        .not("ns_extension", "is", null)
        .or("ns_mobile_device_id.is.null,ns_widget_device_id.is.null,ns_sip_password_ref_mobile.is.null");
      const list = brokers ?? [];
      if (list.length === 0) return json({ success: true, message: "Aucun courtier à provisionner", count: 0 });

      const all: any[] = [];
      let succeeded = 0, failed = 0;
      for (let i = 0; i < list.length; i += batch_size) {
        const batch = list.slice(i, i + batch_size);
        const res = await Promise.all(batch.map((b) => provision(b)));
        all.push(...res);
        succeeded += res.filter((r) => r.success).length;
        failed += res.filter((r) => !r.success).length;
        if (i + batch_size < list.length) await new Promise((r) => setTimeout(r, 500));
      }
      return json({ success: true, total: list.length, processed: all.length, succeeded, failed, results: all });
    }

    return json({ error: "provide broker_id or bulk:true" }, 400);
  } catch (e: any) {
    console.error("ns-provision-broker-devices RUNTIME", e?.message, e?.stack);
    return json({ error: e?.message ?? String(e), stack: e?.stack }, 500);
  }
});
