// ElevenLabs sync — pulls agents + recent conversations + transcripts
// and mirrors them into voice_agent_conversations / voice_agent_transcripts.
// Idempotent: upserts by conversation_id, replaces transcript rows per conversation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EL_API = "https://api.elevenlabs.io";

async function elFetch(path: string, apiKey: string) {
  const r = await fetch(`${EL_API}${path}`, {
    headers: { "xi-api-key": apiKey, Accept: "application/json" },
  });
  const text = await r.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json().catch(() => ({}));
    const organization_id: string | undefined = body.organization_id;
    const limit: number = Math.min(Number(body.limit ?? 50), 200);
    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) List agents (so we can map elevenlabs_agent_id -> voice_agent_id)
    const agentsRes = await elFetch("/v1/convai/agents?page_size=100", apiKey);
    const agentsList: any[] = agentsRes.data?.agents || [];

    // Map ElevenLabs agent_id -> internal voice_agent_id
    const { data: vaRows } = await admin
      .from("lemtel_voice_agents")
      .select("id, elevenlabs_agent_id")
      .eq("organization_id", organization_id);
    const idMap = new Map<string, string>();
    (vaRows || []).forEach((r: any) => {
      if (r.elevenlabs_agent_id) idMap.set(r.elevenlabs_agent_id, r.id);
    });

    // 2) List recent conversations
    const convRes = await elFetch(`/v1/convai/conversations?page_size=${limit}`, apiKey);
    if (!convRes.ok) {
      return new Response(JSON.stringify({
        ok: false, error: "elevenlabs_list_failed", status: convRes.status, detail: convRes.data,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const conversations: any[] = convRes.data?.conversations || [];

    let upsertedConv = 0;
    let upsertedTx = 0;
    const errors: any[] = [];

    for (const c of conversations) {
      const conversation_id = c.conversation_id || c.id;
      if (!conversation_id) continue;
      const elAgentId = c.agent_id || c.agent?.agent_id || null;

      // Hydrate details + transcript
      const det = await elFetch(`/v1/convai/conversations/${conversation_id}`, apiKey);
      const d = det.data || {};
      const started = d.metadata?.start_time_unix_secs
        ? new Date(d.metadata.start_time_unix_secs * 1000).toISOString()
        : d.started_at || c.start_time_unix_secs
          ? new Date((c.start_time_unix_secs || 0) * 1000).toISOString()
          : null;
      const duration = d.metadata?.call_duration_secs ?? d.duration_seconds ?? c.call_duration_secs ?? null;
      const ended = started && duration
        ? new Date(new Date(started).getTime() + duration * 1000).toISOString()
        : null;

      const audioRes = await elFetch(`/v1/convai/conversations/${conversation_id}/audio`, apiKey);
      const hasAudio = audioRes.status === 200 || audioRes.ok;

      const row = {
        organization_id,
        voice_agent_id: elAgentId ? (idMap.get(elAgentId) || null) : null,
        elevenlabs_agent_id: elAgentId,
        conversation_id,
        status: d.status || c.status || null,
        caller_number: d.metadata?.phone_call?.external_number || null,
        callee_number: d.metadata?.phone_call?.agent_number || null,
        duration_seconds: duration,
        ended_reason: d.analysis?.call_successful || d.ended_reason || null,
        audio_url: hasAudio
          ? `${EL_API}/v1/convai/conversations/${conversation_id}/audio`
          : null,
        has_audio: hasAudio,
        metadata: d,
        started_at: started,
        ended_at: ended,
      };

      const { data: upserted, error: upErr } = await admin
        .from("voice_agent_conversations")
        .upsert(row, { onConflict: "organization_id,conversation_id" })
        .select("id")
        .single();
      if (upErr) { errors.push({ conversation_id, err: upErr.message }); continue; }
      upsertedConv += 1;

      const transcriptArr: any[] = d.transcript || [];
      if (transcriptArr.length && upserted?.id) {
        await admin.from("voice_agent_transcripts").delete().eq("conversation_id", upserted.id);
        const txRows = transcriptArr.map((t: any, i: number) => ({
          conversation_id: upserted.id,
          organization_id,
          speaker: t.role || t.speaker || "unknown",
          message: t.message || t.text || "",
          sequence: i,
          timestamp_seconds: t.time_in_call_secs ?? t.timestamp ?? null,
          metadata: t,
        }));
        const { error: txErr } = await admin.from("voice_agent_transcripts").insert(txRows);
        if (txErr) errors.push({ conversation_id, transcript_err: txErr.message });
        else upsertedTx += txRows.length;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      agents_seen: agentsList.length,
      conversations_seen: conversations.length,
      conversations_upserted: upsertedConv,
      transcripts_upserted: upsertedTx,
      errors,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
