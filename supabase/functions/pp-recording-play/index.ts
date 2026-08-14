// GET /functions/v1/pp-recording-play?c=<call_uuid>&t=<hmac>
// Lien d'écoute PERMANENT pour Maestro : Maestro ne stocke que du texte
// (champ `notes`), or les URLs signées Supabase/NetSapiens expirent en 1 h.
// Ce endpoint public (signé HMAC) redirige vers une URL fraîche à chaque clic.
import { createClient } from "npm:@supabase/supabase-js@2";
import { signRecordingToken } from "../_shared/recording-link.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sign = signRecordingToken;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const callId = url.searchParams.get("c") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!callId || token !== (await sign(callId))) {
    return new Response("Forbidden", { status: 403 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: call } = await admin
    .from("planipret_phone_calls")
    .select("id, recording_url, metadata")
    .eq("id", callId)
    .maybeSingle();

  // 1) Re-signer le fichier stocké dans le bucket si on en connaît le chemin.
  const meta = ((call as any)?.metadata ?? {}) as Record<string, any>;
  const path = meta.recording_storage_path
    ?? (typeof call?.recording_url === "string"
      ? call.recording_url.match(/call-recordings\/([^?]+)/)?.[1] ?? null
      : null);
  if (path) {
    const { data } = await admin.storage.from("call-recordings").createSignedUrl(path, 3600);
    if (data?.signedUrl) return Response.redirect(data.signedUrl, 302);
  }

  // 2) Sinon demander à NetSapiens une URL fraîche.
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ns-get-recording`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ call_db_id: callId, prefer_url: true }),
    });
    const d = await res.json().catch(() => ({} as any));
    const fresh = d?.url ?? d?.recording_url;
    if (fresh) return Response.redirect(String(fresh), 302);
  } catch { /* noop */ }

  return new Response("Recording not available yet", { status: 404 });
});
