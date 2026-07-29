// pp-maestro-retry — relaunch a failed Maestro sync job from its log entry.
// Body: { log_id: uuid }
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function resolveCallIdFromEndpoint(admin: any, endpoint?: string | null): Promise<string | null> {
  const marker = String(endpoint ?? "").match(/\/calls\/([^/?#]+)\/(?:recording|transcript|ai_summary)|\/calls\/([^/?#]+)/i);
  const raw = marker?.[1] ?? marker?.[2];
  if (!raw) return null;
  const id = decodeURIComponent(raw);
  if (isUuid(id)) {
    const { data } = await admin.from("planipret_phone_calls").select("id").eq("id", id).maybeSingle();
    if (data?.id) return data.id;
  }
  const { data: byMaestro } = await admin.from("planipret_phone_calls").select("id").eq("maestro_call_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (byMaestro?.id) return byMaestro.id;
  const { data: byNs } = await admin.from("planipret_phone_calls").select("id").eq("ns_call_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return byNs?.id ?? null;
}

/** Pick the orchestrator that owns a logged action. */
async function resolveTarget(admin: any, action: string, reqBody: any, endpoint?: string | null): Promise<{ fn: string; body: Record<string, unknown> } | null> {
  const a = (action ?? "").toLowerCase();
  const callId = reqBody?.call_id ?? reqBody?.callId ?? await resolveCallIdFromEndpoint(admin, endpoint);
  const messageId = reqBody?.message_id ?? reqBody?.messageId ?? null;

  if (/(sms|message|texto)/.test(a) && messageId) return { fn: "maestro-sync-message", body: { message_id: messageId, force: true } };
  if (/recording/.test(a) && callId) return { fn: "maestro-sync-call", body: { call_id: callId, force: true } };
  if (callId) return { fn: "maestro-sync-call", body: { call_id: callId, force: true } };
  if (messageId) return { fn: "maestro-sync-message", body: { message_id: messageId, force: true } };
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return j({ error: "unauthorized" }, 401);
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return j({ error: "unauthorized" }, 401);

    const { log_id } = await req.json().catch(() => ({} as any));
    if (!log_id || typeof log_id !== "string") return j({ error: "log_id_required" }, 400);

    const { data: row } = await admin
      .from("planipret_maestro_sync_log")
      .select("id, user_id, action, maestro_endpoint, request_body, response_status, response_body")
      .eq("id", log_id)
      .maybeSingle();
    if (!row) return j({ error: "log_not_found" }, 404);

    const isAdmin = await admin.rpc("is_planipret_admin", { _user_id: u.user.id });
    if (row.user_id && row.user_id !== u.user.id && !isAdmin.data) return j({ error: "forbidden" }, 403);

    const target = await resolveTarget(admin, String(row.action ?? ""), row.request_body ?? {}, row.maestro_endpoint);
    if (!target) return j({ success: false, error: "not_retryable", action: row.action, status: row.response_status, last_response: row.response_body }, 200);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/${target.fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ ...target.body, user_id: row.user_id }),
    });
    const data = await res.json().catch(() => ({}));
    const success = res.ok && (data as any)?.success !== false;
    return j({ success, invoked: target.fn, status: res.status, result: data, error: success ? null : ((data as any)?.error ?? "retry_failed") }, 200);
  } catch (e) {
    console.error("[pp-maestro-retry]", e);
    return j({ error: (e as Error).message }, 500);
  }
});
