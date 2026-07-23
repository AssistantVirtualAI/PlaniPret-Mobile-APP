import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const { event, call_record_id, organization_id, latency_ms, attempts, reason, wait_ms } = body || {};
    if (!event || !organization_id) return json({ error: "event and organization_id required" }, 400);

    console.log("pending-sync-metrics", { event, call_record_id, organization_id, attempts, latency_ms, reason });

    await admin.from("ai_request_audit_log").insert({
      organization_id,
      user_id: user.id,
      call_record_id: call_record_id || null,
      request_type: "pending_sync_retry",
      status: String(event),
      latency_ms: Number(latency_ms) || 0,
      message: reason || null,
      provider: "client-orchestrator",
      metadata: { attempts: Number(attempts) || 0, wait_ms: Number(wait_ms) || 0, reason: reason || null },
    });

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e?.message || "internal" }, 500);
  }
});
