import { aiFetch } from "../_shared/claude-compat.ts";
// pp-moh-improve — corrige/réécrit un texte d'annonce de musique d'attente
// avec Claude (via Lovable AI Gateway). Admin Planiprêt uniquement.
import { corsHeaders, json, requirePlanipretAdmin } from "../_shared/pp-admin.ts";

const MODEL = "anthropic/claude-sonnet-4-5";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requirePlanipretAdmin(req);
  if ("error" in auth) return auth.error;

  const { text = "", language = "fr", tone = "professionnel", max_seconds = 25 } =
    (await req.json().catch(() => ({}))) as {
      text?: string; language?: string; tone?: string; max_seconds?: number;
    };
  if (text.trim().length < 5) return json({ success: false, error: "text_too_short" }, 400);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ success: false, error: "lovable_ai_not_configured" }, 500);

  const sys = language === "en"
    ? `You rewrite on-hold announcement scripts for a mortgage brokerage phone system. Make them clear, warm, ${tone}, and easy to read aloud. Keep it under about ${max_seconds} seconds when spoken (~${Math.round(max_seconds * 2.5)} words). Fix grammar and spelling. Output ONLY the final script — no quotes, no preamble, no notes.`
    : `Tu réécris des scripts d'annonce de musique d'attente pour le système téléphonique d'un cabinet de courtage hypothécaire. Rends-les clairs, chaleureux, ${tone}, et faciles à lire à voix haute. Le script doit durer moins d'environ ${max_seconds} secondes à l'oral (~${Math.round(max_seconds * 2.3)} mots). Corrige l'orthographe et la grammaire (français du Québec). Réponds UNIQUEMENT avec le script final — pas de guillemets, pas de préambule, pas de notes.`;

  try {
    const r = await aiFetch("https://ai.lovable/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: text },
        ],
      }),
    });
    if (r.status === 429) return json({ success: false, error: "rate_limited" }, 200);
    if (r.status === 402) return json({ success: false, error: "credits_exhausted" }, 200);
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return json({ success: false, error: `ai_${r.status}`, detail: detail.slice(0, 400) }, 200);
    }
    const j = await r.json();
    const improved = String(j.choices?.[0]?.message?.content ?? "")
      .trim()
      .replace(/^["«»]\s*|\s*["«»]$/g, "");
    if (!improved) return json({ success: false, error: "empty_response" }, 200);
    return json({ success: true, improved, model: MODEL });
  } catch (e) {
    return json({ success: false, error: String(e) }, 200);
  }
});
