import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { claudeText } from "../_shared/anthropic.ts";

/**
 * AI insights for the broker Overview dashboard.
 * Input: pre-aggregated activity metrics (no PII — contacts arrive anonymized).
 */

const SYSTEM = `Tu es un coach de performance pour courtiers hypothécaires.
On te fournit les métriques agrégées d'activité d'un courtier sur une période : appels, appels manqués,
taux de réponse, durée moyenne, textos envoyés/reçus, enregistrements, répartition horaire des appels,
volume par jour, contacts les plus fréquents (anonymisés) et commissions.
On te fournit aussi la période précédente équivalente pour comparaison.

Tu produis une analyse courte, concrète et actionnable.

RÈGLES:
- Réponds UNIQUEMENT avec du JSON valide, sans texte autour, sans bloc de code.
- Structure exacte:
{"summary":"...","insights":[{"category":"performance|availability|communication|clients|revenue","title":"...","finding":"...","action":"...","severity":"positive|neutral|warning","metric":"..."}]}
- 3 à 5 insights maximum, chacun appuyé sur les chiffres fournis (cite des valeurs ou %).
- "summary": 1 à 2 phrases, ton exécutif.
- "title": max 6 mots. "finding": max 220 caractères. "action": recommandation concrète, max 180 caractères.
- "metric": une valeur courte à afficher en badge (ex: "+18 %", "62 % de réponse", "pic 10h-11h").
- Écris dans la langue demandée (fr ou en).
- N'invente aucune donnée. Si l'activité est trop faible, dis-le dans summary et donne moins d'insights.`;

function extractJson(text: string): any | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* ignore */ }
  }
  return null;
}

const CATS = ["performance", "availability", "communication", "clients", "revenue"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const j = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    if (!req.headers.get("Authorization")) return j({ success: false, error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const lang = body?.lang === "en" ? "en" : "fr";
    const metrics = body?.metrics;
    if (!metrics || typeof metrics !== "object") return j({ success: false, error: "metrics manquants" }, 400);

    const userText = [
      `Langue de réponse: ${lang}`,
      `Période analysée: ${body?.days ?? 30} jours`,
      "Métriques (JSON):",
      JSON.stringify(metrics).slice(0, 18000),
    ].join("\n");

    const text = await claudeText(SYSTEM, userText, {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1400,
      temperature: 0.3,
      label: "overview-insights",
    });
    if (!text) return j({ success: false, error: "AI indisponible" }, 502);

    const parsed = extractJson(text);
    if (!parsed) return j({ success: false, error: "Réponse IA illisible" }, 502);

    const insights = Array.isArray(parsed.insights)
      ? parsed.insights.slice(0, 5).map((i: any) => ({
          category: CATS.includes(String(i?.category)) ? String(i.category) : "performance",
          title: String(i?.title ?? "").slice(0, 80),
          finding: String(i?.finding ?? "").slice(0, 400),
          action: String(i?.action ?? "").slice(0, 300),
          severity: ["positive", "neutral", "warning"].includes(String(i?.severity)) ? String(i.severity) : "neutral",
          metric: i?.metric == null ? null : String(i.metric).slice(0, 40),
        }))
      : [];

    return j({ success: true, summary: String(parsed.summary ?? "").slice(0, 600), insights });
  } catch (e: any) {
    console.error("pp-overview-insights error", e);
    return j({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
