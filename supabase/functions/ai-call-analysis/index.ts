import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { call_uuid, transcript } = await req.json();
    if (!call_uuid || !transcript) throw new Error("call_uuid and transcript required");

    const { data: cfg } = await admin.from("lemtel_config").select("value").eq("key", "ANTHROPIC_API_KEY").maybeSingle();
    const anthropicKey = cfg?.value;
    if (!anthropicKey) throw new Error("Anthropic API key not configured");

    await admin.from("lemtel_cdrs_cache").update({ ai_processing: true }).eq("call_uuid", call_uuid);

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1024,
        system: "You are a call analysis expert. Analyze this call transcript and return ONLY valid JSON with these exact fields: { sentiment: 'positive'|'neutral'|'negative', topics: string[], action_items: string[], summary: string (2 sentences max), satisfaction_score: number (1-5), escalation_needed: boolean, key_phrases: string[] }",
        messages: [{ role: "user", content: transcript }],
      }),
    });
    const data = await claudeRes.json();
    const text = data.content?.[0]?.text || "{}";
    const analysis = JSON.parse(text.replace(/```json|```/g, "").trim());

    await admin.from("lemtel_transcriptions").insert({
      call_uuid, transcript_text: transcript,
      sentiment: analysis.sentiment, topics: analysis.topics, action_items: analysis.action_items,
      summary: analysis.summary, satisfaction_score: analysis.satisfaction_score,
      escalation_needed: analysis.escalation_needed, key_phrases: analysis.key_phrases,
    });
    await admin.from("lemtel_cdrs_cache").update({ analyzed: true, transcribed: true, ai_processing: false }).eq("call_uuid", call_uuid);

    return new Response(JSON.stringify({ ok: true, analysis }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
