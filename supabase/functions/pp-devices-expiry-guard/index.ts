// pp-devices-expiry-guard — audits (and optionally repairs) NetSapiens device
// settings so `device-sip-registration-expiry-seconds` never drifts back to the
// NS default of 60s (which makes the PBX consider mobile softphones unregistered
// between re-REGISTERs and sends inbound calls straight to voicemail).
//
// Modes:
//   { audit_only: true }            -> read-only report (default when cron=false)
//   { fix: true }                   -> PUT the correct settings on drifting devices
//   { limit, offset, extensions }   -> scope the run
//   header x-cron-secret            -> unattended cron run (fix enabled)
//
// Every run is written to planipret_edge_function_runs so the admin portal can
// display synced / skipped / error counters.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mobileDeviceId, webDeviceId, isMobileDeviceId } from "../_shared/pp-device-ids.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const TARGET_EXPIRY = 1800;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const NS_API_KEY = Deno.env.get("NS_API_KEY");
  const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
  const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";
  const CRON_SECRETS = [Deno.env.get("PP_CRON_SECRET"), Deno.env.get("CRON_PBX_SECRET"), Deno.env.get("CRON_SECRET")].filter((v): v is string => !!v);

  if (!SUPABASE_URL || !SERVICE_ROLE || !NS_API_KEY) {
    return json({ error: "missing_config", detail: "SUPABASE_SERVICE_ROLE_KEY / NS_API_KEY required" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const startedAt = new Date().toISOString();

  try {
    const body: any = await req.json().catch(() => ({}));
    const authHeader = req.headers.get("Authorization") ?? "";
    const cronHeader = req.headers.get("x-cron-secret") ?? "";
    const isCron = !!cronHeader && CRON_SECRETS.includes(cronHeader);
    const serviceCall = authHeader.includes(SERVICE_ROLE);

    let callerId: string | null = null;
    if (!isCron && !serviceCall) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY ?? SERVICE_ROLE, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      const caller = userData?.user;
      if (!caller) return json({ error: "not_authenticated" }, 401);
      callerId = caller.id;
      let isAdmin = false;
      const { data: prof } = await admin.from("planipret_profiles")
        .select("role,user_id,id").or(`user_id.eq.${caller.id},id.eq.${caller.id}`).maybeSingle();
      isAdmin = ["admin", "super_admin", "owner", "planipret_admin"].includes(String(prof?.role ?? "").toLowerCase());
      if (!isAdmin) { try { const { data } = await admin.rpc("is_planipret_admin", { _user_id: caller.id }); if (data) isAdmin = true; } catch { /* ignore */ } }
      if (!isAdmin) { try { const { data } = await admin.rpc("is_super_admin", { _user_id: caller.id }); if (data) isAdmin = true; } catch { /* ignore */ } }
      if (!isAdmin) return json({ error: "forbidden", detail: "admin role required" }, 403);
    }

    const fix: boolean = isCron ? body?.fix !== false : !!body?.fix;
    const limit = Math.max(1, Math.min(500, Number(body?.limit ?? 500)));
    const offset = Math.max(0, Number(body?.offset ?? 0));
    const extensions: string[] | null = Array.isArray(body?.extensions) && body.extensions.length
      ? body.extensions.map(String)
      : null;

    let q = admin.from("planipret_profiles")
      .select("id, user_id, full_name, ns_extension, ns_domain")
      .not("ns_extension", "is", null)
      .order("ns_extension", { ascending: true })
      .range(offset, offset + limit - 1);
    if (extensions) q = q.in("ns_extension", extensions);
    const { data: brokers, error: qErr } = await q;
    if (qErr) return json({ error: "db_error", detail: qErr.message }, 500);

    const list = brokers ?? [];
    const nsHeaders = {
      Authorization: `Bearer ${NS_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const stats = { checked: 0, compliant: 0, drifted: 0, repaired: 0, repair_failed: 0, missing_device: 0, push_disabled: 0, push_repaired: 0, errors: 0 };
    const details: any[] = [];

    const checkBroker = async (broker: any) => {
      const ext = String(broker.ns_extension);
      const domain = broker.ns_domain || NS_DEFAULT_DOMAIN;
      const base = `${NS_API_BASE_URL}/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices`;
      try {
        const res = await fetch(base, { headers: nsHeaders });
        if (!res.ok) { stats.errors += 1; return { ext, error: `list_${res.status}` }; }
        const arr = await res.json().catch(() => []);
        const devices = Array.isArray(arr) ? arr : [];
        const wanted = [mobileDeviceId(ext), webDeviceId(ext)];
        const out: any = { ext, broker: broker.full_name, devices: [] as any[] };

        for (const id of wanted) {
          const dev = devices.find((d: any) =>
            String(d?.device ?? d?.aor ?? "").replace(/^sip:/i, "").split("@")[0].trim().toLowerCase() === id.toLowerCase());
          if (!dev) { stats.missing_device += 1; out.devices.push({ id, status: "missing" }); continue; }
          stats.checked += 1;
          const isMobile = isMobileDeviceId(id, ext);
          const expiry = Number(
            dev["device-sip-registration-expiry-seconds"] ?? dev["sip-registration-expiry-seconds"] ?? 0,
          );
          const nat = String(dev["device-sip-nat-traversal-enabled"] ?? "");
          const registered = String(dev["device-sip-registration-state"] ?? dev["registration-status"] ?? "");
          const expires = dev["device-sip-registration-expires-datetime"] ?? null;

          // `device-push-enabled` is CRITICAL on mobile devices: when it is "no",
          // NetSapiens never fires the APNs VoIP push, the suspended app is never
          // woken, and the inbound call falls through to voicemail
          // (docs/netsapiens/devices.md). The LIST endpoint does not always return
          // the field, so read it from the device DETAIL endpoint for mobile AORs.
          let push = String(dev["device-push-enabled"] ?? "");
          if (isMobile && push === "") {
            const detail = await fetch(`${base}/${encodeURIComponent(id)}`, { headers: nsHeaders }).catch(() => null);
            if (detail?.ok) {
              const dj = await detail.json().catch(() => null);
              const row = Array.isArray(dj) ? dj[0] : (Array.isArray(dj?.data) ? dj.data[0] : dj);
              push = String(row?.["device-push-enabled"] ?? "");
            }
          }
          const pushOk = isMobile
            ? (push === "" ? true : ["yes", "true", "1", "on"].includes(push.toLowerCase()))
            : true;
          if (isMobile && !pushOk) stats.push_disabled += 1;

          // The device LIST endpoint does not always return the NAT field; only
          // treat it as drift when it is present AND wrong.
          const natOk = nat === "" || nat === "automatic";
          const compliant = expiry === TARGET_EXPIRY && natOk && pushOk;
          if (compliant) {
            stats.compliant += 1;
            out.devices.push({ id, status: "ok", expiry, nat, push: push || null, registered, expires });
            continue;
          }
          stats.drifted += 1;
          const reasons = [
            expiry !== TARGET_EXPIRY ? "expiry" : null,
            !natOk ? "nat" : null,
            !pushOk ? "push_disabled" : null,
          ].filter(Boolean);
          const entry: any = { id, status: "drift", reasons, expiry, nat, push: push || null, registered, expires };
          if (fix) {
            const put = await fetch(`${base}/${encodeURIComponent(id)}`, {
              method: "PUT",
              headers: nsHeaders,
              body: JSON.stringify({
                "device-sip-registration-expiry-seconds": TARGET_EXPIRY,
                "device-sip-nat-traversal-enabled": "automatic",
                "device-push-enabled": isMobile ? "yes" : "no",
              }),
            }).catch(() => null);
            if (put?.ok) {
              stats.repaired += 1;
              entry.status = "repaired";
              if (!pushOk) stats.push_repaired += 1;
            }
            else { stats.repair_failed += 1; entry.status = "repair_failed"; entry.http = put?.status ?? 0; }
          }
          out.devices.push(entry);
        }

        return out;
      } catch (e: any) {
        stats.errors += 1;
        return { ext, error: e?.message ?? String(e) };
      }
    };

    for (let i = 0; i < list.length; i += 8) {
      const batch = list.slice(i, i + 8);
      details.push(...(await Promise.all(batch.map(checkBroker))));
      if (i + 8 < list.length) await new Promise((r) => setTimeout(r, 250));
    }

    const summary = {
      mode: fix ? "repair" : "audit",
      triggered: isCron ? "cron" : (serviceCall ? "service" : "admin"),
      brokers: list.length,
      target_expiry_seconds: TARGET_EXPIRY,
      ...stats,
    };

    await admin.from("planipret_edge_function_runs").insert({
      function_name: "pp-devices-expiry-guard",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: stats.errors || stats.repair_failed ? "partial" : "ok",
      summary,
      triggered_by: callerId,
    }).then(() => {}, () => {});

    return json({ success: true, ...summary, details: body?.include_details === false ? undefined : details });
  } catch (e: any) {
    await admin.from("planipret_edge_function_runs").insert({
      function_name: "pp-devices-expiry-guard",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "error",
      error: e?.message ?? String(e),
      summary: {},
    }).then(() => {}, () => {});
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
