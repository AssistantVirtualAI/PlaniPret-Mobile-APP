// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ELEVEN_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

async function transcribeAudio(blob: Blob): Promise<string> {
  if (!ELEVEN_KEY) throw new Error("missing_elevenlabs_key");
  const fd = new FormData();
  fd.append("file", blob, "voicemail.mp3");
  fd.append("model_id", "scribe_v2");
  fd.append("diarize", "false");
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": ELEVEN_KEY },
    body: fd,
  });
  if (!r.ok) throw new Error("stt_failed: " + (await r.text()));
  const j = await r.json();
  return j.text ?? "";
}

async function summarizeText(text: string): Promise<{ summary: string; tags: string[] }> {
  if (!LOVABLE_KEY) return { summary: "", tags: [] };
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LOVABLE_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You summarize voicemails in <=3 sentences. Return JSON {summary:string, tags:string[]}. tags: short keywords (max 5)." },
        { role: "user", content: text || "(empty transcript)" },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) return { summary: "", tags: [] };
  const j = await r.json();
  try {
    const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    return { summary: parsed.summary ?? "", tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [] };
  } catch {
    return { summary: "", tags: [] };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "missing_auth" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "invalid_auth" }, 401);
    const userId = userRes.user.id;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const { action, payload } = body;
    if (!action) return json({ error: "missing_action" }, 400);

    const { data: spu } = await admin
      .from("pbx_softphone_users")
      .select("organization_id, extension")
      .eq("portal_user_id", userId)
      .maybeSingle();

    if (action === "list") {
      if (!spu) return json({ voicemails: [] });
      const { data, error } = await admin
        .from("pbx_voicemails")
        .select("id, caller_number, caller_name, received_at, duration_seconds, audio_storage_path, transcript, ai_summary, ai_tags, folder, read_at, deleted_at")
        .eq("organization_id", spu.organization_id)
        .eq("extension", spu.extension)
        .is("deleted_at", null)
        .order("received_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return json({ voicemails: data ?? [] });
    }

    async function assertAccess(vmId: string) {
      const { data } = await admin.from("pbx_voicemails").select("id, organization_id, extension, audio_storage_path, transcript").eq("id", vmId).maybeSingle();
      if (!data) throw new Error("not_found");
      if (!spu || data.organization_id !== spu.organization_id || data.extension !== spu.extension) {
        // allow org admin
        const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _org_id: data.organization_id, _role: "org_admin" });
        if (!isAdmin) throw new Error("forbidden");
      }
      return data;
    }

    if (action === "mark_read") {
      await assertAccess(payload.id);
      await admin.from("pbx_voicemails").update({ read_at: new Date().toISOString() }).eq("id", payload.id);
      return json({ ok: true });
    }

    if (action === "delete") {
      await assertAccess(payload.id);
      await admin.from("pbx_voicemails").update({ deleted_at: new Date().toISOString() }).eq("id", payload.id);
      return json({ ok: true });
    }

    if (action === "get_audio_url") {
      const vm = await assertAccess(payload.id);
      if (!vm.audio_storage_path) return json({ url: null });
      const { data, error } = await admin.storage.from("voicemail-audio").createSignedUrl(vm.audio_storage_path, 3600);
      if (error) throw error;
      return json({ url: data.signedUrl });
    }

    if (action === "transcribe") {
      const vm = await assertAccess(payload.id);
      if (!vm.audio_storage_path) return json({ error: "no_audio" }, 400);
      const { data: file, error } = await admin.storage.from("voicemail-audio").download(vm.audio_storage_path);
      if (error) throw error;
      const transcript = await transcribeAudio(file);
      await admin.from("pbx_voicemails").update({ transcript }).eq("id", payload.id);
      return json({ transcript });
    }

    if (action === "summarize") {
      const vm = await assertAccess(payload.id);
      const text = vm.transcript ?? "";
      const { summary, tags } = await summarizeText(text);
      await admin.from("pbx_voicemails").update({ ai_summary: summary, ai_tags: tags }).eq("id", payload.id);
      return json({ summary, tags });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
