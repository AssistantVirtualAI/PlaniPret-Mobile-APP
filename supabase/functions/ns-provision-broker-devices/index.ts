// ns-provision-broker-devices — single + bulk broker device provisioning.
// Uses SERVICE_ROLE for all DB writes (bypasses RLS on planipret_profiles).
// Verifies caller is an admin before performing bulk operations.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  mobileDeviceId,
  webDeviceId,
  legacyDeviceIds,
} from "../_shared/pp-device-ids.ts";

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

// NetSapiens closes idle keep-alive sockets abruptly; Deno surfaces this as
// "connection closed before message completed". Retry transient network errors.
async function nsFetch(url: string, init?: RequestInit, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, { ...init, headers: { ...(init?.headers ?? {}), Connection: "close" } });
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
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
    let broker_id: string | null = body?.broker_id ?? null;
    const bulk: boolean = !!body?.bulk;
    const batch_size: number = Math.max(1, Math.min(20, Number(body?.batch_size ?? 8)));
    /**
     * Transport handling.
     *
     * A NetSapiens Device carries exactly ONE `device-sip-transport-type`, and the
     * runtime client (`ns-resolve-sip-credentials`) already aligns it with the stack
     * that is about to REGISTER (wss for JsSIP, tls for native PJSIP).
     *
     * Provisioning must therefore NOT rewrite the transport of an EXISTING device:
     * an admin "sync devices" run would otherwise flip a live native iOS device back
     * to WSS while PJSIP holds a TLS registration -> inbound calls stop being forked
     * and land in voicemail. Pass `transport: "wss" | "tls"` to force a rewrite.
     */
    const rawTransport = String(body?.transport ?? "").trim().toLowerCase();
    const forcedTransport: "WSS" | "TLS" | "TCP" | null =
      rawTransport === "tls" || rawTransport === "sips" ? "TLS"
        : rawTransport === "tcp" ? "TCP"
        : rawTransport === "wss" || rawTransport === "ws" ? "WSS"
        : null;
    const sipPort = Number(
      body?.sip_port ??
        (forcedTransport === "TLS" ? 5061 : forcedTransport === "TCP" ? 5060 : 9002),
    );
    if (!Number.isInteger(sipPort) || sipPort < 1 || sipPort > 65535) {
      return json({ error: "invalid_sip_port" }, 400);
    }
    // Diagnostic uniquement : le Contact effectif est produit par REGISTER et
    // `device-sip-registration-contact` est read-only dans NS-API v2.
    const requestedContact = String(body?.contact ?? "").trim();
    if (requestedContact.length > 512) return json({ error: "invalid_contact" }, 400);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY ?? SERVICE_ROLE, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (!caller) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const readSipSecret = async (name: string) => {
      const { data } = await admin.rpc("read_planipret_sip_secret", { _name: name });
      const value = String(data ?? "").trim();
      return value && !/^\*+$/.test(value) ? value : null;
    };
    const { data: callerProfile } = await admin
      .from("planipret_profiles").select("role,user_id,id").or(`user_id.eq.${caller.id},id.eq.${caller.id}`).maybeSingle();
    let isAdmin = ["admin", "super_admin", "owner", "planipret_admin"].includes(String(callerProfile?.role ?? "").toLowerCase());
    if (!isAdmin) { try { const { data } = await admin.rpc("is_planipret_admin", { _user_id: caller.id }); if (data) isAdmin = true; } catch { /* ignore */ } }
    if (!isAdmin) { try { const { data } = await admin.rpc("is_super_admin", { _user_id: caller.id }); if (data) isAdmin = true; } catch { /* ignore */ } }
    // Self-provisioning: le client mobile appelle sans broker_id juste après le
    // 200 OK du REGISTER PJSIP pour forcer le transport TLS sur SON device.
    if (!bulk && !broker_id && (callerProfile?.id || callerProfile?.user_id)) {
      broker_id = String(callerProfile?.id ?? callerProfile?.user_id);
    }
    // Allow self-provisioning: caller may provision their OWN broker record without admin role
    const selfOnly = !isAdmin && !bulk && !!broker_id
      && callerProfile?.user_id === caller.id
      && (broker_id === callerProfile.id || broker_id === callerProfile.user_id);
    if (!isAdmin && !selfOnly) return json({ error: "forbidden", detail: "admin role required for this operation" }, 403);

    const nsHeaders = { Authorization: `Bearer ${NS_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" };

    const genPassword = async (userId: string, deviceId: string) => {
      const enc = new TextEncoder().encode(`${userId}:${deviceId}:planipret-sip-2026`);
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
      const direct = await nsFetch(userUrl, { headers: nsHeaders });
      if (direct.ok) return { ok: true, existed: true, status: direct.status };
      const create = await nsFetch(`${NS_API_BASE_URL}/domains/${encodeURIComponent(domain)}/users`, {
        method: "POST",
        headers: nsHeaders,
        body: JSON.stringify(nsUserPayload(broker, ext, password)),
      });
      const data = await nsRead(create);
      if (!create.ok && create.status !== 409) return { ok: false, status: create.status, data };
      const verify = await nsFetch(userUrl, { headers: nsHeaders });
      return { ok: verify.ok || create.ok || create.status === 409, created: create.ok, status: verify.status || create.status, data };
    };

    const provision = async (broker: any) => {
      const ext = broker.extension ?? broker.ns_extension;
      const domain = broker.ns_domain || NS_DEFAULT_DOMAIN;
      if (!ext) return { broker_id: broker.user_id, success: false, error: "no_extension" };

      // Naming convention: <ext>M / <ext>W (no underscore — Snap Mobile and the
      // web widget mangle `_` in the AOR user part). Legacy <ext>_mobile /
      // <ext>_web devices are removed once the new pair exists.
      const mobileId = mobileDeviceId(ext);
      const widgetId = webDeviceId(ext);
      const mobileSecretName = broker.ns_sip_password_ref_mobile || `pp_sip_${broker.id ?? broker.user_id}_mobile`;
      const widgetSecretName = `pp_sip_${broker.id ?? broker.user_id}_widget`;
      const base = `${NS_API_BASE_URL}/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices`;

      const listRes = await nsFetch(base, { headers: nsHeaders });
      const existing: any[] = listRes.ok ? (await listRes.json().catch(() => [])) : [];
      const arr = Array.isArray(existing) ? existing : [];
      const hasDev = (id: string) =>
        arr.some((d: any) => (d?.device ?? d?.aor ?? "").toString().replace(/^sip:/i, "").split("@")[0].trim().toLowerCase() === id.toLowerCase());
      const readableDevicePassword = (id: string) => {
        const row = arr.find((d: any) => (d?.device ?? d?.aor ?? "").toString().replace(/^sip:/i, "").split("@")[0].trim().toLowerCase() === id.toLowerCase());
        const value = String(row?.["device-sip-registration-password"] ?? "").trim();
        return value && !/^\*+$/.test(value) ? value : null;
      };
      const mobileStoredPassword = await readSipSecret(mobileSecretName);
      const widgetStoredPassword = await readSipSecret(widgetSecretName);
      const mobilePassword = readableDevicePassword(mobileId)
        ?? mobileStoredPassword
        ?? (!hasDev(mobileId) ? await genPassword(broker.user_id, mobileId) : null);
      const widgetPassword = readableDevicePassword(widgetId)
        ?? widgetStoredPassword
        ?? (!hasDev(widgetId) ? await genPassword(broker.user_id, widgetId) : null);
      if (!mobilePassword || !widgetPassword) {
        return {
          broker_id: broker.id ?? broker.user_id,
          success: false,
          error: "existing_device_credentials_unavailable",
          devices: {
            mobile: { id: mobileId, credentials_available: !!mobilePassword },
            widget: { id: widgetId, credentials_available: !!widgetPassword },
          },
        };
      }

      const nsUser = await ensureNsUser(broker, ext, domain, mobilePassword);
      if (!nsUser.ok) return { broker_id: broker.id ?? broker.user_id, success: false, error: "ns_user_create_failed", ns_user: nsUser };

      const create = async (id: string, model: string, isMobile: boolean, password: string) => {
        // Le réalignement natif cible exclusivement `<ext>M`; `<ext>W` reste WSS.
        const deviceTransport = isMobile ? forcedTransport : null;
        if (hasDev(id)) {
          // Device exists — repair the expiry/NAT/push profile, but LEAVE the
          // transport alone unless the caller explicitly forced one (see the
          // `forcedTransport` note above): rewriting it under a live native TLS
          // registration silently sends inbound calls to voicemail.
          const patch: Record<string, unknown> = {
            "device-srtp-enabled": "opportunistic",
            "device-sip-allowed-user-agent": "",
            "device-provisioning-registration-core-server": "core1.cluster1.ucstack.io",
            "device-sip-registration-expiry-seconds": 1800,
            "device-sip-nat-traversal-enabled": "automatic",
            "device-push-enabled": isMobile ? "yes" : "no",
          };
          if (deviceTransport) {
            patch["synchronous"] = "yes";
            patch["transport"] = deviceTransport;
            patch["device-sip-transport-type"] = deviceTransport;
            patch["device-provisioning-sip-transport-protocol"] = deviceTransport.toLowerCase();
          }
          const r = await nsFetch(`${base}/${encodeURIComponent(id)}`, {
            method: "PUT", headers: nsHeaders,
            body: JSON.stringify(patch),
          }).catch(() => null);
          let observedContact: string | null = null;
          if (r?.ok && isMobile && deviceTransport === "TLS") {
            const verify = await nsFetch(`${base}/${encodeURIComponent(id)}`, { headers: nsHeaders }).catch(() => null);
            const verified = verify?.ok ? await nsRead(verify) : null;
            observedContact = String(verified?.["device-sip-registration-contact"] ?? "") || null;
          }
          return {
            existed: true, id, patched: !!r?.ok, status: r?.status ?? 0,
            transport: deviceTransport ?? "unchanged", sip_port: isMobile ? sipPort : 9002,
            requested_contact: isMobile ? requestedContact || null : null,
            observed_registration_contact: observedContact,
          };
        }

        // core-server is MANDATORY — without it JsSIP/PJSIP cannot register.
        // Both mobile and web use WSS transport so JsSIP (WebRTC) can connect.
        // Empty device-sip-allowed-user-agent accepts any softphone (JsSIP, SIP.js, etc.).
        const r = await nsFetch(base, {
          method: "POST", headers: nsHeaders,
          body: JSON.stringify({
            device: id,
            "device-sip-registration-password": password,
            "device-provisioning-protocol": "sip",
            "device-model": model,
            "core-server": "core1.cluster1.ucstack.io",
            "device-provisioning-registration-core-server": "core1.cluster1.ucstack.io",
            "server-nat": isMobile ? "yes" : "no",
            // NS-API v2 documented fields (docs.ns-api.com/reference/createdevice):
            // - device-sip-registration-expiry-seconds defaults to 60s: the device is
            //   considered UNREGISTERED after 60s + grace, which is why softphones fell
            //   off between re-REGISTERs and calls went straight to voicemail.
            // - device-sip-nat-traversal-enabled "automatic" is the documented default
            //   for virtually every device (replaces the legacy `server-nat` flag).
            "device-sip-registration-expiry-seconds": 1800,
            "device-sip-nat-traversal-enabled": "automatic",
            // Baseline transport at creation. The runtime resolver realigns it
            // with whichever stack actually registers (wss = JsSIP, tls = PJSIP).
            "synchronous": "yes",
            "transport": deviceTransport ?? "WSS",
            "device-sip-transport-type": deviceTransport ?? "WSS",
            "device-provisioning-sip-transport-protocol": (deviceTransport ?? "WSS").toLowerCase(),
            "device-srtp-enabled": "opportunistic",
            "device-sip-allowed-user-agent": "",
            "device-push-enabled": isMobile ? "yes" : "no",

          }),
        });
        const data = await nsRead(r);
        return { created: r.ok, status: r.status, id, data };
      };

      const mobile = await create(mobileId, "Mobile Softphone", true, mobilePassword);
      const widget = await create(widgetId, "Web Softphone", false, widgetPassword);

      // Rename migration: NS device names are immutable, so once <ext>M/<ext>W
      // exist we delete the legacy <ext>_mobile / <ext>_web AORs. Leaving them
      // registered would keep sim-ring forking to dead contacts.
      const removed_legacy: any[] = [];
      const newPairOk = (mobile.created || mobile.existed) && (widget.created || widget.existed);
      if (newPairOk) {
        for (const legacyId of legacyDeviceIds(ext)) {
          if (!hasDev(legacyId)) continue;
          const del = await nsFetch(`${base}/${encodeURIComponent(legacyId)}`, { method: "DELETE", headers: nsHeaders }).catch(() => null);
          removed_legacy.push({ id: legacyId, deleted: !!del?.ok, status: del?.status ?? 0 });
        }
      }


      try {
        await admin.rpc("create_planipret_sip_secret", {
           _name: mobileSecretName, _value: mobilePassword, _broker_id: broker.id ?? broker.user_id,
        });
        await admin.rpc("create_planipret_sip_secret", {
          _name: widgetSecretName, _value: widgetPassword, _broker_id: broker.id ?? broker.user_id,
        });
      } catch { /* optional */ }

      const { error: uErr } = await admin.from("planipret_profiles").update({
        extension: ext,
        ns_mobile_device_id: mobileId,
        ns_widget_device_id: widgetId,
         ns_sip_password_ref_mobile: mobileSecretName,
        ns_domain: domain,
        ns_extension: ext,
        ns_linked: true,
        ns_linked_at: new Date().toISOString(),
      }).eq("id", broker.id ?? broker.user_id);

      const ok = !uErr && (mobile.created || mobile.existed) && (widget.created || widget.existed);

      // Audit trail so the admin "Provisioning" column shows the real last run.
      await admin.from("planipret_ns_migration_log").insert({
        broker_id: broker.id ?? broker.user_id,
        action: "create_mobile_device",
        status: ok ? "ok" : "error",
        details: {
          extension: ext,
          domain,
          mobile: { id: mobileId, created: !!mobile.created, existed: !!mobile.existed, status: (mobile as any).status ?? null },
          widget: { id: widgetId, created: !!widget.created, existed: !!widget.existed, status: (widget as any).status ?? null },
          removed_legacy,
          db_error: uErr?.message ?? null,
        },
      }).then(() => {}, () => {});

      return {
        broker_id: broker.id ?? broker.user_id,
        broker_name: broker.full_name,
        extension: ext,
        success: ok,
        db_error: uErr?.message,
        ns_user: nsUser, mobile, widget, removed_legacy,
         sip_credentials: { mobile_device_id: mobileId, widget_device_id: widgetId },
      };
    };

    // Single mode
    if (broker_id && !bulk) {
      const { data: broker } = await admin.from("planipret_profiles")
        .select("id, user_id, full_name, email, extension, ns_extension, ns_domain, ns_sip_password_ref_mobile")
        .or(`user_id.eq.${broker_id},id.eq.${broker_id}`).maybeSingle();
      if (!broker) return json({ error: "broker_not_found", broker_id }, 404);
      const result = await provision(broker);
      return json({ success: result.success, result });
    }

    // Bulk mode
    if (bulk) {
      // force:true re-provisions every broker with an extension (repairs devices
      // that exist in the DB but are broken/missing in NetSapiens). Otherwise we
      // only touch brokers that have never been provisioned.
      const force: boolean = !!body?.force;
      // Chunked execution: the platform kills the request at 150s, so we only
      // process brokers while we stay inside the time budget and hand back a
      // `next_offset` the caller loops on.
      const offset: number = Math.max(0, Number(body?.offset ?? 0));
      const maxMs: number = Math.max(5_000, Math.min(110_000, Number(body?.max_ms ?? 90_000)));
      const t0 = Date.now();
      let q = admin.from("planipret_profiles")
        .select("id, user_id, full_name, email, extension, ns_extension, ns_domain, ns_mobile_device_id, ns_widget_device_id, ns_sip_password_ref_mobile")
        .not("ns_extension", "is", null)
        .order("id", { ascending: true });
      if (!force) q = q.or("ns_mobile_device_id.is.null,ns_widget_device_id.is.null,ns_sip_password_ref_mobile.is.null");
      const { data: brokers } = await q;
      const fullList = brokers ?? [];
      const list = fullList.slice(offset);
      if (list.length === 0) {
        return json({
          success: true,
          message: "Aucun courtier à provisionner (tous déjà provisionnés — utilisez force:true pour re-provisionner)",
          count: 0, total: fullList.length, processed: 0, succeeded: 0, failed: 0, forced: force,
          offset, next_offset: null, done: true,
        });
      }


      const startedAt = new Date().toISOString();
      const all: any[] = [];
      let succeeded = 0, failed = 0;
      let consumed = 0;
      for (let i = 0; i < list.length; i += batch_size) {
        const batch = list.slice(i, i + batch_size);
        const res = await Promise.all(batch.map((b) => provision(b).catch((e) => ({ broker_id: b.id ?? b.user_id, success: false, error: String((e as Error)?.message ?? e) }))));
        all.push(...res);
        consumed += batch.length;
        succeeded += res.filter((r) => r.success).length;
        failed += res.filter((r) => !r.success).length;
        if (Date.now() - t0 > maxMs) break;
        if (i + batch_size < list.length) await new Promise((r) => setTimeout(r, 500));
      }
      const nextOffset = offset + consumed < fullList.length ? offset + consumed : null;

      // Detailed device-level counters so the admin portal can show a real report
      // (created / patched / skipped / errors) instead of only succeeded/failed.
      const devStats = { created: 0, patched: 0, skipped: 0, errors: 0 };
      const errorSamples: any[] = [];
      for (const r of all) {
        for (const d of [r.mobile, r.widget]) {
          if (!d) { devStats.errors += 1; continue; }
          if (d.created) devStats.created += 1;
          else if (d.existed && d.patched) devStats.patched += 1;
          else if (d.existed) devStats.skipped += 1;
          else devStats.errors += 1;
        }
        if (!r.success && errorSamples.length < 25) {
          errorSamples.push({ broker_id: r.broker_id, broker_name: r.broker_name, extension: r.extension, error: r.error ?? r.db_error ?? null });
        }
      }

      const summary = {
        forced: force, total: fullList.length, processed: all.length, succeeded, failed,
        offset, next_offset: nextOffset, done: nextOffset === null,
        devices: devStats, errors_sample: errorSamples,
        expiry_seconds: 1800, nat_traversal: "automatic",
      };
      await admin.from("planipret_edge_function_runs").insert({
        function_name: "ns-provision-broker-devices",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: failed === 0 ? "ok" : (succeeded > 0 ? "partial" : "error"),
        summary,
        triggered_by: caller.id,
      }).then(() => {}, () => {});

      return json({ success: true, ...summary, results: all });

    }

    return json({ error: "provide broker_id or bulk:true" }, 400);
  } catch (e: any) {
    console.error("ns-provision-broker-devices RUNTIME", e?.message, e?.stack);
    return json({ error: e?.message ?? String(e), stack: e?.stack }, 500);
  }
});
