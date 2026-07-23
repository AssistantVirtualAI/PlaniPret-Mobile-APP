import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { business_description, hours, menu_options, voice_style, language = "en", customer_id } = await req.json();

    const { data: cfgRows } = await admin.from("lemtel_config").select("key, value").in("key", ["ANTHROPIC_API_KEY", "ELEVENLABS_VOICE_ID_DEFAULT"]);
    const cfg = Object.fromEntries((cfgRows || []).map((r: any) => [r.key, r.value]));
    const elevenKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!cfg.ANTHROPIC_API_KEY || !elevenKey) throw new Error("Missing AI/TTS credentials");

    // 1. Generate script via Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": cfg.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929", max_tokens: 600,
        messages: [{
          role: "user",
          content: `You are an IVR script writer. Write a professional phone greeting for: ${business_description}. Business hours: ${hours}. Menu options: ${(menu_options || []).join(", ")}. Language: ${language}. Return ONLY the spoken script, no instructions or quotes.`,
        }],
      }),
    });
    const claudeData = await claudeRes.json();
    const script_text = claudeData.content?.[0]?.text?.trim() || "";

    // 2. TTS via ElevenLabs
    const voiceId = cfg.ELEVENLABS_VOICE_ID_DEFAULT || "21m00Tcm4TlvDq8ikWAM";
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": elevenKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text: script_text, model_id: "eleven_turbo_v2" }),
    });
    if (!ttsRes.ok) throw new Error(`TTS failed: ${await ttsRes.text()}`);
    const audio = new Uint8Array(await ttsRes.arrayBuffer());

    const path = `${customer_id || "shared"}/${crypto.randomUUID()}.mp3`;
    const { error: upErr } = await admin.storage.from("lemtel-ivr-audio").upload(path, audio, { contentType: "audio/mpeg" });
    if (upErr) throw upErr;
    const { data: signed } = await admin.storage.from("lemtel-ivr-audio").createSignedUrl(path, 60 * 60 * 24 * 7);

    await admin.from("lemtel_ivr_audio").insert({
      customer_id, script_text, audio_url: signed?.signedUrl, elevenlabs_voice_id: voiceId, status: "draft",
    });

    return new Response(JSON.stringify({ script_text, audio_url: signed?.signedUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
