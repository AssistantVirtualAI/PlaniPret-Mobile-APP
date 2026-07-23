// Legacy wrapper: forwards CDR sync to the modern fusionpbx-proxy action
// `sync-cdrs`. Kept for backward compatibility with external schedulers /
// older frontend builds that still hit this endpoint.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { organization_id, from_beginning } = await req.json().catch(() => ({}));
    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job } = await admin.from("pbx_sync_jobs").insert({
      organization_id,
      job_type: "cdr",
      status: "running",
      started_at: new Date().toISOString(),
    }).select().single();

    // Forward to modern proxy with service-role auth
    const proxyRes = await fetch(`${SUPABASE_URL}/functions/v1/fusionpbx-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        action: "sync-cdrs",
        organization_id,
        params: from_beginning ? { from_beginning: true } : {},
      }),
    });
    const proxyData = await proxyRes.json().catch(() => ({}));

    const ok = proxyRes.ok && (proxyData as any)?.ok !== false;
    await admin.from("pbx_sync_jobs").update({
      status: ok ? "completed" : "failed",
      completed_at: new Date().toISOString(),
      stats: (proxyData as any)?.stats || {},
      error: ok ? null : (proxyData as any)?.error || `HTTP ${proxyRes.status}`,
    }).eq("id", job!.id);

    await admin.from("pbx_integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("organization_id", organization_id);

    return new Response(JSON.stringify({
      ok,
      mode: "live",
      forwarded_to: "fusionpbx-proxy/sync-cdrs",
      ...(proxyData as any),
    }), { status: proxyRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
