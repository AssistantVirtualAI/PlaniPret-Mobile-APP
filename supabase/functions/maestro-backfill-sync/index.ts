// POST /functions/v1/maestro-backfill-sync
// Body: { days?: number, limit?: number, user_id?: string, force?: boolean }
// Re-runs maestro-sync-call for recent calls that aren't fully pushed to Maestro.
import { adminClient, corsHeaders, json } from "../_shared/maestro.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Admin-only (or internal service-role call).
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const admin = adminClient();
  if (token !== SERVICE_ROLE) {
    const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: userData, error } = await anon.auth.getUser(token);
    if (error || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: userData.user.id });
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: userData.user.id });
    if (!isAdmin && !isSuper) return json({ error: "Forbidden" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const days = Math.min(Math.max(Number(body?.days ?? 7), 1), 90);
  const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 500);
  const force = !!body?.force;
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  let q = admin
    .from("planipret_phone_calls")
    .select("id, user_id, maestro_synced, metadata, pipeline_state, started_at")
    .gte("started_at", since)
    .gte("duration_seconds", 5)
    .order("started_at", { ascending: false })
    .limit(limit * 3);
  if (body?.user_id) q = q.eq("user_id", body.user_id);

  const { data: rows, error } = await q;
  if (error) return json({ error: "query_failed", details: error.message }, 500);

  const pending = (rows ?? []).filter((r: any) => {
    if (force) return true;
    const ps = (r.pipeline_state ?? {}) as any;
    const meta = (r.metadata ?? {}) as any;
    return (
      !r.maestro_synced ||
      !meta.maestro_recording_uploaded_at ||
      ps?.transcript?.state !== "done" ||
      ps?.ai?.state !== "done" ||
      ps?.maestro?.state !== "done"
    );
  }).slice(0, limit);

  const results: any[] = [];
  for (const row of pending) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/maestro-sync-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ call_id: row.id, force }),
      });
      const data = await res.json().catch(() => ({}));
      results.push({ call_id: row.id, success: !!data?.success, steps: data?.steps ?? null });
    } catch (e: any) {
      results.push({ call_id: row.id, success: false, error: e?.message });
    }
  }

  // ── SMS backfill ────────────────────────────────────────────
  let msgQ = admin
    .from("planipret_phone_messages")
    .select("id, user_id, maestro_synced, metadata, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit * 3);
  if (body?.user_id) msgQ = msgQ.eq("user_id", body.user_id);
  if (!force) msgQ = msgQ.eq("maestro_synced", false);
  const { data: msgRows } = await msgQ;
  const pendingMsgs = (msgRows ?? [])
    .filter((m: any) => force || (!m.maestro_synced && !(m.metadata ?? {}).maestro_synced_at))
    .slice(0, limit);

  const messageResults: any[] = [];
  for (const m of pendingMsgs) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/maestro-sync-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ message_id: m.id, force }),
      });
      const data = await res.json().catch(() => ({}));
      messageResults.push({ message_id: m.id, success: !!data?.success });
    } catch (e: any) {
      messageResults.push({ message_id: m.id, success: false, error: e?.message });
    }
  }

  return json({
    success: true,
    messages_processed: messageResults.length,
    messages_succeeded: messageResults.filter((r) => r.success).length,
    scanned: rows?.length ?? 0,
    processed: results.length,
    succeeded: results.filter((r) => r.success).length,
    results,
  });
});
