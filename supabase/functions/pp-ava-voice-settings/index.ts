// pp-ava-voice-settings — read/save the AVA voice-bot voice for a broker and
// drive the ElevenLabs API (voices, shared library, models, ConvAI agent config).
// Used by both the Planiprêt admin portal and the mobile app so a change on
// one surface is instantly reflected on the other (same profile row).
import { authBroker, corsHeaders, jsonResponse, supaAdmin } from "../_shared/ns-broker.ts";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
const EL = "https://api.elevenlabs.io";

// Curated multilingual voices that work well for FR-CA + EN (offline fallback).
const FALLBACK_VOICES = [
  { voice_id: "RCSF5YgDtAhZXpNZfGek", name: "Andréa (FR-CA)", labels: { gender: "female", accent: "canadian" } },
  { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", labels: { gender: "female", accent: "american" } },
  { voice_id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", labels: { gender: "female", accent: "american" } },
  { voice_id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", labels: { gender: "female", accent: "american" } },
  { voice_id: "JBFqnCBsd6RMkjVDRZzb", name: "George", labels: { gender: "male", accent: "british" } },
  { voice_id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", labels: { gender: "male", accent: "british" } },
  { voice_id: "nPczCjzI2devNBz1zQrb", name: "Brian", labels: { gender: "male", accent: "american" } },
  { voice_id: "cjVigY5qzO86Huf0OWal", name: "Eric", labels: { gender: "male", accent: "american" } },
];

const FALLBACK_MODELS = [
  { model_id: "eleven_multilingual_v2", name: "Multilingual v2", languages: ["fr", "en", "es", "de", "..."] },
  { model_id: "eleven_turbo_v2_5", name: "Turbo v2.5 (faible latence)", languages: ["fr", "en", "..."] },
  { model_id: "eleven_flash_v2_5", name: "Flash v2.5 (ultra rapide)", languages: ["fr", "en", "..."] },
  { model_id: "eleven_v3", name: "Eleven v3 (alpha, expressif)", languages: ["fr", "en", "..."] },
];

async function el(path: string, init?: RequestInit) {
  return fetch(`${EL}${path}`, {
    ...init,
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

const mapVoice = (v: any) => ({
  voice_id: v.voice_id,
  name: v.name,
  preview_url: v.preview_url ?? null,
  labels: v.labels ?? {},
  category: v.category ?? null,
  description: v.description ?? null,
});

async function listVoices() {
  if (!ELEVENLABS_API_KEY) return { voices: FALLBACK_VOICES, source: "fallback" };
  try {
    const r = await el("/v1/voices");
    if (!r.ok) return { voices: FALLBACK_VOICES, source: "fallback", error: `elevenlabs_${r.status}` };
    const j = await r.json();
    const voices = (j?.voices ?? []).map(mapVoice);
    return { voices: voices.length ? voices : FALLBACK_VOICES, source: voices.length ? "elevenlabs" : "fallback" };
  } catch (e) {
    return { voices: FALLBACK_VOICES, source: "fallback", error: String((e as Error).message ?? e) };
  }
}

async function listModels() {
  if (!ELEVENLABS_API_KEY) return { models: FALLBACK_MODELS, source: "fallback" };
  try {
    const r = await el("/v1/models");
    if (!r.ok) return { models: FALLBACK_MODELS, source: "fallback", error: `elevenlabs_${r.status}` };
    const j = await r.json();
    const models = (Array.isArray(j) ? j : j?.models ?? [])
      .filter((m: any) => m?.can_do_text_to_speech !== false)
      .map((m: any) => ({
        model_id: m.model_id,
        name: m.name ?? m.model_id,
        languages: (m.languages ?? []).map((l: any) => l.language_id ?? l.name).filter(Boolean),
        can_use_style: !!m.can_use_style,
        can_use_speaker_boost: !!m.can_use_speaker_boost,
      }));
    return { models: models.length ? models : FALLBACK_MODELS, source: models.length ? "elevenlabs" : "fallback" };
  } catch (e) {
    return { models: FALLBACK_MODELS, source: "fallback", error: String((e as Error).message ?? e) };
  }
}

function settingsOf(p: any) {
  return {
    voice_id: p?.ava_voice_id ?? null,
    voice_name: p?.ava_voice_name ?? null,
    stability: Number(p?.ava_voice_stability ?? 0.6),
    similarity_boost: Number(p?.ava_voice_similarity ?? 0.8),
    style: Number(p?.ava_voice_style ?? 0.3),
    speed: Number(p?.ava_voice_speed ?? 1),
    model_id: p?.ava_voice_model ?? "eleven_multilingual_v2",
    speaker_boost: p?.ava_voice_speaker_boost !== false,
    language: p?.ava_preferred_lang ?? p?.language ?? "fr",
    elevenlabs_agent_id: p?.elevenlabs_agent_id ?? null,
    updated_at: p?.updated_at ?? null,
  };
}

const PROFILE_COLS =
  "id, full_name, email, language, ava_voice_id, ava_voice_name, ava_voice_stability, ava_voice_similarity, ava_voice_style, ava_voice_speed, ava_voice_model, ava_voice_speaker_boost, ava_preferred_lang, elevenlabs_agent_id, updated_at";

const clamp = (n: unknown, min: number, max: number, dflt: number) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return dflt;
  return Math.min(max, Math.max(min, v));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await authBroker(req);
  if ("error" in auth) return auth.error;
  const { profile } = auth;
  const admin = supaAdmin();

  let body: any = {};
  try { body = req.method === "POST" ? await req.json() : {}; } catch { body = {}; }
  const action = String(body.action ?? new URL(req.url).searchParams.get("action") ?? "get");

  try {
    const { data: me } = await admin
      .from("planipret_profiles").select("role").eq("id", profile.id).maybeSingle();
    const isAdmin = me?.role === "admin";

    // Admins may read/write another broker's voice settings.
    let targetId = profile.id;
    if (body.broker_profile_id && body.broker_profile_id !== profile.id) {
      if (!isAdmin) return jsonResponse({ success: false, error: "forbidden" }, 403);
      targetId = body.broker_profile_id;
    }

    if (action === "brokers") {
      if (!isAdmin) return jsonResponse({ success: false, error: "forbidden" }, 403);
      const { data, error } = await admin
        .from("planipret_profiles")
        .select("id, full_name, email, ava_voice_name, elevenlabs_agent_id")
        .order("full_name", { ascending: true });
      if (error) return jsonResponse({ success: false, error: error.message }, 500);
      return jsonResponse({ success: true, brokers: data ?? [] });
    }

    if (action === "get") {
      const [{ data: prof }, voices, models] = await Promise.all([
        admin.from("planipret_profiles").select(PROFILE_COLS).eq("id", targetId).maybeSingle(),
        listVoices(),
        listModels(),
      ]);
      return jsonResponse({
        success: true,
        settings: settingsOf(prof),
        voices: voices.voices,
        voices_source: voices.source,
        voices_error: (voices as any).error ?? null,
        models: models.models,
        models_source: models.source,
        elevenlabs_configured: !!ELEVENLABS_API_KEY,
      });
    }

    // Search the public ElevenLabs voice library (thousands of voices).
    if (action === "search_library") {
      if (!ELEVENLABS_API_KEY) return jsonResponse({ success: false, error: "elevenlabs_not_configured" }, 400);
      const params = new URLSearchParams();
      params.set("page_size", String(Math.min(100, Number(body.page_size ?? 40) || 40)));
      if (body.search) params.set("search", String(body.search));
      if (body.language) params.set("language", String(body.language));
      if (body.gender) params.set("gender", String(body.gender));
      if (body.accent) params.set("accent", String(body.accent));
      if (body.category) params.set("category", String(body.category));
      if (body.page) params.set("page", String(body.page));
      const r = await el(`/v1/shared-voices?${params.toString()}`);
      if (!r.ok) {
        const details = await r.text();
        return jsonResponse({ success: false, error: "library_failed", status: r.status, details }, r.status);
      }
      const j = await r.json();
      const voices = (j?.voices ?? []).map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name,
        preview_url: v.preview_url ?? null,
        labels: { gender: v.gender, accent: v.accent, age: v.age, use_case: v.use_case, language: v.language },
        category: v.category ?? "library",
        description: v.description ?? null,
        public_owner_id: v.public_owner_id ?? null,
        shared: true,
      }));
      return jsonResponse({ success: true, voices, has_more: !!j?.has_more });
    }

    // Add a library voice to the workspace so it becomes usable/saveable.
    if (action === "add_library_voice") {
      if (!ELEVENLABS_API_KEY) return jsonResponse({ success: false, error: "elevenlabs_not_configured" }, 400);
      const owner = String(body.public_owner_id ?? "").trim();
      const vid = String(body.voice_id ?? "").trim();
      const name = String(body.name ?? "AVA voice").trim();
      if (!owner || !vid) return jsonResponse({ success: false, error: "owner_and_voice_required" }, 400);
      const r = await el(`/v1/voices/add/${encodeURIComponent(owner)}/${encodeURIComponent(vid)}`, {
        method: "POST",
        body: JSON.stringify({ new_name: name }),
      });
      const txt = await r.text();
      if (!r.ok) return jsonResponse({ success: false, error: "add_failed", status: r.status, details: txt }, r.status);
      let parsed: any = {};
      try { parsed = JSON.parse(txt); } catch { /* */ }
      return jsonResponse({ success: true, voice_id: parsed?.voice_id ?? vid });
    }

    if (action === "save") {
      const patch: Record<string, unknown> = {};
      if (typeof body.voice_id === "string" && body.voice_id.trim()) patch.ava_voice_id = body.voice_id.trim();
      if (typeof body.voice_name === "string") patch.ava_voice_name = body.voice_name;
      if (typeof body.model_id === "string" && body.model_id.trim()) patch.ava_voice_model = body.model_id.trim();
      if (body.speaker_boost !== undefined) patch.ava_voice_speaker_boost = !!body.speaker_boost;
      if (body.stability !== undefined) patch.ava_voice_stability = clamp(body.stability, 0, 1, 0.6);
      if (body.similarity_boost !== undefined) patch.ava_voice_similarity = clamp(body.similarity_boost, 0, 1, 0.8);
      if (body.style !== undefined) patch.ava_voice_style = clamp(body.style, 0, 1, 0.3);
      if (body.speed !== undefined) patch.ava_voice_speed = clamp(body.speed, 0.7, 1.2, 1);
      if (body.language === "fr" || body.language === "en") patch.ava_preferred_lang = body.language;
      if (!Object.keys(patch).length) return jsonResponse({ success: false, error: "nothing_to_save" }, 400);

      const { data, error } = await admin
        .from("planipret_profiles")
        .update(patch)
        .eq("id", targetId)
        .select(PROFILE_COLS)
        .maybeSingle();
      if (error) return jsonResponse({ success: false, error: error.message }, 500);
      return jsonResponse({ success: true, settings: settingsOf(data) });
    }

    if (action === "preview") {
      if (!ELEVENLABS_API_KEY) return jsonResponse({ success: false, error: "elevenlabs_not_configured" }, 400);
      const voiceId = String(body.voice_id ?? "").trim();
      if (!voiceId) return jsonResponse({ success: false, error: "voice_id_required" }, 400);
      const lang = body.language === "en" ? "en" : "fr";
      const modelId = String(body.model_id ?? "eleven_multilingual_v2");
      const text = String(body.text ?? "").trim() || (lang === "en"
        ? "Hi, I'm AVA, your personal AI assistant. How can I help you today?"
        : "Bonjour, je suis AVA, ton assistante IA personnelle. Comment puis-je t'aider aujourd'hui ?");
      const voice_settings: Record<string, unknown> = {
        stability: clamp(body.stability, 0, 1, 0.6),
        similarity_boost: clamp(body.similarity_boost, 0, 1, 0.8),
        use_speaker_boost: body.speaker_boost === undefined ? true : !!body.speaker_boost,
      };
      // v3 does not accept style/speed the same way; keep the payload minimal there.
      if (!modelId.startsWith("eleven_v3")) {
        voice_settings.style = clamp(body.style, 0, 1, 0.3);
        voice_settings.speed = clamp(body.speed, 0.7, 1.2, 1);
      }
      const r = await el(
        `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        { method: "POST", body: JSON.stringify({ text, model_id: modelId, voice_settings }) },
      );
      if (!r.ok) {
        const details = await r.text();
        console.error("pp-ava-voice-settings preview failed", r.status, details);
        return jsonResponse({ success: false, error: "tts_failed", status: r.status, details }, r.status);
      }
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      }
      return jsonResponse({ success: true, audio_base64: btoa(bin), mime: "audio/mpeg" });
    }

    // ---- ConvAI agents list (admin only) ----------------------------------
    if (action === "agents") {
      if (!isAdmin) return jsonResponse({ success: false, error: "forbidden" }, 403);
      if (!ELEVENLABS_API_KEY) return jsonResponse({ success: false, error: "elevenlabs_not_configured" }, 400);
      const r = await el(`/v1/convai/agents?page_size=100`);
      const txt = await r.text();
      if (!r.ok) return jsonResponse({ success: false, error: "agents_list_failed", status: r.status, details: txt }, r.status);
      const j = JSON.parse(txt);
      return jsonResponse({
        success: true,
        agents: (j?.agents ?? []).map((a: any) => ({ agent_id: a.agent_id, name: a.name ?? a.agent_id })),
      });
    }

    // ---- ConvAI agent settings (admin only) -------------------------------
    if (action === "agent_get" || action === "agent_update") {
      if (!isAdmin) return jsonResponse({ success: false, error: "forbidden" }, 403);
      if (!ELEVENLABS_API_KEY) return jsonResponse({ success: false, error: "elevenlabs_not_configured" }, 400);
      let agentId = String(body.agent_id ?? "").trim();
      if (!agentId) {
        const { data: p } = await admin
          .from("planipret_profiles").select("elevenlabs_agent_id").eq("id", targetId).maybeSingle();
        agentId = String(p?.elevenlabs_agent_id ?? "").trim();
      }
      // Fallback: no agent linked to this broker yet → use the workspace agent.
      if (!agentId) {
        try {
          const r = await el(`/v1/convai/agents?page_size=1`);
          if (r.ok) agentId = String((await r.json())?.agents?.[0]?.agent_id ?? "").trim();
        } catch { /* ignore */ }
      }
      if (!agentId) return jsonResponse({ success: false, error: "no_agent_for_broker" }, 400);


      if (action === "agent_get") {
        const r = await el(`/v1/convai/agents/${encodeURIComponent(agentId)}`);
        const txt = await r.text();
        if (!r.ok) return jsonResponse({ success: false, error: "agent_get_failed", status: r.status, details: txt }, r.status);
        const j = JSON.parse(txt);
        const c = j?.conversation_config ?? {};
        return jsonResponse({
          success: true,
          agent_id: agentId,
          name: j?.name ?? null,
          agent: {
            prompt: c?.agent?.prompt?.prompt ?? "",
            llm: c?.agent?.prompt?.llm ?? "gemini-2.0-flash",
            temperature: c?.agent?.prompt?.temperature ?? 0.5,
            first_message: c?.agent?.first_message ?? "",
            language: c?.agent?.language ?? "fr",
            tts_voice_id: c?.tts?.voice_id ?? null,
            tts_model_id: c?.tts?.model_id ?? null,
            stability: c?.tts?.stability ?? null,
            similarity_boost: c?.tts?.similarity_boost ?? null,
            speed: c?.tts?.speed ?? null,
            optimize_streaming_latency: c?.tts?.optimize_streaming_latency ?? null,
          },
          raw: j,
        });
      }

      const a = body.agent ?? {};
      const prompt: Record<string, unknown> = {};
      if (typeof a.prompt === "string") prompt.prompt = a.prompt;
      if (typeof a.llm === "string" && a.llm) prompt.llm = a.llm;
      if (a.temperature !== undefined) prompt.temperature = clamp(a.temperature, 0, 1, 0.5);
      const agentCfg: Record<string, unknown> = {};
      if (Object.keys(prompt).length) agentCfg.prompt = prompt;
      if (typeof a.first_message === "string") agentCfg.first_message = a.first_message;
      if (typeof a.language === "string" && a.language) agentCfg.language = a.language;
      const tts: Record<string, unknown> = {};
      if (typeof a.tts_voice_id === "string" && a.tts_voice_id) tts.voice_id = a.tts_voice_id;
      if (typeof a.tts_model_id === "string" && a.tts_model_id) tts.model_id = a.tts_model_id;
      if (a.stability !== undefined) tts.stability = clamp(a.stability, 0, 1, 0.5);
      if (a.similarity_boost !== undefined) tts.similarity_boost = clamp(a.similarity_boost, 0, 1, 0.8);
      if (a.speed !== undefined) tts.speed = clamp(a.speed, 0.7, 1.2, 1);

      const conversation_config: Record<string, unknown> = {};
      if (Object.keys(agentCfg).length) conversation_config.agent = agentCfg;
      if (Object.keys(tts).length) conversation_config.tts = tts;
      const payload: Record<string, unknown> = { conversation_config };
      if (typeof body.name === "string" && body.name.trim()) payload.name = body.name.trim();

      const r = await el(`/v1/convai/agents/${encodeURIComponent(agentId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const txt = await r.text();
      if (!r.ok) return jsonResponse({ success: false, error: "agent_update_failed", status: r.status, details: txt }, r.status);
      return jsonResponse({ success: true, agent_id: agentId });
    }

    return jsonResponse({ success: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("pp-ava-voice-settings", e);
    return jsonResponse({ success: false, error: String((e as Error).message ?? e) }, 500);
  }
});
