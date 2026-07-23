// Phase 5 — softphone audit logger.
// Whitelisted client-side audit events are written to public.audit_logs
// with the caller's organization_id resolved server-side.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ACTIONS: Record<string, string> = {
  "recording.played": "pbx_call_record",
  "recording.downloaded": "pbx_call_record",
  "voicemail.played": "pbx_voicemail",
  "voicemail.downloaded": "pbx_voicemail",
  "voicemail.deleted": "pbx_voicemail",
  "sms.sent": "pbx_sms_thread",
  "call.originated": "pbx_extension",
  "call.transferred": "pbx_call_record",
  "softphone.signed_in": "pbx_softphone_user",
  "softphone.signed_out": "pbx_softphone_user",
  // PBX admin create-flow audit events. Resource_type is generic; per-event
  // detail (extension/ivr/queue + identifier + remote_id + idempotency_key)
  // lives in metadata.
  "pbx.create_denied_non_admin": "pbx_create_flow",
  "pbx.create_duplicate_detected": "pbx_create_flow",
  "pbx.create_conflict_resolved": "pbx_create_flow",
  "pbx.create_idempotent_replay": "pbx_create_flow",
  "pbx.create_succeeded": "pbx_create_flow",
  // Lemtel tenant access events
  "lemtel.open_tenant_portal": "pbx_domain",
  "lemtel.impersonate_tenant": "organization",
  "lemtel.exit_impersonation": "organization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsRes, error: authErr } = await userClient.auth.getClaims(token);
  if (authErr || !claimsRes?.claims?.sub) return json({ error: "unauthorized" }, 401);
  const userId = claimsRes.claims.sub as string;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const action = String(body?.action || "");
  const resourceType = ALLOWED_ACTIONS[action];
  if (!resourceType) return json({ error: "action_not_allowed", action }, 400);

  const resourceId = body?.resource_id ? String(body.resource_id) : null;
  const metadata = (body?.metadata && typeof body.metadata === "object") ? body.metadata : {};

  const admin = createClient(supabaseUrl, serviceKey);

  // Resolve organization: prefer the user's softphone org, else first org membership.
  let orgId: string | null = null;
  const { data: spu } = await admin
    .from("pbx_softphone_users")
    .select("organization_id")
    .eq("portal_user_id", userId)
    .limit(1)
    .maybeSingle();
  if (spu?.organization_id) orgId = spu.organization_id as string;
  if (!orgId) {
    const { data: om } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (om?.organization_id) orgId = om.organization_id as string;
  }
  if (!orgId) return json({ error: "no_organization" }, 400);

  const ua = req.headers.get("user-agent") || null;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip") || null;

  const { error: insErr } = await admin.from("audit_logs").insert({
    organization_id: orgId,
    user_id: userId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    metadata: { ...metadata, ua, ip, source: "softphone" },
  });
  if (insErr) {
    console.error("audit insert failed", insErr);
    return json({ error: "insert_failed" }, 500);
  }
  return json({ ok: true });
});
