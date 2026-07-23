import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Repairs Verto dial_string + call_timeout for every extension in a FusionPBX domain.
 * Callable with the service role key (no user auth required). Accepts optional
 * `organization_id` or `domain_uuid` in the body; defaults to the Lemtel org.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({} as any));
    let { organization_id, domain_uuid } = body ?? {};

    // If no org given, default to the Lemtel org (identified by its FusionPBX domain).
    if (!organization_id && !domain_uuid) {
      const { data: org } = await admin
        .from("organizations")
        .select("id, fusionpbx_domain_uuid")
        .not("fusionpbx_domain_uuid", "is", null)
        .limit(1)
        .maybeSingle();
      organization_id = org?.id;
      domain_uuid = (org as any)?.fusionpbx_domain_uuid;
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/fusionpbx-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        action: "repair-all-extensions-verto",
        organization_id,
        domain_uuid,
      }),
    });
    const data = await res.json().catch(() => ({}));
    return new Response(JSON.stringify({
      ok: res.ok,
      organization_id,
      domain_uuid,
      proxy_status: res.status,
      summary: data,
    }), { status: res.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
