// pp-admin-transcribe — Transcribe a planipret_phone_calls row via Lovable AI.
// Resolves a fresh recording URL, fetches the audio, and stores the transcript.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const token = auth.replace(/^Bearer\s+/i, "");
    const isServiceRole = token === SERVICE_ROLE;
    if (!isServiceRole) {
      const { data: userData } = await admin.auth.getUser(token);
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: userData.user.id });
      const { data: isMember } = await admin.rpc("is_planipret_member", { _user_id: userData.user.id });
      if (isAdmin !== true && isMember !== true) return json({ error: "Forbidden" }, 403);
    }
    const internalAuth = `Bearer ${SERVICE_ROLE}`;

    const body = await req.json().catch(() => ({}));
    const callId = body.call_id ?? body.call_row_id ?? body.id;
    if (!callId) return json({ error: "call_id required" }, 400);

    const { data: row } = await admin
      .from("planipret_phone_calls")
      .select("id, recording_url, transcript, ai_summary, transcript_attempts")
      .eq("id", callId)
      .maybeSingle();
    if (!row) return json({ error: "call not found" }, 404);
    if (row.transcript) {
      if (!row.ai_summary) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/pp-coach-call`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: internalAuth },
            body: JSON.stringify({ call_id: callId, transcript: row.transcript }),
          });
        } catch (_) { /* best-effort */ }
      }
      const { error: cacheErr } = await admin.from("planipret_phone_calls")
        .update({ transcript_pending: false })
        .eq("id", callId);
      if (cacheErr) return json({ ok: false, error: "DB_UPDATE_FAILED", hint: cacheErr.message }, 500);
      return json({ ok: true, transcript: row.transcript, cached: true });
    }

    const markPending = async (hint: string) => {
      await admin.from("planipret_phone_calls").update({
        transcript_pending: true,
        transcript_last_attempt_at: new Date().toISOString(),
        transcript_attempts: (row.transcript_attempts ?? 0) + 1,
      }).eq("id", callId);
      return json({ ok: false, pending: true, fallback: true, error: "TRANSCRIPT_PENDING", hint, attempts: (row.transcript_attempts ?? 0) + 1 }, 200);
    };

    // Preferred source: the phone system transcription endpoint. AI is only a fallback
    // and coaching/correction runs after the phone-system transcript is stored.
    try {
      const nsTxRes = await fetch(`${SUPABASE_URL}/functions/v1/ns-get-transcription`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: internalAuth },
        body: JSON.stringify({ call_db_id: callId }),
      });
      const nsTx = await nsTxRes.json().catch(() => ({} as any));
      if (nsTx?.success && Array.isArray(nsTx.segments) && nsTx.segments.length) {
        const transcript = nsTx.segments.map((s: any) => `${s.speaker ?? "Speaker"}: ${s.text}`).join("\n");
        const { error: txUpErr } = await admin.from("planipret_phone_calls")
          .update({
            transcript,
            transcript_segments: nsTx.segments,
            transcript_language: nsTx.language ?? null,
            transcript_source: "netsapiens",
            transcript_pending: false,
            transcript_fetched_at: new Date().toISOString(),
          })
          .eq("id", callId);
        if (txUpErr) return json({ ok: false, error: "DB_UPDATE_FAILED", hint: txUpErr.message }, 500);
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/pp-coach-call`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: internalAuth },
            body: JSON.stringify({ call_id: callId, transcript }),
          });
        } catch (_) { /* best-effort */ }
        return json({ ok: true, transcript, segments: nsTx.segments, source: "ns-api" });
      }
    } catch (_) { /* fallback to audio STT below */ }

    // Resolve fresh URL (best-effort)
    let recUrl = row.recording_url as string | null;
    const resolveRes = await fetch(`${SUPABASE_URL}/functions/v1/pp-admin-recording-resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: internalAuth },
      body: JSON.stringify({ call_row_id: callId, force: true }),
    });
    const resolveJson = await resolveRes.json().catch(() => ({} as any));
    if (resolveJson?.recording_url && /^https?:\/\//i.test(resolveJson.recording_url)) {
      recUrl = resolveJson.recording_url;
    }

    // Fetch audio: prefer canonical ns-get-recording proxy (handles fresh NS-API auth + transcoding)
    let audioRes: Response | null = null;
    try {
      const proxyRes = await fetch(`${SUPABASE_URL}/functions/v1/ns-get-recording`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: internalAuth },
        body: JSON.stringify({ call_db_id: callId }),
      });
      const proxyCt = proxyRes.headers.get("content-type") ?? "";
      if (proxyRes.ok && (proxyCt.startsWith("audio") || proxyCt.includes("octet-stream"))) {
        audioRes = proxyRes;
      } else if (recUrl && /^https?:\/\//i.test(recUrl)) {
        audioRes = await fetch(recUrl);
      } else {
        const detail = await proxyRes.json().catch(() => ({}));
        return await markPending(detail?.message ?? resolveJson?.hint ?? "Enregistrement pas encore disponible côté système téléphonique.");
      }
    } catch (e) {
      return await markPending(`Audio fetch échoué: ${(e as Error).message}`);
    }
    if (!audioRes || !audioRes.ok) return await markPending(`Audio HTTP ${audioRes?.status ?? "?"}`);
    const audioBuf = new Uint8Array(await audioRes.arrayBuffer());
    if (audioBuf.length < 1024) return await markPending("Fichier audio vide côté système téléphonique.");

    // Call Lovable AI transcription
    const ct = audioRes.headers.get("content-type") ?? "audio/wav";
    const ext = ct.includes("mp3") ? "mp3" : ct.includes("mp4") ? "mp4" : ct.includes("webm") ? "webm" : "wav";
    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("file", new Blob([audioBuf], { type: ct }), `recording.${ext}`);

    const sttRes = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: form,
    });
    if (!sttRes.ok) {
      const t = await sttRes.text().catch(() => "");
      return await markPending(t.slice(0, 400) || "Transcription IA temporairement indisponible.");
    }
    const sttJson = await sttRes.json().catch(() => ({}));
    const transcript = String(sttJson?.text ?? "").trim();
    if (!transcript) return await markPending("Aucun texte détecté dans l'audio.");

    const { error: sttUpErr } = await admin.from("planipret_phone_calls")
      .update({
        transcript,
        transcript_source: "whisper-fallback",
        transcript_pending: false,
        recording_url: recUrl ?? row.recording_url,
        transcript_fetched_at: new Date().toISOString(),
      })
      .eq("id", callId);
    if (sttUpErr) return json({ ok: false, error: "DB_UPDATE_FAILED", hint: sttUpErr.message }, 500);

    // Chain to Claude-powered coaching (same config as /planipret/admin) so the record is
    // instantly enriched with corrected transcript + summary + coaching + score.
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/pp-coach-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: internalAuth },
        body: JSON.stringify({ call_id: callId, transcript }),
      });
    } catch (_) { /* best-effort */ }

    return json({ ok: true, transcript });
  } catch (e) {
    return json({ ok: false, fallback: true, error: "TRANSCRIPTION_FAILED", hint: (e as Error).message }, 200);
  }
});
