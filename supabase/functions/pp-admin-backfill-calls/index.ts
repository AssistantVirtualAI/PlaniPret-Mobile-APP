// pp-admin-backfill-calls — Traite en batch tous les appels qui ont probablement
// un enregistrement (NetSapiens auto-enregistre) mais qui n'ont pas encore
// de transcription ou d'analyse Claude.
//
// - Renvoie 202 immédiatement et draine la file en arrière-plan
//   (EdgeRuntime.waitUntil) pour ne pas être coupé par le timeout Edge.
// - Traite jusqu'à `limit` (defaut 250, max 1000) appels par invocation, avec
//   concurrence limitée pour ne pas surcharger NS/Claude/Lovable AI.
// - Cron le rappelle toutes les 2 min → la file se draine automatiquement,
//   les nouveaux appels sont pris en charge sans intervention manuelle.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function processOne(row: any, downstreamAuth: string, forceAi: boolean) {
  try {
    if (forceAi && row?.transcript) {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/pp-coach-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: downstreamAuth },
        body: JSON.stringify({ call_id: row.id, force: true, reprocess: true }),
      });
      const j = await r.json().catch(() => ({}));
      return { call_id: row.id, ok: r.ok && j?.error == null, status: r.status, detail: j };
    }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/pp-admin-transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: downstreamAuth },
      body: JSON.stringify({ call_id: row.id }),
    });
    const j = await r.json().catch(() => ({}));
    return { call_id: row.id, ok: r.ok && (j?.ok !== false), status: r.status, detail: j };
  } catch (e) {
    return { call_id: row?.id, ok: false, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Shared secret for pg_cron invocations
    const CRON_SECRET = Deno.env.get("PP_CRON_TOKEN") ?? Deno.env.get("PP_CRON_SECRET") ?? "";

    const auth = req.headers.get("Authorization") ?? "";
    const cronHeader = req.headers.get("x-pp-cron-secret") ?? "";
    const isCron = CRON_SECRET && cronHeader === CRON_SECRET;
    const token = auth.startsWith("Bearer ") ? auth.replace(/^Bearer\s+/i, "") : "";
    const isServiceRole = token && token === SERVICE_ROLE;

    let downstreamAuth = auth;
    if (isCron || isServiceRole) {
      downstreamAuth = `Bearer ${SERVICE_ROLE}`;
    } else {
      if (!token) return json({ error: "Unauthorized" }, 401);
      const { data: userData } = await admin.auth.getUser(token);
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: userData.user.id });
      const { data: isMember } = await admin.rpc("is_planipret_member", { _user_id: userData.user.id });
      if (isAdmin !== true && isMember !== true) return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({} as any));
    const limit = Math.min(Math.max(Number(body.limit) || 250, 1), 1000);
    const concurrency = Math.min(Math.max(Number(body.concurrency) || 4, 1), 8);
    const dryRun = body.dry_run === true;
    const minDuration = Number.isFinite(Number(body.min_duration)) ? Number(body.min_duration) : 5;
    const forceAi = body.force_ai === true || body.reprocess === true || body.force_reprocess === true;

    // Éligibilité large: NetSapiens auto-enregistre tous les appels.
    // On prend TOUT appel avec un identifiant NS + durée > minDuration qui n'a
    // pas encore de transcription OU pas encore d'analyse Claude.
    // (Le pipeline pp-admin-transcribe marque transcript_pending si l'audio
    // n'est pas encore disponible côté PBX — inutile de re-tenter en boucle
    // dans la même invocation, on filtre les tentatives récentes < 10 min.)
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: rows, error } = await admin
      .from("planipret_phone_calls")
      .select("id, transcript, analyzed_at, ai_summary, ai_coaching, coaching_score, analysis_in_progress, analysis_locked_at, transcript_last_attempt_at, ns_call_id, ns_callid, ns_cdr_id, ns_orig_callid, duration_seconds, has_recording")
      .or([
        "has_recording.eq.true",
        "ns_call_id.not.is.null",
        "ns_callid.not.is.null",
        "ns_cdr_id.not.is.null",
        "ns_orig_callid.not.is.null",
      ].join(","))
      .gte("duration_seconds", minDuration)
      .order("started_at", { ascending: false })
      .limit(limit);
    if (error) return json({ error: error.message }, 500);

    const eligible = (rows ?? []).filter((r: any) => {
      // Skip locks < 2 min
      if (r.analysis_in_progress) {
        const lockedAt = new Date(r.analysis_locked_at || 0).getTime();
        if (Date.now() - lockedAt < 120_000) return false;
      }
      // Skip retry storm: if a transcript attempt failed in the last 10 min,
      // wait — the audio is probably still not on the PBX yet.
      if (r.transcript_last_attempt_at && !r.transcript && r.transcript_last_attempt_at > tenMinAgo) return false;
      if (!forceAi && r.transcript && r.analyzed_at && r.ai_summary && r.ai_coaching && r.coaching_score != null) return false;
      return true;
    });

    if (dryRun) {
      return json({ eligible_count: eligible.length, ids: eligible.slice(0, 50).map((r: any) => r.id) });
    }

    // Drain the queue in the background so we're not killed by the 150s
    // edge-function timeout. The client receives 202 immediately.
    const drain = (async () => {
      const results: any[] = [];
      let cursor = 0;
      const workers = Array.from({ length: concurrency }, async () => {
        while (cursor < eligible.length) {
          const idx = cursor++;
          const row = eligible[idx];
          const res = await processOne(row, downstreamAuth, forceAi);
          results.push(res);
          if (!res.ok) {
            console.log(`[backfill] ${row.id} FAILED status=${res.status} err=${JSON.stringify(res.detail ?? res.error).slice(0, 200)}`);
          }
        }
      });
      await Promise.all(workers);
      const ok = results.filter((r) => r.ok).length;
      console.log(`[backfill] done: ${ok}/${results.length} succeeded (queue was ${eligible.length})`);
    })();

    // Keep the worker alive until the drain finishes.
    // @ts-ignore Edge runtime global
    if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(drain);
    } else {
      // Fallback: fire-and-forget
      drain.catch((e) => console.error("[backfill] drain error", e));
    }

    return json({
      queued: eligible.length,
      concurrency,
      limit,
      message: "Processing started in background. Poll planipret_phone_calls for transcript/analyzed_at updates.",
    }, 202);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
