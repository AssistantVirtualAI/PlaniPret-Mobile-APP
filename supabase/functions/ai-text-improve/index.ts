// ai-text-improve — Améliore ou corrige un texte (SMS ou courriel) avec Claude
// Input  : { text: string, mode: "sms" | "email", action: "fix" | "improve" | "formal" | "shorter" }
// Output : { success: true, result: string } | { success: false, error: string }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPTS: Record<string, string> = {
  // SMS — corriger fautes
  "sms:fix": `Tu es un assistant de correction orthographique et grammaticale pour un courtier hypothécaire québécois.
Corrige les fautes d'orthographe, de grammaire et de ponctuation du message SMS suivant.
Garde exactement le même sens, le même ton et la même longueur approximative.
Réponds UNIQUEMENT avec le texte corrigé, sans explication ni guillemets.`,

  // SMS — améliorer
  "sms:improve": `Tu es un assistant de rédaction pour un courtier hypothécaire québécois.
Améliore le message SMS suivant pour qu'il soit plus clair, professionnel et engageant, tout en restant concis (SMS = court).
Garde le même sens et le même destinataire implicite.
Réponds UNIQUEMENT avec le texte amélioré, sans explication ni guillemets.`,

  // SMS — plus court
  "sms:shorter": `Tu es un assistant de rédaction pour un courtier hypothécaire québécois.
Raccourcis le message SMS suivant tout en conservant l'essentiel de l'information.
Réponds UNIQUEMENT avec la version raccourcie, sans explication ni guillemets.`,

  // SMS — formel
  "sms:formal": `Tu es un assistant de rédaction pour un courtier hypothécaire québécois.
Reformule le message SMS suivant dans un registre plus formel et professionnel.
Réponds UNIQUEMENT avec le texte reformulé, sans explication ni guillemets.`,

  // Courriel — corriger fautes
  "email:fix": `Tu es un assistant de correction orthographique et grammaticale pour un courtier hypothécaire québécois.
Corrige les fautes d'orthographe, de grammaire et de ponctuation du courriel suivant.
Garde exactement le même sens, le même ton et la même structure.
Réponds UNIQUEMENT avec le texte corrigé, sans explication ni guillemets.`,

  // Courriel — améliorer
  "email:improve": `Tu es un assistant de rédaction professionnelle pour un courtier hypothécaire québécois.
Améliore le courriel suivant pour qu'il soit plus clair, professionnel, structuré et persuasif.
Garde le même sens, le même destinataire et les mêmes informations clés.
Réponds UNIQUEMENT avec le courriel amélioré, sans explication ni guillemets.`,

  // Courriel — plus court
  "email:shorter": `Tu es un assistant de rédaction pour un courtier hypothécaire québécois.
Raccourcis le courriel suivant tout en conservant toutes les informations essentielles.
Réponds UNIQUEMENT avec la version raccourcie, sans explication ni guillemets.`,

  // Courriel — formel
  "email:formal": `Tu es un assistant de rédaction pour un courtier hypothécaire québécois.
Reformule le courriel suivant dans un registre plus formel et professionnel.
Réponds UNIQUEMENT avec le texte reformulé, sans explication ni guillemets.`,
};

async function callClaude(system: string, userText: string): Promise<string | null> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (key) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: userText }],
      }),
    });
    if (r.ok) {
      const j = await r.json();
      return j.content?.[0]?.text ?? null;
    }
    console.error("[ai-text-improve] Anthropic error", await r.text());
  }
  // Fallback Lovable AI gateway
  const lk = Deno.env.get("LOVABLE_API_KEY");
  if (!lk) return null;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": lk },
    body: JSON.stringify({
      model: "google/gemini-flash-1.5",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
    }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { text, mode = "email", action = "improve" } = await req.json() as {
      text: string;
      mode?: "sms" | "email";
      action?: "fix" | "improve" | "formal" | "shorter";
    };

    if (!text?.trim()) return jsonResponse(400, { success: false, error: "text requis" });

    const key = `${mode}:${action}`;
    const system = SYSTEM_PROMPTS[key] ?? SYSTEM_PROMPTS["email:improve"];

    const result = await callClaude(system, text.trim());
    if (!result) return jsonResponse(500, { success: false, error: "IA indisponible" });

    return jsonResponse(200, { success: true, result: result.trim() });
  } catch (e: any) {
    console.error("[ai-text-improve]", e);
    return jsonResponse(500, { success: false, error: e?.message ?? "Erreur interne" });
  }
});
