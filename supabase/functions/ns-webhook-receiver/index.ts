import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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
  const pem = privateKeyPem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const raw = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", raw, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(sig)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // FIX 2 — strict shared-secret validation
  const expected = Deno.env.get("NS_WEBHOOK_SECRET");
  const got = req.headers.get("x-webhook-secret")
    ?? req.headers.get("authorization")?.replace("Bearer ", "")
    ?? req.headers.get("x-ns-secret");
  if (!expected || got !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let event: any;
  try { event = await req.json(); } catch { return ok(); }

  // FIX 4 — return 200 immediately, process async
  EdgeRuntime.waitUntil(processEvent(event).catch((e) => console.error("ns-webhook async error", e)));
  return ok();
});

async function processEvent(event: any) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const type = event?.type ?? event?.event?.type;
  const data = event?.data ?? event?.payload ?? event;

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
      .select("device_token,bundle_id,environment")
      .eq("user_id", uid)
      .eq("platform", "ios");
    if (!tokens?.length) return;

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
    await Promise.allSettled(tokens.map(async (row: any) => {
      const bundleId = row.bundle_id || config.ios_bundle_id || Deno.env.get("PLANIPRET_IOS_BUNDLE_ID");
      if (!bundleId) return;
      const host = row.environment === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
      const res = await fetch(`https://${host}/3/device/${row.device_token}`, {
        method: "POST",
        headers: {
          authorization: `bearer ${jwt}`,
          "apns-topic": `${bundleId}.voip`,
          "apns-push-type": "voip",
          "apns-priority": "10",
          "content-type": "application/json",
        },
        body: JSON.stringify({ aps: { "content-available": 1 }, ...payload }),
      });
      if (!res.ok) console.error("[ns-webhook] APNs VoIP failed", res.status, await res.text().catch(() => ""));
    }));
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

      // Maestro pipeline: resolve uuid by ns_call_id, then push CDR → transcript → AI.
      void admin.from("planipret_phone_calls").select("id").eq("ns_call_id", String(callId)).maybeSingle()
        .then(({ data: row }) => {
          if (row?.id) {
            void fetch(`${SUPABASE_URL}/functions/v1/maestro-cdr`, {
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
        await sendVoipPush(userId, {
          call_id: callId ? String(callId) : crypto.randomUUID(),
          from_number: data.from_number ?? data.from ?? "Inconnu",
          to_number: data.to_number ?? data.to ?? ext,
          type: "incoming_call",
        });
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
    await admin.from("planipret_phone_messages").insert({
      user_id: userId, direction: "inbound",
      from_number: data.from_number ?? data.from ?? null,
      to_number: data.to_number ?? data.to ?? null,
      body: data.body ?? data.message ?? "",
      type: "sms",
    });
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
