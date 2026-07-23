// AVA Planiprêt — generate voicemail greeting (ElevenLabs TTS) and optionally
// push it to NS-API as the broker's active voicemail greeting.
// Docs: POST /domains/{domain}/users/{user}/greetings (multipart) — NS-API v2.
import {
  AVA_ORG_ID,
  authBroker,
  corsHeaders,
  jsonResponse,
  nsEnv,
  ensureBrokerJwt,
} from "../_shared/ns-broker.ts";

type Body = {
  text?: string;
  voice_id?: string;
  voice_settings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
  push_to_ns?: boolean;
  greeting_index?: number; // NS greeting slot (1..9), default 1
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "method_not_allowed" }, 200);

  try {
    const auth = await authBroker(req);
    if ("error" in auth) return auth.error;
    const { admin, userId, profile } = auth;
    if (profile.organization_id !== AVA_ORG_ID) {
      return jsonResponse({ success: false, error: "wrong_org" }, 200);
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const text = (body.text ?? "").trim();
    const voiceId = body.voice_id || "EXAVITQu4vr4xnSDxMaL";
    const greetingIndex = Math.min(Math.max(Number(body.greeting_index) || 1, 1), 9);
    if (text.length < 10 || text.length > 500) {
      return jsonResponse({ success: false, error: "text_length_invalid" }, 200);
    }

    const elKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!elKey) return jsonResponse({ success: false, error: "elevenlabs_not_configured" }, 200);

    // 1) ElevenLabs TTS
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": elKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: body.voice_settings?.stability ?? 0.6,
          similarity_boost: body.voice_settings?.similarity_boost ?? 0.8,
          style: body.voice_settings?.style ?? 0.3,
          use_speaker_boost: body.voice_settings?.use_speaker_boost ?? true,
        },
      }),
    });
    if (!ttsRes.ok) {
      const detail = await ttsRes.text().catch(() => "");
      return jsonResponse({ success: false, error: "tts_failed", detail, status: ttsRes.status }, 200);
    }
    const audioBytes = new Uint8Array(await ttsRes.arrayBuffer());

    // 2) Storage
    const fileName = `greeting_${userId}_${Date.now()}.mp3`;
    const path = `${profile.organization_id}/${userId}/${fileName}`;
    const { error: upErr } = await admin.storage
      .from("voicemail-greetings")
      .upload(path, audioBytes, { contentType: "audio/mpeg", upsert: false });
    if (upErr) return jsonResponse({ success: false, error: "storage_failed", detail: upErr.message }, 200);

    const { data: signed } = await admin.storage
      .from("voicemail-greetings")
      .createSignedUrl(path, 60 * 60 * 24);
    const audioUrl = signed?.signedUrl ?? null;

    // 3) Profile update
    await admin
      .from("planipret_profiles")
      .update({
        voicemail_greeting_text: text,
        voicemail_greeting_voice_id: voiceId,
        voicemail_greeting_audio_url: path,
        voicemail_greeting_updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    // 4) Push to NS-API (optional)
    let pushedToNs = false;
    let pushError: string | null = null;
    let pushDetail: string | null = null;

    if (body.push_to_ns) {
      const extension = profile.extension;
      const domain = profile.ns_domain || nsEnv().domain;

      if (!extension) {
        pushError = "no_extension";
      } else {
        try {
          const env = nsEnv();
          const token = await ensureBrokerJwt(admin, profile);
          const url = `${env.base}/ns-api/v2/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(extension)}/greetings`;

          // NS-API v2: POST greetings (multipart/form-data)
          const fd = new FormData();
          fd.append("script", text.slice(0, 200));
          fd.append("index", String(greetingIndex));
          fd.append("convert", "yes");
          fd.append("synchronous", "yes");
          fd.append("File", new Blob([audioBytes], { type: "audio/mpeg" }), fileName);

          const r = await fetch(url, {
            method: "POST",
            headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
            body: fd,
          });
          const detailText = await r.text().catch(() => "");
          if (r.ok) {
            pushedToNs = true;

            // Mark this greeting as the active one for the mailbox.
            try {
              const activateUrl = `${env.base}/ns-api/v2/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(extension)}`;
              await fetch(activateUrl, {
                method: "PUT",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ "voicemail-greeting-index": String(greetingIndex) }),
              });
            } catch (_) { /* non-fatal */ }
          } else {
            pushError = `ns_${r.status}`;
            pushDetail = detailText.slice(0, 300);
          }
        } catch (e) {
          pushError = "ns_exception";
          pushDetail = String((e as Error)?.message ?? e).slice(0, 300);
        }
      }

      if (pushedToNs) {
        await admin
          .from("planipret_profiles")
          .update({ voicemail_greeting_active: true })
          .eq("id", profile.id);
      }

      await admin.from("planipret_audit_log").insert({
        user_id: userId,
        action: "voicemail_greeting_push",
        metadata: {
          pushed_to_ns: pushedToNs,
          push_error: pushError,
          push_detail: pushDetail,
          voice_id: voiceId,
          text_length: text.length,
          greeting_index: greetingIndex,
        },
      }).then(() => null).catch(() => null);
    }

    // Voice name lookup (best effort)
    let voiceName = voiceId;
    try {
      const v = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, { headers: { "xi-api-key": elKey } });
      if (v.ok) voiceName = (await v.json()).name ?? voiceId;
    } catch (_) { /* noop */ }

    return jsonResponse({
      success: true,
      audio_url: audioUrl,
      storage_path: path,
      duration_seconds: Math.round((audioBytes.length / 16000) * 1) || null,
      voice_name: voiceName,
      pushed_to_ns: pushedToNs,
      push_error: pushError,
      push_detail: pushDetail,
      message: pushedToNs
        ? "Boîte vocale mise à jour avec succès"
        : body.push_to_ns
          ? `Audio généré — publication NS échouée (${pushError ?? "unknown"})`
          : "Audio généré (non publié)",
    });
  } catch (e) {
    console.error("[pp-greeting-generate]", e);
    return jsonResponse({
      success: false,
      error: "server_error",
      detail: String((e as Error)?.message ?? e).slice(0, 300),
    }, 200);
  }
});
