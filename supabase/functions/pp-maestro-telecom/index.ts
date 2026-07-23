// pp-maestro-telecom — generic proxy for Maestro Telecom REST API operations
// that don't have an NS-API equivalent (lookups, recordings, transcriptions,
// voicemail, read markers, communications, per-contact history).
//
// POST body { action, ...params }
//
// Actions:
//   lookup-by-phone      { phone }
//   recording            { call_id }
//   transcription        { call_id }
//   voicemail            { call_id }
//   mark-read-call       { call_id }
//   mark-read-messages   { phone_number }
//   recent-comms         { }
//   all-comms            { }
//   call-history-with    { contact }         // phone or user id
//   user-comms           { user_id }
//   user-messages-with   { user_id, phone_number }
//
// Security: same guard as pp-ns-sms (requirePlanipretBroker) + must have a
// linked Maestro broker id on the profile.

import {
  corsHeaders,
  jsonResponse,
  requirePlanipretBroker,
} from "../_shared/planipret-ns.ts";
import {
  getMaestroTelecomConfig,
  isMaestroTelecomConfigured,
  maestroTelecomFetch,
} from "../_shared/maestro-telecom.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const guard = await requirePlanipretBroker(req);
  if (guard instanceof Response) return guard;
  const { ctx, supabase } = guard;

  if (!ctx.maestroBrokerId) {
    return jsonResponse({ ok: false, error: "no_maestro_broker_id", needs_link: true }, 200);
  }

  const cfg = await getMaestroTelecomConfig(supabase);
  if (!isMaestroTelecomConfigured(cfg)) {
    return jsonResponse({ ok: false, error: "maestro_telecom_not_configured" }, 200);
  }

  const body = await req.json().catch(() => ({} as any));
  const action = String(body?.action ?? "");
  const meId = encodeURIComponent(ctx.maestroBrokerId);

  try {
    switch (action) {
      case "me": {
        // GET /user — current broker profile
        const r = await maestroTelecomFetch<any>(cfg, `/user`);
        return jsonResponse({ ok: r.ok, status: r.status, data: r.data });
      }
      case "sip": {
        // GET /users/{id}/sip — SIP credentials
        const r = await maestroTelecomFetch<any>(cfg, `/users/${meId}/sip`);
        const d: any = r.data ?? {};
        const sip_username =
          d?.sip_username ?? d?.username ?? d?.sip?.username ?? d?.extension ?? null;
        return jsonResponse({
          ok: r.ok,
          status: r.status,
          sip_username,
          maestro_broker_id: ctx.maestroBrokerId,
          data: r.data,
        });
      }
      case "calls-list": {
        // GET /users/{id}/calls
        const r = await maestroTelecomFetch(cfg, `/users/${meId}/calls`);
        return jsonResponse({ ok: r.ok, status: r.status, data: r.data });
      }
      case "call-create": {
        // POST /users/{id}/calls
        if (!body.call) return jsonResponse({ error: "call payload required" }, 400);
        const r = await maestroTelecomFetch(cfg, `/users/${meId}/calls`, {
          method: "POST", body: body.call,
        });
        return jsonResponse({ ok: r.ok, status: r.status, data: r.data });
      }
      case "call-update": {
        // PUT /users/{id}/calls/{callId}
        if (!body.call_id) return jsonResponse({ error: "call_id required" }, 400);
        if (!body.patch) return jsonResponse({ error: "patch payload required" }, 400);
        const r = await maestroTelecomFetch(cfg,
          `/users/${meId}/calls/${encodeURIComponent(body.call_id)}`,
          { method: "PUT", body: body.patch });
        return jsonResponse({ ok: r.ok, status: r.status, data: r.data });
      }
      case "sms-send": {
        // POST /users/{id}/messages
        if (!body.message) return jsonResponse({ error: "message payload required" }, 400);
        const r = await maestroTelecomFetch(cfg, `/users/${meId}/messages`, {
          method: "POST", body: body.message,
        });
        return jsonResponse({ ok: r.ok, status: r.status, data: r.data });
      }
      case "inbox": {
        // GET /users/{id}/inbox
        const r = await maestroTelecomFetch(cfg, `/users/${meId}/inbox`);
        return jsonResponse({ ok: r.ok, status: r.status, data: r.data });
      }
      case "messages-with": {
        // GET /users/{id}/messages/with/{phoneNumber}
        if (!body.phone_number) return jsonResponse({ error: "phone_number required" }, 400);
        const r = await maestroTelecomFetch(cfg,
          `/users/${meId}/messages/with/${encodeURIComponent(String(body.phone_number))}`);
        return jsonResponse({ ok: r.ok, status: r.status, data: r.data });
      }

      case "lookup-by-phone": {
        if (!body.phone) return jsonResponse({ error: "phone required" }, 400);
        const r = await maestroTelecomFetch(cfg, `/users/${meId}/lookup-by-phone`, {
          method: "POST", body: { phone: String(body.phone) },
        });
        return jsonResponse({ ok: r.ok, status: r.status, data: r.data });
      }
      case "recording":
      case "transcription":
      case "voicemail": {
        if (!body.call_id) return jsonResponse({ error: "call_id required" }, 400);
        const r = await maestroTelecomFetch(cfg, `/users/${meId}/call/${encodeURIComponent(body.call_id)}/${action}`);
        return jsonResponse({ ok: r.ok, status: r.status, data: r.data });
      }
      case "mark-read-call": {
        if (!body.call_id) return jsonResponse({ error: "call_id required" }, 400);
        const r = await maestroTelecomFetch(cfg, `/users/${meId}/call/${encodeURIComponent(body.call_id)}/read`, { method: "POST" });
        return jsonResponse({ ok: r.ok, status: r.status, data: r.data });
      }
      case "mark-read-messages": {
        if (!body.phone_number) return jsonResponse({ error: "phone_number required" }, 400);
        const r = await maestroTelecomFetch(cfg, `/users/${meId}/read-messages/${encodeURIComponent(body.phone_number)}`, { method: "POST" });
        return jsonResponse({ ok: r.ok, status: r.status, data: r.data });
      }
      case "recent-comms": {
        const r = await maestroTelecomFetch<any>(cfg, `/users/${meId}/communications/recent`);
        const list = Array.isArray(r.data) ? r.data : (r.data?.communications ?? r.data?.data ?? []);
        return jsonResponse({ ok: r.ok, status: r.status, communications: list, data: r.data });
      }
      case "all-comms": {
        const r = await maestroTelecomFetch(cfg, `/users/${meId}/communications/all`);
        return jsonResponse({ ok: r.ok, status: r.status, data: r.data });
      }
      case "call-history-with": {
        if (!body.contact) return jsonResponse({ error: "contact required" }, 400);
        const r = await maestroTelecomFetch(cfg, `/users/${meId}/calls/with/${encodeURIComponent(String(body.contact))}`);
        return jsonResponse({ ok: r.ok, status: r.status, data: r.data });
      }
      case "user-comms": {
        if (!body.user_id) return jsonResponse({ error: "user_id required" }, 400);
        const r = await maestroTelecomFetch(cfg, `/users/${meId}/user-communications/${encodeURIComponent(String(body.user_id))}`);
        return jsonResponse({ ok: r.ok, status: r.status, data: r.data });
      }
      case "user-messages-with": {
        if (!body.user_id || !body.phone_number) return jsonResponse({ error: "user_id and phone_number required" }, 400);
        const r = await maestroTelecomFetch(cfg,
          `/users/${meId}/user-messages/${encodeURIComponent(String(body.user_id))}/with/${encodeURIComponent(String(body.phone_number))}`);
        return jsonResponse({ ok: r.ok, status: r.status, data: r.data });
      }
      default:
        return jsonResponse({ error: `unsupported action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[pp-maestro-telecom]", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
