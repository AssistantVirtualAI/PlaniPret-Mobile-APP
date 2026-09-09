// GET /functions/v1/pp-recording-play?c=<call_uuid>&t=<hmac>[&r=1]
// Lien d'écoute PERMANENT pour Maestro : Maestro ne stocke que du texte
// (champ `notes`), or les URLs signées Supabase/NetSapiens expirent en 1 h.
// Par défaut on STREAME l'audio (audio/wav + Range + CORS) pour que le lecteur
// intégré de Maestro puisse le lire ; `r=1` force l'ancienne redirection 302.
import { createClient } from "npm:@supabase/supabase-js@2";
import { signRecordingToken } from "../_shared/recording-link.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sign = signRecordingToken;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "range, content-type",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const callId = url.searchParams.get("c") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!callId || token !== (await sign(callId))) {
    return new Response("Forbidden", { status: 403, headers: CORS });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: call } = await admin
    .from("planipret_phone_calls")
    .select("id, recording_url, recording_storage_path, metadata")
    .eq("id", callId)
    .maybeSingle();

  // 1) Re-signer le fichier stocké dans le bucket si on en connaît le chemin.
  const meta = ((call as any)?.metadata ?? {}) as Record<string, any>;
  const path = (call as any)?.recording_storage_path
    ?? meta.recording_storage_path
    ?? (typeof call?.recording_url === "string"
      ? call.recording_url.match(/call-recordings\/([^?]+)/)?.[1] ?? null
      : null);

  let source: string | null = null;
  if (path) {
    const { data } = await admin.storage.from("call-recordings").createSignedUrl(path, 3600);
    source = data?.signedUrl ?? null;
  }

  // 2) Sinon demander à NetSapiens une URL fraîche.
  if (!source) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ns-get-recording`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ call_db_id: callId, prefer_url: true }),
      });
      const d = await res.json().catch(() => ({} as any));
      source = (d?.url ?? d?.recording_url) ? String(d.url ?? d.recording_url) : null;
    } catch { /* noop */ }
  }

  if (!source) return new Response("Recording not available yet", { status: 404, headers: CORS });
  if (url.searchParams.get("r") === "1") return Response.redirect(source, 302);

  // Streaming direct : Maestro (et tout lecteur HTML5) lit le média sans
  // suivre de redirection cross-domain ni gérer d'URL signée expirée.
  const range = req.headers.get("range");
  const upstream = await fetch(source, { headers: range ? { Range: range } : {} });
  if (!upstream.ok && upstream.status !== 206) {
    return new Response("Recording not available yet", { status: 404, headers: CORS });
  }
  const type = upstream.headers.get("content-type") ?? "audio/wav";
  const headers = new Headers(CORS);
  headers.set("Content-Type", /audio|octet/.test(type) ? (type === "application/octet-stream" ? "audio/wav" : type) : "audio/wav");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("Content-Disposition", `inline; filename="${callId}.wav"`);
  for (const h of ["content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(req.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers });
});
