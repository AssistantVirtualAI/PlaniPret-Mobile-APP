// Temporary diagnostic: exercises every ElevenLabs + DB dependency used by
// pp-ava-voice-settings. Guarded by a shared header secret.
import { corsHeaders, jsonResponse, supaAdmin } from "../_shared/ns-broker.ts";

const KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
const EL = "https://api.elevenlabs.io";
const GUARD = Deno.env.get("AVA_VOICE_SELFTEST_KEY") ?? "";

async function el(path: string) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${EL}${path}`, { headers: { "xi-api-key": KEY } });
    const txt = await r.text();
    return { path, status: r.status, ok: r.ok, ms: Date.now() - t0, sample: txt.slice(0, 200), size: txt.length };
  } catch (e) {
    return { path, status: 0, ok: false, ms: Date.now() - t0, sample: String((e as Error).message ?? e), size: 0 };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!GUARD || req.headers.get("x-selftest-key") !== GUARD) {
    return jsonResponse({ success: false, error: "forbidden" }, 403);
  }
  const admin = supaAdmin();
  const results: any[] = [];

  // 1. DB profile columns used by the voice settings endpoint
  const t0 = Date.now();
  const { data: prof, error: profErr } = await admin
    .from("planipret_profiles")
    .select("id, full_name, ava_voice_id, ava_voice_name, ava_voice_stability, ava_voice_similarity, ava_voice_style, ava_voice_speed, ava_voice_model, ava_voice_speaker_boost, ava_preferred_lang, elevenlabs_agent_id")
    .limit(5);
  results.push({
    name: "db:planipret_profiles voice columns",
    ok: !profErr,
    ms: Date.now() - t0,
    detail: profErr?.message ?? `${prof?.length ?? 0} rows`,
  });

  const agentId = (prof ?? []).map((p: any) => p.elevenlabs_agent_id).find(Boolean);
  const brokerCount = (await admin.from("planipret_profiles").select("id", { count: "exact", head: true })).count ?? 0;
  results.push({ name: "db:brokers count", ok: true, ms: 0, detail: `${brokerCount} profiles` });

  results.push({ name: "env:ELEVENLABS_API_KEY", ok: !!KEY, ms: 0, detail: KEY ? "present" : "missing" });

  // 2. ElevenLabs endpoints
  const checks = [
    "/v1/voices",
    "/v1/models",
    "/v1/shared-voices?page_size=5&language=fr",
    "/v1/user/subscription",
    "/v1/convai/agents?page_size=5",
  ];
  for (const p of checks) {
    const r = await el(p);
    results.push({ name: `elevenlabs:GET ${p}`, ok: r.ok, ms: r.ms, detail: `HTTP ${r.status} — ${r.size} bytes` });
  }

  let effectiveAgent = agentId;
  if (!effectiveAgent) {
    const rr = await fetch(`${EL}/v1/convai/agents?page_size=1`, { headers: { "xi-api-key": KEY } });
    if (rr.ok) effectiveAgent = (await rr.json())?.agents?.[0]?.agent_id ?? "";
  }
  const agentIdFinal = effectiveAgent;
  if (agentIdFinal) {
    const r = await el(`/v1/convai/agents/${agentIdFinal}`);
    results.push({ name: `elevenlabs:GET /v1/convai/agents/{id}`, ok: r.ok, ms: r.ms, detail: `HTTP ${r.status} (agent ${agentIdFinal})` });
  } else {
    results.push({ name: "elevenlabs:GET /v1/convai/agents/{id}", ok: false, ms: 0, detail: "no ConvAI agent available" });
  }

  // 3. TTS preview (small payload)
  const voiceId = (prof ?? []).map((p: any) => p.ava_voice_id).find(Boolean) ?? "EXAVITQu4vr4xnSDxMaL";
  const t1 = Date.now();
  try {
    const r = await fetch(`${EL}/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`, {
      method: "POST",
      headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Bonjour, test AVA.", model_id: "eleven_multilingual_v2" }),
    });
    const buf = await r.arrayBuffer();
    results.push({ name: "elevenlabs:POST /v1/text-to-speech (preview)", ok: r.ok, ms: Date.now() - t1, detail: `HTTP ${r.status} — ${buf.byteLength} bytes audio` });
  } catch (e) {
    results.push({ name: "elevenlabs:POST /v1/text-to-speech (preview)", ok: false, ms: Date.now() - t1, detail: String((e as Error).message ?? e) });
  }

  return jsonResponse({ success: true, generated_at: new Date().toISOString(), results });
});
