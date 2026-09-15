import { aiFetch } from "../_shared/claude-compat.ts";
import { authBroker, corsHeaders, jsonResponse } from "../_shared/ns-broker.ts";
import { hasValidAiConsent } from "../_shared/ai-consent.ts";
// pp-ava-stt — Speech to text for AVA voice input.
// Accepts { audio: base64, mime: string } and returns { text }.
const j = jsonResponse;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authBroker(req);
    if ("error" in auth) return auth.error;
    if (auth.authMode !== "jwt") return j({ error: "user_session_required" }, 403);
    if (!hasValidAiConsent(auth.profile)) return j({ error: "ai_consent_required" }, 403);
    const { audio, mime = "audio/webm" } = await req.json();
    if (!audio || typeof audio !== "string") return j({ error: "audio_required" }, 400);
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return j({ error: "gateway_key_missing" }, 500);

    // Decode base64 to bytes
    const bin = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
    // Empty-recording guard: a header-only clip has no speech and the STT provider
    // always rejects it with HTTP 400. Surface it instead of uploading.
    if (bin.length < 2048) return j({ error: "no_audio_captured", bytes: bin.length }, 400);
    const ext = mime.includes("mp4") ? "mp4" : mime.includes("wav") ? "wav" : mime.includes("mpeg") ? "mp3" : "webm";
    const blob = new Blob([bin], { type: mime });
    const form = new FormData();
    form.append("file", blob, `audio.${ext}`);
    form.append("model", "openai/gpt-4o-mini-transcribe");

    const res = await aiFetch("https://ai.lovable/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const t = await res.text();
      return j({ error: `stt_${res.status}`, detail: t.slice(0, 500) }, 500);
    }
    const data = await res.json().catch(() => ({}));
    return j({ ok: true, text: data.text ?? "" });
  } catch (e: any) {
    console.error("[pp-ava-stt]", e);
    return j({ error: e?.message ?? "server_error" }, 500);
  }
});
