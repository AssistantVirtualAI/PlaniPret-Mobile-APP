// mobile-calls: list call history and per-call detail (transcript + AI summary).
// GET    /mobile-calls           → list
// GET    /mobile-calls?id=<uuid> → detail
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function mapCall(r: any) {
  const direction = r.direction === "outbound" ? "out" : "in";
  const status = r.missed_call ? "missed" : r.call_status === "voicemail" ? "voicemail" : "answered";
  return {
    id: r.id, direction, status,
    pbx_uuid: r.pbx_uuid || undefined,
    organization_id: r.organization_id || undefined,
    domain_uuid: r.domain_uuid || undefined,
    domain_name: r.domain_name || undefined,
    from: r.caller_number || r.source_number || "",
    to: r.destination_number || r.destination || r.extension || "",
    extension: r.extension || undefined,
    customer: r.caller_name || undefined,
    startedAt: r.start_at, durationSec: r.duration_seconds || 0,
    hasRecording: !!(r.has_recording || r.recording_path || r.recording_name || r.recording_url), hasTranscript: !!r.transcribed,
    recording_path: r.recording_path || undefined,
    recording_name: r.recording_name || undefined,
    recording_url: r.recording_url || undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: __mobileAllowed } = await sb.rpc("my_platform_access_allowed", { _platform: "mobile" });
    if (__mobileAllowed === false) return json({ error: "MOBILE_ACCESS_DISABLED", message: "Mobile access not granted by Lemtel administrators." }, 403);

    const { data: sp } = await admin.from("pbx_softphone_users")
      .select("organization_id, extension, domain_uuid")
      .eq("portal_user_id", u.user.id).maybeSingle();
    if (!sp) return json({ error: "NO_SOFTPHONE_ACCOUNT" }, 404);
    if (!sp.extension) return json({ error: "NO_EXTENSION_ASSIGNED" }, 403);

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    // Mobile app is ALWAYS scoped to the current broker's extension — no
    // admin bypass here, so brokers never see other brokers' calls.
    const ext = sp.extension;
    const extFilter = `extension.eq.${ext},caller_number.eq.${ext},source_number.eq.${ext},destination_number.eq.${ext},destination.eq.${ext}`;

    if (id) {
      let detailQ = admin.from("pbx_call_records").select("*")
        .eq("id", id).eq("organization_id", sp.organization_id).or(extFilter);
      // Allow rows where domain_uuid is NULL (older CDRs) OR matches the user's domain.
      if (sp.domain_uuid) detailQ = detailQ.or(`domain_uuid.eq.${sp.domain_uuid},domain_uuid.is.null`);
      const { data: r } = await detailQ.maybeSingle();
      if (!r) return json({ error: "not_found" }, 404);

      const [{ data: tr }, { data: ins }, { data: audit }] = await Promise.all([
        admin.from("pbx_call_transcripts").select("transcript_json, transcript_text, provider, created_at")
          .eq("call_record_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        admin.from("pbx_ai_insights").select("summary, topics, action_items, quality_score, coaching_score, coaching_notes, intent, tags, sentiment, ai_model, created_at")
          .eq("call_record_id", id).maybeSingle(),
        admin.from("ai_request_audit_log").select("status, error_code, message, provider, model, created_at")
          .eq("call_record_id", id).eq("request_type", "transcribe").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      let transcript: any[] = [];
      const tj = (tr as any)?.transcript_json;
      if (Array.isArray(tj)) {
        transcript = tj.map((s: any, i: number) => ({
          speaker: s.speaker === "agent" || s.role === "agent" ? "agent" : "customer",
          text: s.text || s.content || "", t: s.t ?? i * 6,
        }));
      } else if ((tr as any)?.transcript_text) {
        transcript = [{ speaker: "agent", text: (tr as any).transcript_text, t: 0 }];
      }

      // Transcription status + provider (used by the mobile badge).
      const rawProvider = String((tr as any)?.provider || (audit as any)?.provider || "");
      const auditStatus = String((audit as any)?.status || "");
      const isStub = rawProvider.startsWith("stub");
      const hasText = !!(tr as any)?.transcript_text && !isStub;
      let transcriptionStatus: 'pending' | 'processing' | 'done' | 'failed' | 'missing' = 'missing';
      if (hasText) transcriptionStatus = 'done';
      else if (auditStatus === 'error' || auditStatus === 'ai-error' || isStub) transcriptionStatus = 'failed';
      else if (auditStatus === 'processing') transcriptionStatus = 'processing';
      // Human-readable provider label
      const providerLabel = (() => {
        if (!rawProvider) return null;
        if (rawProvider.includes('openai') && rawProvider.includes('whisper')) return 'Whisper-1';
        if (rawProvider.includes('gpt-4o-mini-transcribe') || rawProvider.includes('lovable-ai')) return 'Gemini (fallback)';
        if (isStub) return `Échec (${rawProvider.replace('stub-', '')})`;
        return rawProvider;
      })();

      return json({
        ...mapCall(r),
        sentiment: (ins as any)?.sentiment || undefined,
        transcript,
        summary: (ins as any)?.summary || "",
        topics: (ins as any)?.topics || [],
        actionItems: (ins as any)?.action_items || [],
        qualityScore: (ins as any)?.quality_score ?? 0,
        coachingScore: (ins as any)?.coaching_score ?? null,
        coachingNotes: (ins as any)?.coaching_notes || [],
        aiStatus: (ins as any)?.ai_model && !String((ins as any).ai_model).startsWith("stub") && hasText ? "cached"
          : auditStatus === "error" || auditStatus === "ai-error" ? "failed"
          : "missing",
        aiError: auditStatus === "error" || auditStatus === "ai-error" ? ((audit as any)?.message || (audit as any)?.error_code || "AI analysis failed") : null,
        aiCached: !!((ins as any)?.ai_model && !String((ins as any).ai_model).startsWith("stub") && hasText),
        transcriptionStatus,
        transcriptionProvider: providerLabel,
        transcriptionProviderRaw: rawProvider || null,
        transcriptionError: transcriptionStatus === 'failed' ? ((audit as any)?.message || (audit as any)?.error_code || null) : null,
        intent: (ins as any)?.intent || "",
        tags: (ins as any)?.tags || [],
      });
    }

    const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 7, 1), 30);
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    sinceDate.setHours(0, 0, 0, 0);
    const since = sinceDate.toISOString();
    const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 200);
    let listQ = admin.from("pbx_call_records")
      .select("id, pbx_uuid, organization_id, domain_uuid, direction, call_status, caller_name, caller_number, source_number, destination_number, extension, start_at, duration_seconds, missed_call, has_recording, transcribed")
      .eq("organization_id", sp.organization_id)
      .gte("start_at", since);
    listQ = listQ.or(extFilter);
    if (sp.domain_uuid) listQ = listQ.or(`domain_uuid.eq.${sp.domain_uuid},domain_uuid.is.null`);
    const { data: rows, error } = await listQ
      .order("start_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return json((rows || []).map(mapCall));
  } catch (e) {
    console.error("[mobile-calls]", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
