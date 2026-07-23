import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await req.json().catch(() => ({} as any));

  // ---- TEST action: connectivity probe ----
  if (body?.action === "test") {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ status: "error", error: "MISSING_SECRET", secret: "ELEVENLABS_API_KEY" }),
        { status: 200, headers: corsHeaders });
    }
    const start = Date.now();
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      });
      const latency = Date.now() - start;
      if (res.ok) {
        const user = await res.json();
        return new Response(JSON.stringify({
          status: "ok",
          message: "ElevenLabs connected",
          latency_ms: latency,
          characters_used: user.subscription?.character_count,
          characters_limit: user.subscription?.character_limit,
          tier: user.subscription?.tier,
        }), { status: 200, headers: corsHeaders });
      }
      const errText = await res.text();
      return new Response(JSON.stringify({
        status: "error", error: "ELEVENLABS_API_ERROR", http_status: res.status, details: errText,
      }), { status: 200, headers: corsHeaders });
    } catch (e: any) {
      return new Response(JSON.stringify({ status: "error", error: "ELEVENLABS_UNREACHABLE", message: e.message }),
        { status: 200, headers: corsHeaders });
    }
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { script_text, voice_id, language = "fr", ivr_id, organization_id } = body;
    if (!script_text || !organization_id) {
      return new Response(JSON.stringify({ error: "script_text and organization_id required" }), { status: 400, headers: corsHeaders });
    }
    if (String(script_text).trim().length > 5000) {
      return new Response(JSON.stringify({ error: "Le script dépasse 5000 caractères. Raccourcissez le message puis réessayez." }), { status: 400, headers: corsHeaders });
    }
    const { data: member } = await admin.from("organization_members")
      .select("organization_id").eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
    const { data: superAdmin } = await admin.rpc("is_super_admin", { _user_id: user.id });
    if (!member && !superAdmin) return new Response(JSON.stringify({ error: "Vous n’avez pas accès à cette organisation." }), { status: 403, headers: corsHeaders });

    let clientId = null;
    if (ivr_id) {
      const { data: ivr, error: ivrErr } = await admin.from("pbx_ivrs")
        .select("id, organization_id, client_id").eq("id", ivr_id).maybeSingle();
      if (ivrErr) throw ivrErr;
      if (!ivr) return new Response(JSON.stringify({ error: "IVR introuvable." }), { status: 404, headers: corsHeaders });
      if (ivr.organization_id !== organization_id) {
        return new Response(JSON.stringify({ error: "Cet IVR n’appartient pas à l’organisation sélectionnée." }), { status: 403, headers: corsHeaders });
      }
      clientId = ivr.client_id;
    }

    const elevenKey = Deno.env.get("ELEVENLABS_API_KEY");
    const vid = voice_id || "21m00Tcm4TlvDq8ikWAM";
    if (!elevenKey) {
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured", stub: true }), { status: 503, headers: corsHeaders });
    }

    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": elevenKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text: script_text, model_id: "eleven_multilingual_v2" }),
    });
    if (!ttsRes.ok) throw new Error(`TTS failed: ${await ttsRes.text()}`);
    const audio = new Uint8Array(await ttsRes.arrayBuffer());

    const path = `${organization_id}/${ivr_id || "standalone"}/${crypto.randomUUID()}.mp3`;
    const { error: upErr } = await admin.storage.from("lemtel-ivr-audio").upload(path, audio, { contentType: "audio/mpeg", upsert: true });
    if (upErr) throw upErr;
    const { data: signed } = await admin.storage.from("lemtel-ivr-audio").createSignedUrl(path, 3600);

    const { data: row } = await admin.from("pbx_ivr_audio").insert({
      organization_id, client_id: clientId, ivr_id, script_text, audio_url: signed?.signedUrl,
      storage_path: path, elevenlabs_voice_id: vid, language, status: "ready",
    }).select().single();

    return new Response(JSON.stringify({ audio_url: signed?.signedUrl, storage_path: path, id: row?.id }), { headers: corsHeaders });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
