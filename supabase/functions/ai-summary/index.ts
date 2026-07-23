// ai-summary: short natural-language AVA briefing from dashboard stats.
// POST { range: 'today'|'7d'|'30d'|'custom', stats: {...}, periodLabel?: string }
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "LOVABLE_API_KEY missing" }, 500);
    const body = await req.json().catch(() => ({}));
    const { range = "today", stats = {}, periodLabel } = body || {};

    const prompt = `You are AVA, an analyst for a call center. Summarize this period in 2-3 short sentences (max 60 words). Mention answer rate, peak hour, busiest extension, and one actionable insight. Be concrete and use the numbers. Period: ${periodLabel || range}. Stats: ${JSON.stringify(stats)}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are AVA, a concise call-center analyst. Reply only with the briefing prose. No markdown headers." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
      }),
    });
    if (r.status === 429) return json({ error: "rate_limited", message: "AVA is rate-limited, try again shortly." }, 429);
    if (r.status === 402) return json({ error: "credits", message: "AI credits exhausted." }, 402);
    if (!r.ok) {
      const t = await r.text();
      return json({ error: "ai_failed", message: t.slice(0, 200) }, 502);
    }
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    return json({ ok: true, summary: text, range, generatedAt: new Date().toISOString() });
  } catch (e: any) {
    return json({ error: e?.message || "error" }, 500);
  }
});
