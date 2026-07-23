// Short-lived HMAC-signed session token embedding the broker user_id.
// Used to authorize ElevenLabs voice-agent tool webhooks that cannot carry
// a Supabase user JWT.
//
// Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256)
// Payload: { uid: string, exp: number (unix seconds) }

const enc = new TextEncoder();

function b64u(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("AVA_TOOL_SIGNING_SECRET");
  if (!secret) throw new Error("AVA_TOOL_SIGNING_SECRET_missing");
  return await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signAvaSession(userId: string, ttlSeconds = 1800): Promise<string> {
  const payload = { uid: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const p = b64u(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(p)));
  return `${p}.${b64u(sig)}`;
}

export async function verifyAvaSession(token: string): Promise<{ uid: string } | null> {
  try {
    const [p, s] = token.split(".");
    if (!p || !s) return null;
    const key = await hmacKey();
    const ok = await crypto.subtle.verify("HMAC", key, b64uDecode(s), enc.encode(p));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64uDecode(p))) as { uid: string; exp: number };
    if (!payload?.uid || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { uid: payload.uid };
  } catch {
    return null;
  }
}
