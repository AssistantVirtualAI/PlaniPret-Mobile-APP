// pp-maestro-push-sweeper — pousse vers Maestro tout ce qui manque aux appels
// déjà synchronisés au niveau CDR : enregistrement, transcription, résumé IA et
// coaching IA. Appelé par pg_cron toutes les 5 minutes.
//
// POST { limit?, max_age_hours?, force?, call_id? }
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pp-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const CRON_SECRET = Deno.env.get("PP_CRON_TOKEN") ?? Deno.env.get("PP_CRON_SECRET") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const isCron = !!CRON_SECRET && req.headers.get("x-pp-cron-secret") === CRON_SECRET;
  const isService = token && token === SERVICE_ROLE;

  if (!isCron && !isService) {
    if (!token) return json({ error: "Unauthorized" }, 401);
    const { data: userData } = await admin.auth.getUser(token);
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: userData.user.id });
    if (isAdmin !== true) return json({ error: "Forbidden" }, 403);
  }

  const body = await req.json().catch(() => ({} as any));
  const limit = Math.min(Math.max(Number(body?.limit) || 20, 1), 100);
  const maxAgeHours = Number(body?.max_age_hours ?? 24 * 14);
  const force = body?.force === true;

  let q = admin
    .from("planipret_phone_calls")
    .select("id, user_id, duration_seconds, maestro_call_id, transcript, ai_summary, ai_coaching, recording_storage_path, recording_url, ns_recording_url, maestro_media_synced_at")
    .not("maestro_call_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit * 3);

  if (body?.call_id) q = q.eq("id", body.call_id);
  else {
    q = q.gte("created_at", new Date(Date.now() - maxAgeHours * 3600_000).toISOString());
    if (!force) q = q.is("maestro_media_synced_at", null);
  }

  const { data: rows, error } = await q;
  if (error) return json({ error: error.message }, 500);

  // On ne pousse que les appels qui ont vraiment quelque chose à pousser.
  const eligible = (rows ?? []).filter((r: any) =>
    body?.call_id || force ||
    !!r.transcript || !!r.ai_summary || !!r.ai_coaching ||
    !!r.recording_storage_path || !!r.recording_url || !!r.ns_recording_url
  ).slice(0, limit);

  const results: any[] = [];
  for (const call of eligible) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/maestro-sync-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ call_id: call.id, force }),
      });
      const data = await res.json().catch(() => ({} as any));
      let ok = res.ok && data?.success !== false;
      // A call with no answered audio (0 s) can never produce a transcript.
      // Treat it as done instead of retrying it forever every 5 minutes.
      const noAudio = Number((call as any).duration_seconds ?? 0) <= 1;
      const onlyTranscriptMissing = data?.error === "transcript_unavailable";
      const closedAsNoAudio = !ok && noAudio && onlyTranscriptMissing;
      if (closedAsNoAudio) ok = true;
      await admin
        .from("planipret_phone_calls")
        .update({
          maestro_media_synced_at: ok ? new Date().toISOString() : null,
          maestro_media_sync_error: ok ? (closedAsNoAudio ? "no_audio_no_transcript" : null) : (data?.error ?? `http_${res.status}`),
        })
        .eq("id", call.id);
      results.push({
        call_id: call.id,
        ok,
        skipped: closedAsNoAudio ? "no_audio_no_transcript" : undefined,
        error: ok ? null : (data?.error ?? `http_${res.status}`),
        steps: data?.steps ?? null,
      });
    } catch (e) {
      results.push({ call_id: call.id, ok: false, error: (e as Error).message });
    }
  }

  return json({
    success: true,
    candidates: rows?.length ?? 0,
    processed: results.length,
    pushed: results.filter((r) => r.ok).length,
    results,
  });
});
