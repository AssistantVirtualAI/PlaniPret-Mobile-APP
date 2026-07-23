// AVA Planiprêt — improve a voicemail greeting text via Lovable AI.
import { authBroker, corsHeaders, jsonResponse } from "../_shared/ns-broker.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await authBroker(req);
  if ("error" in auth) return auth.error;

  const { text = "", language = "fr" } = (await req.json().catch(() => ({}))) as {
    text?: string; language?: string;
  };
  if (text.trim().length < 5) return jsonResponse({ success: false, error: "text_too_short" }, 400);

  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return jsonResponse({ success: false, error: "lovable_ai_not_configured" }, 500);

  const sys = language === "en"
    ? "You rewrite voicemail greetings to be more professional, warm and concise. Preserve essential info. Output the rewritten greeting ONLY — no quotes, no preamble."
    : "Tu réécris des messages de boîte vocale pour qu'ils soient plus professionnels, chaleureux et concis. Conserve les informations essentielles. Réponds UNIQUEMENT avec le nouveau message — pas de guillemets, pas de préambule.";

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: text },
      ],
    }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    return jsonResponse({ success: false, error: `ai_${r.status}`, detail }, 200);
  }
  const j = await r.json();
  const improved = (j.choices?.[0]?.message?.content ?? "").trim().replace(/^["«»]|["«»]$/g, "");
  return jsonResponse({ success: true, improved });
});
