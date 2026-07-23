// ns-make-call — outbound call initiation (canonical entry point for the mobile app).
// Delegates to NS-API v2  POST /domains/{domain}/users/{extension}/calls  through the
// same `nsBrokerFetch` used by `ns-calls` (action:"start"), so both functions share
// identical NS behaviour but this one owns end-to-end tracing correlated to a callId.

import {
  authBroker,
  corsHeaders,
  jsonResponse,
  logAudit,
  nsBrokerFetch,
  nsEnv,
  nsPath,
} from "../_shared/ns-broker.ts";

function toE164(raw: string): string {
  const s = String(raw).trim();
  if (s.startsWith("+")) return s;
  let d = s.replace(/\D/g, "");
  if (d.length === 10) d = "1" + d;
  return "+" + d;
}

const trace = (traceId: string, event: string, data: Record<string, unknown> = {}) => {
  console.log(JSON.stringify({ fn: "ns-make-call", trace_id: traceId, event, ts: Date.now(), ...data }));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "method_not_allowed", code: 405 }, 405);
  }

  const traceId = crypto.randomUUID();
  const t0 = Date.now();

  try {
    trace(traceId, "request.received", { method: req.method });

    const auth = await authBroker(req);
    if ("error" in auth) { trace(traceId, "auth.failed", {}); return auth.error; }
    const { admin, userId, profile } = auth;
    const env = nsEnv();
    const ext = profile.extension;
    if (!ext) {
      trace(traceId, "missing.extension", { user_id: userId });
      return jsonResponse({ success: false, error: "NO_EXTENSION", code: 400, trace_id: traceId }, 400);
    }

    const body = await req.json().catch(() => ({} as any));
    const rawDest =
      body?.to_number ?? body?.destination ?? body?.number ?? body?.to ?? null;
    if (!rawDest || typeof rawDest !== "string") {
      trace(traceId, "missing.destination");
      return jsonResponse({ success: false, error: "destination requise", code: 400, trace_id: traceId }, 400);
    }
    const destination = toE164(rawDest);
    const callerIdNumber = body?.caller_id_number ?? body?.["caller-id-number"] ?? ext;
    const callerIdName =
      body?.caller_id_name ?? body?.["caller-id-name"] ?? profile.full_name ?? "Courtier Planiprêt";

    // NS-API v2 requires a client-generated `callid` to originate the call.
    const clientCallId = crypto.randomUUID();
    trace(traceId, "ns.request", { extension: ext, destination, caller_id_number: callerIdNumber, callid: clientCallId });

    // NS-API v2 outbound — same path/verb/body as ns-calls action:"start".
    const path = nsPath(env.domain, ext, "/calls");
    const res = await nsBrokerFetch(admin, profile, path, {
      method: "POST",
      body: JSON.stringify({
        "call-id": clientCallId,
        callid: clientCallId,
        synchronous: "no",
        "call-orig-user": `${ext}@${env.domain}`,
        "call-term-user": destination,
        destination,
        "caller-id-number": callerIdNumber,
        "caller-id-name": callerIdName,
        "callback-caller-id-number": callerIdNumber,
      }),
    });

    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!res.ok) {
      const errMsg = typeof data === "string" ? data : (data?.message ?? "NS-API error");
      trace(traceId, "ns.error", { status: res.status, error: errMsg, latency_ms: Date.now() - t0 });
      await logAudit(admin, req, {
        user_id: profile.id, action: "CALL_START_FAILED",
        resource_type: "call", resource_id: null,
        metadata: { trace_id: traceId, direction: "outbound", to: destination, status: res.status, error: errMsg, via: "ns-make-call" },
      });
      return jsonResponse({ success: false, error: errMsg, code: res.status, trace_id: traceId }, 200);
    }

    const responseCallId: string | null = data?.["call-id"] ?? data?.call_id ?? data?.id ?? null;
    const callId = responseCallId || clientCallId;
    trace(traceId, "ns.ok", { call_id: callId, response_call_id: responseCallId, latency_ms: Date.now() - t0 });

    // CDR row so the Calls tab reflects the outbound attempt.
    try {
      const { error: cdrError } = await admin.from("planipret_phone_calls").insert({
        user_id: profile.id,
        organization_id: profile.organization_id,
        ns_call_id: callId,
        ns_callid: callId,
        ns_domain: env.domain,
        extension: ext,
        direction: "outbound",
        from_number: String(callerIdNumber),
        to_number: destination,
        status: "outbound_ringing",
        started_at: new Date().toISOString(),
        metadata: { trace_id: traceId, ns_response: data, client_call_id: clientCallId, response_call_id: responseCallId },
      });
      if (cdrError) throw cdrError;
      trace(traceId, "cdr.inserted", { call_id: callId });
    } catch (e) {
      trace(traceId, "cdr.insert_failed", { call_id: callId, error: (e as Error).message });
    }

    await logAudit(admin, req, {
      user_id: profile.id, action: "CALL_START",
      resource_type: "call", resource_id: callId ? String(callId) : null,
      metadata: { trace_id: traceId, direction: "outbound", to: destination, via: "ns-make-call" },
    });

    return jsonResponse({
      success: true,
      call_id: callId,
      status: callId ? "outbound_ringing" : "queued",
      trace_id: traceId,
      data,
    });
  } catch (e) {
    trace(traceId, "unexpected.error", { error: (e as Error).message, stack: (e as Error).stack });
    return jsonResponse({ success: false, error: (e as Error).message ?? "unexpected", code: 500, trace_id: traceId }, 500);
  }
});
