// pp-call-e2e-check: end-to-end coherence check for a Planiprêt call.
// Verifies (1) recording available via ns-recordings, (2) transcript available
// via ns-transcription (or already stored on the call), and (3) AI actions
// produced by ai-analyze-call. Returns a compact JSON report.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type StepReport = { ok: boolean; skipped?: boolean; detail?: any; error?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ success: false, error: "unauthorized" }, 401);

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supaUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const callId = String(body?.call_id ?? "").trim();
    if (!callId) return json({ success: false, error: "call_id required" }, 400);

    const invoke = async (name: string, opts: { method?: string; qs?: string; body?: unknown }) => {
      const url = `${supaUrl}/functions/v1/${name}${opts.qs ? `?${opts.qs}` : ""}`;
      const t0 = Date.now();
      const r = await fetch(url, {
        method: opts.method ?? "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      return { status: r.status, ms: Date.now() - t0, res: r };
    };

    const report: Record<string, StepReport> = {};

    // 0) Extension resolved for the calling broker
    try {
      const userClient = createClient(supaUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (u?.user) {
        const { data: p } = await admin
          .from("planipret_profiles")
          .select("extension, ns_extension, ns_linked, ns_domain")
          .eq("user_id", u.user.id)
          .maybeSingle();
        const ext = (p as any)?.extension || (p as any)?.ns_extension;
        report.extension = {
          ok: !!ext && !!(p as any)?.ns_linked,
          detail: { extension: ext ?? null, ns_linked: (p as any)?.ns_linked ?? false, domain: (p as any)?.ns_domain ?? null },
          error: !ext ? "no_extension" : (!(p as any)?.ns_linked ? "not_linked" : undefined),
        };
      } else {
        report.extension = { ok: false, error: "unauthorized" };
      }
    } catch (e) {
      report.extension = { ok: false, error: (e as Error).message };
    }

    // 1) Recording
    try {
      const { status, ms, res } = await invoke("ns-recordings", { method: "GET", qs: `call_id=${encodeURIComponent(callId)}` });
      const ct = res.headers.get("content-type") ?? "";
      if (status === 200 && ct.startsWith("audio/")) {
        const buf = await res.arrayBuffer();
        report.recording = { ok: buf.byteLength > 128, detail: { bytes: buf.byteLength, content_type: ct, ms } };
      } else {
        const j = await res.json().catch(() => ({}));
        report.recording = { ok: false, error: j?.error ?? `status ${status}`, detail: { ms, ...j } };
      }
    } catch (e) {
      report.recording = { ok: false, error: (e as Error).message };
    }

    // 2) Transcript — first check DB, otherwise call ns-get-transcription
    const { data: callRow } = await admin
      .from("planipret_phone_calls")
      .select("id, transcript, transcript_segments, ai_summary, ai_analysis_json, next_actions, metadata")
      .or(`id.eq.${callId},ns_call_id.eq.${callId}`)
      .maybeSingle();

    const existingTranscript = (callRow as any)?.transcript || (Array.isArray((callRow as any)?.transcript_segments) && (callRow as any).transcript_segments.length > 0);
    if (existingTranscript) {
      report.transcript = {
        ok: true,
        detail: {
          source: "db",
          length: String((callRow as any).transcript ?? "").length,
          segments: Array.isArray((callRow as any).transcript_segments) ? (callRow as any).transcript_segments.length : 0,
        },
      };
    } else {
      try {
        const { res, ms, status } = await invoke("ns-get-transcription", { body: { call_db_id: (callRow as any)?.id ?? callId, ns_callid: callId } });
        const j = await res.json().catch(() => ({}));
        report.transcript = {
          ok: !!j?.success && Array.isArray(j.segments) && j.segments.length > 0,
          detail: { source: "ns-get-transcription", status, ms, segments: j?.segments?.length ?? 0, hint: j?.hint },
          error: j?.success === false ? j?.error : undefined,
        };
      } catch (e) {
        report.transcript = { ok: false, error: (e as Error).message };
      }
    }

    // 3) AI actions — reuse cached analysis if present, otherwise trigger ai-analyze-call
    const cachedAi = (callRow as any)?.ai_analysis_json || (callRow as any)?.ai_summary;
    const cachedActions =
      (callRow as any)?.next_actions ??
      (callRow as any)?.ai_analysis_json?.summary?.next_steps ??
      (callRow as any)?.metadata?.ai_tasks ??
      null;

    if (cachedAi && Array.isArray(cachedActions) && cachedActions.length > 0) {
      report.ai_actions = { ok: true, detail: { source: "cached", count: cachedActions.length } };
    } else if (!report.transcript?.ok) {
      report.ai_actions = { ok: false, skipped: true, error: "transcript missing" };
    } else {
      try {
        const { res, ms, status } = await invoke("ai-analyze-call", { body: { call_id: callId, force: false } });
        const j = await res.json().catch(() => ({}));
        const actions =
          j?.insights?.tasks ??
          j?.analysis?.summary?.next_steps ??
          j?.next_actions ??
          [];
        report.ai_actions = {
          ok: !!j?.success && Array.isArray(actions) && actions.length > 0,
          detail: { source: "ai-analyze-call", status, ms, count: Array.isArray(actions) ? actions.length : 0, model: j?.insights?.ai_model ?? j?.model_used },
          error: j?.success === false ? j?.error : undefined,
        };
      } catch (e) {
        report.ai_actions = { ok: false, error: (e as Error).message };
      }
    }

    const allOk = !!report.extension?.ok && report.recording.ok && report.transcript.ok && report.ai_actions.ok;

    return json({
      success: true,
      call_id: callId,
      coherent: allOk,
      report,
      checked_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("pp-call-e2e-check error", e);
    return json({ success: false, error: (e as Error).message ?? "error" }, 500);
  }
});
