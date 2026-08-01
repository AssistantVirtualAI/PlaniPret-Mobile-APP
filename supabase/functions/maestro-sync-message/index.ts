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
} from "../_shared/maestro.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { message_id, force } = await req.json().catch(() => ({}));
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
    const contact = msg.direction === "inbound"
      ? normalizePhone(msg.from_number)
      : normalizePhone(msg.to_number);

    const t0 = Date.now();
    const res = await maestroFetchScoped(cfg, {
      method: "POST",
      path: "/api/v1/messages",
      token: auth.token,
      brokerId: auth.brokerId,
      idempotencyKey: msg.id,
      body: {
        message_id: msg.ns_message_id ?? msg.id,
        maestro_broker_id: auth.brokerId,
        direction: msg.direction,
        from_number: msg.from_number,
        to_number: msg.to_number,
        contact_number: contact,
        body: msg.body ?? "",
        sent_at: msg.sent_at ?? msg.created_at,
        channel: "sms",
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
