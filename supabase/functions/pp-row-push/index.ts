// pp-row-push — lock-screen alerts for new SMS, missed calls and voicemails,
// whatever path stored them (NetSapiens webhook, periodic sync, app pull).
//
// Called by database triggers with only { table, id }. The caller is never
// trusted: the row is re-read with the service role and a push is sent only
// for a real, recent, inbound event, once (idempotency key shared with
// ns-webhook-receiver so the two paths never double-notify).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RECENT_MS = 2 * 3_600_000; // never alert on backfilled history
const INSERT_RECENT_MS = 30 * 60_000;

const Body = z.object({
  table: z.enum(["planipret_phone_messages", "planipret_phone_calls", "planipret_voicemails"]),
  id: z.string().uuid(),
});

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const recent = (iso?: string | null, max = RECENT_MS) => !!iso && Date.now() - new Date(iso).getTime() < max;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  // Internal database trigger only. Gateway JWT validation is enabled as a first
  // barrier; this explicit comparison prevents an ordinary authenticated user
  // from turning a known row id into another broker's lock-screen alert.
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!SERVICE_KEY || bearer !== SERVICE_KEY) return json({ error: "service_role_required" }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "invalid_body" }, 400);
  const { table, id } = parsed.data;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: row } = await admin.from(table).select("*").eq("id", id).maybeSingle();
  if (!row?.user_id) return json({ skipped: "no_row" });

  // Phone rows store the planipret_profiles id; pushes target the auth user.
  const { data: prof } = await admin.from("planipret_profiles")
    .select("user_id, notif_sms, notif_missed_call, notif_voicemails")
    .or(`id.eq.${row.user_id},user_id.eq.${row.user_id}`).limit(1).maybeSingle();
  const uid = prof?.user_id;
  if (!uid) return json({ skipped: "no_owner" });

  let payload: Record<string, unknown> | null = null;
  if (table === "planipret_phone_messages") {
    if (row.direction !== "inbound" || prof.notif_sms === false) return json({ skipped: "not_applicable" });
    if (!recent(row.created_at, INSERT_RECENT_MS) || (row.sent_at && !recent(row.sent_at))) return json({ skipped: "old" });
    const key = row.ns_message_id ?? row.id;
    payload = {
      title: `💬 ${row.from_number ?? "SMS"}`, category: "sms",
      body: String(row.body ?? "").slice(0, 140),
      data: { url: "/mplanipret/messages", type: "sms" }, deep_link: "/mplanipret/messages",
      idempotency_key: `inbound_sms:${key}`,
    };
  } else if (table === "planipret_phone_calls") {
    // PJSIP writes a native no-answer row with direction="missed", while the
    // NetSapiens CDR retains direction="inbound". Both represent one missed
    // inbound call and use the same delivery category/idempotency strategy.
    const inboundOrMissed = row.direction === "inbound" || row.direction === "missed";
    if (!inboundOrMissed || prof.notif_missed_call === false) return json({ skipped: "not_applicable" });
    const missed = row.direction === "missed" || (!row.answered_at && !(Number(row.duration_seconds ?? 0) > 0)
      && (row.status === "missed" || !!row.ended_at));
    if (!missed) return json({ skipped: "not_missed" });
    if (!recent(row.started_at ?? row.created_at)) return json({ skipped: "old" });
    const key = row.ns_call_id ?? row.ns_cdr_id ?? row.ns_callid ?? row.id;
    payload = {
      title: "📵 Appel manqué", category: "missed_call",
      body: String(row.from_name || row.from_number || "Inconnu"),
      data: { url: "/mplanipret/calls", type: "missed_call" }, deep_link: "/mplanipret/calls",
      idempotency_key: `missed_call:${key}`,
    };
  } else {
    if (prof.notif_voicemails === false) return json({ skipped: "not_applicable" });
    if (!recent(row.created_at, INSERT_RECENT_MS) || (row.received_at && !recent(row.received_at))) return json({ skipped: "old" });
    const key = row.ns_vm_id ?? row.id;
    payload = {
      title: "📬 Nouveau voicemail", category: "voicemail",
      body: `De ${row.from_name || row.from_number || "inconnu"}`,
      data: { url: "/mplanipret/voicemail", type: "voicemail" }, deep_link: "/mplanipret/voicemail",
      idempotency_key: `inbound_voicemail:${key}`,
    };
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/pp-push-notify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: uid, ...payload }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[pp-row-push] push failed [${res.status}]: ${text.slice(0, 300)}`);
    return json({ error: "push_failed", status: res.status }, 502);
  }
  return json({ ok: true, category: payload.category });
});
