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
  maestroTelecomMirror,
} from "../_shared/maestro-telecom.ts";
import { buildIdempotencyKey, claimAction, finishAction } from "../_shared/ava-confirm.ts";


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
      const bare = dest.replace(/\D/g, "");
      // Appel interne : composer le poste directement (2 à 6 chiffres), jamais +1.
      if (bare.length >= 2 && bare.length <= 6) {
        dest = bare;
      } else if (!dest.startsWith("+")) {
        dest = "+" + (bare.length === 10 ? "1" + bare : bare);
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

      // Si l'appareil visé n'est pas inscrit, utiliser n'importe quel appareil
      // inscrit du poste (web/mobile). Erreur explicite seulement si aucun.
      const origFallback: "device" = "device";
      if (!deviceRegistered) {
        try {
          const regRes = await nsFetch(`/domains/${encodeURIComponent(ctx.nsDomain)}/users/${encodeURIComponent(ctx.extension)}/registrations`, { method: "GET" });
          if (regRes.ok) {
            const rd = await regRes.json().catch(() => null);
            const regs = Array.isArray(rd) ? rd : (rd ? [rd] : []);
            const alt = regs.find((r: any) => typeof (r?.["aor"] ?? r?.["registration-uri"] ?? r?.["contact-uri"]) === "string");
            const aor = alt?.["aor"] ?? alt?.["registration-uri"] ?? alt?.["contact-uri"];
            if (typeof aor === "string" && aor.length) {
              callOrigUser = String(aor).replace(/^sip:/i, "").split(";")[0];
              deviceRegistered = true;
              deviceState = "registered_alt";
              console.log(`[pp-ns-calls] fallback to registered device aor=${callOrigUser}`);
            }
          }
        } catch { /* ignore */ }
      }
      if (!deviceRegistered) {
        return jsonResponse({
          success: false,
          error: "sip_not_registered",
          device_registered: false,
          device_state: deviceState,
          device_name: deviceName,
          message: "Votre ligne n'est pas connectée — rouvrez l'application puis réessayez",
        }, 200);
      }


      const clientCallId = crypto.randomUUID();
      // NS dial rules ne connaissent pas le format E.164 avec « + » :
      // POST .../calls répond 404 "Resource not found." Composer en chiffres.
      const nsDest = dest.replace(/^\+/, "");

      // Numéro affiché : configuration « Appels sortants » du courtier, sinon
      // le DID attribué à son poste chez le fournisseur.
      let callerId = String(payload.caller_id_number ?? "").replace(/[^\d]/g, "");
      let callerName = String(payload.caller_id_name ?? "").trim();
      if (!callerId) {
        try {
          const { data: outbound } = await guard.supabase
            .from("planipret_outbound_settings")
            .select("caller_id_number, caller_id_name")
            .eq("user_id", ctx.userId)
            .maybeSingle();
          callerId = String(outbound?.caller_id_number ?? "").replace(/[^\d]/g, "");
          if (!callerName) callerName = String(outbound?.caller_id_name ?? "").trim();
        } catch { /* ignore */ }
      }
      if (!callerId) {
        try {
          const uRes = await nsFetch(`/domains/${encodeURIComponent(ctx.nsDomain)}/users/${encodeURIComponent(ctx.extension)}`, { method: "GET" });
          if (uRes.ok) {
            const ud = await uRes.json().catch(() => null);
            const u = Array.isArray(ud) ? ud[0] : ud;
            callerId = String(u?.["caller-id-number"] ?? u?.["caller-id-number-emergency"] ?? "").replace(/[^\d]/g, "");
          }
        } catch { /* ignore */ }
      }

      const buildBody = (term: string) => ({
        // Champs documentés uniquement (docs/netsapiens/calls.md).
        "call-id": clientCallId,
        "dial-rule-application": "call",
        "call-orig-user": callOrigUser,
        "call-term-user": term,
        "auto-answer-enabled": "no",
        ...(callerId ? { "caller-id-number": callerId } : {}),
        ...(callerName ? { "caller-id-name": callerName } : {}),
        "synchronous": "no",
      });

      console.log(`[pp-ns-calls] REST start requested_client=${requestedClientType} forced_client=${clientType} device=${deviceName} orig=${callOrigUser} term=${nsDest} ext=${ctx.extension}`);

      const t0 = Date.now();
      let res = await nsFetch(base, { method: "POST", body: JSON.stringify(buildBody(nsDest)) });
      let text = await res.text();
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }

      // Repli : certains dial plans acceptent uniquement le format E.164.
      if (res.status === 404 && nsDest !== dest) {
        console.log("[pp-ns-calls] retry originate with E.164 destination");
        res = await nsFetch(base, { method: "POST", body: JSON.stringify(buildBody(dest)) });
        text = await res.text();
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
      }

      console.log(`[pp-ns-calls] NS status=${res.status} latency_ms=${Date.now() - t0} orig_fallback_pending body=${typeof parsed === "string" ? parsed.slice(0,200) : JSON.stringify(parsed).slice(0,200)}`);

      const ok = res.ok || res.status === 202;
      if (ok) {
        const nsCallId = parsed?.["call-id"] ?? parsed?.call_id ?? parsed?.id ?? clientCallId;

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
            // The CDR pipeline is the single source allowed to create the
            // Maestro communication row after the provider call id is stable.
            maestro_call_id: null,
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
          orig_fallback: origFallback,
          caller_id_number: callerId || null,
          message: "Appel en cours — le numéro composé sonne",
        }, 200);
      }

      return jsonResponse({
        success: false,
        error: (typeof parsed === "object" && parsed?.message) || `NS-API error ${res.status}`,
        ns_status: res.status,
        debug: { call_orig_user: callOrigUser, call_term_user: dest, extension: ctx.extension, domain: ctx.nsDomain, ns_body: parsed },
      }, 200);
    }

    // Click-to-call pickup for inbound calls when the SIP WebSocket is not
    // usable (wss://core*.cluster1.ucstack.io:9002 is not publicly reachable).
    // NS-API: POST /domains/{d}/users/{ext}/calls with the mobile AOR as
    // origination and the caller as termination, auto-answered on our leg.
    if (action === "callback") {
      const payload = cachedBody ?? (await req.json().catch(() => ({})));
      const raw = String(payload?.number ?? payload?.from_number ?? "");
      const digits = raw.replace(/[^\d+]/g, "");
      if (!digits) return jsonResponse({ success: false, error: "number required" }, 200);
      let dest = digits;
      const bare = digits.replace(/\D/g, "");
      if (bare.length >= 2 && bare.length <= 6) {
        dest = bare;
      } else if (!dest.startsWith("+")) {
        dest = "+" + (bare.length === 10 ? "1" + bare : bare);
      }

      let deviceName = `${ctx.extension}_mobile`;
      try {
        const { data: profileDevice } = await guard.supabase
          .from("planipret_profiles")
          .select("ns_mobile_device_id")
          .eq("user_id", ctx.userId)
          .maybeSingle();
        if (profileDevice?.ns_mobile_device_id) deviceName = String(profileDevice.ns_mobile_device_id);
      } catch { /* keep default */ }

      const cbCallId = crypto.randomUUID();
      const nsDest = dest.replace(/^\+/, "");
      const cbBody = (term: string) => ({
        "call-id": cbCallId,
        "call-orig-user": `${deviceName}@${ctx.nsDomain}`,
        "call-term-user": term,
        "auto-answer-enabled": "yes",
        "synchronous": "no",
      });
      console.log(`[pp-ns-calls] callback orig=${deviceName}@${ctx.nsDomain} term=${nsDest}`);
      let res = await nsFetch(base, { method: "POST", body: JSON.stringify(cbBody(nsDest)) });
      let text = await res.text();
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
      if (res.status === 404 && nsDest !== dest) {
        res = await nsFetch(base, { method: "POST", body: JSON.stringify(cbBody(dest)) });
        text = await res.text();
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
      }
      const ok = res.ok || res.status === 202;
      return jsonResponse({
        success: ok,
        call_id: parsed?.["call-id"] ?? parsed?.call_id ?? cbCallId,
        destination: dest,
        ns_status: res.status,
        error: ok ? undefined : ((typeof parsed === "object" && parsed?.message) || `NS-API error ${res.status}`),
      }, 200);
    }

    // ---- Transfert supervisé (attended transfer) -------------------------
    // 1) attended_start    : met le client en attente et appelle le collègue.
    // 2) attended_complete : relie le client au collègue (confirmation requise).
    // 3) attended_cancel   : raccroche la consultation et reprend le client.
    // Chaque étape est tracée dans AVA — Confirmations avec sa clé d'idempotence.
    if (action === "attended_start" || action === "attended_complete" || action === "attended_cancel") {
      const payload = cachedBody ?? {};
      const callId = String(payload?.call_id ?? "");
      if (!callId) return jsonResponse({ success: false, error: "call_id required" }, 200);

      const rawTarget = String(payload?.destination ?? payload?.target ?? "");
      const bare = rawTarget.replace(/\D/g, "");
      const target = bare.length >= 2 && bare.length <= 6
        ? bare
        : bare.length ? (bare.length === 10 ? `+1${bare}` : `+${bare}`) : "";

      if ((action === "attended_start" || action === "attended_complete") && !target) {
        return jsonResponse({ success: false, error: "destination required" }, 200);
      }
      // L'exécution finale n'a jamais lieu sans confirmation explicite du courtier.
      if (action === "attended_complete" && payload?.confirmed !== true) {
        return jsonResponse({
          success: false,
          needs_confirmation: true,
          error: "confirmation_required",
          message: "Confirmez le transfert vers le collègue avant de relier le client.",
        }, 200);
      }

      const idem = await buildIdempotencyKey({
        userId: ctx.userId,
        action: `attended_transfer.${action.replace("attended_", "")}`,
        destination: target || null,
        callId,
        payload: { consult_call_id: payload?.consult_call_id ?? null },
        provided: payload?.idempotency_key ?? null,
      });
      const claim = await claimAction(guard.supabase, {
        userId: ctx.userId,
        brokerId: ctx.maestroBrokerId ?? null,
        callId,
        action: `attended_transfer.${action.replace("attended_", "")}`,
        surface: String(payload?.surface ?? "mobile"),
        destination: target || null,
        provider: "netsapiens",
        idempotencyKey: idem,
      });
      if (claim.replay) return jsonResponse({ ...claim.result, idempotency_key: idem }, 200);

      const patch = (id: string, op: string, body?: unknown) =>
        nsFetch(`${base}/${encodeURIComponent(id)}/${op}`, {
          method: "PATCH",
          ...(body ? { body: JSON.stringify(body) } : {}),
        });

      try {
        if (action === "attended_start") {
          const hold = await patch(callId, "hold");
          if (!hold.ok) throw new Error(`hold failed (${hold.status})`);
          const consultId = crypto.randomUUID();
          const res = await nsFetch(base, {
            method: "POST",
            body: JSON.stringify({
              "call-id": consultId,
              "call-orig-user": `${ctx.extension}@${ctx.nsDomain}`,
              "call-term-user": target,
              "auto-answer-enabled": "no",
              "synchronous": "no",
            }),
          });
          const txt = await res.text();
          if (!(res.ok || res.status === 202)) throw new Error(`consult call failed (${res.status}) ${txt.slice(0, 160)}`);
          let parsed: any = null;
          try { parsed = txt ? JSON.parse(txt) : null; } catch { /* texte brut */ }
          const nsConsultId = parsed?.["call-id"] ?? parsed?.call_id ?? consultId;
          const result = { success: true, stage: "consulting", consult_call_id: nsConsultId, destination: target };
          await finishAction(guard.supabase, claim.id, true, result);
          return jsonResponse({ ...result, idempotency_key: idem }, 200);
        }

        if (action === "attended_complete") {
          let res = await patch(callId, "transfer", { destination: target });
          if (!res.ok) res = await patch(callId, "transfer", { transfer_to: target });
          if (!res.ok) throw new Error(`transfer failed (${res.status})`);
          const result = { success: true, stage: "transferred", destination: target };
          await finishAction(guard.supabase, claim.id, true, result);
          return jsonResponse({ ...result, idempotency_key: idem }, 200);
        }

        // attended_cancel : on raccroche la consultation, on reprend le client.
        const consultId = String(payload?.consult_call_id ?? "");
        if (consultId) {
          const end = await patch(consultId, "disconnect");
          if (!end.ok) await nsFetch(`${base}/${encodeURIComponent(consultId)}`, { method: "DELETE" });
        }
        const back = await patch(callId, "unhold");
        if (!back.ok) throw new Error(`unhold failed (${back.status})`);
        const result = { success: true, stage: "resumed" };
        await finishAction(guard.supabase, claim.id, true, result);
        return jsonResponse({ ...result, idempotency_key: idem }, 200);
      } catch (e) {
        const msg = (e as Error)?.message ?? "attended transfer failed";
        await finishAction(guard.supabase, claim.id, false, null, msg);
        return jsonResponse({ success: false, error: msg, idempotency_key: idem }, 200);
      }
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
      // Decline: NS-API documents DELETE .../calls/{call-id} as the hangup /
      // reject path, used as fallback when PATCH is refused.
      if (!res.ok && (nsAction === "disconnect" || nsAction === "reject")) {
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
