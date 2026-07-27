// pp-moh-generate — génère une musique d'attente (voix ElevenLabs + lit musical)
// et la stocke dans le bucket privé `planipret-hold-music`.
// Admin Planiprêt uniquement.
import {
  corsHeaders,
  encodeWav,
  json,
  mixVoiceOverMusic,
  pcmBytesToInt16,
  requirePlanipretAdmin,
  resample,
} from "../_shared/pp-admin.ts";

const EL = "https://api.elevenlabs.io";
const SR = 8000; // téléphonie — NetSapiens MOH

type Body = {
  id?: string;
  name?: string;
  text?: string;
  language?: string;
  voice_id?: string;
  voice_name?: string;
  music_style?: string;
  music_volume?: number;
  music_only?: boolean;
  duration_seconds?: number;
};

async function ttsPcm(key: string, voiceId: string, text: string): Promise<Int16Array> {
  const res = await fetch(
    `${EL}/v1/text-to-speech/${voiceId}?output_format=pcm_16000`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/pcm" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
      }),
    },
  );
  if (!res.ok) throw new Error(`tts_${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return resample(pcmBytesToInt16(new Uint8Array(await res.arrayBuffer())), 16000, SR);
}

async function musicPcm(key: string, prompt: string, seconds: number): Promise<Int16Array | null> {
  try {
    const res = await fetch(`${EL}/v1/music?output_format=pcm_44100`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        music_length_ms: Math.min(Math.max(Math.round(seconds * 1000), 10_000), 120_000),
      }),
    });
    if (!res.ok) {
      console.error("[pp-moh-generate] music failed", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return null;
    }
    return resample(pcmBytesToInt16(new Uint8Array(await res.arrayBuffer())), 44100, SR);
  } catch (e) {
    console.error("[pp-moh-generate] music error", String(e));
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requirePlanipretAdmin(req);
  if ("error" in auth) return auth.error;
  const { admin, userId } = auth;

  const body = (await req.json().catch(() => ({}))) as Body;
  const text = (body.text ?? "").trim();
  const musicOnly = !!body.music_only;
  if (!musicOnly && (text.length < 10 || text.length > 2000)) {
    return json({ success: false, error: "text_length_invalid" }, 200);
  }
  const key = Deno.env.get("ELEVENLABS_API_KEY");
  if (!key) return json({ success: false, error: "elevenlabs_not_configured" }, 200);

  const voiceId = body.voice_id || "EXAVITQu4vr4xnSDxMaL";
  const musicStyle = (body.music_style ?? "").trim();
  const musicVolume = typeof body.music_volume === "number" ? body.music_volume : 0.25;
  const name = (body.name ?? "").trim() || `MOH ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

  // 1) Ligne de suivi
  let rowId = body.id ?? null;
  if (rowId) {
    await admin.from("planipret_hold_music")
      .update({ status: "generating", error_message: null, name, source_text: text })
      .eq("id", rowId);
  } else {
    const { data, error } = await admin.from("planipret_hold_music").insert({
      name,
      source_text: text,
      language: body.language ?? "fr",
      voice_id: musicOnly ? null : voiceId,
      voice_name: body.voice_name ?? null,
      music_style: musicStyle || null,
      music_volume: musicVolume,
      status: "generating",
      created_by: userId,
    }).select("id").single();
    if (error) return json({ success: false, error: error.message }, 200);
    rowId = (data as { id: string }).id;
  }

  const fail = async (msg: string) => {
    await admin.from("planipret_hold_music")
      .update({ status: "failed", error_message: msg.slice(0, 500) }).eq("id", rowId);
    return json({ success: false, error: msg, id: rowId }, 200);
  };

  try {
    // 2) Voix
    const voice = musicOnly ? new Int16Array(0) : await ttsPcm(key, voiceId, text);
    const targetSeconds = musicOnly
      ? Math.min(Math.max(body.duration_seconds ?? 30, 10), 120)
      : voice.length / SR + 2;

    // 3) Lit musical (facultatif — la génération continue sans musique en cas d'échec)
    const music = musicStyle
      ? await musicPcm(
        key,
        `Instrumental hold music loop, ${musicStyle}, calm, no vocals, seamless, soft dynamics, suitable as background under a spoken announcement.`,
        targetSeconds,
      )
      : null;

    // 4) Mixage + WAV 8 kHz mono
    const mixed = musicOnly && music
      ? music.slice(0, Math.floor(targetSeconds * SR))
      : mixVoiceOverMusic(voice, music, musicVolume, SR, 2);
    if (mixed.length === 0) return await fail("no_audio_generated");
    const wav = encodeWav(mixed, SR);

    // 5) Storage
    const path = `hold-music/${rowId}.wav`;
    const { error: upErr } = await admin.storage
      .from("planipret-hold-music")
      .upload(path, wav, { contentType: "audio/wav", upsert: true });
    if (upErr) return await fail(`storage_failed: ${upErr.message}`);

    await admin.from("planipret_hold_music").update({
      status: "ready",
      storage_path: path,
      duration_seconds: Number((mixed.length / SR).toFixed(1)),
      music_style: musicStyle || null,
      music_volume: musicVolume,
      voice_id: musicOnly ? null : voiceId,
      voice_name: body.voice_name ?? null,
      error_message: music === null && musicStyle ? "music_unavailable_voice_only" : null,
    }).eq("id", rowId);

    const { data: signed } = await admin.storage
      .from("planipret-hold-music").createSignedUrl(path, 3600);

    return json({
      success: true,
      id: rowId,
      storage_path: path,
      audio_url: signed?.signedUrl ?? null,
      duration_seconds: Number((mixed.length / SR).toFixed(1)),
      music_included: !!music,
    });
  } catch (e) {
    return await fail(String((e as Error).message ?? e));
  }
});
