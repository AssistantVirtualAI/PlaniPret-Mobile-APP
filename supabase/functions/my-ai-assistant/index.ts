// @ts-nocheck
// Personal end-user AI assistant. Tools: stats, recent calls, voicemails,
// recordings, AI insights, voicemail greeting generation (ElevenLabs TTS),
// transcription and call summaries.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ELEVEN_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah

const tools = [
  {
    type: "function",
    function: {
      name: "get_my_stats",
      description: "Get the current user's personal stats: calls today/week, voicemails unread, recordings count, and registration status.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recent_calls",
      description: "List recent calls for the current user with direction, number, duration and status.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", minimum: 1, maximum: 50 } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_voicemails",
      description: "List recent voicemails for the current user.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", minimum: 1, maximum: 50 }, unread_only: { type: "boolean" } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recordings",
      description: "List recent call recordings the user has access to.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", minimum: 1, maximum: 50 } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "period_report",
      description: "Generate an aggregated report for a period: total calls, inbound/outbound, missed, total talk time.",
      parameters: {
        type: "object",
        properties: { period: { type: "string", enum: ["today", "week", "month"] } },
        required: ["period"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "summarize_call",
      description: "Summarize a specific call by id (uses transcript and AI).",
      parameters: {
        type: "object",
        properties: { call_id: { type: "string" } },
        required: ["call_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transcribe_voicemail",
      description: "Transcribe a specific voicemail by id.",
      parameters: {
        type: "object",
        properties: { voicemail_id: { type: "string" } },
        required: ["voicemail_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_voicemail_greeting",
      description: "Generate a voicemail greeting from a user-provided script using ElevenLabs TTS, save it, and activate it as the user's voicemail greeting.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "The greeting script to convert to speech." },
          voice_id: { type: "string", description: "ElevenLabs voice id (optional)." },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_recent_insights",
      description: "Return AI insights generated from recent calls (sentiment, topics).",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", minimum: 1, maximum: 30 } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_voicemail_detail",
      description: "Get full details for one voicemail (caller, transcript, AI summary, signed audio URL). Use when the user is on the voicemail page or asks about a specific voicemail.",
      parameters: {
        type: "object",
        properties: { voicemail_id: { type: "string" } },
        required: ["voicemail_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_call_detail",
      description: "Get full details for one call (numbers, duration, status, transcript, AI summary, recording reference).",
      parameters: {
        type: "object",
        properties: { call_id: { type: "string" } },
        required: ["call_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recording_detail",
      description: "Get full details for a call recording (signed audio URL, transcript snippet, AI analysis).",
      parameters: {
        type: "object",
        properties: { recording_id: { type: "string" } },
        required: ["recording_id"],
        additionalProperties: false,
      },
    },
  },
];

async function elevenTts(text: string, voiceId: string): Promise<ArrayBuffer> {
  if (!ELEVEN_KEY) throw new Error("ElevenLabs not connected");
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.55, similarity_boost: 0.8, use_speaker_boost: true },
    }),
  });
  if (!r.ok) throw new Error("tts_failed: " + (await r.text()));
  return r.arrayBuffer();
}

async function execTool(
  name: string,
  args: any,
  ctx: { admin: any; userId: string; spu: any; userToken: string },
): Promise<any> {
  const { admin, userId, spu } = ctx;
  if (!spu && name !== "get_my_stats") return { error: "no_extension_linked" };

  if (name === "get_my_stats") {
    const { data } = await admin.rpc("get_my_extension_summary").select?.() ?? { data: null };
    // RPC doesn't support .select(); call directly:
    const summary = await admin.rpc("get_my_extension_summary");
    let recordings = 0;
    if (spu) {
      const r = await admin
        .from("pbx_call_recordings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", spu.organization_id);
      recordings = r.count ?? 0;
    }
    return { summary: summary.data ?? {}, recordings };
  }

  if (name === "list_recent_calls") {
    const limit = Math.min(Math.max(args?.limit ?? 10, 1), 50);
    const { data } = await admin
      .from("pbx_call_records")
      .select("id, direction, caller_number, destination_number, start_at, duration_seconds, call_status, hangup_cause, sentiment, ai_summary")
      .eq("organization_id", spu.organization_id)
      .eq("extension", spu.extension)
      .order("start_at", { ascending: false })
      .limit(limit);
    return { calls: data ?? [] };
  }

  if (name === "list_voicemails") {
    const limit = Math.min(Math.max(args?.limit ?? 10, 1), 50);
    let q = admin
      .from("pbx_voicemails")
      .select("id, caller_number, caller_name, received_at, duration_seconds, transcript, ai_summary, read_at")
      .eq("organization_id", spu.organization_id)
      .eq("extension", spu.extension)
      .is("deleted_at", null)
      .order("received_at", { ascending: false })
      .limit(limit);
    if (args?.unread_only) q = q.is("read_at", null);
    const { data } = await q;
    return { voicemails: data ?? [] };
  }

  if (name === "list_recordings") {
    const limit = Math.min(Math.max(args?.limit ?? 10, 1), 50);
    const { data } = await admin
      .from("pbx_call_recordings")
      .select("id, recorded_at, duration_seconds, direction, recording_name, available, transcribed, analyzed, sentiment, call_record_id")
      .eq("organization_id", spu.organization_id)
      .order("recorded_at", { ascending: false })
      .limit(limit);
    return { recordings: data ?? [] };
  }

  if (name === "period_report") {
    const period = args?.period ?? "today";
    const since = new Date();
    if (period === "today") since.setHours(0, 0, 0, 0);
    else if (period === "week") since.setDate(since.getDate() - 7);
    else since.setDate(since.getDate() - 30);
    const { data } = await admin
      .from("pbx_call_records")
      .select("direction, duration_seconds, call_status, missed_call")
      .eq("organization_id", spu.organization_id)
      .eq("extension", spu.extension)
      .gte("start_at", since.toISOString())
      .limit(2000);
    const rows = data ?? [];
    const inbound = rows.filter((r: any) => r.direction === "inbound").length;
    const outbound = rows.filter((r: any) => r.direction === "outbound").length;
    const missed = rows.filter((r: any) => r.missed_call || r.call_status === "missed").length;
    const total_seconds = rows.reduce((acc: number, r: any) => acc + (r.duration_seconds ?? 0), 0);
    return { period, total_calls: rows.length, inbound, outbound, missed, total_seconds };
  }

  if (name === "summarize_call") {
    const callId: string = args?.call_id;
    if (!callId) return { error: "missing_call_id" };
    const { data: call } = await admin
      .from("pbx_call_records")
      .select("id, organization_id, extension, ai_summary, transcript:ai_summary")
      .eq("id", callId)
      .maybeSingle();
    if (!call || call.organization_id !== spu.organization_id || call.extension !== spu.extension)
      return { error: "forbidden" };
    // Delegate to ai-summarize-call
    const r = await fetch(`${SUPABASE_URL}/functions/v1/ai-summarize-call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.userToken}` },
      body: JSON.stringify({ call_id: callId }),
    });
    const j = await r.json().catch(() => ({}));
    return j;
  }

  if (name === "transcribe_voicemail") {
    const vmId: string = args?.voicemail_id;
    if (!vmId) return { error: "missing_voicemail_id" };
    const r = await fetch(`${SUPABASE_URL}/functions/v1/user-voicemail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.userToken}` },
      body: JSON.stringify({ action: "transcribe", payload: { id: vmId } }),
    });
    return await r.json().catch(() => ({ error: "transcribe_failed" }));
  }

  if (name === "set_voicemail_greeting") {
    const text: string = String(args?.text ?? "").trim();
    const voiceId: string = String(args?.voice_id ?? DEFAULT_VOICE);
    if (!text) return { error: "missing_text" };
    if (text.length > 2000) return { error: "text_too_long" };
    const audio = await elevenTts(text, voiceId);
    const path = `${spu.organization_id}/${userId}/greeting-${Date.now()}.mp3`;
    const { error: upErr } = await admin.storage.from("voicemail-greetings").upload(path, new Uint8Array(audio), {
      contentType: "audio/mpeg",
      upsert: true,
    });
    if (upErr) return { error: "upload_failed: " + upErr.message };
    const { data: signed } = await admin.storage.from("voicemail-greetings").createSignedUrl(path, 3600);
    const row = {
      user_id: userId,
      organization_id: spu.organization_id,
      greeting_type: "tts",
      greeting_tts_text: text,
      greeting_voice_id: voiceId,
      greeting_storage_path: path,
      greeting_audio_url: signed?.signedUrl ?? null,
      transcription_enabled: true,
      ai_summary_enabled: true,
      notify_email: true,
      attach_audio_email: false,
      greeting_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await admin.from("pbx_voicemail_settings").upsert(row, { onConflict: "user_id" });
    await admin.from("audit_logs").insert({
      organization_id: spu.organization_id,
      user_id: userId,
      action: "voicemail_greeting_generated_via_ai",
      resource_type: "pbx_voicemail_settings",
      metadata: { voice_id: voiceId, length: text.length, source: "my-ai-assistant" },
    });
    return { ok: true, audio_url: signed?.signedUrl ?? null, storage_path: path };
  }

  if (name === "analyze_recent_insights") {
    const limit = Math.min(Math.max(args?.limit ?? 10, 1), 30);
    const { data } = await admin
      .from("pbx_ai_insights")
      .select("id, created_at, insight_type, summary, sentiment, topics, priority, call_record_id")
      .eq("organization_id", spu.organization_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    return { insights: data ?? [] };
  }

  if (name === "get_voicemail_detail") {
    const id: string = args?.voicemail_id;
    if (!id) return { error: "missing_voicemail_id" };
    const { data: vm } = await admin
      .from("pbx_voicemails")
      .select("id, organization_id, extension, caller_number, caller_name, received_at, duration_seconds, transcript, ai_summary, ai_tags, read_at, audio_storage_path")
      .eq("id", id)
      .maybeSingle();
    if (!vm || vm.organization_id !== spu.organization_id || vm.extension !== spu.extension)
      return { error: "forbidden" };
    let audio_url: string | null = null;
    if (vm.audio_storage_path) {
      const { data: s } = await admin.storage.from("voicemails").createSignedUrl(vm.audio_storage_path, 3600);
      audio_url = s?.signedUrl ?? null;
    }
    return { voicemail: { ...vm, audio_url } };
  }

  if (name === "get_call_detail") {
    const id: string = args?.call_id;
    if (!id) return { error: "missing_call_id" };
    const { data: c } = await admin
      .from("pbx_call_records")
      .select("id, organization_id, extension, direction, caller_number, destination_number, start_at, duration_seconds, call_status, hangup_cause, sentiment, ai_summary")
      .eq("id", id)
      .maybeSingle();
    if (!c || c.organization_id !== spu.organization_id || c.extension !== spu.extension)
      return { error: "forbidden" };
    const { data: tr } = await admin
      .from("pbx_call_transcripts")
      .select("content, speaker_segments")
      .eq("call_record_id", id)
      .maybeSingle();
    const { data: rec } = await admin
      .from("pbx_call_recordings")
      .select("id, duration_seconds, recording_name")
      .eq("call_record_id", id)
      .maybeSingle();
    return { call: c, transcript: tr ?? null, recording: rec ?? null };
  }

  if (name === "get_recording_detail") {
    const id: string = args?.recording_id;
    if (!id) return { error: "missing_recording_id" };
    const { data: r } = await admin
      .from("pbx_call_recordings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!r || r.organization_id !== spu.organization_id) return { error: "forbidden" };
    let audio_url: string | null = null;
    if (r.storage_path) {
      const { data: s } = await admin.storage.from("recordings").createSignedUrl(r.storage_path, 3600).catch(() => ({ data: null } as any));
      audio_url = s?.signedUrl ?? null;
    }
    return { recording: { ...r, audio_url } };
  }

  return { error: "unknown_tool" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_KEY) return json({ error: "ai_not_configured" }, 500);
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "missing_auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "invalid_auth" }, 401);
    const userId = userRes.user.id;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const messages: any[] = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) return json({ error: "missing_messages" }, 400);

    const { data: spu } = await admin
      .from("pbx_softphone_users")
      .select("id, organization_id, extension, display_name, sip_domain")
      .eq("portal_user_id", userId)
      .maybeSingle();

    const pageContext = body.pageContext ?? null;
    const contextLines: string[] = [];
    if (pageContext) {
      contextLines.push(`Current page: ${pageContext.page} (${pageContext.path}).`);
      if (pageContext.voicemail_id)
        contextLines.push(`The user is viewing voicemail id ${pageContext.voicemail_id}. When they ask about "this voicemail" / "this message", call get_voicemail_detail with that id and use its transcript / summary.`);
      if (pageContext.call_id)
        contextLines.push(`The user is viewing call id ${pageContext.call_id}. When they ask about "this call", call get_call_detail with that id and use its transcript.`);
      if (pageContext.recording_id)
        contextLines.push(`The user is viewing recording id ${pageContext.recording_id}. Use get_recording_detail.`);
    }

    const system = {
      role: "system",
      content: [
        "You are AVA — a personal AI assistant inside the user's workspace.",
        "You help end-users understand their telephony activity, manage voicemail, and configure their voicemail greeting.",
        spu
          ? `User extension: ${spu.extension} (${spu.display_name ?? ""}) in organization ${spu.organization_id}.`
          : "User has no SIP extension linked yet — for telephony actions tell them to ask their admin.",
        "Use the provided tools to fetch real data; never invent statistics or call ids.",
        "When the user asks to update / record / program their voicemail greeting, call set_voicemail_greeting with the exact script they want. Confirm the script back to them before generating if it's unclear.",
        "If page context references a voicemail / call / recording id, automatically pull its details with the matching tool before answering.",
        ...contextLines,
        "Be concise and answer in the language the user writes in (French or English).",
        "Format answers in Markdown with short headings, bullets, and bold key numbers.",
      ].join("\n"),
    };

    const convo: any[] = [system, ...messages];
    const ctx = { admin, userId, spu, userToken: token };

    // up to 4 tool-call rounds
    for (let round = 0; round < 5; round++) {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_KEY}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: convo,
          tools,
          tool_choice: "auto",
        }),
      });
      if (r.status === 429) return json({ error: "rate_limited" }, 429);
      if (r.status === 402) return json({ error: "ai_credits_exhausted" }, 402);
      if (!r.ok) return json({ error: "ai_error", details: await r.text() }, 500);
      const j = await r.json();
      const msg = j.choices?.[0]?.message;
      if (!msg) return json({ error: "ai_no_message" }, 500);
      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        return json({ message: msg.content ?? "", tool_traces: convo.filter((m) => m.role === "tool").map((m) => ({ name: m.name, content: m.content })) });
      }
      convo.push(msg);
      for (const call of toolCalls) {
        let parsed: any = {};
        try { parsed = JSON.parse(call.function.arguments || "{}"); } catch {}
        const result = await execTool(call.function.name, parsed, ctx);
        convo.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(result).slice(0, 12000),
        });
      }
    }
    return json({ message: "I couldn't finish the request after several attempts. Please try again with a simpler question." });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
