// pp-call-followup — envoi d'un suivi (texto ou courriel) après un appel.
//
// Le brouillon rédigé par AVA n'est jamais envoyé automatiquement : cette
// fonction refuse toute exécution sans `confirmed: true`, vérifie que l'appel
// appartient bien au courtier, valide le destinataire et applique une clé
// d'idempotence serveur (un double tap, un retry réseau ou un webhook rejoué
// renvoient le résultat du premier envoi, sans deuxième envoi).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, guardPlanipret } from "../_shared/planipret-guard.ts";
import { buildIdempotencyKey, claimAction, finishAction, logProposal } from "../_shared/ava-confirm.ts";
import { validateFollowup } from "./logic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await guardPlanipret(req);
  if ("error" in guard) return guard.error;
  const { user } = guard;
  const authHeader = req.headers.get("Authorization") ?? "";

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  const callId = String(body?.call_id ?? "").trim();
  if (!callId) return json({ error: "call_id_required" }, 400);

  const check = validateFollowup(body);

  // Le courtier possède-t-il cet appel ?
  const { data: call } = await admin
    .from("planipret_phone_calls")
    .select("id, user_id")
    .eq("id", callId)
    .maybeSingle();
  if (!call) return json({ error: "call_not_found" }, 404);
  if (call.user_id !== user.id) {
    const { data: prof } = await admin
      .from("planipret_profiles").select("id, user_id").eq("user_id", user.id).maybeSingle();
    if (!prof || (call.user_id !== prof.id && call.user_id !== prof.user_id)) {
      return json({ error: "forbidden" }, 403);
    }
  }

  const idempotencyKey = await buildIdempotencyKey({
    userId: user.id,
    action: `followup_${body?.kind ?? "unknown"}`,
    destination: String(body?.recipient ?? ""),
    callId,
    payload: { body: String(body?.body ?? "").trim(), subject: body?.subject ?? null },
    provided: body?.idempotency_key ?? null,
  });

  if (!check.ok) {
    if (check.error === "confirmation_required") {
      await logProposal(admin, {
        userId: user.id, callId, action: `followup_${body?.kind ?? "unknown"}`,
        surface: "post_call_sheet", destination: String(body?.recipient ?? "") || null,
        decision: "proposed", idempotencyKey,
      });
    }
    return json({ error: check.error, needs_confirmation: check.error === "confirmation_required" }, 400);
  }

  const claim = await claimAction(admin, {
    userId: user.id, callId, action: `followup_${check.kind}`, surface: "post_call_sheet",
    destination: check.destination, provider: check.kind === "sms" ? "netsapiens" : "ms365",
    idempotencyKey,
  });
  if (claim.replay) return json({ ok: true, ...claim.result, idempotency_key: idempotencyKey });

  const { data: followup } = await admin.from("planipret_call_followups").insert({
    call_id: callId,
    user_id: user.id,
    kind: check.kind,
    recipient: check.destination,
    recipient_name: String(body?.recipient_name ?? "").slice(0, 200) || null,
    subject: check.kind === "email" ? String(body?.subject ?? "Suivi").slice(0, 200) : null,
    body: check.text,
    status: "approved",
    approved_at: new Date().toISOString(),
  }).select("id").maybeSingle();

  try {
    let ok = false;
    let detail: any = null;
    if (check.kind === "sms") {
      // Toujours depuis le DID du courtier : un seul chemin d'envoi.
      const r = await fetch(`${SUPABASE_URL}/functions/v1/pp-ns-sms?action=send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ action: "send", to: check.destination, message: check.text, idempotency_key: idempotencyKey }),
      });
      detail = await r.json().catch(() => ({}));
      ok = r.ok && detail?.success !== false && !detail?.error;
    } else {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/ms365-actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({
          action: "send_email",
          payload: { to: [check.destination], subject: String(body?.subject ?? "Suivi").slice(0, 200), body: check.text },
        }),
      });
      detail = await r.json().catch(() => ({}));
      ok = r.ok && detail?.success !== false && !detail?.error;
    }

    const errorCode = ok ? null : String(detail?.error ?? detail?.message ?? "send_failed").slice(0, 200);
    await finishAction(admin, claim.id, ok, { sent: ok, kind: check.kind }, errorCode);
    if (followup?.id) {
      await admin.from("planipret_call_followups").update({
        status: ok ? "sent" : "failed",
        sent_at: ok ? new Date().toISOString() : null,
        error: ok ? null : errorCode,
      }).eq("id", followup.id);
    }
    if (!ok) return json({ ok: false, error: errorCode, idempotency_key: idempotencyKey }, 502);
    return json({ ok: true, sent: true, kind: check.kind, idempotency_key: idempotencyKey });
  } catch (e) {
    const message = String((e as Error)?.message ?? e).slice(0, 200);
    await finishAction(admin, claim.id, false, null, message);
    if (followup?.id) {
      await admin.from("planipret_call_followups").update({ status: "failed", error: message }).eq("id", followup.id);
    }
    return json({ ok: false, error: message }, 502);
  }
});
