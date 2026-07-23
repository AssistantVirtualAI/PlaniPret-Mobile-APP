import { authBroker, corsHeaders, jsonResponse, logAudit, nsBrokerFetch, nsEnv, nsPath } from "../_shared/ns-broker.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authBroker(req);
    if ("error" in auth) return auth.error;
    const { admin, userId, profile } = auth;
    const env = nsEnv();
    const ext = profile.extension;

    const url = new URL(req.url);
    const body = req.method !== "GET" ? await req.json().catch(() => ({})) : {};
    const action = body.action ?? url.searchParams.get("action") ?? "list";
    const callId = body.call_id ?? url.searchParams.get("call_id") ?? "";
    const toNumber = body.to_number ?? body.destination ?? body.number ?? null;

    let res: Response;
    switch (action) {
      case "list":
        res = await nsBrokerFetch(admin, profile, nsPath(env.domain, ext, "/calls"), { method: "GET" });
        break;
      case "start": {
        if (!toNumber) {
          return jsonResponse({ success: false, error: "destination requise", code: 400 }, 400);
        }
        const clientCallId = crypto.randomUUID();
        // Normalize destination to E.164-ish (+1XXXXXXXXXX for NA)
        let dest = String(toNumber).replace(/\D/g, "");
        if (dest.length === 10) dest = "1" + dest;
        if (!String(toNumber).startsWith("+")) dest = "+" + dest;
        res = await nsBrokerFetch(admin, profile, nsPath(env.domain, ext, "/calls"), {
          method: "POST",
          body: JSON.stringify({
            "call-id": clientCallId,
            callid: clientCallId,
            synchronous: "no",
            "call-orig-user": `${ext}@${env.domain}`,
            "call-term-user": dest,
            destination: dest,
            "caller-id-number": body.caller_id_number ?? ext,
            "caller-id-name": body.caller_id_name ?? profile.full_name ?? "Courtier Planiprêt",
            "callback-caller-id-number": body.caller_id_number ?? ext,
          }),
        });
        if (res.ok) {
          const data = await res.clone().json().catch(() => ({}));
          const newCallId = data?.["call-id"] ?? data?.call_id ?? data?.id ?? clientCallId;
          await admin.from("planipret_phone_calls").insert({
            user_id: userId,
            organization_id: profile.organization_id,
            ns_call_id: newCallId,
            ns_callid: newCallId,
            ns_domain: env.domain,
            extension: ext,
            direction: "outbound",
            from_number: String(body.caller_id_number ?? ext),
            to_number: dest,
            status: "outbound_ringing",
            started_at: new Date().toISOString(),
            metadata: { client_call_id: clientCallId, ns_response: data },
          });
          await logAudit(admin, req, {
            user_id: profile.id, action: "CALL_START",
            resource_type: "call", resource_id: newCallId ? String(newCallId) : null,
            metadata: { direction: "outbound", to: dest },
          });
        }
        break;
      }
      case "answer":
        res = await nsBrokerFetch(admin, profile, nsPath(env.domain, ext, `/calls/${encodeURIComponent(callId)}/answer`), { method: "PATCH" });
        break;
      case "hold":
        res = await nsBrokerFetch(admin, profile, nsPath(env.domain, ext, `/calls/${encodeURIComponent(callId)}/hold`), { method: "PATCH" });
        break;
      case "unhold":
        res = await nsBrokerFetch(admin, profile, nsPath(env.domain, ext, `/calls/${encodeURIComponent(callId)}/unhold`), { method: "PATCH" });
        break;
      case "transfer":
        res = await nsBrokerFetch(admin, profile, nsPath(env.domain, ext, `/calls/${encodeURIComponent(callId)}/transfer`), {
          method: "PATCH",
          body: JSON.stringify({ transfer_to: body.transfer_to }),
        });
        break;
      case "disconnect":
        res = await nsBrokerFetch(admin, profile, nsPath(env.domain, ext, `/calls/${encodeURIComponent(callId)}`), { method: "DELETE" });
        if (res.ok && callId) {
          await admin.from("planipret_phone_calls").update({ status: "completed" }).eq("call_id", callId);
        }
        break;
      case "reject":
        res = await nsBrokerFetch(admin, profile, nsPath(env.domain, ext, `/calls/${encodeURIComponent(callId)}/reject`), { method: "DELETE" });
        break;
      default:
        return jsonResponse({ success: false, error: `action invalide: ${action}`, code: 400 }, 400);
    }

    const text = await res.text();
    const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;

    if (res.status === 403) return jsonResponse({ success: false, error: "Accès non autorisé", code: 403 }, 200);
    if (!res.ok) return jsonResponse({ success: false, error: typeof data === "string" ? data : (data?.message ?? "NS-API error"), code: res.status }, 200);
    return jsonResponse({ success: true, data });
  } catch (e) {
    console.error("ns-calls error", e);
    return jsonResponse({ success: false, error: (e as Error).message ?? "Connexion perdue", code: 0 }, 200);
  }
});
