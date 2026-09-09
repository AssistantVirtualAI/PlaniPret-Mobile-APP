// pp-call-consent — décision du courtier en fin d'appel.
//
// Rien (audio, transcription, résumé IA, coaching) ne part vers Maestro
// tant que le courtier n'a pas dit oui. Il peut aussi supprimer un appel :
// dans ce cas l'audio, la transcription et l'analyse sont effacés chez nous
// ET retirés de Maestro.
//
// Body: { call_id, action: "approve" | "decline" | "delete" | "status",
//         channel?: "voice" | "screen", reason?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, guardPlanipret } from "../_shared/planipret-guard.ts";
import { getMaestroConfig, maestroFetchScoped, telecomAuth } from "../_shared/maestro.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CALL_FIELDS =
  "id, user_id, maestro_call_id, maestro_client_id, save_consent, save_consent_at, deleted_at, recording_url, ns_recording_url, recording_storage_path, transcript, ai_summary, ai_coaching, duration_seconds, started_at, from_number, to_number, direction, maestro_client_name";

/** Le courtier possède-t-il cet appel ? (user_id peut pointer sur auth.users ou sur le profil) */
async function ownsCall(admin: any, authUserId: string, callUserId: string | null) {
  if (!callUserId) return false;
  if (callUserId === authUserId) return true;
  const { data } = await admin
    .from("planipret_profiles")
    .select("id, user_id")
    .or(`id.eq.${callUserId},user_id.eq.${callUserId}`)
    .limit(5);
  return (data ?? []).some((p: any) => p.user_id === authUserId || p.id === authUserId);
}

/** Retire l'appel (audio + notes + analyse) de Maestro. Best-effort, journalisé. */
async function purgeFromMaestro(admin: any, call: any): Promise<{ ok: boolean; detail: string }> {
  if (!call.maestro_call_id) return { ok: true, detail: "not_in_maestro" };
  try {
    const cfg = await getMaestroConfig(admin);
    const auth = await telecomAuth(admin, call.user_id);
    if (!auth?.token) return { ok: false, detail: "no_maestro_token" };
    const id = encodeURIComponent(String(call.maestro_call_id));

    const del = await maestroFetchScoped(cfg, {
      method: "DELETE",
      path: `/api/v1/calls/${id}`,
      token: auth.token,
      brokerId: auth.brokerId,
    });
    if (del.ok) return { ok: true, detail: "deleted" };

    // Maestro n'expose pas toujours la suppression : on vide alors le contenu.
    const wipe = await maestroFetchScoped(cfg, {
      method: "PUT",
      path: `/api/v1/calls/${id}`,
      token: auth.token,
      brokerId: auth.brokerId,
      body: {
        notes: "Enregistrement et sommaire supprimés par le courtier.",
        recording_url: "",
        transcript: "",
        summary: "",
      },
    });
    return wipe.ok
      ? { ok: true, detail: "content_cleared" }
      : { ok: false, detail: `delete_${del.status}_put_${wipe.status}` };
  } catch (e) {
    return { ok: false, detail: String((e as Error)?.message ?? e).slice(0, 200) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await guardPlanipret(req);
  if ("error" in guard) return guard.error;
  const { user } = guard;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const callId = String(body?.call_id ?? "");
  const action = String(body?.action ?? "status");
  const channel = body?.channel === "voice" ? "voice" : "screen";
  if (!callId) return json({ error: "call_id_required" }, 400);

  const { data: call } = await admin
    .from("planipret_phone_calls")
    .select(CALL_FIELDS)
    .eq("id", callId)
    .maybeSingle();
  if (!call) return json({ error: "call_not_found" }, 404);

  const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: user.id });
  if (isAdmin !== true && !(await ownsCall(admin, user.id, call.user_id))) {
    return json({ error: "forbidden" }, 403);
  }

  if (action === "status") return json({ ok: true, call });

  if (action === "approve") {
    await admin.from("planipret_phone_calls").update({
      save_consent: "approved",
      save_consent_at: new Date().toISOString(),
      save_consent_by: user.id,
      save_consent_channel: channel,
    }).eq("id", callId);

    // Lance la chaîne complète : transcription → IA → Maestro.
    fetch(`${SUPABASE_URL}/functions/v1/pp-auto-process-call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ call_id: callId }),
    }).catch(() => {});

    return json({ ok: true, save_consent: "approved", processing: "started" });
  }

  if (action === "decline") {
    await admin.from("planipret_phone_calls").update({
      save_consent: "declined",
      save_consent_at: new Date().toISOString(),
      save_consent_by: user.id,
      save_consent_channel: channel,
    }).eq("id", callId);
    return json({ ok: true, save_consent: "declined", pushed_to_maestro: false });
  }

  if (action === "delete") {
    const purge = await purgeFromMaestro(admin, call);
    const now = new Date().toISOString();
    await admin.from("planipret_phone_calls").update({
      save_consent: "declined",
      deleted_at: now,
      deleted_by: user.id,
      delete_reason: String(body?.reason ?? "").slice(0, 500) || null,
      recording_url: null,
      ns_recording_url: null,
      recording_storage_path: null,
      transcript: null,
      transcript_raw: null,
      transcript_segments: null,
      ai_summary: null,
      ai_summary_short: null,
      ai_coaching: null,
      ai_analysis_json: null,
      ai_key_points: null,
      ai_action_items: null,
      ai_client_insights: null,
      maestro_purged_at: purge.ok ? now : null,
      maestro_purge_error: purge.ok ? null : purge.detail,
    }).eq("id", callId);

    return json({ ok: true, deleted: true, maestro: purge });
  }

  return json({ error: "unknown_action" }, 400);
});
