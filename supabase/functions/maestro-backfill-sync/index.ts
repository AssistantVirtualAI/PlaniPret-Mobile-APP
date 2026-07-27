// POST /functions/v1/maestro-backfill-sync
// Rattrapage (backfill) : synchronise vers Maestro tous les messages SMS et
// appels qui ne sont pas encore marqués maestro_synced = true.
//
// Peut être déclenché :
//   - Manuellement par un admin depuis le portail
//   - Via un cron Supabase (ex: toutes les heures)
//   - Après reconnexion OAuth Maestro d'un courtier
//
// Body (optionnel) :
//   { user_id?: uuid }  — si fourni, ne traite que ce courtier
//   { limit?: number }  — max messages à traiter (défaut: 100)
//   { type?: "messages" | "calls" | "all" }  — défaut: "all"
//
// verify_jwt: false — appelé en service-to-service.

import {
  adminClient,
  corsHeaders,
  getBrokerAuth,
  getMaestroConfig,
  json,
  maestroFetch,
} from "../_shared/maestro.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function syncOneMessage(
  admin: ReturnType<typeof adminClient>,
  cfg: Awaited<ReturnType<typeof getMaestroConfig>>,
  msg: Record<string, any>,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const userId = msg.user_id;
  if (!userId) return { ok: false, error: "no_user_id" };

  const auth = await getBrokerAuth(admin, userId);
  const brokerId = auth.brokerId;
  if (!brokerId) return { ok: false, skipped: true, error: "no_maestro_broker_id" };

  const direction = msg.direction ?? "outbound";
  const payload: Record<string, unknown> = {
    message: msg.body ?? "",
    direction,
    type: msg.type ?? "sms",
    sent_at: msg.sent_at ?? msg.created_at ?? new Date().toISOString(),
    to_user_number: msg.to_number ?? null,
    from_user_number: msg.from_number ?? null,
  };

  const path = `/api/v1/users/${encodeURIComponent(brokerId)}/messages?machine=1`;
  const t0 = Date.now();
  const result = await maestroFetch(cfg, {
    method: "POST",
    path,
    token: auth.token,
    body: payload,
  });
  const ms = Date.now() - t0;

  // Log
  try {
    await admin.from("planipret_maestro_sync_log").insert({
      user_id: userId,
      action: `sms.backfill.${direction}`,
      maestro_endpoint: `POST /users/${brokerId}/messages`,
      request_body: payload as any,
      response_body: result.data as any,
      response_status: result.status ?? 0,
      duration_ms: ms,
      success: result.ok,
    });
  } catch { /* non-fatal */ }

  if (result.ok && msg.id) {
    try {
      await admin
        .from("planipret_phone_messages")
        .update({ maestro_synced: true })
        .eq("id", msg.id);
    } catch { /* non-fatal */ }
  }

  return { ok: result.ok, error: result.ok ? undefined : `HTTP ${result.status}` };
}

async function syncOneCall(
  admin: ReturnType<typeof adminClient>,
  cfg: Awaited<ReturnType<typeof getMaestroConfig>>,
  call: Record<string, any>,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const userId = call.user_id;
  if (!userId) return { ok: false, error: "no_user_id" };

  // Déclencher le pipeline CDR complet via maestro-cdr
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/maestro-cdr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ call_id: call.id }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok || data?.success === true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const admin = adminClient();
    const cfg = await getMaestroConfig(admin);

    if (!cfg.url || !cfg.key) {
      return json({ ok: false, error: "maestro_not_configured" });
    }

    const filterUserId: string | null = body?.user_id ?? null;
    const limit: number = Math.min(body?.limit ?? 100, 500);
    const syncType: string = body?.type ?? "all";

    const stats = {
      messages: { total: 0, synced: 0, skipped: 0, errors: 0 },
      calls: { total: 0, synced: 0, skipped: 0, errors: 0 },
    };

    // ── Rattrapage SMS ───────────────────────────────────────────────────────
    if (syncType === "all" || syncType === "messages") {
      let msgQuery = admin
        .from("planipret_phone_messages")
        .select("id, user_id, direction, from_number, to_number, body, type, sent_at, created_at")
        .eq("maestro_synced", false)
        .not("user_id", "is", null)
        .order("created_at", { ascending: true })
        .limit(limit);

      if (filterUserId) {
        msgQuery = msgQuery.eq("user_id", filterUserId);
      }

      const { data: messages } = await msgQuery;
      const msgs = messages ?? [];
      stats.messages.total = msgs.length;

      console.log(`[maestro-backfill-sync] messages à synchroniser: ${msgs.length}`);

      for (const msg of msgs) {
        const r = await syncOneMessage(admin, cfg, msg);
        if (r.skipped) stats.messages.skipped++;
        else if (r.ok) stats.messages.synced++;
        else stats.messages.errors++;
      }
    }

    // ── Rattrapage appels ────────────────────────────────────────────────────
    if (syncType === "all" || syncType === "calls") {
      let callQuery = admin
        .from("planipret_phone_calls")
        .select("id, user_id, direction, started_at, ended_at, duration_seconds")
        .eq("maestro_synced", false)
        .not("user_id", "is", null)
        .not("ended_at", "is", null)  // Ne traiter que les appels terminés
        .order("started_at", { ascending: true })
        .limit(limit);

      if (filterUserId) {
        callQuery = callQuery.eq("user_id", filterUserId);
      }

      const { data: calls } = await callQuery;
      const callList = calls ?? [];
      stats.calls.total = callList.length;

      console.log(`[maestro-backfill-sync] appels à synchroniser: ${callList.length}`);

      for (const call of callList) {
        const r = await syncOneCall(admin, cfg, call);
        if (r.skipped) stats.calls.skipped++;
        else if (r.ok) stats.calls.synced++;
        else stats.calls.errors++;
      }
    }

    console.log(`[maestro-backfill-sync] terminé:`, JSON.stringify(stats));

    return json({
      ok: true,
      stats,
      user_id: filterUserId ?? "all",
      sync_type: syncType,
    });
  } catch (e) {
    console.error("[maestro-backfill-sync]", e);
    return json({ ok: false, error: (e as Error).message ?? "error" }, 500);
  }
});
