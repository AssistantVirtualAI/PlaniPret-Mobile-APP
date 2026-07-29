// pp-ava-voice-settings — read/save the AVA voice-bot voice for a broker.
// Used by both the Planiprêt admin portal and the mobile app so a change on
// one surface is instantly reflected on the other (same profile row).
import { authBroker, corsHeaders, jsonResponse, supaAdmin } from "../_shared/ns-broker.ts";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";

// Curated multilingual voices that work well for FR-CA + EN.
const FALLBACK_VOICES = [
  { voice_id: "RCSF5YgDtAhZXpNZfGek", name: "Andréa (FR-CA)", labels: { gender: "female", accent: "canadian" } },
  { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", labels: { gender: "female", accent: "american" } },
  { voice_id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", labels: { gender: "female", accent: "american" } },
  { voice_id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", labels: { gender: "female", accent: "american" } },
  { voice_id: "JBFqnCBsd6RMkjVDRZzb", name: "George", labels: { gender: "male", accent: "british" } },
  { voice_id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", labels: { gender: "male", accent: "british" } },
  { voice_id: "nPczCjzI2devNBz1zQrb", name: "Brian", labels: { gender: "male", accent: "american" } },
  { voice_id: "cjVigY5qzO86Huf0OWal", name: "Eric", labels: { gender: "male", accent: "american" } },
];

async function listVoices() {
  if (!ELEVENLABS_API_KEY) return { voices: FALLBACK_VOICES, source: "fallback" };
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });
    if (!r.ok) return { voices: FALLBACK_VOICES, source: "fallback", error: `elevenlabs_${r.status}` };
    const j = await r.json();
    const voices = (j?.voices ?? []).map((v: any) => ({
      voice_id: v.voice_id,
      name: v.name,
      preview_url: v.preview_url ?? null,
      labels: v.labels ?? {},
      category: v.category ?? null,
    }));
    return { voices: voices.length ? voices : FALLBACK_VOICES, source: voices.length ? "elevenlabs" : "fallback" };
  } catch (e) {
    return { voices: FALLBACK_VOICES, source: "fallback", error: String((e as Error).message ?? e) };
  }
}

function settingsOf(p: any) {
  return {
    voice_id: p?.ava_voice_id ?? null,
    voice_name: p?.ava_voice_name ?? null,
    stability: Number(p?.ava_voice_stability ?? 0.6),
    similarity_boost: Number(p?.ava_voice_similarity ?? 0.8),
    style: Number(p?.ava_voice_style ?? 0.3),
    speed: Number(p?.ava_voice_speed ?? 1),
    language: p?.ava_preferred_lang ?? p?.language ?? "fr",
    updated_at: p?.updated_at ?? null,
  };
}

const clamp = (n: unknown, min: number, max: number, dflt: number) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return dflt;
  return Math.min(max, Math.max(min, v));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await authBroker(req);
  if ("error" in auth) return auth.error;
  const { profile } = auth;
  const admin = supaAdmin();

  let body: any = {};
  try { body = req.method === "POST" ? await req.json() : {}; } catch { body = {}; }
  const action = String(body.action ?? new URL(req.url).searchParams.get("action") ?? "get");

  try {
    // Admins may read/write another broker's voice settings.
    let targetId = profile.id;
    if (body.broker_profile_id && body.broker_profile_id !== profile.id) {
      const { data: me } = await admin
        .from("planipret_profiles").select("role").eq("id", profile.id).maybeSingle();
      if (me?.role !== "admin") return jsonResponse({ success: false, error: "forbidden" }, 403);
      targetId = body.broker_profile_id;
    }

    if (action === "get") {
      const [{ data: prof }, voices] = await Promise.all([
        admin.from("planipret_profiles")
          .select("id, full_name, language, ava_voice_id, ava_voice_name, ava_voice_stability, ava_voice_similarity, ava_voice_style, ava_voice_speed, ava_preferred_lang, updated_at")
          .eq("id", targetId).maybeSingle(),
        listVoices(),
      ]);
      return jsonResponse({
        success: true,
        settings: settingsOf(prof),
        voices: voices.voices,
        voices_source: voices.source,
        elevenlabs_configured: !!ELEVENLABS_API_KEY,
      });
    }

    if (action === "save") {
      const patch: Record<string, unknown> = {};
      if (typeof body.voice_id === "string" && body.voice_id.trim()) patch.ava_voice_id = body.voice_id.trim();
      if (typeof body.voice_name === "string") patch.ava_voice_name = body.voice_name;
      if (body.stability !== undefined) patch.ava_voice_stability = clamp(body.stability, 0, 1, 0.6);
      if (body.similarity_boost !== undefined) patch.ava_voice_similarity = clamp(body.similarity_boost, 0, 1, 0.8);
      if (body.style !== undefined) patch.ava_voice_style = clamp(body.style, 0, 1, 0.3);
      if (body.speed !== undefined) patch.ava_voice_speed = clamp(body.speed, 0.7, 1.2, 1);
      if (body.language === "fr" || body.language === "en") patch.ava_preferred_lang = body.language;
      if (!Object.keys(patch).length) return jsonResponse({ success: false, error: "nothing_to_save" }, 400);

      const { data, error } = await admin
        .from("planipret_profiles")
        .update(patch)
        .eq("id", targetId)
        .select("id, ava_voice_id, ava_voice_name, ava_voice_stability, ava_voice_similarity, ava_voice_style, ava_voice_speed, ava_preferred_lang, updated_at")
        .maybeSingle();
      if (error) return jsonResponse({ success: false, error: error.message }, 500);
      return jsonResponse({ success: true, settings: settingsOf(data) });
    }

    if (action === "preview") {
      if (!ELEVENLABS_API_KEY) return jsonResponse({ success: false, error: "elevenlabs_not_configured" }, 400);
      const voiceId = String(body.voice_id ?? "").trim();
      if (!voiceId) return jsonResponse({ success: false, error: "voice_id_required" }, 400);
      const lang = body.language === "en" ? "en" : "fr";
      const text = String(body.text ?? "").trim() || (lang === "en"
        ? "Hi, I'm AVA, your personal AI assistant. How can I help you today?"
        : "Bonjour, je suis AVA, ton assistante IA personnelle. Comment puis-je t'aider aujourd'hui ?");
      const r = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: clamp(body.stability, 0, 1, 0.6),
              similarity_boost: clamp(body.similarity_boost, 0, 1, 0.8),
              style: clamp(body.style, 0, 1, 0.3),
              use_speaker_boost: true,
              speed: clamp(body.speed, 0.7, 1.2, 1),
            },
          }),
        },
      );
      if (!r.ok) {
        const details = await r.text();
        console.error("pp-ava-voice-settings preview failed", r.status, details);
        return jsonResponse({ success: false, error: "tts_failed", status: r.status, details }, r.status);
      }
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      }
      return jsonResponse({ success: true, audio_base64: btoa(bin), mime: "audio/mpeg" });
    }

    return jsonResponse({ success: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("pp-ava-voice-settings", e);
    return jsonResponse({ success: false, error: String((e as Error).message ?? e) }, 500);
  }
});
