import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const TONES: Record<string, string> = {
  professional: "Professional, concise, business tone.",
  friendly: "Warm, friendly, approachable.",
  bilingual: "Bilingual French + English greeting (start in French, then English).",
  short: "Very short, under 10 seconds.",
  detailed: "Detailed with hours, callback time, alternative contact.",
  after_hours: "After-hours notice; mention business hours and that the call will be returned.",
  vacation: "Vacation message with return date placeholder.",
};

async function llmGreeting(tone: string, name: string, org: string): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: `You write voicemail greetings. Return ONLY the spoken text (no stage directions, no quotes).` },
        { role: "user", content: `Tone: ${TONES[tone] ?? TONES.professional}\nUser name: ${name}\nCompany: ${org}\nWrite the greeting.` },
      ],
    }),
  });
  if (!r.ok) {
    if (r.status === 429) throw new Error("ai_rate_limited");
    if (r.status === 402) throw new Error("ai_credits_exhausted");
    throw new Error(`ai_failed`);
  }
  const j = await r.json();
  return (j.choices?.[0]?.message?.content ?? "").trim();
}

async function tts(text: string, voiceId?: string): Promise<Uint8Array | null> {
  const key = Deno.env.get("ELEVENLABS_API_KEY");
  if (!key) return null;
  // Fallback chain: param → ELEVENLABS_AVA_VOICE_ID secret → Charlotte (XB0fDUnXU5powFXDhCwa).
  // Charlotte is the documented Planiprêt default; never crash when the secret is unset.
  const vid = voiceId || Deno.env.get("ELEVENLABS_AVA_VOICE_ID") || "XB0fDUnXU5powFXDhCwa";
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!r.ok) return null;
  return new Uint8Array(await r.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "missing_auth" }, 401);

    const URL = Deno.env.get("SUPABASE_URL")!;
    const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const AK = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(URL, AK, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: ures } = await userClient.auth.getUser();
    if (!ures?.user) return json({ error: "invalid_auth" }, 401);
    const userId = ures.user.id;

    const body = await req.json().catch(() => ({}));
    const tone = String(body?.tone ?? "professional");
    const generateAudio = body?.audio !== false;

    const admin = createClient(URL, SR);
    const { data: prof } = await admin.from("profiles").select("full_name,email").eq("id", userId).maybeSingle();
    const { data: spu } = await admin.from("pbx_softphone_users")
      .select("organization_id, extension, display_name").eq("portal_user_id", userId).maybeSingle();
    const { data: org } = spu?.organization_id
      ? await admin.from("organizations").select("name").eq("id", spu.organization_id).maybeSingle()
      : { data: null as any };

    const name = prof?.full_name || spu?.display_name || prof?.email || "your contact";
    const orgName = org?.name || "our team";

    const text = await llmGreeting(tone, name, orgName);

    let audioUrl: string | null = null;
    let ttsUnavailable = false;
    if (generateAudio) {
      const bytes = await tts(text);
      if (bytes && spu?.organization_id) {
        const path = `${spu.organization_id}/${userId}/${crypto.randomUUID()}.mp3`;
        const { error: upErr } = await admin.storage.from("voicemail-greetings")
          .upload(path, bytes, { contentType: "audio/mpeg", upsert: false });
        if (!upErr) {
          const { data: signed } = await admin.storage.from("voicemail-greetings").createSignedUrl(path, 3600);
          audioUrl = signed?.signedUrl ?? null;
        }
      } else {
        ttsUnavailable = true;
      }
    }

    return json({ text, audio_url: audioUrl, tts_unavailable: ttsUnavailable });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "internal", detail: msg }, 500);
  }
});
