// pp-sync-answering-rules
//
// Applies the standard Planiprêt answering-rule configuration to every broker
// that has a NetSapiens extension. Mirrors the setup of extension 113:
//
//   Answering Rule (Default, Active):
//     Simultaneously ring: {ext}_mobile ✅, {ext}x ❌, {ext}_web ❌
//     Ring for: 25 seconds
//     Then: voicemail
//
// Also ensures the {ext}_mobile device has:
//   - transport = WSS
//   - server-nat = yes
//   - device-push-enabled = yes
//   - device-srtp-enabled = opportunistic
//   - device-sip-allowed-user-agent = "" (accept any)
//   - device-provisioning-registration-core-server = core1.cluster1.ucstack.io
//
// Safe to re-run: existing rules are replaced (PUT), not duplicated.
// Requires admin role. Supports single (broker_id) or bulk (bulk:true) mode.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";
const CORE_SERVER = "core1.cluster1.ucstack.io";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const nsHeaders = {
  Authorization: `Bearer ${NS_API_KEY}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

async function nsFetch(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${NS_API_BASE_URL}${path}`, {
    method,
    headers: nsHeaders,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function derivePassword(userId: string): Promise<string> {
  const enc = new TextEncoder().encode(userId + "planipret-sip-2026");
  const h = await crypto.subtle.digest("SHA-256", enc);
  const hex = Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `Pp${hex.substring(0, 12)}!`;
}

// Apply the standard config to one broker extension
async function syncBroker(broker: any): Promise<any> {
  const ext = String(broker.ns_extension ?? broker.extension ?? "").trim();
  const domain = String(broker.ns_domain ?? NS_DEFAULT_DOMAIN).trim();
  if (!ext || !domain) {
    return { broker_id: broker.id, success: false, error: "missing_extension_or_domain" };
  }

  const mobileId = `${ext}_mobile`;
  const sipPassword = await derivePassword(String(broker.user_id ?? broker.id));
  const results: Record<string, any> = {};

  // ── 1. Ensure {ext}_mobile device exists and has correct settings ──────────
  const devBase = `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices`;
  const devList = await nsFetch(devBase);
  const devices: any[] = Array.isArray(devList.data) ? devList.data : [];
  const mobileExists = devices.some((d: any) =>
    String(d?.device ?? d?.aor ?? "").toLowerCase().includes("_mobile")
  );

  const devicePayload = {
    "device-sip-registration-password": sipPassword,
    "transport": "WSS",
    "server-nat": "yes",
    "device-push-enabled": "yes",
    "device-srtp-enabled": "opportunistic",
    "device-sip-allowed-user-agent": "",
    "device-provisioning-registration-core-server": CORE_SERVER,
    "device-model": "Mobile Softphone",
  };

  if (mobileExists) {
    const r = await nsFetch(
      `${devBase}/${encodeURIComponent(mobileId)}`,
      "PUT",
      devicePayload
    );
    results.device = { action: "updated", ok: r.ok, status: r.status };
  } else {
    const r = await nsFetch(devBase, "POST", {
      device: mobileId,
      "device-provisioning-protocol": "sip",
      "core-server": CORE_SERVER,
      ...devicePayload,
    });
    results.device = { action: "created", ok: r.ok, status: r.status };
  }

  // ── 2. Fetch existing answering rules ──────────────────────────────────────
  const rulesPath = `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/answering_rules`;
  const rulesRes = await nsFetch(rulesPath);
  const rules: any[] = Array.isArray(rulesRes.data) ? rulesRes.data : [];

  // Find the Default / first active rule
  const defaultRule = rules.find((r: any) =>
    String(r?.["time-frame"] ?? r?.timeframe ?? "").toLowerCase() === "default" ||
    r?.active === true || r?.active === "yes"
  ) ?? rules[0] ?? null;

  // ── 3. Build the standard answering rule payload ───────────────────────────
  // Simultaneously ring {ext}_mobile only (113x and {ext}_web are disabled).
  // Ring for 25 seconds, then voicemail.
  const rulePayload = {
    "time-frame": "Default",
    "active": "yes",
    "ring-type": "simultaneous",
    "ring-timeout": 25,
    "cfwd-type": "voicemail",
    "cfwd-no-answer-type": "voicemail",
    "cfwd-no-answer-timeout": 25,
    "simultaneous-ring": [
      { "device": mobileId, "enabled": "yes" },
    ],
  };

  if (defaultRule) {
    // Update existing rule
    const ruleId = defaultRule?.["answering-rule-id"] ?? defaultRule?.id ?? "Default";
    const r = await nsFetch(
      `${rulesPath}/${encodeURIComponent(String(ruleId))}`,
      "PUT",
      rulePayload
    );
    results.answering_rule = { action: "updated", rule_id: ruleId, ok: r.ok, status: r.status };
  } else {
    // Create new rule
    const r = await nsFetch(rulesPath, "POST", rulePayload);
    results.answering_rule = { action: "created", ok: r.ok, status: r.status };
  }

  const success = (results.device?.ok ?? false) && (results.answering_rule?.ok ?? false);
  return {
    broker_id: broker.id ?? broker.user_id,
    broker_name: broker.full_name,
    extension: ext,
    domain,
    success,
    results,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!NS_API_KEY) return json({ error: "NS_API_KEY not configured" }, 500);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty ok */ }

  const broker_id: string | null = body?.broker_id ?? null;
  const bulk: boolean = body?.bulk === true;
  const dry_run: boolean = body?.dry_run === true;
  const batch_size: number = Math.min(Number(body?.batch_size ?? 10), 20);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "not_authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Admin gate
  const { data: callerProfile } = await admin
    .from("planipret_profiles").select("role").eq("user_id", user.id).maybeSingle();
  let isAdmin = ["admin", "super_admin", "owner", "planipret_admin"].includes(
    String(callerProfile?.role ?? "").toLowerCase()
  );
  if (!isAdmin) {
    const { data: r1 } = await admin.rpc("is_super_admin", { _user_id: user.id });
    const { data: r2 } = await admin.rpc("is_planipret_admin", { _user_id: user.id });
    isAdmin = !!(r1 || r2);
  }
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  if (dry_run) {
    // Return the list of brokers that would be processed without touching NS-API
    const { data: brokers } = await admin
      .from("planipret_profiles")
      .select("id, user_id, full_name, ns_extension, ns_domain")
      .not("ns_extension", "is", null);
    return json({
      dry_run: true,
      total: (brokers ?? []).length,
      brokers: (brokers ?? []).map((b: any) => ({
        id: b.id,
        name: b.full_name,
        extension: b.ns_extension,
        domain: b.ns_domain ?? NS_DEFAULT_DOMAIN,
      })),
    });
  }

  try {
    // Single mode
    if (broker_id && !bulk) {
      const { data: broker } = await admin
        .from("planipret_profiles")
        .select("id, user_id, full_name, email, extension, ns_extension, ns_domain")
        .or(`user_id.eq.${broker_id},id.eq.${broker_id}`)
        .maybeSingle();
      if (!broker) return json({ error: "broker_not_found", broker_id }, 404);
      const result = await syncBroker(broker);
      return json({ success: result.success, result });
    }

    // Bulk mode — process all brokers with an ns_extension
    if (bulk) {
      const { data: brokers } = await admin
        .from("planipret_profiles")
        .select("id, user_id, full_name, email, extension, ns_extension, ns_domain")
        .not("ns_extension", "is", null);

      const list = brokers ?? [];
      if (list.length === 0) {
        return json({ success: true, message: "Aucun courtier avec une extension NS trouvé", count: 0 });
      }

      const all: any[] = [];
      let succeeded = 0, failed = 0;

      for (let i = 0; i < list.length; i += batch_size) {
        const batch = list.slice(i, i + batch_size);
        const res = await Promise.all(batch.map((b: any) => syncBroker(b)));
        all.push(...res);
        succeeded += res.filter((r) => r.success).length;
        failed += res.filter((r) => !r.success).length;
        // Rate-limit: pause 500ms between batches
        if (i + batch_size < list.length) await new Promise((r) => setTimeout(r, 500));
      }

      return json({
        success: true,
        total: list.length,
        processed: all.length,
        succeeded,
        failed,
        results: all,
      });
    }

    return json({ error: "Provide broker_id or bulk:true" }, 400);
  } catch (e: any) {
    console.error("pp-sync-answering-rules RUNTIME", e?.message, e?.stack);
    return json({ error: e?.message ?? String(e), stack: e?.stack }, 500);
  }
});
