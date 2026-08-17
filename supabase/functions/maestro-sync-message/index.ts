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

    const t0 = Date.now();
    const res = await maestroFetchScoped(cfg, {
      method: "POST",
      path: "/api/v1/messages",
      token: auth.token,
      brokerId: auth.brokerId,
      idempotencyKey: msg.id,
      body: {
        to_user_number: contact,
        message: msg.body ?? "",
      },


    });

    await maestroSyncLog(admin, {
      user_id: msg.user_id,
      action: "message_push",
      endpoint: res.path,
      request_body: { direction: msg.direction, contact },
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
      payload: { direction: msg.direction, contact, response: res.data ?? null },
    }).catch(() => {});


    if (res.ok || res.status === 409) {
      await admin
        .from("planipret_phone_messages")
        .update({
          maestro_synced: true,
          metadata: {
            ...meta,
            maestro_synced_at: new Date().toISOString(),
            maestro_message_id: res.data?.id ?? res.data?.message_id ?? null,
          },
        })
        .eq("id", msg.id);
      return json({ success: true, message_id: msg.id, status: res.status });
    }

    return json({ success: false, status: res.status, error: res.data?.error ?? "maestro_error" }, 200);
  } catch (e: any) {
    console.error("maestro-sync-message error", e);
    return json({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
