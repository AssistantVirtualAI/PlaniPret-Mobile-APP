// pbx-write — unified mutation router for the portal to FusionPBX.
// 1) Verifies caller auth + RBAC (org_admin / super_admin / lemtel_admin)
// 2) Forwards the action to fusionpbx-proxy
// 3) Upserts the Supabase mirror table when applicable
// 4) Writes an audit log entry
//
// Body shape:
// {
//   organizationId: string,         // required
//   clientId?: string,              // optional tenant scope
//   action: string,                 // proxy action, e.g. "create-extension"
//   params: Record<string, any>,    // forwarded to fusionpbx-proxy
//   mirror?: {                       // optional: which local table to upsert
//     table: string,
//     row: Record<string, any>,
//     onConflict?: string,
//   },
//   objectType?: string,            // for pbx_object_owner linkage
//   objectPbxUuid?: string,
// }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function callProxy(action: string, params: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/fusionpbx-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify({ action, ...params }),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* keep text */ }
  return { ok: res.ok, status: res.status, body: json ?? text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const {
      organizationId, clientId, action, params = {},
      mirror, objectType, objectPbxUuid,
    } = body as {
      organizationId?: string; clientId?: string; action?: string;
      params?: Record<string, unknown>;
      mirror?: { table: string; row: Record<string, unknown>; onConflict?: string };
      objectType?: string; objectPbxUuid?: string;
    };

    if (!organizationId || !action) {
      return new Response(JSON.stringify({ error: "organizationId and action are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Identify caller
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // RBAC
    const [{ data: isSuper }, { data: hasOrgAdmin }, { data: isLemtelAdmin }] = await Promise.all([
      admin.rpc("is_super_admin", { _user_id: user.id }),
      admin.rpc("has_role", { _user_id: user.id, _org_id: organizationId, _role: "org_admin" }),
      admin.rpc("is_lemtel_admin", { _user_id: user.id }),
    ]);

    let allowed = !!(isSuper || hasOrgAdmin || isLemtelAdmin);
    if (!allowed && clientId) {
      const { data: clientAllowed } = await admin.rpc("can_manage_pbx_for_client", {
        _user_id: user.id, _client_id: clientId,
      });
      allowed = !!clientAllowed;
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Forward to fusionpbx-proxy
    const proxyResult = await callProxy(action, { ...params, organizationId });
    if (!proxyResult.ok) {
      await admin.from("audit_logs").insert({
        organization_id: organizationId,
        user_id: user.id,
        action: `pbx.${action}.error`,
        resource_type: objectType || "pbx",
        resource_id: objectPbxUuid || null,
        metadata: { params, error: proxyResult.body, status: proxyResult.status },
      });
      return new Response(JSON.stringify({
        ok: false, error: "fusionpbx_error", status: proxyResult.status, detail: proxyResult.body,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Mirror upsert — strict allowlist of mirror targets to prevent
    // arbitrary service-role writes that would bypass RLS.
    const MIRROR_TABLE_ALLOWLIST = new Set<string>([
      "pbx_extensions",
      "pbx_domains",
      "pbx_gateways",
      "pbx_dialplans",
      "pbx_destinations",
      "pbx_conferences",
      "pbx_ivrs",
      "pbx_ivr_options",
      "pbx_ring_groups",
      "pbx_call_queues",
      "pbx_queue_agents",
      "pbx_time_conditions",
      "pbx_feature_codes",
      "pbx_hold_music",
      "pbx_sip_profiles",
      "pbx_devices",
      "pbx_voicemail_settings",
      "pbx_call_forwarding",
      "pbx_call_recording_rules",
    ]);

    let mirrorResult: unknown = null;
    if (mirror?.table) {
      if (!MIRROR_TABLE_ALLOWLIST.has(mirror.table)) {
        return new Response(JSON.stringify({ error: "mirror_table_not_allowed", table: mirror.table }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Strip any attempt to override identity/security columns from the caller payload.
      const FORBIDDEN_KEYS = new Set(["id", "organization_id", "client_id", "user_id", "portal_user_id", "created_by", "owner_id", "role"]);
      const safeRow: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(mirror.row || {})) {
        if (!FORBIDDEN_KEYS.has(k)) safeRow[k] = v;
      }
      const row = { ...safeRow, organization_id: organizationId, last_synced_at: new Date().toISOString() };
      const q = admin.from(mirror.table).upsert(row, mirror.onConflict ? { onConflict: mirror.onConflict } : undefined).select();
      const { data, error } = await q;
      if (error) mirrorResult = { error: error.message };
      else mirrorResult = data;
    }

    // Object ownership link
    if (objectType && objectPbxUuid) {
      await admin.from("pbx_object_owner").upsert({
        organization_id: organizationId,
        client_id: clientId ?? null,
        object_type: objectType,
        object_pbx_uuid: objectPbxUuid,
      }, { onConflict: "object_type,object_pbx_uuid" });
    }

    // Audit
    await admin.from("audit_logs").insert({
      organization_id: organizationId,
      user_id: user.id,
      action: `pbx.${action}`,
      resource_type: objectType || "pbx",
      resource_id: objectPbxUuid || null,
      metadata: { params, clientId: clientId ?? null },
    });

    return new Response(JSON.stringify({
      ok: true, proxy: proxyResult.body, mirror: mirrorResult,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
