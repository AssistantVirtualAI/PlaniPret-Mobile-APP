// POST /functions/v1/maestro-webhook-receiver — inbound webhooks FROM Maestro/Kanguru.
// verify_jwt is false; signature checked via HMAC X-Maestro-Signature.
import {
  adminClient,
  corsHeaders,
  getMaestroConfig,
  hmacSha256Hex,
  json,
  maestroAudit,
} from "../_shared/maestro.ts";

async function broadcast(admin: any, brokerId: string | null | undefined, event: string, payload: any) {
  if (!brokerId) return;
  try {
    await admin.channel(`maestro-events:${brokerId}`).send({
      type: "broadcast",
      event,
      payload,
    });
  } catch {}
}

async function resolveBrokerUserId(admin: any, brokerId: string | null | undefined): Promise<string | null> {
  if (!brokerId) return null;
  const { data } = await admin
    .from("planipret_profiles")
    .select("user_id")
    .eq("maestro_broker_id", brokerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: true });

  const raw = await req.text();
  const admin = adminClient();
  const cfg = await getMaestroConfig(admin);
  const sig = req.headers.get("x-maestro-signature") ?? "";

  if (!cfg.webhookSecret) {
    await maestroAudit(admin, "webhook_not_configured", {});
    return json({ error: "webhook_not_configured" }, 503);
  }
  try {
    const expected = await hmacSha256Hex(cfg.webhookSecret, raw);
    const given = sig.replace(/^sha256=/i, "").trim().toLowerCase();
    if (given !== expected.toLowerCase()) {
      await maestroAudit(admin, "webhook_bad_signature", { event: "unknown" });
      return json({ error: "invalid_signature" }, 401);
    }
  } catch (e) {
    console.warn("signature verify error", e);
    return json({ error: "signature_verify_failed" }, 401);
  }

  let payload: any = {};
  try { payload = JSON.parse(raw); } catch {}
  const event = payload.event ?? payload.type ?? "unknown";
  const data = payload.data ?? payload.payload ?? payload;
  const brokerId = data?.broker_id ?? data?.assigned_to ?? null;
  const userId = await resolveBrokerUserId(admin, brokerId);

  // Fire and forget rest of work
  (async () => {
    try {
      await maestroAudit(admin, `event_${event}`, { brokerId, data });

      switch (event) {
        case "client.created":
          // Invalidate any stale cache for this id
          if (data?.client_id ?? data?.id) {
            await admin.from("planipret_maestro_clients").delete().eq("maestro_client_id", data?.client_id ?? data?.id);
          }
          await broadcast(admin, brokerId, "client_created", {
            title: "👤 Nouveau client Maestro",
            body: data?.name ?? data?.client?.name ?? "Nouveau client",
            client_id: data?.id ?? data?.client_id,
          });
          break;
        case "client.phone_updated": {
          const cid = data?.client_id ?? data?.id;
          const newPhone = data?.new_phone ?? data?.phone ?? null;
          if (cid) {
            await admin
              .from("planipret_maestro_clients")
              .update({ phone_e164: newPhone, cached_at: new Date().toISOString() })
              .eq("maestro_client_id", cid);
          }
          await broadcast(admin, brokerId, "client_phone_updated", {
            title: "📱 Téléphone client mis à jour",
            client_id: cid,
            new_phone: newPhone,
          });
          break;
        }

        case "appointment.updated":
          await broadcast(admin, brokerId, "appointment_updated", {
            title: "📅 RDV modifié",
            body: data?.title ?? "Rendez-vous",
            appointment_id: data?.id,
          });
          break;
        case "appointment.cancelled":
          await broadcast(admin, brokerId, "appointment_cancelled", {
            title: "❌ RDV annulé",
            body: data?.title ?? "Rendez-vous",
            appointment_id: data?.id,
          });
          break;
        case "appointment.reminder":
          await broadcast(admin, brokerId, "appointment_reminder", {
            title: "⏰ RDV dans 30 min",
            body: data?.title ?? "Rendez-vous",
            appointment_id: data?.id,
            client_id: data?.client_id,
          });
          break;
        case "task.assigned":
          await broadcast(admin, brokerId, "task_assigned", {
            title: "📌 Nouvelle tâche",
            body: data?.title ?? "Tâche",
            task_id: data?.id,
          });
          break;
        case "task.completed":
          await broadcast(admin, brokerId, "task_completed", {
            title: "✅ Tâche complétée",
            body: data?.title ?? "Tâche",
            task_id: data?.id,
          });
          break;
        default:
          await broadcast(admin, brokerId, "unknown_event", { event, data });
      }
    } catch (e) {
      console.error("maestro-webhook-receiver async error", e);
    }
  })();

  return json({ ok: true });
});
