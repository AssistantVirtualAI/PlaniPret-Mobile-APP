// Backfill mobile SIP devices on NS-API for every already-linked broker.
//
// Each user gets a dedicated `{ext}_mobile` device separate from the Maestro
// widget device. Safe to re-run: it never touches an existing widget device
// and skips profiles that already have `ns_mobile_device_id` populated.
//
// Requires the caller to be an authenticated admin (super_admin or admin
// role via `has_role`). Returns a summary of what was created.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function nsFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${NS_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${NS_API_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

function randomPassword(len = 22): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < len; i++) s += chars[buf[i] % chars.length];
  return s;
}

function deviceIdOf(d: any): string | null {
  const id = d?.device ?? d?.aor ?? d?.["device-aor"] ?? d?.["aor-user"] ?? null;
  return id ? String(id) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "not_authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Admin gate: check planipret_profiles.role OR user_roles has_role
  const { data: callerProfile } = await admin
    .from("planipret_profiles").select("role").eq("user_id", user.id).maybeSingle();
  let isAdmin = ["admin", "super_admin", "owner"].includes(String(callerProfile?.role ?? "").toLowerCase());
  if (!isAdmin) {
    const { data: r1 } = await admin.rpc("is_super_admin", { _user_id: user.id });
    const { data: r2 } = await admin.rpc("is_planipret_admin", { _user_id: user.id });
    isAdmin = Boolean(r1 || r2);
  }
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const body: any = await req.json().catch(() => ({}));
  const dryRun = Boolean(body?.dry_run);
  const limit = Math.min(Number(body?.limit ?? 500), 2000);

  const { data: profiles, error: pErr } = await admin
    .from("planipret_profiles")
    .select("id,ns_extension,ns_domain,ns_mobile_device_id,ns_sip_password_ref_mobile,ns_linked")
    .not("ns_extension", "is", null)
    .limit(limit);


  if (pErr) return json({ error: "profile_query_failed", detail: pErr.message }, 500);

  const results: any[] = [];
  let created = 0, skipped = 0, errors = 0;

  for (const p of profiles ?? []) {
    const extension = String(p.ns_extension);
    const domain = p.ns_domain || NS_DEFAULT_DOMAIN;
    const targetId = p.ns_mobile_device_id || `${extension}_mobile`;

    // Already tracked → skip.
    if (p.ns_mobile_device_id) {
      skipped++;
      results.push({ broker_id: p.id, extension, device_id: p.ns_mobile_device_id, status: "already_present" });
      continue;
    }

    // Check NS-API for an existing `{ext}_mobile` (e.g. previously created
    // manually) BEFORE creating anything. Never touch other devices.
    const listRes = await nsFetch(
      `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(extension)}/devices`,
    );
    const list: any[] = Array.isArray(listRes.data) ? listRes.data : [];
    let device = list.find((d) => deviceIdOf(d) === targetId) ?? null;
    let password: string | null = null;

    if (dryRun) {
      results.push({ broker_id: p.id, extension, device_id: targetId, status: device ? "would_link_existing" : "would_create" });
      continue;
    }

    if (!device) {
      password = randomPassword(22);
      const createRes = await nsFetch(
        `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(extension)}/devices`,
        {
          method: "POST",
          body: JSON.stringify({
            device: targetId,
            "authentication-key": password,
            "device-provisioning-protocol": "sip",
            "device-model": "Mobile Softphone",
          }),
        },
      );
      if (!createRes.ok) {
        errors++;
        results.push({ broker_id: p.id, extension, device_id: targetId, status: "create_failed", ns_status: createRes.status });
        try {
          await admin.from("planipret_ns_migration_log").insert({
            broker_id: p.id, action: "create_mobile_device", status: "error",
            details: { device_id: targetId, ns_status: createRes.status },
          });
        } catch { /* ignore */ }
        continue;
      }
      created++;
    } else {
      // Device already exists on NS but we don't own its password yet: rotate
      // ONLY this device (`{ext}_mobile`) to a fresh key so we can store it.
      password = randomPassword(22);
      await nsFetch(
        `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(extension)}/devices/${encodeURIComponent(targetId)}`,
        { method: "PUT", body: JSON.stringify({ "authentication-key": password }) },
      );
      created++;
    }

    // Persist in Vault + link on the profile.
    const secretName = `pp_sip_${p.id}_mobile`;
    try {
      await admin.rpc("create_planipret_sip_secret", {
        _name: secretName, _value: password, _broker_id: p.id,
      });
    } catch (e) {
      console.error("vault_store_failed", (e as Error).message);
    }
    await admin.from("planipret_profiles")
      .update({ ns_mobile_device_id: targetId, ns_sip_password_ref_mobile: secretName })
      .eq("id", p.id);

    try {
      await admin.from("planipret_ns_migration_log").insert({
        broker_id: p.id, action: "create_mobile_device", status: "ok",
        details: { device_id: targetId },
      });
    } catch { /* ignore */ }

    results.push({ broker_id: p.id, extension, device_id: targetId, status: device ? "linked_existing" : "created" });
  }

  return json({
    ok: true,
    total: profiles?.length ?? 0,
    created,
    skipped,
    errors,
    dry_run: dryRun,
    results,
  });
});
