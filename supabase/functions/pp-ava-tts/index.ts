// pp-ava-tts — Text to speech for AVA replies using ElevenLabs.
// Voice selection by language:
//   FR: Charlotte (XB0fDUnXU5powFXDhCwa) — warm Quebec French female
//   EN: Brian (nPczCjzI2devNBz1zQrb) — natural North American English male
//   fallback: Sarah (EXAVITQu4vr4xnSDxMaL) — multilingual
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const VOICE_MAP: Record<string, string> = {
  fr: "XB0fDUnXU5powFXDhCwa", // Charlotte — FR
  en: "nPczCjzI2devNBz1zQrb", // Brian — EN
};
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah — multilingual fallback

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const text: string = body?.text ?? "";
    const language: string = body?.language ?? body?.lang ?? "fr";
    // Allow caller to override voiceId explicitly (e.g. from user voice preference)
    const voiceId: string = body?.voiceId ?? VOICE_MAP[language] ?? DEFAULT_VOICE;

    if (!text || typeof text !== "string") return j({ error: "text_required" }, 400);
    if (text.length > 4000) return j({ error: "text_too_long" }, 400);

    const key = Deno.env.get("ELEVENLABS_API_KEY");
    if (!key) return j({ error: "elevenlabs_not_configured" }, 500);

    const model = "eleven_multilingual_v2";
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
    return j({ ok: true, audioContent: base64Encode(buf), mime: "audio/mpeg", voiceId, language });
  } catch (e: any) {
    console.error("[pp-ava-tts]", e);
    return j({ error: e?.message ?? "server_error" }, 500);
  }
});
