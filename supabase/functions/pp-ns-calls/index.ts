// pp-ns-calls — REST-only active call control via NS-API v2.
// AVA Planiprêt brokers only. Browser calls must never originate from _web.
// GET    ?action=list                          → list active calls
// POST   ?action=start  body { to_number, caller_id_number?, caller_id_name? }
// PATCH  ?action=answer|hold|unhold|transfer|disconnect|reject  body { call_id, ... }

import {
  corsHeaders,
  jsonResponse,
  requirePlanipretBroker,
  nsFetch,
} from "../_shared/planipret-ns.ts";
import {
  getMaestroTelecomConfig,
  isMaestroTelecomConfigured,
  maestroTelecomFetch,
  maestroTelecomMirror,
} from "../_shared/maestro-telecom.ts";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await requirePlanipretBroker(req);
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const url = new URL(req.url);
  let action = url.searchParams.get("action") ?? "list";
  // Also accept action from JSON body (supabase.functions.invoke can't pass ?query)
  let cachedBody: any = null;
  if (req.method !== "GET") {
    try { cachedBody = await req.clone().json(); } catch { cachedBody = null; }
    if (cachedBody?.action) action = cachedBody.action;
  }
  const base = `/domains/${encodeURIComponent(ctx.nsDomain)}/users/${encodeURIComponent(ctx.extension)}/calls`;

  try {
    if (action === "list") {
      const res = await nsFetch(base, { method: "GET" });
      const body = await res.text();
      let parsed: any = null;
      try { parsed = body ? JSON.parse(body) : null; } catch { parsed = body; }

      // Best-effort enrich with Maestro Telecom history. Never fail the NS response.
      let maestroCalls: any[] = [];
      if (ctx.maestroBrokerId) {
        try {
          const cfg = await getMaestroTelecomConfig(guard.supabase);
          if (isMaestroTelecomConfigured(cfg)) {
            const r = await maestroTelecomFetch<any>(cfg, `/users/${encodeURIComponent(ctx.maestroBrokerId)}/calls`);
            const list = Array.isArray(r.data) ? r.data : (r.data?.calls ?? r.data?.data ?? []);
            if (Array.isArray(list)) maestroCalls = list;
          }
        } catch { /* ignore */ }
      }

      return jsonResponse({ ns: parsed, maestro_calls: maestroCalls }, res.status);
    }

    if (action === "start") {
      const payload = cachedBody ?? (await req.json().catch(() => ({})));
      const raw = payload?.to_number ?? payload?.destination;
      if (!raw || typeof raw !== "string") {
        return jsonResponse({ success: false, error: "destination required" }, 200);
      }

      let dest = raw.replace(/[^\d+]/g, "");
      if (!dest.startsWith("+")) {
        const digits = dest.replace(/\D/g, "");
        dest = "+" + (digits.length === 10 ? "1" + digits : digits);
      }

      const requestedClientType = String(payload.client_type ?? "mobile").toLowerCase();
      // "web"/"widget" → {ext}_web device (SIP.js in the browser).
      // Anything else (default) → {ext}_mobile device (Capacitor app).
      const clientType: "web" | "mobile" = (requestedClientType === "web" || requestedClientType === "widget") ? "web" : "mobile";
      let deviceName = `${ctx.extension}_${clientType}`;
      if (clientType === "mobile") {
        const { data: profileDevice } = await guard.supabase
          .from("planipret_profiles")
          .select("ns_mobile_device_id")
          .eq("user_id", ctx.userId)
          .maybeSingle();
        if (profileDevice?.ns_mobile_device_id) deviceName = String(profileDevice.ns_mobile_device_id);
      }

      // Fetch device to build the exact call-orig-user SIP URI.
      let callOrigUser = payload.call_orig_user ?? `${deviceName}@${ctx.nsDomain}`;
      let deviceRegistered = false;
      let deviceState = "unknown";
      try {
        const devRes = await nsFetch(`/domains/${encodeURIComponent(ctx.nsDomain)}/users/${encodeURIComponent(ctx.extension)}/devices/${encodeURIComponent(deviceName)}`, { method: "GET" });
        if (devRes.ok) {
          const dd = await devRes.json().catch(() => null);
          const device = Array.isArray(dd) ? dd[0] : dd;
          deviceState = String(device?.["device-sip-registration-state"] ?? device?.["registration-state"] ?? "unknown").toLowerCase();
          deviceRegistered = deviceState === "registered";
          const uri = device?.["device-sip-registration-uri"];
          if (typeof uri === "string" && uri.length) {
            callOrigUser = uri.replace(/^sip:/i, "");
          }
        }
      } catch { /* fallback to constructed */ }

      if (!deviceRegistered) {
        callOrigUser = `${ctx.extension}@${ctx.nsDomain}`;
      }

      const clientCallId = crypto.randomUUID();
      const nsBody = {
        "call-id": clientCallId,
        "destination": dest,
        "origination": callOrigUser,
        "call-orig-user": callOrigUser,
        "call-term-user": dest,
        "auto-answer-enabled": "no",
        // Force NS to fully ring the originator (broker's phone) and wait for
        // pickup BEFORE dialing the destination. Without this NS may dial the
        // destination first, so the customer hears ringing before the broker.
        "synchronous": "yes",
      };

      console.log(`[pp-ns-calls] REST start requested_client=${requestedClientType} forced_client=${clientType} device=${deviceName} orig=${callOrigUser} term=${dest} ext=${ctx.extension}`);

      const res = await nsFetch(base, { method: "POST", body: JSON.stringify(nsBody) });
      const text = await res.text();
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }

      console.log(`[pp-ns-calls] NS status=${res.status} body=${typeof parsed === "string" ? parsed.slice(0,200) : JSON.stringify(parsed).slice(0,200)}`);

      const ok = res.ok || res.status === 202;
      if (ok) {
        const nsCallId = parsed?.["call-id"] ?? parsed?.call_id ?? parsed?.id ?? clientCallId;
        let maestroCallIdCreated: string | null = null;

        // Mirror to Maestro Telecom (best-effort, blocking here so we can
        // capture the returned maestro id and persist it locally). The
        // configured timeout in maestroTelecomFetch keeps this bounded.
        if (ctx.maestroBrokerId) {
          try {
            const cfg = await getMaestroTelecomConfig(guard.supabase);
            if (isMaestroTelecomConfigured(cfg)) {
              const r = await maestroTelecomFetch<any>(
                cfg,
                `/users/${encodeURIComponent(ctx.maestroBrokerId)}/calls`,
                {
                  method: "POST",
                  body: {
                    provider_call_id: nsCallId,
                    to_user_number: dest,
                    status: "dialing",
                    direction: "outbound",
                  },
                },
              );
              maestroCallIdCreated = r.data?.id ?? r.data?.call_id ?? null;
            }
          } catch (e) {
            console.warn("[pp-ns-calls] maestro mirror (start) failed:", (e as Error)?.message);
          }
        }

        try {
          await guard.supabase.from("planipret_phone_calls").insert({
            user_id: ctx.userId,
            ns_call_id: nsCallId,
            ns_callid: nsCallId,
            ns_domain: ctx.nsDomain,
            extension: ctx.extension,
            direction: "outbound",
            from_number: String(ctx.extension),
            to_number: dest,
            status: "outbound_ringing",
            started_at: new Date().toISOString(),
            maestro_call_id: maestroCallIdCreated,
            metadata: { rest_originated: true, requested_client_type: requestedClientType, forced_client_type: clientType, client_call_id: clientCallId, call_orig_user: callOrigUser, device_name: deviceName },
          });
        } catch { /* non-fatal */ }



        return jsonResponse({
          success: true,
          call_id: nsCallId,
          call_orig_user: callOrigUser,
          requested_client_type: requestedClientType,
          client_type: clientType,
          device_name: deviceName,
          destination: dest,
          status: "initiated",
          device_registered: deviceRegistered,
          device_was_unregistered: !deviceRegistered,
          device_state: deviceState,
          message: deviceRegistered
            ? "Votre téléphone va sonner — décrochez pour parler au client"
            : "Votre téléphone sonnera dans quelques secondes — assurez-vous que l'app est ouverte",
        }, 200);
      }

      return jsonResponse({
        success: false,
        error: (typeof parsed === "object" && parsed?.message) || `NS-API error ${res.status}`,
        ns_status: res.status,
        debug: { call_orig_user: callOrigUser, call_term_user: dest, extension: ctx.extension, domain: ctx.nsDomain, ns_body: parsed },
      }, 200);
    }

    // Call-control actions: accept either PATCH or POST-with-action-in-body
    // (supabase.functions.invoke only issues POST).
    const controlActions = ["answer", "hold", "unhold", "resume", "transfer", "forward", "disconnect", "reject", "mute", "dtmf"];
    if (controlActions.includes(action)) {
      const payload = cachedBody ?? (await req.json().catch(() => ({})));
      const callId = payload?.call_id;
      if (!callId) return jsonResponse({ error: "call_id required" }, 400);
      const nsAction = action === "resume" ? "unhold" : action === "hangup" ? "disconnect" : action;
      const path = `${base}/${encodeURIComponent(callId)}/${nsAction}`;
      const body = (nsAction === "transfer" || nsAction === "forward") ? JSON.stringify({ destination: payload.destination ?? payload.target })
        : nsAction === "mute" ? JSON.stringify({ muted: !!payload.muted })
        : nsAction === "dtmf" ? JSON.stringify({ digit: payload.digit })
        : undefined;
      let res = await nsFetch(path, { method: "PATCH", body });
      if (!res.ok && nsAction === "disconnect") {
        res = await nsFetch(`${base}/${encodeURIComponent(callId)}`, { method: "DELETE" });
      }
      if (!res.ok && (nsAction === "transfer" || nsAction === "forward")) {
        res = await nsFetch(path, { method: "PATCH", body: JSON.stringify({ transfer_to: payload.destination ?? payload.target }) });
      }
      const txt = await res.text();

      // On disconnect/reject: force-mark the row as ended locally so the
      // client overlay closes even if the NS webhook is slow/missing.
      if (nsAction === "disconnect" || nsAction === "reject") {
        try {
          const nowIso = new Date().toISOString();
          await guard.supabase
            .from("planipret_phone_calls")
            .update({ status: "ended", ended_at: nowIso })
            .or(`id.eq.${callId},ns_callid.eq.${callId},ns_call_id.eq.${callId}`);
        } catch (e) {
          console.warn("[pp-ns-calls] failed to mark row ended", (e as Error).message);
        }
        // Mirror end to Maestro Telecom — fire-and-forget by maestro_call_id
        // if we captured one, otherwise by the NS provider_call_id.
        if (ctx.maestroBrokerId) {
          try {
            const { data: row } = await guard.supabase
              .from("planipret_phone_calls")
              .select("maestro_call_id")
              .or(`ns_callid.eq.${callId},ns_call_id.eq.${callId}`)
              .maybeSingle();
            const maestroId = (row as any)?.maestro_call_id;
            const endedReason = nsAction === "reject" ? "rejected" : "completed";
            if (maestroId) {
              maestroTelecomMirror(
                guard.supabase,
                `/users/${encodeURIComponent(ctx.maestroBrokerId)}/calls/${encodeURIComponent(maestroId)}`,
                { method: "PUT", body: { status: "ended", ended_reason: endedReason }, action: "call.end", userId: ctx.userId },
              );
            } else {
              // No maestro id — try updating by provider_call_id path (some
              // Maestro deployments accept it interchangeably).
              maestroTelecomMirror(
                guard.supabase,
                `/users/${encodeURIComponent(ctx.maestroBrokerId)}/calls/${encodeURIComponent(String(callId))}`,
                { method: "PUT", body: { status: "ended", ended_reason: endedReason }, action: "call.end", userId: ctx.userId },
              );
            }
          } catch (e) {
            console.warn("[pp-ns-calls] maestro mirror (end) failed:", (e as Error)?.message);
          }
        }

      }

      return new Response(txt || JSON.stringify({ success: res.ok, status: res.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return jsonResponse({ error: "unsupported action/method" }, 400);
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 502);
  }
});
