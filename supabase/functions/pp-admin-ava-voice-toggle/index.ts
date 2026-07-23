// pp-admin-ava-voice-toggle — Admin action: enable/disable a broker's voice agent.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await anon.auth.getUser(authHeader.slice(7));
    if (!userRes?.user) return json({ error: "unauthorized" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: me } = await admin
      .from("planipret_profiles").select("role").eq("user_id", userRes.user.id).maybeSingle();
    if (me?.role !== "admin") return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const target_user_id = String(body?.user_id ?? "");
    const enabled = Boolean(body?.enabled);
    if (!target_user_id) return json({ error: "missing_user_id" }, 400);

    const { error } = await admin.from("planipret_profiles")
      .update({ voice_agent_enabled: enabled })
      .eq("user_id", target_user_id);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, user_id: target_user_id, voice_agent_enabled: enabled });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
