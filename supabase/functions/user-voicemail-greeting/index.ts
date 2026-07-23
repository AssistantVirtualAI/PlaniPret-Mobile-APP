// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ELEVEN_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";

const TOP_VOICES = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice" },
];

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const MAX_CONCURRENT_PER_USER = 2;

type TtsResult = {
  ok: boolean;
  audio?: ArrayBuffer;
  request_id: string | null;
  http_status: number | null;
  error_message?: string;
  error_payload?: any;
  duration_ms: number;
};

async function ttsCall(text: string, voiceId: string, signal?: AbortSignal): Promise<TtsResult> {
  const start = Date.now();
  if (!ELEVEN_KEY) {
    return { ok: false, request_id: null, http_status: null, error_message: "missing_elevenlabs_key", duration_ms: 0 };
  }
  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75, use_speaker_boost: true },
        }),
        signal,
      },
    );
    const reqId = r.headers.get("request-id") ?? r.headers.get("x-request-id") ?? null;
    const httpStatus = r.status;
    if (!r.ok) {
      const text = await r.text();
      let payload: any = text;
      try { payload = JSON.parse(text); } catch { /* keep as string */ }
      return {
        ok: false,
        request_id: reqId,
        http_status: httpStatus,
        error_message: typeof payload === "object" ? (payload?.detail?.message ?? payload?.detail?.status ?? text.slice(0, 300)) : text.slice(0, 300),
        error_payload: payload,
        duration_ms: Date.now() - start,
      };
    }
    const audio = await r.arrayBuffer();
    return { ok: true, audio, request_id: reqId, http_status: httpStatus, duration_ms: Date.now() - start };
  } catch (e: any) {
    return {
      ok: false,
      request_id: null,
      http_status: null,
      error_message: String(e?.message ?? e).slice(0, 500),
      error_payload: { name: e?.name, message: String(e?.message ?? e) },
      duration_ms: Date.now() - start,
    };
  }
}

async function logAttempt(admin: any, g: any, attemptNumber: number, r: TtsResult, status: "succeeded" | "failed" | "canceled") {
  await admin.from("pbx_voicemail_greeting_attempts").insert({
    greeting_id: g.id,
    user_id: g.user_id,
    organization_id: g.organization_id,
    attempt_number: attemptNumber,
    status,
    request_id: r.request_id,
    http_status: r.http_status,
    error_message: r.error_message ?? null,
    error_payload: r.error_payload ?? null,
    voice_id: g.voice_id,
    duration_ms: r.duration_ms,
    finished_at: new Date().toISOString(),
  });
}

async function processGeneration(admin: any, greetingId: string) {
  const { data: g } = await admin
    .from("pbx_voicemail_greetings")
    .select("*")
    .eq("id", greetingId)
    .maybeSingle();
  if (!g) return { ok: false, error: "not_found" };
  if (g.status === "canceled") return { ok: false, error: "canceled" };

  await admin
    .from("pbx_voicemail_greetings")
    .update({ status: "generating", error_message: null, last_attempt_at: new Date().toISOString() })
    .eq("id", greetingId);

  const result = await ttsCall(g.text_script, g.voice_id ?? "EXAVITQu4vr4xnSDxMaL");
  const attemptNumber = g.attempts ?? 1;

  // Check if canceled mid-flight.
  const { data: fresh } = await admin
    .from("pbx_voicemail_greetings")
    .select("status")
    .eq("id", greetingId)
    .maybeSingle();
  if (fresh?.status === "canceled") {
    await logAttempt(admin, g, attemptNumber, result, "canceled");
    return { ok: false, error: "canceled" };
  }

  if (!result.ok) {
    await logAttempt(admin, g, attemptNumber, result, "failed");
    await admin
      .from("pbx_voicemail_greetings")
      .update({ status: "failed", error_message: result.error_message ?? "tts_failed" })
      .eq("id", greetingId);
    return { ok: false, error: result.error_message ?? "tts_failed" };
  }

  const path = `${g.organization_id}/${g.user_id}/lib-${g.id}.mp3`;
  const { error: upErr } = await admin.storage
    .from("voicemail-greetings")
    .upload(path, new Uint8Array(result.audio!), { contentType: "audio/mpeg", upsert: true });
  if (upErr) {
    const r2 = { ...result, ok: false, error_message: String(upErr.message ?? upErr), error_payload: upErr };
    await logAttempt(admin, g, attemptNumber, r2, "failed");
    await admin
      .from("pbx_voicemail_greetings")
      .update({ status: "failed", error_message: r2.error_message })
      .eq("id", greetingId);
    return { ok: false, error: r2.error_message };
  }

  await logAttempt(admin, g, attemptNumber, result, "succeeded");
  const { data: row } = await admin
    .from("pbx_voicemail_greetings")
    .update({ storage_path: path, status: "ready", error_message: null })
    .eq("id", greetingId)
    .select()
    .single();
  const { data: signed } = await admin.storage.from("voicemail-greetings").createSignedUrl(path, 3600);
  return { ok: true, greeting: { ...row, audio_url: signed?.signedUrl ?? null } };
}

