// Silent "wake & re-REGISTER" push for the Planiprêt mobile app.
//
// A SIP REGISTER can only come from the device: the PBX cannot register an
// `<ext>M` AOR on its own. This helper sends a SILENT push (APNs background /
// FCM data-only) carrying `type=sip_register`, which the mobile app turns into
// a forced re-REGISTER of its own AOR.
//
// Never touches PJSIP, CallKit, audio or AOR ownership — it only asks the app
// to redo what it already does at login.

import { parseServiceAccount, sendFcmDataMessage } from "./fcm.ts";

function b64url(input: ArrayBuffer | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function apnsJwt(teamId: string, keyId: string, privateKeyPem: string) {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  let normalized = String(privateKeyPem ?? "").trim();
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    try { normalized = JSON.parse(normalized); } catch { /* keep original */ }
  }
  normalized = normalized.replace(/\\r\\n|\\n|\\r/g, "\n");
  const pem = normalized
    .replace(/-----BEGIN (?:EC )?PRIVATE KEY-----/g, "")
    .replace(/-----END (?:EC )?PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  if (!pem) throw new Error("APNS_PRIVATE_KEY missing");
  const raw = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", raw, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(sig)}`;
}

export type SipWakeResult = { sent: number; ios: number; android: number; reason?: string };

export async function sendSipWakePush(admin: any, userId: string): Promise<SipWakeResult> {
  const out: SipWakeResult = { sent: 0, ios: 0, android: 0 };
  try {
    const [{ data: tokens }, { data: voip }] = await Promise.all([
      admin
        .from("mobile_push_tokens")
        .select("id,token,platform")
        .eq("user_id", userId)
        .in("platform", ["ios", "android"]),
      admin
        .from("planipret_voip_push_tokens")
        .select("id")
        .eq("user_id", userId)
        .limit(1),
    ]);
    if (!tokens?.length) {
      // A VoIP (PushKit) token means the app IS installed, but PushKit cannot be
      // used for a silent wake: iOS requires every PushKit push to report a call.
      out.reason = voip?.length ? "ios_voip_only_no_silent_wake" : "no_native_token";
      return out;
    }

    const [{ data: cfg }, { data: secrets }] = await Promise.all([
      admin.from("planipret_integration_config").select("config_data").eq("integration_key", "mobile_app").maybeSingle(),
      admin.from("planipret_integration_secrets").select("config").eq("provider", "mobile_app").maybeSingle(),
    ]);
    const config = { ...((cfg?.config_data ?? {}) as Record<string, string>), ...((secrets?.config ?? {}) as Record<string, string>) };

    const iosTokens = tokens.filter((t: any) => t.platform === "ios");
    if (iosTokens.length) {
      const keyId = config.apns_key_id ?? Deno.env.get("APNS_KEY_ID");
      const teamId = config.apns_team_id ?? Deno.env.get("APNS_TEAM_ID");
      const privateKey = config.apns_private_key ?? Deno.env.get("APNS_PRIVATE_KEY");
      const bundleId = config.ios_bundle_id ?? Deno.env.get("PLANIPRET_IOS_BUNDLE_ID");
      if (keyId && teamId && privateKey && bundleId) {
        try {
          const jwt = await apnsJwt(teamId, keyId, privateKey);
          const payload = JSON.stringify({ aps: { "content-available": 1 }, type: "sip_register" });
          for (const row of iosTokens) {
            const send = (env: string) => fetch(
              `https://${env === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com"}/3/device/${row.token}`,
              {
                method: "POST",
                headers: {
                  authorization: `bearer ${jwt}`,
                  "apns-topic": bundleId,
                  "apns-push-type": "background",
                  "apns-priority": "5",
                  "content-type": "application/json",
                },
                body: payload,
              },
            );
            let res = await send("production");
            let text = res.ok ? "" : await res.text().catch(() => "");
            if (!res.ok && (text.includes("BadDeviceToken") || text.includes("DeviceTokenNotForTopic"))) {
              res = await send("sandbox");
              text = res.ok ? "" : await res.text().catch(() => "");
            }
            if (res.ok) { out.ios++; out.sent++; }
            else if (res.status === 410 || text.includes("Unregistered")) {
              await admin.from("mobile_push_tokens").delete().eq("id", row.id);
            }
          }
        } catch (e) {
          console.error("[sip-wake-push] APNs error", e instanceof Error ? e.message : e);
        }
      } else out.reason = "apns_not_configured";
    }

    const androidTokens = tokens.filter((t: any) => t.platform === "android");
    if (androidTokens.length) {
      const sa = parseServiceAccount(config.fcm_service_account_json ?? Deno.env.get("FCM_SERVICE_ACCOUNT_JSON"));
      if (sa) {
        for (const row of androidTokens) {
          const res = await sendFcmDataMessage(sa, row.token, { type: "sip_register" }, {
            collapseKey: "pp-sip-register",
            ttlSeconds: 120,
          });
          if (res.ok) { out.android++; out.sent++; }
          else if (res.unregistered) await admin.from("mobile_push_tokens").delete().eq("id", row.id);
        }
      } else out.reason = out.reason ?? "fcm_not_configured";
    }
  } catch (e) {
    console.error("[sip-wake-push] fatal", e instanceof Error ? e.message : e);
  }
  return out;
}
