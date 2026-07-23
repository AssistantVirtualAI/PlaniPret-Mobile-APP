// ai-summarize-call: thin wrapper that delegates to process-call-recording.
// Kept for backward compatibility with existing UI callers; returns the same
// `{ insight, cached }` shape that previous callers expect.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json();

    const upstream = await fetch(`${SUPABASE_URL}/functions/v1/process-call-recording`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    let payload: any;
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }

    // Adapt to the legacy shape consumed by existing UIs
    if (upstream.ok && payload?.insight) {
      return new Response(JSON.stringify({
        insight: payload.insight,
        cached: payload.status === "cached",
        coaching_notes: payload.coaching_notes ?? payload.insight?.coaching_notes ?? [],
        coaching_score: payload.coaching_score ?? payload.insight?.coaching_score ?? null,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(text, { status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
