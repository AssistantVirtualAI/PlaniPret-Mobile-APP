// Phase 7 — PBX drift detector
// Compares row counts between Supabase mirror tables (pbx_*) and FusionPBX REST,
// returning per-entity drift counts. Admin-only. Persists last run summary in pbx_sync_jobs.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const LEMTEL_ORG = "71755d33-ed64-4ad5-a828-61c9d2029eb7";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Entity = {
  key: string;
  table: string;
  action: string;
  itemsKey?: string;
};

const ENTITIES: Entity[] = [
  { key: "extensions",   table: "pbx_extensions",   action: "list-extensions" },
  { key: "devices",      table: "pbx_devices",      action: "list-devices" },
  { key: "ivrs",         table: "pbx_ivrs",         action: "list-ivrs" },
  { key: "queues",       table: "pbx_call_queues",  action: "list-queues" },
  { key: "ring_groups",  table: "pbx_ring_groups",  action: "list-ring-groups" },
  { key: "gateways",     table: "pbx_gateways",     action: "list-gateways" },
  { key: "sip_profiles", table: "pbx_sip_profiles", action: "list-sip-profiles" },
  { key: "conferences",  table: "pbx_conferences",  action: "list-conferences" },
  { key: "dialplans",    table: "pbx_dialplans",    action: "list-dialplans" },
  { key: "time_conditions", table: "pbx_time_conditions", action: "list-time-conditions" },
];

async function callProxy(action: string, organization_id: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/fusionpbx-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify({ action, organization_id }),
  });
  if (!res.ok) throw new Error(`proxy ${action} ${res.status}`);
  return res.json().catch(() => ({}));
}

function countItems(payload: any): number {
  if (!payload) return 0;
  if (Array.isArray(payload)) return payload.length;
  if (Array.isArray(payload.items)) return payload.items.length;
  if (Array.isArray(payload.data)) return payload.data.length;
  if (typeof payload.count === "number") return payload.count;
  return 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const orgId: string = body.organizationId || body.organization_id || LEMTEL_ORG;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const isService = token === SERVICE_ROLE;
    if (!isService) {
      if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: user.id });
      let allowed = !!isSuper;
      if (!allowed) {
        const { data: a } = await admin.rpc("has_role", { _user_id: user.id, _org_id: orgId, _role: "org_admin" });
        allowed = !!a;
      }
      if (!allowed) {
        const { data: lem } = await admin.rpc("is_lemtel_admin", { _user_id: user.id });
        allowed = !!lem;
      }
      if (!allowed) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: job } = await admin
      .from("pbx_sync_jobs")
      .insert({ organization_id: orgId, kind: "drift-detect", status: "running" })
      .select("id")
      .single();

    const results: any[] = [];
    let totalDrift = 0;
    let entitiesWithDrift = 0;
    let errors = 0;

    for (const e of ENTITIES) {
      let mirror = 0, remote = 0, error: string | null = null;
      try {
        const { count } = await admin.from(e.table).select("*", { count: "exact", head: true }).eq("organization_id", orgId);
        mirror = count ?? 0;
      } catch (err) { error = `mirror: ${(err as Error).message}`; errors++; }
      try {
        const payload = await callProxy(e.action, orgId);
        remote = countItems(payload);
      } catch (err) { error = `remote: ${(err as Error).message}`; errors++; }

      const drift = Math.abs(mirror - remote);
      if (drift > 0) { totalDrift += drift; entitiesWithDrift++; }
      results.push({ entity: e.key, table: e.table, mirror, remote, drift, error });
    }

    const stats = { total_drift: totalDrift, entities_with_drift: entitiesWithDrift, errors };
    await admin.from("pbx_sync_jobs").update({
      status: errors > 0 ? "error" : "success",
      finished_at: new Date().toISOString(),
      stats,
      error: errors > 0 ? `${errors} entities failed` : null,
    }).eq("id", job?.id);

    return new Response(JSON.stringify({ ok: true, organization_id: orgId, checked_at: new Date().toISOString(), summary: stats, entities: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
