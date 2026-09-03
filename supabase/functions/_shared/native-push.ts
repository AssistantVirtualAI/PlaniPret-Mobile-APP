// Native alert pushes (APNs + FCM) for the Planiprêt mobile apps.
// Web Push (VAPID) only reaches browsers; iOS/Android installs register their
// device token in `mobile_push_tokens`, which is what this helper targets.

import { parseServiceAccount, sendFcmNotification } from "./fcm.ts";

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
  if (!pem || !/^[A-Za-z0-9+/]+={0,2}$/.test(pem)) throw new Error("APNS_PRIVATE_KEY is not a valid PKCS#8 .p8 key");
  const raw = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", raw, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(sig)}`;
}

export type NativePushResult = { delivered: number; ios: number; android: number; reason?: string };

/**
 * Deliver a user-visible notification to every native device registered for
 * `userId`. Never throws — telephony/webhook paths must not fail on push.
 */
export async function sendNativeAlertPush(
  admin: any,
  userId: string,
  opts: { title: string; body?: string; data?: Record<string, string>; category?: string; threadId?: string; sound?: string },
): Promise<NativePushResult> {
  const out: NativePushResult = { delivered: 0, ios: 0, android: 0 };
  try {
    const { data: tokens } = await admin
      .from("mobile_push_tokens")
      .select("id,token,platform")
      .eq("user_id", userId)
      .in("platform", ["ios", "android"]);
    if (!tokens?.length) { out.reason = "no_native_token"; return out; }

    const [{ data: cfg }, { data: secrets }] = await Promise.all([
      admin.from("planipret_integration_config").select("config_data").eq("integration_key", "mobile_app").maybeSingle(),
      admin.from("planipret_integration_secrets").select("config").eq("provider", "mobile_app").maybeSingle(),
    ]);
    const config = { ...((cfg?.config_data ?? {}) as Record<string, string>), ...((secrets?.config ?? {}) as Record<string, string>) };

    const dataPayload: Record<string, string> = Object.fromEntries(
      Object.entries({ ...(opts.data ?? {}), category: opts.category ?? "info" })
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, String(v)]),
    );

    // ---- iOS (APNs alert push) ----
    const iosTokens = tokens.filter((t: any) => t.platform === "ios");
    if (iosTokens.length) {
      const keyId = config.apns_key_id ?? Deno.env.get("APNS_KEY_ID");
      const teamId = config.apns_team_id ?? Deno.env.get("APNS_TEAM_ID");
      const privateKey = config.apns_private_key ?? Deno.env.get("APNS_PRIVATE_KEY");
      const bundleId = config.ios_bundle_id ?? Deno.env.get("PLANIPRET_IOS_BUNDLE_ID");
      if (keyId && teamId && privateKey && bundleId) {
        try {
          const jwt = await apnsJwt(teamId, keyId, privateKey);
          const payload = JSON.stringify({
            aps: {
              alert: { title: opts.title, body: opts.body ?? "" },
              sound: opts.sound ?? "default",
              badge: 1,
              "thread-id": opts.threadId ?? opts.category ?? "planipret",
              "mutable-content": 1,
            },
            ...dataPayload,
          });
          for (const row of iosTokens) {
            const send = (env: string) => fetch(
              `https://${env === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com"}/3/device/${row.token}`,
              {
                method: "POST",
                headers: {
                  authorization: `bearer ${jwt}`,
                  "apns-topic": bundleId,
                  "apns-push-type": "alert",
                  "apns-priority": "10",
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
            if (res.ok) { out.ios++; out.delivered++; }
            else {
              console.error("[native-push] APNs failed", { status: res.status, body: text.slice(0, 200) });
              if (res.status === 410 || text.includes("Unregistered")) {
                await admin.from("mobile_push_tokens").delete().eq("id", row.id);
              }
            }
          }
        } catch (e) {
          console.error("[native-push] APNs error", e instanceof Error ? e.message : e);
        }
      } else {
        console.warn("[native-push] APNs not configured");
      }
    }

    // ---- Android (FCM notification) ----
    const androidTokens = tokens.filter((t: any) => t.platform === "android");
    if (androidTokens.length) {
      const sa = parseServiceAccount(
        config.fcm_service_account_json ?? Deno.env.get("FCM_SERVICE_ACCOUNT_JSON"),
      );
      if (sa) {
        for (const row of androidTokens) {
          const res = await sendFcmNotification(sa, row.token, {
            title: opts.title,
            body: opts.body ?? "",
            data: dataPayload,
            channelId: opts.category === "sms" ? "sms" : opts.category === "voicemail" ? "voicemail" : "planipret_default",
          });
          if (res.ok) { out.android++; out.delivered++; }
          else {
            console.error("[native-push] FCM failed", { status: res.status, error: res.error });
            if (res.unregistered) await admin.from("mobile_push_tokens").delete().eq("id", row.id);
          }
        }
      } else {
        console.warn("[native-push] FCM not configured");
      }
    }
  } catch (e) {
    console.error("[native-push] fatal", e instanceof Error ? e.message : e);
  }
  return out;
}
