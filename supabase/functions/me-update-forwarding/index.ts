import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(url, service);
    const { data: spu } = await admin.from("pbx_softphone_users").select("organization_id, extension").eq("portal_user_id", user.id).maybeSingle();
    if (!spu) return new Response(JSON.stringify({ error: "no extension" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: org } = await admin.from("organizations").select("allow_user_self_forwarding").eq("id", spu.organization_id).maybeSingle();
    if (org && org.allow_user_self_forwarding === false) {
      return new Response(JSON.stringify({ error: "forwarding self-service is disabled by your admin" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const payload = {
      user_id: user.id,
      organization_id: spu.organization_id,
      extension: spu.extension,
      always_enabled: !!body.always_enabled,
      always_to: body.always_to ?? null,
      busy_enabled: !!body.busy_enabled,
      busy_to: body.busy_to ?? null,
      no_answer_enabled: !!body.no_answer_enabled,
      no_answer_to: body.no_answer_to ?? null,
      no_answer_seconds: body.no_answer_seconds ?? 20,
      offline_enabled: !!body.offline_enabled,
      offline_to: body.offline_to ?? null,
      dnd_enabled: !!body.dnd_enabled,
      updated_at: new Date().toISOString(),
    };

    const { error } = await admin.from("pbx_call_forwarding").upsert(payload, { onConflict: "user_id" });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
