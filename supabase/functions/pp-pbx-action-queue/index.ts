// Retry queue for PBX-dependent user actions (SMS, calls) queued by the
// mobile app when the PBX proxy is unavailable.
//
// Actions:
//   { action: "enqueue", type: "sms", payload: { to, message, from? } }
//   { action: "list" }            -> caller's own queued items
//   { action: "cancel", id }
//   { action: "process" }         -> drains due items (cron / admin)
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_ATTEMPTS = 6;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "content-type": "application/json" } });

function backoffMs(attempt: number) {
  return Math.min(30 * 60_000, 30_000 * Math.pow(2, Math.max(0, attempt - 1)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action ?? "");

  // Identify caller (service role calls skip user resolution)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  let userId: string | null = null;
  if (token && token !== SERVICE_KEY) {
    const { data } = await admin.auth.getUser(token);
    userId = data?.user?.id ?? null;
  }

  try {
    if (action === "enqueue") {
      if (!userId) return json({ error: "UNAUTHORIZED" }, 401);
      const type = String(body.type ?? "sms");
      const payload = body.payload ?? {};
      if (type === "sms" && (!payload.to || !payload.message)) {
        return json({ error: "INVALID_PAYLOAD", message: "to and message are required" }, 400);
      }
      const { data, error } = await admin
        .from("planipret_pbx_action_queue")
        .insert({
          user_id: userId,
          action: type,
          payload,
          status: "pending",
          attempts: 0,
          next_attempt_at: new Date(Date.now() + 30_000).toISOString(),
        })
        .select("id, created_at")
        .single();
      if (error) throw error;
      return json({ ok: true, id: data.id, queued_at: data.created_at });
    }

    if (action === "list") {
      if (!userId) return json({ error: "UNAUTHORIZED" }, 401);
      const { data, error } = await admin
        .from("planipret_pbx_action_queue")
        .select("id, action, payload, status, attempts, next_attempt_at, last_error, created_at")
        .eq("user_id", userId)
        .in("status", ["pending", "failed"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return json({ ok: true, items: data ?? [] });
    }

    if (action === "cancel") {
      if (!userId) return json({ error: "UNAUTHORIZED" }, 401);
      const { error } = await admin
        .from("planipret_pbx_action_queue")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", String(body.id ?? ""))
        .eq("user_id", userId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "process") {
      const { data: due, error } = await admin
        .from("planipret_pbx_action_queue")
        .select("id, user_id, action, payload, attempts")
        .eq("status", "pending")
        .lte("next_attempt_at", new Date().toISOString())
        .order("created_at", { ascending: true })
        .limit(25);
      if (error) throw error;

      let done = 0, retried = 0, dead = 0;
      for (const job of due ?? []) {
        const attempts = (job.attempts ?? 0) + 1;
        try {
          if (job.action !== "sms") throw new Error(`unsupported_action:${job.action}`);
          const res = await fetch(`${SUPABASE_URL}/functions/v1/pp-ns-sms`, {
            method: "POST",
            headers: { Authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
            body: JSON.stringify({
              action: "send",
              to: (job.payload as any)?.to,
              message: (job.payload as any)?.message,
              from: (job.payload as any)?.from ?? undefined,
              on_behalf_of: job.user_id,
              // pp-ns-sms (requirePlanipretBroker) resolves the acting broker
              // from these fields when called with the service-role key.
              _user_id: job.user_id,
              user_id: job.user_id,
            }),
          });
          if (!res.ok) throw new Error(`pp-ns-sms ${res.status}: ${(await res.text()).slice(0, 200)}`);
          await admin.from("planipret_pbx_action_queue")
            .update({ status: "done", attempts, updated_at: new Date().toISOString(), last_error: null })
            .eq("id", job.id);
          done++;
        } catch (e: any) {
          const isDead = attempts >= MAX_ATTEMPTS;
          await admin.from("planipret_pbx_action_queue").update({
            status: isDead ? "dead" : "pending",
            attempts,
            last_error: String(e?.message ?? e).slice(0, 500),
            next_attempt_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", job.id);
          isDead ? dead++ : retried++;
        }
      }
      return json({ ok: true, processed: (due ?? []).length, done, retried, dead });
    }

    return json({ error: "UNKNOWN_ACTION", action }, 400);
  } catch (e: any) {
    console.error("[pp-pbx-action-queue]", e);
    return json({ error: "INTERNAL", message: String(e?.message ?? e) }, 500);
  }
});
