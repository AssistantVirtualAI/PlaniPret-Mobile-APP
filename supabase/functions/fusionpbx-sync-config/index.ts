import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { organization_id } = await req.json().catch(() => ({}));
    if (!organization_id) return new Response(JSON.stringify({ error: "organization_id required" }), { status: 400, headers: corsHeaders });

    const { data: job } = await admin.from("pbx_sync_jobs").insert({
      organization_id, job_type: "config", status: "running", started_at: new Date().toISOString(),
    }).select().single();

    const { data: integ } = await admin.from("pbx_integrations").select("*").eq("organization_id", organization_id).maybeSingle();
    const mockMode = integ?.config?.mock_mode === true;
    const stats: any = { mode: mockMode ? "mock" : "live", extensions: 0, devices: 0, ivrs: 0, queues: 0, ring_groups: 0 };

    if (mockMode || !integ?.base_url) {
      const exts = Array.from({ length: 5 }, (_, i) => ({
        organization_id, pbx_uuid: `ext-mock-${i}`, extension: `${100 + i}`,
        effective_cid_name: `User ${100 + i}`, effective_cid_number: `+1514555010${i}`,
        enabled: true, voicemail_enabled: true, description: "Mock extension",
      }));
      await admin.from("pbx_extensions").upsert(exts, { onConflict: "id" });
      stats.extensions = exts.length;
    } else {
      stats.note = "live config sync not yet wired to FusionPBX endpoint";
    }

    // Ensure every extension has the correct Verto dial_string + call_timeout
    // so mobile softphones ring. Safe to run on every sync.
    try {
      const repairRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/fusionpbx-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify({ action: "repair-all-extensions-verto", organization_id }),
      });
      stats.verto_repair = await repairRes.json().catch(() => ({ status: repairRes.status }));
    } catch (e: any) {
      stats.verto_repair = { error: e?.message || String(e) };
    }


    await admin.from("pbx_sync_jobs").update({
      status: "completed", completed_at: new Date().toISOString(), stats,
    }).eq("id", job!.id);

    return new Response(JSON.stringify(stats), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
