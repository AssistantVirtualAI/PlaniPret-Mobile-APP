// Liste voix ElevenLabs + preview TTS pour la page Settings Voix du courtier.
import { authBroker, corsHeaders, jsonResponse } from "../_shared/ns-broker.ts";

const EL_API = "https://api.elevenlabs.io/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await authBroker(req);
  if ("error" in auth) return auth.error;

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) return jsonResponse({ success: false, error: "elevenlabs_api_key_missing" }, 500);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "list");

  try {
    if (action === "list") {
      const r = await fetch(`${EL_API}/voices`, { headers: { "xi-api-key": apiKey } });
      if (!r.ok) return jsonResponse({ success: false, error: `elevenlabs ${r.status}` }, 200);
      const d = await r.json();
      const voices = (d?.voices ?? []).map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name,
        preview_url: v.preview_url,
        category: v.category,
        labels: v.labels ?? {},
      }));
      return jsonResponse({ success: true, voices });
    }

    if (action === "preview") {
      const voiceId = String(body?.voice_id ?? "");
      const text = String(body?.text ?? "Bonjour, je suis AVA, ton assistante Planiprêt.");
      if (!voiceId) return jsonResponse({ success: false, error: "voice_id_required" }, 400);
      const stability = Number(body?.stability ?? 0.6);
      const similarity = Number(body?.similarity ?? 0.8);
      const style = Number(body?.style ?? 0.3);
      const r = await fetch(`${EL_API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability, similarity_boost: similarity, style, use_speaker_boost: true },
        }),
      });
      if (!r.ok) {
        const errText = await r.text();
        return jsonResponse({ success: false, error: errText.slice(0, 300) }, 200);
      }
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.byteLength; i++) bin += String.fromCharCode(buf[i]);
      const b64 = btoa(bin);
      return jsonResponse({ success: true, audioContent: b64, mime: "audio/mpeg" });
    }

    return jsonResponse({ success: false, error: "unknown_action" }, 400);
  } catch (e) {
    return jsonResponse({ success: false, error: String(e) }, 200);
  }
});
