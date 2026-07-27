// POST /functions/v1/maestro-sync-message
// Synchronise un SMS (entrant ou sortant) vers Maestro Telecom sous le bon
// broker_id du courtier. Appelé automatiquement :
//   - Par pp-ns-sms après chaque envoi SMS sortant
//   - Par ns-webhook-receiver après chaque SMS entrant (message.inbound)
//   - Par maestro-backfill-sync pour le rattrapage
//
// Body: { message_id?: uuid, user_id?: uuid, direction?, from_number?, to_number?, body?, type? }
// Si message_id est fourni, on charge le message depuis planipret_phone_messages.
// Sinon on utilise les champs du body directement.
//
// Endpoint Maestro utilisé :
//   POST /api/v1/users/{maestro_broker_id}/messages  (sortant)
//   POST /api/v1/users/{maestro_broker_id}/messages  (entrant — même endpoint, direction dans le body)
//
// verify_jwt: false — appelé en service-to-service avec service_role key.

import {
  adminClient,
  corsHeaders,
  getBrokerAuth,
  getMaestroConfig,
  json,
  maestroFetch,
} from "../_shared/maestro.ts";

interface SyncResult {
  ok: boolean;
  message_id?: string | null;
  broker_id?: string | null;
  maestro_status?: number;
  error?: string;
  skipped?: boolean;
  skip_reason?: string;
}

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const admin = adminClient();

    // ── Résolution du message ────────────────────────────────────────────────
    let msg: Record<string, any> | null = null;

    if (body?.message_id) {
      const { data } = await admin
        .from("planipret_phone_messages")
        .select("id, user_id, direction, from_number, to_number, body, type, maestro_synced, sent_at, created_at")
        .eq("id", body.message_id)
        .maybeSingle();
      msg = data ?? null;
      if (!msg) return json({ ok: false, error: "message_not_found" }, 404);
    } else {
      // Payload inline — utilisé par le webhook receiver en temps réel
      msg = {
        id: body.message_id ?? null,
        user_id: body.user_id ?? null,
        direction: body.direction ?? "inbound",
        from_number: body.from_number ?? null,
        to_number: body.to_number ?? null,
        body: body.body ?? body.message ?? "",
        type: body.type ?? "sms",
        maestro_synced: false,
        sent_at: body.sent_at ?? new Date().toISOString(),
        created_at: body.created_at ?? new Date().toISOString(),
      };
    }

    // Idempotence — ne pas re-syncer si déjà fait
    if (msg.maestro_synced) {
      return json({ ok: true, skipped: true, skip_reason: "already_synced", message_id: msg.id });
    }

    const userId: string | null = msg.user_id ?? body.user_id ?? null;
    if (!userId) {
      return json({ ok: false, error: "user_id_required" }, 400);
    }

    // ── Résolution broker_id + token ─────────────────────────────────────────
    const auth = await getBrokerAuth(admin, userId);
    const brokerId = auth.brokerId;

    if (!brokerId) {
      console.warn(`[maestro-sync-message] no broker_id for user=${userId} — skipping`);
      return json({
        ok: false,
        skipped: true,
        skip_reason: "no_maestro_broker_id",
        message_id: msg.id,
        hint: "Le courtier doit d'abord se connecter à Maestro via le flux OAuth pour que son broker_id soit résolu.",
      });
    }

    const cfg = await getMaestroConfig(admin);
    if (!cfg.url || !cfg.key) {
      return json({ ok: false, error: "maestro_not_configured" });
    }

    // ── Construction du payload Maestro ─────────────────────────────────────
    // POST /api/v1/users/{brokerId}/messages
    // Champs acceptés par Maestro Telecom (confirmés avec Scott) :
    //   to_user_number, from_user_number, message, direction, type, sent_at
    const direction = msg.direction ?? "outbound";
    const maestroPayload: Record<string, unknown> = {
      message: msg.body ?? "",
      direction,
      type: msg.type ?? "sms",
      sent_at: msg.sent_at ?? msg.created_at ?? new Date().toISOString(),
    };

    if (direction === "outbound") {
      maestroPayload.to_user_number = msg.to_number ?? null;
      maestroPayload.from_user_number = msg.from_number ?? null;
    } else {
      // inbound
      maestroPayload.to_user_number = msg.to_number ?? null;
      maestroPayload.from_user_number = msg.from_number ?? null;
    }

    const path = `/api/v1/users/${encodeURIComponent(brokerId)}/messages?machine=1`;
    console.log(`[maestro-sync-message] → POST ${path} user=${userId} broker=${brokerId} dir=${direction}`);

    const t0 = Date.now();
    const result = await maestroFetch(cfg, {
      method: "POST",
      path,
      token: auth.token,
      body: maestroPayload,
    });
    const ms = Date.now() - t0;

    console.log(`[maestro-sync-message] ← ok=${result.ok} status=${result.status} ms=${ms}`);

    // ── Log de synchronisation ───────────────────────────────────────────────
    try {
      await admin.from("planipret_maestro_sync_log").insert({
        user_id: userId,
        action: `sms.${direction}`,
        maestro_endpoint: `POST /users/${brokerId}/messages`,
        request_body: maestroPayload as any,
        response_body: result.data as any,
        response_status: result.status ?? 0,
        duration_ms: ms,
        success: result.ok,
      });
    } catch { /* non-fatal */ }

    // ── Marquer comme synchronisé dans planipret_phone_messages ─────────────
    if (result.ok && msg.id) {
      try {
        await admin
          .from("planipret_phone_messages")
          .update({ maestro_synced: true })
          .eq("id", msg.id);
      } catch { /* non-fatal */ }
    }

    const syncResult: SyncResult = {
      ok: result.ok,
      message_id: msg.id,
      broker_id: brokerId,
      maestro_status: result.status,
    };
    if (!result.ok) {
      syncResult.error = `Maestro HTTP ${result.status}`;
    }

    return json(syncResult);
  } catch (e) {
    console.error("[maestro-sync-message]", e);
    return json({ ok: false, error: (e as Error).message ?? "error" }, 500);
  }
});
