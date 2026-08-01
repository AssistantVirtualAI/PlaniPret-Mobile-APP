// Firebase Cloud Messaging (HTTP v1) sender — used to wake the Planiprêt
// Android app for incoming calls, mirroring the APNs VoIP path used on iOS.
//
// Configuration: a Google service-account JSON stored either in the
// `FCM_SERVICE_ACCOUNT_JSON` secret or in planipret_integration_secrets
// (provider = 'mobile_app', key `fcm_service_account_json`).
// When it is missing, every helper is a no-op so the iOS path keeps working.

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function parseServiceAccount(raw: string | null | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed?.project_id || !parsed?.client_email || !parsed?.private_key) return null;
    return {
      project_id: String(parsed.project_id),
      client_email: String(parsed.client_email),
      // Secrets pasted through a form often keep literal \n sequences.
      private_key: String(parsed.private_key).replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)),
  );
  const jwt = `${header}.${claims}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body?.access_token) {
    throw new Error(`fcm_oauth_failed:${res.status}:${JSON.stringify(body).slice(0, 200)}`);
  }
  cachedToken = { token: body.access_token, exp: now + Number(body.expires_in ?? 3600) };
  return cachedToken.token;
}

export type FcmSendResult = {
  ok: boolean;
  status?: number;
  /** Token is permanently invalid and should be deleted. */
  unregistered?: boolean;
  error?: string;
};

/**
 * Send a high-priority DATA-ONLY message. Data-only lets the app build its own
 * full-screen incoming-call notification (PpSipKeepAliveService) instead of
 * letting the system show a plain banner.
 */
export async function sendFcmDataMessage(
  sa: ServiceAccount,
  token: string,
  data: Record<string, string>,
  opts: { collapseKey?: string; ttlSeconds?: number } = {},
): Promise<FcmSendResult> {
  try {
    const accessToken = await getAccessToken(sa);
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            data,
            android: {
              priority: "HIGH",
              ttl: `${Math.max(0, opts.ttlSeconds ?? 30)}s`,
              ...(opts.collapseKey ? { collapse_key: opts.collapseKey } : {}),
            },
          },
        }),
      },
    );
    if (res.ok) return { ok: true, status: res.status };
    const text = await res.text().catch(() => "");
    const unregistered = res.status === 404
      || /UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/i.test(text);
    return { ok: false, status: res.status, unregistered, error: text.slice(0, 300) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
