// AVA Planiprêt — publish a greeting the broker recorded with their own voice.
// The app/portal records with MediaRecorder (webm/mp4/wav), sends base64, and
// this function stores it, pushes it to NetSapiens as the active voicemail
// greeting (slot 1) and updates the broker profile — same contract as
// `pp-greeting-generate`, minus the TTS step.
import {
  AVA_ORG_ID,
  authBroker,
  corsHeaders,
  jsonResponse,
  nsEnv,
  ensureBrokerJwt,
} from "../_shared/ns-broker.ts";

type Body = {
  /** base64 payload, with or without a `data:` prefix. */
  audio_base64?: string;
  mime_type?: string;
  /** Optional label stored with the greeting. */
  label?: string;
  duration_seconds?: number;
  push_to_ns?: boolean;
  greeting_index?: number;
};

const MAX_BYTES = 8 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

function decodeBase64(input: string): Uint8Array {
  const raw = input.includes(",") && input.trim().startsWith("data:")
    ? input.slice(input.indexOf(",") + 1)
    : input;
  const bin = atob(raw.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

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
    const mime = String(body.mime_type ?? "audio/webm").split(";")[0].trim().toLowerCase();
    const ext = EXT_BY_MIME[mime] ?? "webm";
    const greetingIndex = Math.min(Math.max(Number(body.greeting_index) || 1, 1), 9);

    let audioBytes: Uint8Array;
    try {
      audioBytes = decodeBase64(String(body.audio_base64 ?? ""));
    } catch {
      return jsonResponse({ success: false, error: "audio_invalid" }, 200);
    }
    if (audioBytes.length < 1024) return jsonResponse({ success: false, error: "audio_too_short" }, 200);
    if (audioBytes.length > MAX_BYTES) return jsonResponse({ success: false, error: "audio_too_large" }, 200);

    // 1) Storage
    const fileName = `greeting_rec_${userId}_${Date.now()}.${ext}`;
    const path = `${profile.organization_id}/${userId}/${fileName}`;
    const { error: upErr } = await admin.storage
      .from("voicemail-greetings")
      .upload(path, audioBytes, { contentType: mime, upsert: false });
    if (upErr) return jsonResponse({ success: false, error: "storage_failed", detail: upErr.message }, 200);

    const { data: signed } = await admin.storage
      .from("voicemail-greetings")
      .createSignedUrl(path, 60 * 60 * 24);

    const label = String(body.label ?? "Message enregistré par le courtier").slice(0, 200);

    // 2) Profile — a recorded greeting has no TTS voice.
    await admin
      .from("planipret_profiles")
      .update({
        voicemail_greeting_text: label,
        voicemail_greeting_voice_id: null,
        voicemail_greeting_audio_url: path,
        voicemail_greeting_updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    // 3) Push to NS (convert=yes lets NS transcode webm/m4a to its own format)
    let pushedToNs = false;
    let pushError: string | null = null;
    let pushDetail: string | null = null;

    if (body.push_to_ns !== false) {
      const extension = profile.extension;
      const domain = profile.ns_domain || nsEnv().domain;
      if (!extension) {
        pushError = "no_extension";
      } else {
        try {
          const env = nsEnv();
          const token = await ensureBrokerJwt(admin, profile);
          const url = `${env.base}/ns-api/v2/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(extension)}/greetings`;

          // JSON base64 upload — the multipart variant rejects webm on some nodes.
          const r = await fetch(url, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              synchronous: "yes",
              convert: "yes",
              index: greetingIndex,
              script: label.slice(0, 200),
              encoding: mime,
              base64_file: toBase64(audioBytes),
            }),
          });
          const detailText = await r.text().catch(() => "");
          if (r.ok) {
            pushedToNs = true;
            try {
              await fetch(`${env.base}/ns-api/v2/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(extension)}`, {
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
        await admin.from("planipret_profiles").update({ voicemail_greeting_active: true }).eq("id", profile.id);
      }

      await admin.from("planipret_audit_log").insert({
        user_id: userId,
        action: "voicemail_greeting_record",
        metadata: {
          pushed_to_ns: pushedToNs,
          push_error: pushError,
          push_detail: pushDetail,
          bytes: audioBytes.length,
          mime,
          greeting_index: greetingIndex,
          duration_seconds: body.duration_seconds ?? null,
        },
      }).then(() => null).catch(() => null);
    }

    return jsonResponse({
      success: true,
      audio_url: signed?.signedUrl ?? null,
      storage_path: path,
      bytes: audioBytes.length,
      pushed_to_ns: pushedToNs,
      push_error: pushError,
      push_detail: pushDetail,
      message: pushedToNs
        ? "Votre message enregistré est maintenant actif"
        : `Enregistrement sauvegardé — publication échouée (${pushError ?? "unknown"})`,
    });
  } catch (e) {
    console.error("[pp-greeting-record]", e);
    return jsonResponse({ success: false, error: "server_error", detail: String((e as Error)?.message ?? e).slice(0, 300) }, 200);
  }
});
