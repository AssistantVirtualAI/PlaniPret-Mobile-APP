// pp-ava-tts — Text to speech for AVA replies using ElevenLabs.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { text, voiceId = "EXAVITQu4vr4xnSDxMaL", language = "fr" } = await req.json();
    if (!text || typeof text !== "string") return j({ error: "text_required" }, 400);
    if (text.length > 4000) return j({ error: "text_too_long" }, 400);
    const key = Deno.env.get("ELEVENLABS_API_KEY");
    if (!key) return j({ error: "elevenlabs_not_configured" }, 500);

    const model = language === "fr" ? "eleven_multilingual_v2" : "eleven_turbo_v2";
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: { stability: 0.55, similarity_boost: 0.8 },
        }),
      },
    );
    if (!res.ok) {
      const t = await res.text();
      return j({ error: `tts_${res.status}`, detail: t.slice(0, 500) }, 500);
    }
    const buf = await res.arrayBuffer();
    return j({ ok: true, audioContent: base64Encode(buf), mime: "audio/mpeg" });
  } catch (e: any) {
    console.error("[pp-ava-tts]", e);
    return j({ error: e?.message ?? "server_error" }, 500);
  }
});
