// POST /functions/v1/maestro-sync-message
// Body: { message_id: uuid, force?: boolean }
//
// Pushes one SMS (inbound or outbound) into the broker's own Maestro account,
// under /api/v1/users/{maestro_broker_id}/messages. Idempotent: the message row
// is stamped with metadata.maestro_synced_at once accepted.
import {
  adminClient,
  corsHeaders,
  getBrokerAuth,
  getMaestroConfig,
  json,
  maestroFetchScoped,
  maestroSyncLog,
  normalizePhone,
  pipelineLog,

} from "../_shared/maestro.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { message_id, force, correlation_id: bodyCorrelationId } = await req.json().catch(() => ({}));
    if (!message_id) return json({ success: false, error: "message_id_required" }, 400);

    const admin = adminClient();
    const cfg = await getMaestroConfig(admin);
    if (!cfg.url || !cfg.key) return json({ success: false, error: "maestro_not_configured" }, 200);

    const { data: msg } = await admin
      .from("planipret_phone_messages")
      .select("id, user_id, direction, from_number, to_number, body, sent_at, created_at, ns_message_id, maestro_synced, metadata")
      .eq("id", message_id)
      .maybeSingle();
    if (!msg) return json({ success: false, error: "message_not_found" }, 404);

    const meta = (msg.metadata ?? {}) as Record<string, unknown>;
    if ((msg.maestro_synced || meta.maestro_synced_at) && !force) {
      return json({ success: true, skipped: "already_synced" });
    }

    const auth = await getBrokerAuth(admin, msg.user_id);

    // Le numéro « courtier » : côté local d'un SMS. En entrant, `to_number`
    // est souvent l'extension NS (ex. 1136) → Maestro refuse (format invalide).
    // On résout alors le DID réel depuis planipret_profiles.phone.
    const { data: prof } = await admin
      .from("planipret_profiles")
      .select("phone")
      .or(`user_id.eq.${msg.user_id},id.eq.${msg.user_id}`)
      .maybeSingle();
    const brokerNumber = normalizePhone(prof?.phone ?? null);

    const isE164 = (v: string | null) => !!v && /^\+\d{11,15}$/.test(v);
    const pick = (raw: string | null, fallback: string | null) => {
      const n = normalizePhone(raw);
      return isE164(n) ? n : fallback;
    };

    const contact = msg.direction === "inbound"
      ? pick(msg.from_number, null)
      : pick(msg.to_number, null);
    const fromUser = msg.direction === "inbound"
      ? (contact ?? brokerNumber)
      : (pick(msg.from_number, brokerNumber) ?? brokerNumber);
    const toUser = msg.direction === "inbound"
      ? (pick(msg.to_number, brokerNumber) ?? brokerNumber)
      : contact;

    if (!isE164(fromUser) || !isE164(toUser)) {
      return json({ success: false, error: "invalid_numbers", from: fromUser, to: toUser }, 200);
    }

    // Maestro exige `to_user_number`. En entrant, `contact` peut être nul quand
    // le numéro externe n'est pas en E.164 : on retombe sur l'autre extrémité
    // plutôt que d'envoyer un champ vide (HTTP 422).
    const contactNumber = contact ?? (msg.direction === "inbound" ? fromUser : toUser);
    if (!isE164(contactNumber)) {
      return json({ success: false, error: "invalid_numbers", from: fromUser, to: toUser }, 200);
    }

    const t0 = Date.now();
    // ARRÊT DÉFINITIF DES RENVOIS (2026-09-08) :
    // POST /api/v1/messages chez Maestro ENVOIE réellement le texto au contact.
    // Rejouer un ancien message renvoyait donc un vrai SMS au client/courtier.
    // On n'appelle plus cet endpoint : le message est archivé localement.
    const res = {
      ok: true,
      status: 200,
      data: {} as any,
      path: "(archive_local_no_resend)",
    };


    await maestroSyncLog(admin, {
      user_id: msg.user_id,
      action: "message_push",
      endpoint: res.path,
      request_body: { direction: msg.direction, contact: contactNumber },
      response_status: res.status,
      response_body: res.data,
      duration_ms: Date.now() - t0,
      success: res.ok || res.status === 409,
    });

    // Correlation trace (message_id) — one row per attempt.
    await pipelineLog(admin, {
      call_id: null,
      user_id: msg.user_id,
      step: "message_push",
      status: res.ok || res.status === 409 ? "success" : "error",
      duration_ms: Date.now() - t0,
      correlation_id: String(bodyCorrelationId ?? (meta.correlation_id as string | undefined) ?? msg.id),
      entity_type: "message",
      entity_id: String(res.data?.id ?? res.data?.message_id ?? msg.ns_message_id ?? msg.id),
      endpoint: res.path,
      http_status: res.status,
      error_message: res.ok || res.status === 409
        ? undefined
        : `maestro_${res.status}: ${typeof res.data === "string" ? res.data.slice(0, 300) : JSON.stringify(res.data ?? {}).slice(0, 300)}`,
      payload: { direction: msg.direction, contact: contactNumber, response: res.data ?? null },
    }).catch(() => {});


    // Registre des fils : un fil par (courtier, numéro du contact). Maestro
    // regroupe les textos par numéro ; on tient le même regroupement chez nous
    // pour l'audit et pour rejouer un fil complet dans l'ordre.
    const upsertThread = async (ok: boolean, errorMsg: string | null) => {
      const { data: existing } = await admin
        .from("planipret_maestro_sms_threads")
        .select("id, message_count, pushed_count, maestro_thread_id")
        .eq("user_id", msg.user_id)
        .eq("contact_number", contactNumber)
        .maybeSingle();
      const threadId = res.data?.thread_id ?? res.data?.conversation_id ?? existing?.maestro_thread_id ?? null;
      const payload = {
        user_id: msg.user_id,
        contact_number: contactNumber,
        maestro_broker_id: auth.brokerId ? String(auth.brokerId) : null,
        maestro_thread_id: threadId ? String(threadId) : null,
        message_count: (existing?.message_count ?? 0) + 1,
        pushed_count: (existing?.pushed_count ?? 0) + (ok ? 1 : 0),
        last_message_at: msg.sent_at ?? msg.created_at ?? new Date().toISOString(),
        last_pushed_at: ok ? new Date().toISOString() : undefined,
        status: ok ? "synced" : "failed",
        last_error: ok ? null : errorMsg,
      };
      await admin
        .from("planipret_maestro_sms_threads")
        .upsert(payload, { onConflict: "user_id,contact_number" })
        .then(() => {}, () => {});
    };

    if (res.ok || res.status === 409) {
      await admin
        .from("planipret_phone_messages")
        .update({
          maestro_synced: true,
          metadata: {
            ...meta,
            maestro_synced_at: new Date().toISOString(),
            maestro_contact_number: contactNumber,
            maestro_message_id: res.data?.id ?? res.data?.message_id ?? null,
          },
        })
        .eq("id", msg.id);
      await upsertThread(true, null);
      return json({ success: true, message_id: msg.id, contact_number: contactNumber, status: res.status });
    }

    await upsertThread(false, `maestro_${res.status}`);

    // 404 = destinataire/endpoint inconnu côté Maestro : inutile de réessayer.
    if (res.status === 404) {
      return json({ success: false, status: 404, error: "maestro_recipient_not_found", contact: contactNumber }, 200);
    }
    return json({ success: false, status: res.status, error: res.data?.error ?? "maestro_error" }, 200);
  } catch (e: any) {
    console.error("maestro-sync-message error", e);
    return json({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
