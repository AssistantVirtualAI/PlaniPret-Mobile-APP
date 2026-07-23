// Report per-broker mobile SIP device provisioning state.
// Admin-only. For each planipret_profiles row with ns_extension, returns
// whether {ext}_mobile exists on NS-API, whether we track it, when it was
// provisioned and any last error from planipret_ns_migration_log.

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

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function nsListDevices(domain: string, ext: string) {
  try {
    const res = await fetch(
      `${NS_API_BASE_URL}/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices`,
      { headers: { Authorization: `Bearer ${NS_API_KEY}`, Accept: "application/json" } },
    );
    if (!res.ok) return { ok: false, status: res.status, ids: [] as string[] };
    const data = await res.json().catch(() => []);
    const ids = (Array.isArray(data) ? data : []).map((d: any) =>
      String(d?.device ?? d?.aor ?? d?.["device-aor"] ?? d?.["aor-user"] ?? ""),
    ).filter(Boolean);
    return { ok: true, status: 200, ids };
  } catch (e) {
    return { ok: false, status: 0, ids: [] as string[], error: (e as Error).message };
  }
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
  const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: user.id });
  const { data: isPpAdmin } = await admin.rpc("is_planipret_admin", { _user_id: user.id });
  if (!isSuper && !isPpAdmin) return json({ error: "forbidden" }, 403);

  const body: any = await req.json().catch(() => ({}));
  const syncLocal = !!body?.sync;

  const { data: profiles, error } = await admin
    .from("planipret_profiles")
    .select("id,full_name,email,ns_extension,ns_domain,ns_mobile_device_id,ns_widget_device_id,ns_sip_password_ref_mobile,ns_linked,ns_linked_at")
    .not("ns_extension", "is", null)
    .order("full_name", { ascending: true, nullsFirst: false });
  if (error) return json({ error: "query_failed", detail: error.message }, 500);

  const brokerIds = (profiles ?? []).map((p) => p.id);
  const { data: logs } = brokerIds.length
    ? await admin
        .from("planipret_ns_migration_log")
        .select("broker_id,action,status,details,created_at")
        .in("broker_id", brokerIds)
        .eq("action", "create_mobile_device")
        .order("created_at", { ascending: false })
    : { data: [] as any[] };
  const logsByBroker = new Map<string, any[]>();
  for (const l of logs ?? []) {
    const arr = logsByBroker.get(l.broker_id) ?? [];
    arr.push(l);
    logsByBroker.set(l.broker_id, arr);
  }

  const stats = { total: 0, ok: 0, missing: 0, error: 0, partial: 0 };

  // Parallelize NS-API calls with bounded concurrency to keep the page fast.
  const CONCURRENCY = 12;
  const list = profiles ?? [];
  const rows: any[] = new Array(list.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= list.length) return;
      const p = list[i];
      const ext = String(p.ns_extension);
      const domain = p.ns_domain || NS_DEFAULT_DOMAIN;
      const targetMobile = p.ns_mobile_device_id || `${ext}_mobile`;
      const ns = await nsListDevices(domain, ext);
      const mobileFromNs = ns.ids.find((id) => id === targetMobile || id.toLowerCase().includes("_mobile")) ?? null;
      const widgetTarget = p.ns_widget_device_id || `${ext}_web`;
      const widgetFromNs = ns.ids.find((id) => id === widgetTarget || id.toLowerCase().includes("_web")) ?? null;
      const nsMobileExists = ns.ok && !!mobileFromNs;
      const nsWidgetExists = ns.ok && !!widgetFromNs;
      if (syncLocal && ns.ok && (mobileFromNs || widgetFromNs)) {
        const patch: Record<string, unknown> = { ns_linked: true, ns_linked_at: new Date().toISOString(), ns_domain: domain, ns_extension: ext };
        if (mobileFromNs && p.ns_mobile_device_id !== mobileFromNs) patch.ns_mobile_device_id = mobileFromNs;
        if (widgetFromNs && p.ns_widget_device_id !== widgetFromNs) patch.ns_widget_device_id = widgetFromNs;
        if (Object.keys(patch).length > 4) {
          await admin.from("planipret_profiles").update(patch).eq("id", p.id);
        }
      }
      const brokerLogs = logsByBroker.get(p.id) ?? [];
      const okLog = brokerLogs.find((l) => l.status === "ok");
      const errLog = brokerLogs.find((l) => l.status === "error");
      let state: "ok" | "missing" | "error" | "partial";
      if (nsMobileExists && p.ns_mobile_device_id && p.ns_sip_password_ref_mobile) state = "ok";
      else if (!ns.ok || errLog) state = "error";
      else if (!nsMobileExists) state = "missing";
      else state = "partial";
      rows[i] = {
        broker_id: p.id, full_name: p.full_name, email: p.email,
        ns_extension: ext, ns_domain: domain,
        ns_mobile_device_id: p.ns_mobile_device_id ?? mobileFromNs,
        ns_widget_device_id: p.ns_widget_device_id ?? widgetFromNs,
        target_mobile_id: targetMobile,
        ns_mobile_exists: nsMobileExists,
        ns_widget_exists: nsWidgetExists,
        ns_reachable: ns.ok, ns_status: ns.status,
        has_vault_secret: !!p.ns_sip_password_ref_mobile,
        provisioned_at: okLog?.created_at ?? null,
        last_error: errLog ? { at: errLog.created_at, details: errLog.details } : null,
        state,
      };
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
  for (const r of rows) {
    stats.total++;
    (stats as any)[r.state]++;
  }

  return json({ ok: true, stats, rows });
});
