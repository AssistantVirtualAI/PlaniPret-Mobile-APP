// pp-ns-recordings — Proxy NS-API v2 Enregistrements d'appels pour Planiprêt.
// AVA Planiprêt uniquement. Segmentation stricte par extension utilisateur.
//
// GET  ?call_id=X          → Enregistrement d'un appel spécifique
// GET  ?action=list        → Liste des enregistrements récents (via CDR)
//
// Sécurité : requirePlanipretBroker() garantit que l'utilisateur ne peut
// accéder qu'aux enregistrements de sa propre extension.

import {
  corsHeaders,
  jsonResponse,
  requirePlanipretBroker,
  nsFetch,
} from "../_shared/planipret-ns.ts";

function val(raw: any, keys: string[], fb: any = null) {
  for (const k of keys) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && `${v}` !== "") return v;
  }
  return fb;
}

function normalizeEndpoint(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.replace(/^sips?:/i, "").replace(/^tel:/i, "").split("@")[0] || s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await requirePlanipretBroker(req);
  if (guard instanceof Response) return guard;

  const { ctx, supabase } = guard;
  const url = new URL(req.url);
  let body: any = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { body = {}; }
  }
  const callId = body.call_id ?? url.searchParams.get("call_id");
  const action = body.action ?? url.searchParams.get("action") ?? (callId ? "get" : "list");

  try {
    // ── GET enregistrement d'un appel spécifique ─────────────────────────────
    if (action === "get" && callId) {
      // NS-API v2: GET /domains/{domain}/users/{user}/recordings/{call_id}
      const res = await nsFetch(
        `/domains/${encodeURIComponent(ctx.nsDomain)}/users/${encodeURIComponent(ctx.extension)}/recordings/${encodeURIComponent(callId)}`,
        { method: "GET" }
      );

      if (!res.ok) {
        const txt = await res.text();
        return jsonResponse({ error: "NS-API recording fetch failed", status: res.status, body: txt }, 502);
      }

      const contentType = res.headers.get("content-type") ?? "";

      // Si la réponse est JSON, retourner l'URL de l'enregistrement
      if (contentType.includes("application/json")) {
        const data = await res.json();
        return jsonResponse({
          ok: true,
          call_id: callId,
          recording_url: data.url ?? data.recording_url ?? null,
          duration: data.duration ?? null,
        });
      }

      // Proxy du contenu audio directement
      const audioBuffer = await res.arrayBuffer();
      return new Response(audioBuffer, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": contentType || "audio/wav",
          "Content-Length": audioBuffer.byteLength.toString(),
          "Content-Disposition": `inline; filename="recording-${callId}.wav"`,
        },
      });
    }

    // ── GET liste des enregistrements récents ────────────────────────────────
    if (action === "list") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? body.limit ?? 50), 200);
      const end = url.searchParams.get("end") ?? body.end ?? new Date().toISOString();
      const start = url.searchParams.get("start") ?? body.start ??
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // 1) Fetch live from NS-API recordings endpoint (per-user extension)
      let nsItems: any[] = [];
      try {
        const nsRes = await nsFetch(
          `/domains/${encodeURIComponent(ctx.nsDomain)}/users/${encodeURIComponent(ctx.extension)}/recordings` +
          `?start-time=${encodeURIComponent(start)}&end-time=${encodeURIComponent(end)}&limit=${limit}`,
          { method: "GET" },
          { functionName: "pp-ns-recordings" },
        );
        if (nsRes.ok) {
          const raw = await nsRes.json();
          nsItems = Array.isArray(raw) ? raw : raw?.recordings ?? raw?.data ?? [];
        } else {
          console.warn("[pp-ns-recordings] NS list failed", nsRes.status);
        }
      } catch (e) {
        console.warn("[pp-ns-recordings] NS list error", (e as Error).message);
      }

      // 2) Merge with enriched local CDR rows (transcript, AI, etc.)
      // Match admin scoping: filter by extension so we include every call on
      // the broker's extension, even if user_id wasn't tagged at sync time.
      const { data: local } = await supabase
        .from("planipret_phone_calls")
        .select("id, user_id, ns_call_id, ns_callid, ns_orig_callid, ns_term_callid, extension, direction, status, from_number, from_name, to_number, to_name, started_at, duration_seconds, recording_url, has_recording, ai_summary, transcript, transcript_segments, transcript_language, ai_coaching, ai_key_points, ai_client_insights, maestro_synced, maestro_client_id, pipeline_state")
        .or(`user_id.eq.${ctx.profileId},extension.eq.${ctx.extension}`)
        .gte("started_at", start)
        .lte("started_at", end)
        .order("started_at", { ascending: false })
        .limit(limit);
      const byNsId = new Map<string, any>();
      (local ?? []).forEach((r: any) => {
        [r.ns_call_id, r.ns_callid, r.ns_orig_callid, r.ns_term_callid].filter(Boolean).forEach((id: string) => byNsId.set(id, r));
      });

      const items = nsItems.map((it: any, i: number) => {
        const nsId = val(it, ["call-parent-cdr-id", "cdr-id", "cdr_id", "id", "uuid", "call_id", "call-id"]);
        const nsCallId = val(it, ["call-id", "call_id", "callid", "call-parent-call-id", "orig_callid", "term_callid"]);
        const nsOrigCallId = val(it, ["call-orig-call-id", "orig_callid", "orig-callid", "orig-call-id"]);
        const nsTermCallId = val(it, ["call-term-call-id", "term_callid", "term-callid", "term-call-id"]);
        const enriched = [nsId, nsCallId, nsOrigCallId, nsTermCallId].map((id) => id ? byNsId.get(id) : null).find(Boolean);
        const dirRaw = String(val(it, ["direction", "call_direction", "call-direction"], enriched?.direction ?? "")).toLowerCase();
        const direction = dirRaw.includes("in") ? "inbound" : "outbound";
        const recordingUrl = val(it, ["file-access-url", "url", "recording_url", "recording", "record_url"]) ?? enriched?.recording_url ?? null;
        return {
          id: enriched?.id ?? nsId ?? `rec-${i}`,
          user_id: enriched?.user_id ?? ctx.profileId,
          ns_call_id: nsId,
          ns_callid: nsCallId ?? enriched?.ns_callid ?? null,
          ns_orig_callid: nsOrigCallId ?? enriched?.ns_orig_callid ?? null,
          ns_term_callid: nsTermCallId ?? enriched?.ns_term_callid ?? null,
          extension: enriched?.extension ?? ctx.extension,
          direction,
          from_number: normalizeEndpoint(val(it, ["from_number", "from", "caller_id_number", "caller-id-number", "orig_from_user", "orig-user", "call-orig-user", "call-orig-from-uri", "orig-from-uri", "by_number"])) ?? enriched?.from_number ?? null,
          from_name: val(it, ["from_name", "caller_id_name", "caller-id-name", "orig_from_name", "orig-name"]) ?? enriched?.from_name ?? null,
          to_number: normalizeEndpoint(val(it, ["to_number", "to", "destination", "dialed_number", "dnis", "term_to_user", "term-user", "call-term-user", "call-term-to-uri", "call-orig-to-uri"])) ?? enriched?.to_number ?? null,
          to_name: val(it, ["to_name", "term_to_name", "term-name"]) ?? enriched?.to_name ?? null,
          started_at: val(it, ["start_time", "started_at", "time_start", "time-start", "call-recording-started-datetime"]) ?? enriched?.started_at ?? null,
          duration_seconds: Number(val(it, ["duration", "billsec", "time_talking", "file-duration-seconds"], 0)) || enriched?.duration_seconds || 0,
          recording_url: recordingUrl,
          has_recording: true,
          // Always give the UI a proxy stream endpoint so audio can be fetched
          // even when the raw file-access-url is unavailable/expired.
          stream_via_proxy: !!(enriched?.id || nsCallId || nsOrigCallId || nsTermCallId),
          proxy_call_db_id: enriched?.id ?? null,
          proxy_ns_callid: nsCallId ?? nsOrigCallId ?? nsTermCallId ?? nsId ?? null,
          ai_summary: enriched?.ai_summary ?? null,
          transcript: enriched?.transcript ?? null,
          transcript_segments: enriched?.transcript_segments ?? null,
          transcript_language: enriched?.transcript_language ?? null,
          ai_coaching: enriched?.ai_coaching ?? null,
          ai_key_points: enriched?.ai_key_points ?? null,
          ai_client_insights: enriched?.ai_client_insights ?? null,
          maestro_synced: enriched?.maestro_synced ?? null,
          maestro_client_id: enriched?.maestro_client_id ?? null,
          pipeline_state: enriched?.pipeline_state ?? null,
        };
      });

      // Fallback + merge: include local rows that NS didn't return but have any NS id
      // (recordings may still be resolvable through ns-get-recording proxy).
      const nsSeen = new Set(items.map((r) => r.id));
      const localExtra = (local ?? [])
        .filter((r: any) => {
          if (nsSeen.has(r.id)) return false;
          if (r.ns_callid || r.ns_orig_callid || r.ns_term_callid || r.ns_call_id || r.recording_url || r.has_recording) return true;
          const st = String(r.status ?? "").toLowerCase();
          return ["completed", "answered", "active", "in_progress"].some((s) => st.includes(s)) || Number(r.duration_seconds ?? 0) > 0;
        })
        .map((r: any) => ({
          id: r.id,
          user_id: r.user_id ?? ctx.profileId,
          ns_call_id: r.ns_call_id,
          ns_callid: r.ns_callid,
          ns_orig_callid: r.ns_orig_callid,
          ns_term_callid: r.ns_term_callid,
          extension: r.extension ?? ctx.extension,
          direction: r.direction ?? "outbound",
          status: r.status ?? null,
          from_number: r.from_number,
          from_name: r.from_name,
          to_number: r.to_number,
          to_name: r.to_name,
          started_at: r.started_at,
          duration_seconds: r.duration_seconds ?? 0,
          recording_url: r.recording_url,
          has_recording: !!(r.recording_url || r.has_recording || r.ns_callid || r.ns_orig_callid || r.ns_term_callid || r.ns_call_id || r.started_at),
          stream_via_proxy: true,
          proxy_call_db_id: r.id,
          proxy_ns_callid: r.ns_callid ?? r.ns_orig_callid ?? r.ns_term_callid ?? r.ns_call_id ?? null,
          ai_summary: r.ai_summary,
          transcript: r.transcript,
          transcript_segments: r.transcript_segments,
          transcript_language: r.transcript_language,
          ai_coaching: r.ai_coaching,
          ai_key_points: r.ai_key_points,
          ai_client_insights: r.ai_client_insights,
          maestro_synced: r.maestro_synced,
          maestro_client_id: r.maestro_client_id,
          pipeline_state: r.pipeline_state,
        }));
      const finalItems = [...items, ...localExtra].sort((a: any, b: any) => {
        const ta = a.started_at ? new Date(a.started_at).getTime() : 0;
        const tb = b.started_at ? new Date(b.started_at).getTime() : 0;
        return tb - ta;
      });

      return jsonResponse({ ok: true, count: finalItems.length, items: finalItems });
    }

    return jsonResponse({ error: `Action inconnue: ${action}` }, 400);

  } catch (e) {
    console.error("[pp-ns-recordings] Erreur:", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
