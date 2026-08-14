// Lien d'écoute permanent poussé dans Maestro (le CRM ne stocke que du texte).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export async function signRecordingToken(callId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SERVICE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`rec:${callId}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function recordingPermalink(callId: string): Promise<string> {
  return `${SUPABASE_URL}/functions/v1/pp-recording-play?c=${encodeURIComponent(callId)}&t=${await signRecordingToken(callId)}`;
}
