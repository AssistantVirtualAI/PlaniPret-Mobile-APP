// Super-admin preview of ava-agent-config for any broker (test/simulation).
// Returns the same shape as ava-agent-config but for a target user_id.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEFAULT_AGENT_ID = Deno.env.get("ELEVENLABS_DEFAULT_AGENT_ID") ?? "";
const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildFirstMessage(fullName: string | null | undefined) {
  const first = (fullName ?? "courtier").trim().split(/\s+/)[0];
  return `Bonjour ${first} ! Je suis AVA, ton assistante IA. Comment puis-je t'aider aujourd'hui ?`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ success: false, error: "unauthorized" }, 401);
    const jwt = authHeader.slice(7);

    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await anon.auth.getUser(jwt);
    if (userErr || !userRes?.user) return json({ success: false, error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: userRes.user.id });
    if (!isSuper) return json({ success: false, error: "forbidden_super_admin_only" }, 403);

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body?.target_user_id ?? "");
    if (!targetUserId) {
      // Return list of brokers instead
      const { data: brokers } = await admin
        .from("planipret_profiles")
        .select("user_id, full_name, extension, voice_agent_enabled")
        .order("full_name", { ascending: true })
        .limit(200);
      return json({ success: true, brokers: brokers ?? [] });
    }

    const { data: p } = await admin
      .from("planipret_profiles")
      .select("user_id, full_name, extension, elevenlabs_agent_id, ava_voice_id, ava_preferred_lang, voice_agent_enabled, ava_autonomy_mode, ms365_access_token, maestro_connected, maestro_broker_id")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!p) return json({ success: false, error: "profile_not_found" }, 404);

    const agentId = p.elevenlabs_agent_id || DEFAULT_AGENT_ID;
    const voiceId = p.ava_voice_id || DEFAULT_VOICE_ID;
    const firstName = (p.full_name ?? "courtier").trim().split(/\s+/)[0];

    return json({
      success: true,
      target_user_id: targetUserId,
      broker: {
        full_name: p.full_name,
        first_name: firstName,
        extension: p.extension,
        voice_agent_enabled: p.voice_agent_enabled,
        ms365_connected: !!p.ms365_access_token,
        maestro_connected: !!p.maestro_connected,
      },
      agent_id: agentId,
      voice_id: voiceId,
      language: p.ava_preferred_lang ?? "fr",
      autonomy_mode: p.ava_autonomy_mode ?? "confirm",
      first_message: buildFirstMessage(p.full_name),
      dynamic_variables: {
        ava_broker_name: p.full_name ?? "",
        ava_broker_first_name: firstName,
        ava_broker_extension: p.extension ?? "",
      },
    });
  } catch (e) {
    console.error("ava-agent-config-preview", e);
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
