import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { claudeText } from "../_shared/anthropic.ts";

/**
 * AI validation of Maestro commission data.
 *
 * Claude READS the data returned by the Maestro endpoint (provenance lines +
 * audit summary) and verifies that each displayed amount is the raw value of the
 * declared Maestro field — no recalculation. It never modifies an amount.
 */

const SYSTEM = `Tu es un auditeur de données financières. On te fournit des lignes de commissions
extraites d'un endpoint Maestro, avec pour chaque ligne : l'identifiant du dossier, les critères
Maestro utilisés (type de dossier + étape), le nom EXACT du champ Maestro retenu, la valeur BRUTE
de ce champ, et le montant affiché.

Ta mission (lecture seule, tu ne corriges jamais un montant) :
1. Vérifier que le montant affiché est identique à la valeur brute du champ déclaré (aucun recalcul).
2. Signaler les lignes non mappées (aucune règle critère → champ), les champs manquants,
   les doublons de dossier, les valeurs incohérentes (négatives, nulles, aberrantes).
3. Résumer ce que tu observes, sans inventer de donnée.

RÈGLES:
- Réponds UNIQUEMENT avec du JSON valide, sans texte autour, sans bloc de code.
- Structure exacte:
{"status":"ok|warnings|blocked","summary":"...","checked":0,"anomalies":[{"record_id":"...","type":"recalculation|unmapped|missing_field|duplicate|inconsistent","severity":"info|warning|critical","detail":"..."}]}
- "status": "ok" si aucune anomalie, "warnings" si anomalies mineures, "blocked" si des montants
  ne correspondent pas à leur champ source ou si la majorité des lignes sont non mappées.
- Maximum 25 anomalies, les plus importantes d'abord. "detail": max 220 caractères.
- Écris dans la langue demandée (fr ou en).`;

function extractJson(text: string): any | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(cleaned.slice(s, e + 1)); } catch { /* ignore */ } }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const j = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    if (!req.headers.get("Authorization")) return j({ success: false, error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const lang = body?.lang === "en" ? "en" : "fr";
    const provenance = Array.isArray(body?.provenance) ? body.provenance : null;
    const audit = body?.audit ?? null;
    if (!provenance) return j({ success: false, error: "provenance manquante" }, 400);
    if (!provenance.length) {
      return j({ success: true, status: "ok", summary: lang === "en" ? "No Maestro line to validate." : "Aucune ligne Maestro à valider.", checked: 0, anomalies: [] });
    }

    // Trim to keep the prompt bounded; the audit summary covers the whole set.
    const sample = provenance.slice(0, 200).map((p: any) => ({
      id: p?.maestro_record_id ?? null,
      criteria: p?.criteria ?? null,
      revenue_field: p?.revenue_field ?? null,
      revenue_raw: p?.revenue_raw ?? null,
      displayed: p?.commission ?? null,
      status: p?.status ?? null,
      reason: p?.reason ?? null,
    }));

    const userText = [
      `Langue de réponse: ${lang}`,
      `Résumé d'audit (JSON): ${JSON.stringify(audit).slice(0, 4000)}`,
      `Lignes (${provenance.length} au total, ${sample.length} envoyées) :`,
      JSON.stringify(sample).slice(0, 24000),
    ].join("\n");

    const text = await claudeText(SYSTEM, userText, {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      temperature: 0.1,
      label: "commissions-validate",
    });
    if (!text) return j({ success: false, error: "AI indisponible" }, 502);

    const parsed = extractJson(text);
    if (!parsed) return j({ success: false, error: "Réponse IA illisible" }, 502);

    const anomalies = Array.isArray(parsed.anomalies)
      ? parsed.anomalies.slice(0, 25).map((a: any) => ({
          record_id: a?.record_id == null ? null : String(a.record_id).slice(0, 80),
          type: ["recalculation", "unmapped", "missing_field", "duplicate", "inconsistent"].includes(String(a?.type)) ? String(a.type) : "inconsistent",
          severity: ["info", "warning", "critical"].includes(String(a?.severity)) ? String(a.severity) : "warning",
          detail: String(a?.detail ?? "").slice(0, 400),
        }))
      : [];

    return j({
      success: true,
      status: ["ok", "warnings", "blocked"].includes(String(parsed.status)) ? String(parsed.status) : "warnings",
      summary: String(parsed.summary ?? "").slice(0, 800),
      checked: Number(parsed.checked) || provenance.length,
      anomalies,
    });
  } catch (e: any) {
    console.error("pp-commissions-validate error", e);
    return j({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
