import { authBroker, corsHeaders, jsonResponse, logAudit, nsBrokerFetch, nsEnv, nsPath } from "../_shared/ns-broker.ts";

const val = (raw: any, keys: string[], fb: any = null) => {
  for (const k of keys) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && `${v}` !== "") return v;
  }
  return fb;
};

function pushCandidate(out: string[], raw: any) {
  const value = String(raw ?? "").trim();
  if (!value || value === "null" || value === "undefined" || out.includes(value)) return;
  if (value.includes("sip:") || value.split(":").length > 3) return;
  out.push(value);
}

function lookupCallIds(...sources: any[]): string[] {
  const ids: string[] = [];
  const keys = [
    "call-id", "call_id", "callid",
    "call-orig-call-id", "orig-callid", "orig-call-id", "orig_callid",
    "call-term-call-id", "term-callid", "term-call-id", "term_callid",
    "call-through-call-id", "by-callid", "by_callid",
    "call-parent-call-id",
    "call-parent-cdr-id", "cdr_id", "cdr-id", "id", "uuid",
  ];
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) pushCandidate(ids, source[key]);
  }
  return ids;
}

function accessUrl(raw: any): string | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return val(first, ["file-access-url", "file_access_url", "recording_url", "recording-url", "url"], null);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  console.log("=== ns-recordings called ===", req.method, req.url);
  try {
    const auth = await authBroker(req);
    if ("error" in auth) {
      console.log("authBroker failed");
      return auth.error;
    }
    const { admin, profile } = auth;
    const env = nsEnv();
    console.log("auth ok — extension:", profile.extension, "domain:", env.domain);

    const url = new URL(req.url);
    let callId = url.searchParams.get("call_id");
    if (!callId && req.method === "POST") {
      try {
        const body = await req.json();
        callId = body?.call_id ?? body?.cdr_id ?? null;
      } catch { /* ignore */ }
    }
    if (!callId) return jsonResponse({ success: false, error: "call_id requis", code: 400 }, 200);

    const { data: row } = await admin
      .from("planipret_phone_calls")
      .select("id, ns_call_id, recording_url, metadata, extension")
      .or(`id.eq.${callId},ns_call_id.eq.${callId}`)
      .maybeSingle();

    const meta: any = row?.metadata ?? {};
    const nsRaw = meta.ns_recording ?? meta;
    let res: Response | null = null;
    let path = "";
    const attempts: Array<{ path: string; status: number }> = [];

    const stripBase = (p: string) => p.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/?ns-api\/v2/i, "");

    const direct = row?.recording_url && String(row.recording_url).startsWith("http") ? String(row.recording_url) : null;
    if (direct) {
      path = direct;
      console.log("NS-API direct audio GET", path);
      res = await nsBrokerFetch(admin, profile, direct, { method: "GET", headers: { Accept: "audio/wav" } });
      attempts.push({ path: "direct_recording_url", status: res.status });
    }

    // Prefer NetSapiens' precomputed recording_api_path from sync metadata.
    const preferredPaths: string[] = [];
    if (meta.recording_api_path) preferredPaths.push(stripBase(String(meta.recording_api_path)));
    if (nsRaw?.recording_api_path && nsRaw.recording_api_path !== meta.recording_api_path) {
      preferredPaths.push(stripBase(String(nsRaw.recording_api_path)));
    }
    for (const p of preferredPaths) {
      if (res?.ok) break;
      path = p;
      console.log("NS-API recording metadata GET (preferred)", path);
      const metaRes = await nsBrokerFetch(admin, profile, path, { method: "GET" });
      attempts.push({ path, status: metaRes.status });
      if (!metaRes.ok) continue;
      const data = await metaRes.json().catch(() => null);
      const audioUrl = accessUrl(data);
      if (!audioUrl) continue;
      res = await nsBrokerFetch(admin, profile, audioUrl, { method: "GET", headers: { Accept: "audio/wav" } });
      attempts.push({ path: "file-access-url", status: res.status });
      if (res.ok && row?.id) {
        admin.from("planipret_phone_calls").update({ recording_url: audioUrl }).eq("id", row.id).then(() => {}, () => {});
      }
    }

    const ids = lookupCallIds(nsRaw, meta, { call_id: callId, ns_call_id: row?.ns_call_id });
    const extensions = Array.from(new Set([
      row?.extension,
      profile.extension,
      meta.extension,
      nsRaw?.["orig-user"],
      nsRaw?.["term-user"],
      nsRaw?.["user"],
    ].map((e) => String(e ?? "").trim()).filter((e) => e && !e.includes("@"))));

    for (const id of ids) {
      if (res?.ok) break;
      const paths: string[] = [
        `/domains/${encodeURIComponent(env.domain)}/recordings/${encodeURIComponent(id)}`,
      ];
      // User-level fallback for each candidate extension when domain-level returns 404.
      for (const ext of extensions) {
        paths.push(nsPath(env.domain, ext, `/recordings/${encodeURIComponent(id)}`));
      }
      for (const p of paths) {
        if (res?.ok) break;
        path = p;
        console.log("NS-API recording metadata GET", path);
        const metaRes = await nsBrokerFetch(admin, profile, path, { method: "GET" });
        attempts.push({ path, status: metaRes.status });
        if (!metaRes.ok) continue;
        const data = await metaRes.json().catch(() => null);
        const audioUrl = accessUrl(data);
        if (!audioUrl) continue;
        res = await nsBrokerFetch(admin, profile, audioUrl, { method: "GET", headers: { Accept: "audio/wav" } });
        attempts.push({ path: "file-access-url", status: res.status });
        if (res.ok && row?.id) {
          admin.from("planipret_phone_calls").update({ recording_url: audioUrl }).eq("id", row.id).then(() => {}, () => {});
        }
      }
    }


    if (!res) {
      return jsonResponse({
        success: false,
        error: "Enregistrement non disponible pour cet appel",
        hint: "Aucune URL audio valide n'a été retournée par NetSapiens.",
        call_id: callId,
        attempts,
      }, 200);
    }
    console.log("NS-API status:", res.status, "content-type:", res.headers.get("content-type"));

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const hint = res.status === 401
        ? "NS-API token invalide/expiré pour cet enregistrement"
        : res.status === 403
        ? "Le token NS-API n'a pas la permission d'accéder aux enregistrements pour l'extension " + profile.extension
        : res.status === 404
        ? "Aucun enregistrement pour cet appel (call_id introuvable côté NS-API — l'appel n'a peut-être pas été enregistré)"
        : `NS-API a retourné ${res.status}`;
      console.log("NS-API error body:", txt.slice(0, 500));
      return jsonResponse({
        success: false,
        error: hint,
        ns_status: res.status,
        ns_response: txt.slice(0, 500),
        call_id: callId,
        extension: profile.extension,
        attempts,
      }, 200);
    }

    const blob = await res.arrayBuffer();
    console.log("audio bytes:", blob.byteLength);
    if (blob.byteLength < 128) {
      return jsonResponse({
        success: false,
        error: "Fichier audio vide reçu de NS-API",
        ns_status: res.status,
        call_id: callId,
      }, 200);
    }
    await logAudit(admin, req, {
      user_id: profile.id, action: "RECORDING_ACCESS",
      resource_type: "recording", resource_id: callId,
    });
    const ct = res.headers.get("content-type") ?? "audio/wav";
    return new Response(blob, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": ct.startsWith("audio/") ? ct : "audio/wav",
        "Content-Length": String(blob.byteLength),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("ns-recordings unexpected error:", e);
    return jsonResponse({
      success: false,
      error: (e as Error)?.message ?? "Erreur inconnue",
      type: (e as Error)?.constructor?.name,
    }, 200);
  }
});