async function dequeueNext(admin: any, userId: string) {
  const { count } = await admin
    .from("pbx_voicemail_greetings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "generating");
  if ((count ?? 0) >= MAX_CONCURRENT_PER_USER) return;
  const { data: next } = await admin
    .from("pbx_voicemail_greetings")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!next) return;
  // Fire & wait — Deno handles single request lifecycle; running inline is fine.
  await processGeneration(admin, next.id);
  // Cascade
  await dequeueNext(admin, userId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "missing_auth" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "invalid_auth" }, 401);
    const userId = userRes.user.id;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { action, payload } = await req.json().catch(() => ({}));
    if (!action) return json({ error: "missing_action" }, 400);

    const { data: spu } = await admin
      .from("pbx_softphone_users")
      .select("id, organization_id, extension, domain_uuid, pbx_uuid")
      .eq("portal_user_id", userId)
      .maybeSingle();

    if (action === "voices") return json({ voices: TOP_VOICES });

    if (action === "get_settings") {
      if (!spu) return json({ settings: null });
      const { data } = await admin
        .from("pbx_voicemail_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return json({ settings: data ?? null, voices: TOP_VOICES });
    }

    if (action === "save_settings") {
      if (!spu) return json({ error: "no_extension" }, 400);
      const row = {
        user_id: userId,
        organization_id: spu.organization_id,
        greeting_type: payload.greeting_type ?? "default",
        greeting_tts_text: payload.greeting_tts_text ?? null,
        greeting_voice_id: payload.greeting_voice_id ?? null,
        greeting_voice_name: payload.greeting_voice_name ?? null,
        greeting_storage_path: payload.greeting_storage_path ?? null,
        greeting_audio_url: payload.greeting_audio_url ?? null,
        transcription_enabled: payload.transcription_enabled ?? true,
        ai_summary_enabled: payload.ai_summary_enabled ?? true,
        notify_email: payload.notify_email ?? true,
        attach_audio_email: payload.attach_audio_email ?? false,
        greeting_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { error } = await admin
        .from("pbx_voicemail_settings")
        .upsert(row, { onConflict: "user_id" });
      if (error) throw error;
      await admin.from("audit_logs").insert({
        organization_id: spu.organization_id,
        user_id: userId,
        action: "voicemail_settings_saved",
        resource_type: "pbx_voicemail_settings",
        metadata: { source: "desktop_app", greeting_type: row.greeting_type },
      });
      return json({ ok: true });
    }

    if (action === "generate_tts") {
      if (!spu) return json({ error: "no_extension" }, 400);
      const text: string = String(payload?.text ?? "").trim();
      const voiceId: string = String(payload?.voice_id ?? "EXAVITQu4vr4xnSDxMaL");
      if (!text) return json({ error: "missing_text" }, 400);
      const result = await ttsCall(text, voiceId);
      if (!result.ok) return json({ error: result.error_message ?? "tts_failed" }, 502);
      const path = `${spu.organization_id}/${userId}/greeting-${Date.now()}.mp3`;
      const { error: upErr } = await admin.storage.from("voicemail-greetings").upload(path, new Uint8Array(result.audio!), {
        contentType: "audio/mpeg",
        upsert: true,
      });
      if (upErr) throw upErr;
      const { data: signed } = await admin.storage.from("voicemail-greetings").createSignedUrl(path, 3600);
      return json({ storage_path: path, url: signed?.signedUrl ?? null });
    }

    if (action === "get_greeting_url") {
      const path: string = payload?.path;
      if (!path) return json({ url: null });
      const { data, error } = await admin.storage.from("voicemail-greetings").createSignedUrl(path, 3600);
      if (error) throw error;
      return json({ url: data.signedUrl });
    }

    // ============= GREETINGS LIBRARY =============

    if (action === "list_greetings") {
      const { data, error } = await admin
        .from("pbx_voicemail_greetings")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const greetings = await Promise.all((data ?? []).map(async (g: any) => {
        if (g.status !== "ready") return { ...g, audio_url: null };
        const { data: s } = await admin.storage.from("voicemail-greetings").createSignedUrl(g.storage_path, 3600);
        return { ...g, audio_url: s?.signedUrl ?? null };
      }));
      const { data: exts } = await admin
        .from("pbx_softphone_users")
        .select("extension, display_name")
        .eq("portal_user_id", userId);
      const { count: generatingCount } = await admin
        .from("pbx_voicemail_greetings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "generating");
      const { count: queuedCount } = await admin
        .from("pbx_voicemail_greetings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "queued");
      return json({
        greetings,
        extensions: exts ?? [],
        voices: TOP_VOICES,
        throttle: {
          max_concurrent: MAX_CONCURRENT_PER_USER,
          generating: generatingCount ?? 0,
          queued: queuedCount ?? 0,
        },
      });
    }

    if (action === "list_attempts") {
      const id: string = payload?.id;
      if (!id) return json({ error: "missing_id" }, 400);
      const { data: g } = await admin
        .from("pbx_voicemail_greetings")
        .select("user_id")
        .eq("id", id)
        .maybeSingle();
      if (!g || g.user_id !== userId) return json({ error: "forbidden" }, 403);
      const { data, error } = await admin
        .from("pbx_voicemail_greeting_attempts")
        .select("*")
        .eq("greeting_id", id)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return json({ attempts: data ?? [] });
    }

    if (action === "create_greeting") {
      if (!spu) return json({ error: "no_extension" }, 400);
      const name: string = String(payload?.name ?? "").trim() || "Untitled greeting";
      const text: string = String(payload?.text ?? "").trim();
      const voiceId: string = String(payload?.voice_id ?? "EXAVITQu4vr4xnSDxMaL");
      const extension: string | null = payload?.extension ?? null;
      if (!text) return json({ error: "missing_text" }, 400);
      if (text.length > 2000) return json({ error: "text_too_long" }, 400);
      const voiceName = TOP_VOICES.find((v) => v.id === voiceId)?.name ?? null;

      // Throttle: count current in-flight jobs for this user.
      const { count: inflight } = await admin
        .from("pbx_voicemail_greetings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "generating");

      const initialStatus = (inflight ?? 0) >= MAX_CONCURRENT_PER_USER ? "queued" : "generating";

      const { data: pending, error: pErr } = await admin
        .from("pbx_voicemail_greetings")
        .insert({
          user_id: userId,
          organization_id: spu.organization_id,
          extension,
          name,
          source: "tts",
          text_script: text,
          voice_id: voiceId,
          voice_name: voiceName,
          storage_path: `pending-${Date.now()}`,
          status: initialStatus,
          attempts: 1,
          last_attempt_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (pErr) throw pErr;

      if (initialStatus === "queued") {
        return json({ greeting: { ...pending, audio_url: null }, queued: true });
      }

      const res = await processGeneration(admin, pending.id);
      // After completion, attempt to start the next queued job.
      await dequeueNext(admin, userId).catch(() => {});
      if (!res.ok) return json({ error: res.error, greeting_id: pending.id }, 502);
      return json({ greeting: res.greeting });
    }

    if (action === "retry_greeting" || action === "regenerate_greeting") {
      if (!spu) return json({ error: "no_extension" }, 400);
      const id: string = payload?.id;
      if (!id) return json({ error: "missing_id" }, 400);
      const { data: g } = await admin
        .from("pbx_voicemail_greetings")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!g || g.user_id !== userId) return json({ error: "forbidden" }, 403);
      if (!g.text_script) return json({ error: "no_script_to_retry" }, 400);
      if (g.status === "generating") return json({ error: "already_generating" }, 409);

      const { count: inflight } = await admin
        .from("pbx_voicemail_greetings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "generating");

      const nextStatus = (inflight ?? 0) >= MAX_CONCURRENT_PER_USER ? "queued" : "generating";

      await admin
        .from("pbx_voicemail_greetings")
        .update({
          status: nextStatus,
          error_message: null,
          canceled_at: null,
          attempts: (g.attempts ?? 0) + 1,
          last_attempt_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (nextStatus === "queued") {
        return json({ ok: true, queued: true });
      }

      const res = await processGeneration(admin, id);
      await dequeueNext(admin, userId).catch(() => {});
      if (!res.ok) return json({ error: res.error }, 502);
      return json({ greeting: res.greeting });
    }

    if (action === "cancel_greeting") {
      const id: string = payload?.id;
      if (!id) return json({ error: "missing_id" }, 400);
      const { data: g } = await admin
        .from("pbx_voicemail_greetings")
        .select("user_id,status")
        .eq("id", id)
        .maybeSingle();
      if (!g || g.user_id !== userId) return json({ error: "forbidden" }, 403);
      if (g.status !== "generating" && g.status !== "queued") {
        return json({ error: "not_cancelable" }, 400);
      }
      await admin
        .from("pbx_voicemail_greetings")
        .update({
          status: "canceled",
          canceled_at: new Date().toISOString(),
          error_message: "Canceled by user",
        })
        .eq("id", id);
      // Free a slot for queued items.
      await dequeueNext(admin, userId).catch(() => {});
      return json({ ok: true });
    }

    if (action === "delete_greeting") {
      const id: string = payload?.id;
      if (!id) return json({ error: "missing_id" }, 400);
      const { data: g } = await admin
        .from("pbx_voicemail_greetings")
        .select("storage_path,user_id")
        .eq("id", id)
        .maybeSingle();
      if (!g || g.user_id !== userId) return json({ error: "forbidden" }, 403);
      await admin.storage.from("voicemail-greetings").remove([g.storage_path]).catch(() => {});
      await admin.from("pbx_voicemail_greetings").delete().eq("id", id);
      return json({ ok: true });
    }

    if (action === "activate_greeting") {
      if (!spu) return json({ error: "no_extension" }, 400);
      const id: string = payload?.id;
      if (!id) return json({ error: "missing_id" }, 400);
      const { data: g } = await admin
        .from("pbx_voicemail_greetings")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!g || g.user_id !== userId) return json({ error: "forbidden" }, 403);
      let q = admin.from("pbx_voicemail_greetings").update({ is_active: false }).eq("user_id", userId);
      q = g.extension ? q.eq("extension", g.extension) : q.is("extension", null);
      await q;
      await admin.from("pbx_voicemail_greetings").update({ is_active: true }).eq("id", id);
      const { data: signed } = await admin.storage
        .from("voicemail-greetings")
        .createSignedUrl(g.storage_path, 3600);
      let pbxPublish: any = null;
      try {
        const { data: fileData, error: dlErr } = await admin.storage.from("voicemail-greetings").download(g.storage_path);
        if (dlErr) throw dlErr;
        const audioBase64 = arrayBufferToBase64(await fileData.arrayBuffer());
        const safeExt = String(g.extension || spu.extension || "voicemail").replace(/[^A-Za-z0-9_-]/g, "_");
        const filename = `ava-voicemail-${safeExt}-${g.id}.mp3`;
        const uploadRes = await fetch(`${SUPABASE_URL}/functions/v1/fusionpbx-proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
          body: JSON.stringify({
            action: "upload-recording",
            organization_id: spu.organization_id,
            params: { domain_uuid: spu.domain_uuid, filename, audio_base64: audioBase64, mime: "audio/mpeg", description: `Voicemail greeting: ${g.name}` },
          }),
        });
        pbxPublish = await uploadRes.json().catch(() => ({ ok: false, status: uploadRes.status }));
        if (pbxPublish?.ok) {
          const updateRes = await fetch(`${SUPABASE_URL}/functions/v1/fusionpbx-proxy`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
            body: JSON.stringify({
              action: "update-extension",
              organization_id: spu.organization_id,
              params: {
                domain_uuid: spu.domain_uuid,
                extension_uuid: spu.pbx_uuid,
                extension: spu.extension,
                voicemail_enabled: "true",
                voicemail_custom_prompt: "true",
                voicemail_file: filename,
              },
            }),
          });
          const extensionUpdate = await updateRes.json().catch(() => ({ ok: false, status: updateRes.status }));
          pbxPublish = { ...pbxPublish, extension_update: extensionUpdate };
          await admin.from("pbx_softphone_users").update({
            voicemail_file: filename,
            voicemail_custom_prompt: true,
            updated_at: new Date().toISOString(),
          }).eq("id", spu.id);
        }
      } catch (e: any) {
        pbxPublish = { ok: false, error: String(e?.message || e) };
      }
      await admin.from("pbx_voicemail_settings").upsert({
        user_id: userId,
        organization_id: spu.organization_id,
        greeting_type: "tts",
        greeting_tts_text: g.text_script,
        greeting_voice_id: g.voice_id,
        greeting_voice_name: g.voice_name,
        greeting_storage_path: g.storage_path,
        greeting_audio_url: signed?.signedUrl ?? null,
        greeting_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      await admin.from("audit_logs").insert({
        organization_id: spu.organization_id,
        user_id: userId,
        action: "voicemail_greeting_activated",
        resource_type: "pbx_voicemail_greetings",
        resource_id: id,
        metadata: { extension: g.extension, name: g.name, pbx_publish: pbxPublish },
      });
      return json({ ok: true, audio_url: signed?.signedUrl ?? null, pbx_publish: pbxPublish });
    }

    if (action === "rename_greeting") {
      const id: string = payload?.id;
      const name: string = String(payload?.name ?? "").trim();
      if (!id || !name) return json({ error: "missing_fields" }, 400);
      const { error } = await admin
        .from("pbx_voicemail_greetings")
        .update({ name })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
