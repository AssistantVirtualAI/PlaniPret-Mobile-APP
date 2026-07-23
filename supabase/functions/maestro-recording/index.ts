// GET /functions/v1/maestro-recording?call_id={uuid}
// Returns a signed recording URL from Maestro, caching it on the call row.
import {
  adminClient,
  corsHeaders,
  getBrokerAuth,
  getMaestroConfig,
  json,
  maestroFetch,
} from "../_shared/maestro.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let callId = url.searchParams.get("call_id");
    if (!callId && req.method !== "GET") {
      try {
        const body = await req.json();
        callId = body?.call_id ?? body?.callId ?? null;
      } catch { /* ignore */ }
    }
    // Always return 200 with a structured payload so the mobile UI can render
    // "not yet available" states gracefully instead of red 4xx errors.
    if (!callId) {
      return json({ available: false, reason: "call_id_required", url: null, recording_url: null });
    }

    const admin = adminClient();
    const { data: call } = await admin
      .from("planipret_phone_calls")
      .select("id, user_id, ns_call_id, maestro_call_id, recording_url, metadata")
      .eq("id", callId)
      .maybeSingle();
    if (!call) {
      return json({ available: false, reason: "call_not_found", url: null, recording_url: null });
    }

    // Cached URL check
    const cached = (call.metadata ?? {}) as Record<string, any>;
    const cachedUrl = cached.maestro_recording_url;
    const cachedExp = cached.maestro_recording_expires_at;
    if (cachedUrl && cachedExp && new Date(cachedExp) > new Date(Date.now() + 60_000)) {
      return json({
        available: true,
        reason: "cached",
        url: cachedUrl,
        recording_url: cachedUrl,
        expires_at: cachedExp,
        duration_sec: cached.maestro_recording_duration_sec ?? null,
        cached: true,
      });
    }

    const cfg = await getMaestroConfig(admin);
    if (!cfg.url || !cfg.key) {
      if (call.recording_url) {
        return json({ available: true, reason: "ns_fallback", url: call.recording_url, recording_url: call.recording_url, expires_at: null, source: "ns" });
      }
      return json({ available: false, reason: "maestro_not_configured", url: null, recording_url: null });
    }

    let res: any;
    try {
      const auth = await getBrokerAuth(admin, call.user_id);
      const maestroCallId = call.maestro_call_id ?? call.ns_call_id ?? call.id;
      res = await maestroFetch(cfg, {
        method: "GET",
        path: `/api/v1/calls/${encodeURIComponent(maestroCallId)}/recording`,
        token: auth.token,
      });
    } catch (e: any) {
      if (call.recording_url) {
        return json({ available: true, reason: "ns_fallback", url: call.recording_url, recording_url: call.recording_url, expires_at: null, source: "ns" });
      }
      return json({ available: false, reason: "maestro_error", detail: e?.message ?? null, url: null, recording_url: null });
    }

    if (!res.ok) {
      if (call.recording_url) {
        return json({ available: true, reason: "ns_fallback", url: call.recording_url, recording_url: call.recording_url, expires_at: null, source: "ns" });
      }
      return json({ available: false, reason: "maestro_status_" + res.status, url: null, recording_url: null });
    }

    const data = res.data ?? {};
    if (!data?.url) {
      return json({ available: false, reason: "no_url", url: null, recording_url: call.recording_url ?? null });
    }
    const next = {
      ...cached,
      maestro_recording_url: data.url,
      maestro_recording_expires_at: data.expires_at ?? null,
      maestro_recording_duration_sec: data.duration_sec ?? null,
    };
    await admin
      .from("planipret_phone_calls")
      .update({
        recording_url: data.url ?? call.recording_url,
        metadata: next,
      })
      .eq("id", call.id);

    return json({
      available: true,
      reason: "fresh",
      url: data.url,
      recording_url: data.url,
      expires_at: data.expires_at ?? null,
      duration_sec: data.duration_sec ?? null,
      cached: false,
    });
  } catch (e: any) {
    console.error("maestro-recording error", e);
    // Still return 200 so client can render a friendly state.
    return json({ available: false, reason: "server_error", detail: e?.message ?? null, url: null, recording_url: null });
  }
});
