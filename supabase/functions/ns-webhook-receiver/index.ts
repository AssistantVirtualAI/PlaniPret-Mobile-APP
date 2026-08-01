import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { normalizeNsEvents, nsCallKey, shouldProcessCall } from "../_shared/ns-call-events.ts";
import { parseServiceAccount, sendFcmDataMessage } from "../_shared/fcm.ts";


declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const ok = () => new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function b64url(input: ArrayBuffer | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function apnsJwt(teamId: string, keyId: string, privateKeyPem: string) {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  // Lovable Cloud secrets may preserve a pasted .p8 key with literal `\n`
  // sequences or surrounding JSON quotes. Normalize both representations
  // before decoding the PKCS#8 body. The previous whitespace-only cleanup left
  // the backslash characters in place, making every terminated-app VoIP push
  // fail with `InvalidCharacterError: Failed to decode base64`.
  let normalized = String(privateKeyPem ?? "").trim();
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    try { normalized = JSON.parse(normalized); } catch { /* keep original */ }
  }
  normalized = normalized.replace(/\\r\\n|\\n|\\r/g, "\n");
  const pem = normalized
    .replace(/-----BEGIN (?:EC )?PRIVATE KEY-----/g, "")
    .replace(/-----END (?:EC )?PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  if (!pem || !/^[A-Za-z0-9+/]+={0,2}$/.test(pem)) {
    throw new Error("APNS_PRIVATE_KEY is not a valid PKCS#8 .p8 key");
  }
  const raw = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", raw, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(sig)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // FIX 2 — strict shared-secret validation.
  // NetSapiens v2 subscriptions cannot send custom headers (docs: verification
  // is IP allowlist + X-Correlation-ID), so the secret also travels in the
  // post-url query string that ns-webhook-setup registers.
  const expected = Deno.env.get("NS_WEBHOOK_SECRET");
  const url = new URL(req.url);
  const got = req.headers.get("x-webhook-secret")
    ?? req.headers.get("authorization")?.replace("Bearer ", "")
    ?? req.headers.get("x-ns-secret")
    ?? url.searchParams.get("secret");
  if (!expected || got !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  let body: any;
  try { body = await req.json(); } catch { return ok(); }

  // NS-API v2 posts an ARRAY of resource objects (docs/netsapiens/webhooks.md).
  const events = normalizeNsEvents(body);
  if (!events.length) return ok();

  // FIX 4 — return 200 immediately, process async
  EdgeRuntime.waitUntil(
    (async () => {
      for (const ev of events) {
        try { await processEvent(ev); } catch (e) { console.error("ns-webhook async error", e); }
      }
    })(),
  );
  return ok();
});

async function processEvent(event: any) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const type = event?.type ?? event?.event?.type;
  const data = event?.data ?? event?.payload ?? event;

  // The `call` model fires on every state change — only the first ringing
  // event for a given SIP Call-ID may trigger a VoIP push.
  if (type === "call.inbound" && !shouldProcessCall(nsCallKey(data))) {
    console.log("[ns-webhook] duplicate call event ignored", { call_id: nsCallKey(data) });
    return;
  }


  const ext = data?.extension ?? data?.user ?? data?.to ?? data?.callee ?? null;
  let userId: string | null = null;
  let brokerProfile: any = null;
  if (ext) {
    const { data: p } = await admin
      .from("planipret_profiles").select("user_id, dnd_enabled, dnd_auto_schedule, dnd_start_time, dnd_end_time, dnd_message_fr, notif_calls, notif_sms, notif_voicemails")
      .eq("extension", String(ext)).maybeSingle();
    userId = p?.user_id ?? null;
    brokerProfile = p;
  }

  const sendPush = (uid: string, payload: any) => {
    fetch(`${SUPABASE_URL}/functions/v1/pp-push-notify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: uid, ...payload }),
    }).catch(() => {});
  };

  const sendVoipPush = async (uid: string, payload: any) => {
    const { data: tokens } = await admin
      .from("planipret_voip_push_tokens")
      .select("id,device_token,bundle_id,environment,updated_at,extension")
      .eq("user_id", uid)
      .eq("platform", "ios");
    if (!tokens?.length) {
      console.warn("[ns-webhook] no iOS VoIP tokens for inbound call", { user_id: uid, call_id: payload?.call_id });
      return;
    }

    const [{ data: cfg }, { data: secrets }] = await Promise.all([
      admin.from("planipret_integration_config").select("config_data").eq("integration_key", "mobile_app").maybeSingle(),
      admin.from("planipret_integration_secrets").select("config").eq("provider", "mobile_app").maybeSingle(),
    ]);
    const config = { ...((cfg?.config_data ?? {}) as Record<string, string>), ...((secrets?.config ?? {}) as Record<string, string>) };
    const keyId = config.apns_key_id ?? Deno.env.get("APNS_KEY_ID");
    const teamId = config.apns_team_id ?? Deno.env.get("APNS_TEAM_ID");
    const privateKey = config.apns_private_key ?? Deno.env.get("APNS_PRIVATE_KEY");
    if (!keyId || !teamId || !privateKey) {
      console.warn("[ns-webhook] APNs VoIP not configured");
      return;
    }

    const jwt = await apnsJwt(teamId, keyId, privateKey);
    const results = await Promise.allSettled(tokens.map(async (row: any) => {
      const bundleId = row.bundle_id || config.ios_bundle_id || Deno.env.get("PLANIPRET_IOS_BUNDLE_ID");
      if (!bundleId) {
        console.error("[ns-webhook] APNs VoIP missing bundle id", { token_id: row.id, call_id: payload?.call_id });
        return { ok: false, skipped: "missing_bundle_id" };
      }
      // Apple VoIP requirements: push-type `voip`, topic `<bundle>.voip`,
      // priority 10 and expiration 0 (immediate delivery only — a stored VoIP
      // push delivered late is rejected by iOS and kills the app).
      const send = (env: string) => fetch(
        `https://${env === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com"}/3/device/${row.device_token}`,
        {
          method: "POST",
          headers: {
            authorization: `bearer ${jwt}`,
            "apns-topic": `${bundleId}.voip`,
            "apns-push-type": "voip",
            "apns-priority": "10",
            "apns-expiration": "0",
            "content-type": "application/json",
          },
          body: JSON.stringify({ aps: { "content-available": 1 }, ...payload }),
        },
      );

      const primary = row.environment === "sandbox" ? "sandbox" : "production";
      let env = primary;
      let res = await send(env);
      let body = res.ok ? "" : await res.text().catch(() => "");
      // Dev-signed builds (aps-environment=development) hold sandbox tokens; a
      // stored `production` environment then yields BadDeviceToken. Retry once
      // on the other APNs host before discarding the token.
      if (!res.ok && (body.includes("BadDeviceToken") || body.includes("DeviceTokenNotForTopic"))) {
        env = primary === "sandbox" ? "production" : "sandbox";
        res = await send(env);
        body = res.ok ? "" : await res.text().catch(() => "");
        if (res.ok) {
          await admin.from("planipret_voip_push_tokens").update({ environment: env }).eq("id", row.id);
        }
      }
      if (!res.ok) {
        console.error("[ns-webhook] APNs VoIP failed", { status: res.status, body, token_id: row.id, env, bundle_id: bundleId, call_id: payload?.call_id });
        if (res.status === 410 || body.includes("Unregistered")) {
          await admin.from("planipret_voip_push_tokens").delete().eq("id", row.id);
        }
        return { ok: false, status: res.status };
      }
      console.log("[ns-webhook] APNs VoIP sent", { token_id: row.id, env, bundle_id: bundleId, call_id: payload?.call_id });
      return { ok: true };

    }));
    const sent = results.filter((r) => r.status === "fulfilled" && (r.value as any)?.ok).length;
    if (!sent) console.warn("[ns-webhook] APNs VoIP delivered to 0 tokens", { user_id: uid, call_id: payload?.call_id, token_count: tokens.length });
  };

  // Android counterpart of sendVoipPush: a high-priority FCM data message wakes
  // PpSipKeepAliveService, which re-registers SIP and raises the full-screen
  // incoming-call notification. No-op (with a log) when FCM is not configured.
  const sendAndroidCallPush = async (uid: string, payload: Record<string, unknown>) => {
    const { data: tokens } = await admin
      .from("mobile_push_tokens")
      .select("id,token,extension")
      .eq("user_id", uid)
      .eq("platform", "android");
    if (!tokens?.length) {
      console.warn("[ns-webhook] no Android push tokens for inbound call", { user_id: uid, call_id: payload?.call_id });
      return;
    }

    const { data: secrets } = await admin
      .from("planipret_integration_secrets").select("config").eq("provider", "mobile_app").maybeSingle();
    const rawSa = (secrets?.config as Record<string, string> | null)?.fcm_service_account_json
      ?? Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
    const sa = parseServiceAccount(rawSa);
    if (!sa) {
      console.warn("[ns-webhook] FCM not configured — Android wake-up skipped", { user_id: uid, call_id: payload?.call_id });
      return;
    }

    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(payload)) data[k] = v == null ? "" : String(v);

    const results = await Promise.allSettled(tokens.map(async (row: any) => {
      const res = await sendFcmDataMessage(sa, row.token, data, {
        collapseKey: String(payload?.call_id ?? ""),
        ttlSeconds: 30,
      });
      if (!res.ok) {
        console.error("[ns-webhook] FCM push failed", { token_id: row.id, status: res.status, error: res.error, call_id: payload?.call_id });
        if (res.unregistered) await admin.from("mobile_push_tokens").delete().eq("id", row.id);
      } else {
        console.log("[ns-webhook] FCM push sent", { token_id: row.id, call_id: payload?.call_id });
      }
      return res;
    }));
    const delivered = results.filter((r) => r.status === "fulfilled" && (r.value as any)?.ok).length;
    if (!delivered) console.warn("[ns-webhook] FCM delivered to 0 tokens", { user_id: uid, call_id: payload?.call_id, token_count: tokens.length });
  };


  function isDndActive(p: any): boolean {
    if (!p) return false;
    if (p.dnd_enabled) return true;
    if (p.dnd_auto_schedule && p.dnd_start_time && p.dnd_end_time) {
      const now = new Date();
      const hh = now.getHours(), mm = now.getMinutes();
      const cur = hh * 60 + mm;
      const [sh, sm] = String(p.dnd_start_time).split(":").map(Number);
      const [eh, em] = String(p.dnd_end_time).split(":").map(Number);
      const s = sh * 60 + sm, e = eh * 60 + em;
      if (s < e) return cur >= s && cur < e;
      return cur >= s || cur < e; // overnight window
    }
    return false;
  }

  if (type === "cdr") {
    const callId = data.call_id ?? data.id ?? data["cdr-id"] ?? data.cdr_id;
    if (callId) {
      // Extract recording URL from any of the possible NS-API field names
      const recUrl =
        data.recording_url ??
        data.recording ??
        data["recording-url"] ??
        data["recording-file"] ??
        data.media_url ??
        data["media-url"] ??
        null;

      await admin.from("planipret_phone_calls").upsert({
        user_id: userId,
        ns_call_id: String(callId),
        ns_callid: data["call-parent-cdr-id"] ?? data["call-orig-call-id"] ?? data["call-term-call-id"] ?? data["call-parent-call-id"] ?? data.id ?? String(callId),
        ns_orig_callid: data["call-orig-call-id"] ?? data["orig-callid"] ?? data["orig-call-id"] ?? null,
        ns_term_callid: data["call-term-call-id"] ?? data["term-callid"] ?? data["term-call-id"] ?? null,
        direction: data.direction ?? null,
        from_number: data.from_number ?? data.caller_number ?? data.from ?? null,
        to_number: data.to_number ?? data.callee_number ?? data.to ?? null,
        duration_seconds: data.duration ?? data.duration_seconds ?? null,
        recording_url: recUrl,
        status: "completed",
      }, { onConflict: "ns_call_id" });

      const authH = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
      fetch(`${SUPABASE_URL}/functions/v1/ns-transcription?call_id=${encodeURIComponent(callId)}`, {
        method: "GET", headers: { Authorization: authH },
      }).catch(() => {});
      fetch(`${SUPABASE_URL}/functions/v1/ai-analyze-call`, {
        method: "POST", headers: { Authorization: authH, "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: callId }),
      }).catch(() => {});

      // Maestro pipeline: resolve uuid by ns_call_id, then push CDR + recording
      // + transcript + AI analytics in one idempotent orchestrator call.
      void admin.from("planipret_phone_calls").select("id").eq("ns_call_id", String(callId)).maybeSingle()
        .then(({ data: row }) => {
          if (row?.id) {
            void fetch(`${SUPABASE_URL}/functions/v1/maestro-sync-call`, {
              method: "POST", headers: { Authorization: authH, "Content-Type": "application/json" },
              body: JSON.stringify({ call_id: row.id }),
            }).catch(() => {});
          }
        }, () => {});
    }
  } else if (type === "call.inbound") {
    const callId = data.call_id ?? data.id;
    const dndActive = isDndActive(brokerProfile);
    await admin.from("planipret_phone_calls").insert({
      user_id: userId, ns_call_id: callId ? String(callId) : null, direction: "inbound",
      from_number: data.from_number ?? data.from ?? null,
      to_number: data.to_number ?? data.to ?? null,
      status: dndActive ? "voicemail" : "inbound_ringing",
      metadata: dndActive ? { dnd_auto_voicemail: true, dnd_message: brokerProfile?.dnd_message_fr } : null,
    });
    if (userId && !dndActive) {
      await admin.channel(`call-events:${userId}`).send({
        type: "broadcast", event: "inbound_call",
        payload: { type: "inbound_call", call_id: callId, from_number: data.from_number ?? data.from, to_number: data.to_number ?? data.to },
      });
      if (brokerProfile?.notif_calls !== false) {
        const inboundCallId = callId ? String(callId) : crypto.randomUUID();
        const inboundPushPayload = {
          call_id: inboundCallId,
          callId: inboundCallId,
          from_number: data.from_number ?? data.from ?? "Inconnu",
          callerName: data.from_name ?? data.caller_name ?? data.from_number ?? data.from ?? "Appel entrant",
          callerNumber: data.from_number ?? data.from ?? "",
          from: data.from_number ?? data.from ?? "Inconnu",
          from_user: data.from_number ?? data.from ?? "",
          to_number: data.to_number ?? data.to ?? ext,
          type: "incoming_call",
        };
        await sendVoipPush(userId, inboundPushPayload);
        await sendAndroidCallPush(userId, inboundPushPayload);
        sendPush(userId, {
          title: "📞 Appel entrant",
          body: data.from_number ?? data.from ?? "Inconnu",
          data: { url: "/mplanipret/calls", call_id: callId },
          actions: [{ action: "answer", title: "Répondre" }],
        });
      }
    } else if (userId && dndActive) {
      await admin.channel(`call-events:${userId}`).send({
        type: "broadcast", event: "dnd_auto_handled",
        payload: { call_id: callId, from_number: data.from_number ?? data.from, message: brokerProfile?.dnd_message_fr },
      });
    }
  } else if (type === "message.inbound") {
    const { data: inboundMsg } = await admin.from("planipret_phone_messages").insert({
      user_id: userId, direction: "inbound",
      from_number: data.from_number ?? data.from ?? null,
      to_number: data.to_number ?? data.to ?? null,
      body: data.body ?? data.message ?? "",
      type: "sms",
    }).select("id").maybeSingle();
    if (inboundMsg?.id) {
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/maestro-sync-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ message_id: inboundMsg.id }),
      }).catch(() => {});
    }
    if (userId) {
      await admin.channel(`messages:${userId}`).send({
        type: "broadcast", event: "inbound_message",
        payload: { from_number: data.from_number ?? data.from, body: data.body ?? data.message },
      });
      if (brokerProfile?.notif_sms !== false) {
        sendPush(userId, {
          title: `💬 ${data.from_number ?? data.from ?? "SMS"}`,
          body: String(data.body ?? data.message ?? "").slice(0, 140),
          data: { url: "/mplanipret/messages" },
        });
      }
    }
  } else if (type === "voicemail.new") {
    const vmId = data.vm_id ?? data.id;
    await admin.from("planipret_voicemails").insert({
      user_id: userId, vm_id: vmId,
      from_number: data.from_number ?? data.from ?? null,
      duration_seconds: data.duration ?? data.duration_seconds ?? null,
      is_read: false,
    });
    if (userId) {
      await admin.channel(`voicemails:${userId}`).send({
        type: "broadcast", event: "new_voicemail",
        payload: { vm_id: vmId, from_number: data.from_number ?? data.from },
      });
      if (brokerProfile?.notif_voicemails !== false) {
        sendPush(userId, {
          title: "📬 Nouveau voicemail",
          body: `De ${data.from_number ?? data.from ?? "inconnu"}`,
          data: { url: "/mplanipret/voicemail" },
          actions: [{ action: "listen", title: "Écouter" }],
        });
      }
    }
  }
}
