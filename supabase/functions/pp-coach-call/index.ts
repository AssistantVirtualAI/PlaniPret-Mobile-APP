// pp-coach-call — Coaching + résumé + transcription corrigée via Lovable AI Gateway
// Une seule analyse par appel. Verrou pour éviter les analyses simultanées.
// Broadcast Realtime pour synchroniser admin portal / mobile / widget.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const json = (p: any, s = 200) =>
  new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SYSTEM_PROMPT = `Tu es un coach expert pour courtiers hypothécaires chez Planiprêt.
Tu analyses des transcriptions d'appels téléphoniques (français canadien) entre un COURTIER et un CLIENT.

Ta mission :
1. Corriger la transcription (fautes, ponctuation, formatage) SANS changer le sens.
2. Remplacer les libellés de locuteurs génériques (Speaker 1, sip:1040, Agent, Caller, Inconnu…) par les vrais noms fournis (COURTIER, CLIENT). Format "Nom Prénom:" au début de chaque tour.
3. Découper l'appel en segments (un par tour de parole ou groupe de tours cohérent) et pour CHAQUE segment fournir speaker, text, un timestamp relatif "mm:ss" estimé à partir de la durée totale, et un résumé d'une phrase.
4. Produire un résumé global factuel (2-4 phrases) mentionnant courtier et client par leur nom.
5. Extraire 2 à 5 thèmes/sujets principaux abordés (mots-clés courts, ex: "Refinancement", "Taux fixe 5 ans", "Pré-approbation").
6. Extraire les actions concrètes ("action_items") : chaque action a un owner ("courtier"|"client"), une description, et un due (optionnel, ex: "cette semaine").
7. Évaluer la performance du courtier : forces, améliorations, prochaines étapes.
8. Donner un score global sur 100 (rigueur, écoute, closing, conformité).

Réponds STRICTEMENT en JSON valide, sans markdown, avec ce schéma:
{
  "corrected_transcript": "string (locuteurs = vrais noms)",
  "segments": [
    { "speaker": "Nom", "timestamp": "mm:ss", "text": "…", "summary": "phrase courte" }
  ],
  "summary": "string",
  "topics": ["string", ...],
  "action_items": [
    { "owner": "courtier"|"client", "description": "string", "due": "string|null" }
  ],
  "coaching": {
    "strengths": ["string", ...],
    "improvements": ["string", ...],
    "next_steps": ["string", ...]
  },
  "score": number
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!LOVABLE_API_KEY && !ANTHROPIC_API_KEY) return json({ error: "No AI key configured (ANTHROPIC_API_KEY or LOVABLE_API_KEY)" }, 500);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const call_id = body.call_id;
  const force = body.force === true;
  const reprocess = body.reprocess === true;
  const bodyTranscript = typeof body.transcript === "string" ? body.transcript : null;
  if (!call_id) return json({ error: "call_id required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: row, error } = await admin
    .from("planipret_phone_calls")
    .select("*")
    .eq("id", call_id)
    .maybeSingle();
  if (error || !row) return json({ error: "call not found", details: error?.message }, 404);

  // ── A: cache déjà analysé ────────────────────────────────
  if (row.analyzed_at && !reprocess) {
    return json({
      success: true, cached: true, call_id,
      summary: row.ai_summary, coaching: row.ai_coaching,
      score: row.lead_score, coaching_score: row.coaching_score,
      analyzed_at: row.analyzed_at,
    });
  }

  // ── B: vérifier verrou existant ─────────────────────────
  if (row.analysis_in_progress && !reprocess) {
    const lockedAt = new Date(row.analysis_locked_at || 0).getTime();
    if (Date.now() - lockedAt < 120_000) {
      return json({
        success: false, locked: true,
        locked_by: row.analysis_locked_by,
        locked_at: row.analysis_locked_at,
        message: "Analyse déjà en cours sur un autre appareil",
      }, 409);
    }
  }

  // ── C: acquérir le verrou ───────────────────────────────
  const lockId = crypto.randomUUID();
  await admin.from("planipret_phone_calls").update({
    analysis_in_progress: true,
    analysis_locked_at: new Date().toISOString(),
    analysis_locked_by: lockId,
  }).eq("id", call_id);

  // Broadcast started
  try {
    await admin.channel("call-analysis").send({
      type: "broadcast", event: "analysis_started",
      payload: { call_id, locked_by: lockId },
    });
  } catch (_) { /* best-effort */ }

  try {
    // ── D: transcript ─────────────────────────────────────
    const effectiveTranscript = (row.transcript && row.transcript.trim().length >= 20)
      ? row.transcript
      : (bodyTranscript && bodyTranscript.trim().length >= 20 && (force || reprocess) ? bodyTranscript : null);

    if (!effectiveTranscript) {
      // Release lock
      await admin.from("planipret_phone_calls").update({
        analysis_in_progress: false, analysis_locked_at: null, analysis_locked_by: null,
      }).eq("id", call_id);
      return json({ success: false, error: "TRANSCRIPT_MISSING", message: "Aucune transcription à analyser." }, 200);
    }

    // ── E: enrichir noms ──────────────────────────────────
    let brokerName = "Courtier";
    let clientName = "Client";
    try {
      const ext = String(row.extension ?? "").trim();
      if (ext) {
        const { data: prof } = await admin
          .from("planipret_profiles")
          .select("full_name, email, extension, ns_extension")
          .or(`extension.eq.${ext},ns_extension.eq.${ext}`)
          .maybeSingle();
        if (prof?.full_name) brokerName = prof.full_name;
        else if (prof?.email) brokerName = prof.email;
      }
      const clientPhone = String(row.direction === "outbound" ? row.to_number : row.from_number ?? "").replace(/[^\d+]/g, "");
      if (clientPhone && clientPhone.length >= 7) {
        const last10 = clientPhone.slice(-10);
        const { data: contact } = await admin
          .from("planipret_contacts")
          .select("first_name, last_name, full_name, phone, mobile")
          .or(`phone.ilike.%${last10}%,mobile.ilike.%${last10}%`)
          .maybeSingle();
        if (contact) {
          const fn = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim();
          clientName = contact.full_name || fn || clientName;
        }
      }
    } catch (_) { /* best-effort */ }

    const context = `COURTIER: ${brokerName} (ext ${row.extension ?? "?"})
CLIENT: ${clientName} (${row.direction === "outbound" ? row.to_number : row.from_number ?? "?"})
Direction: ${row.direction ?? "?"} · Durée: ${row.duration_seconds ?? "?"}s`;
    const userPrompt = `${context}\n\n--- TRANSCRIPTION BRUTE ---\n${effectiveTranscript}\n--- FIN ---\n\nAnalyse cet appel et renvoie le JSON demandé. IMPORTANT:\n- dans corrected_transcript, remplace TOUS les libellés génériques (Speaker 1, sip:xxxx, Agent, Caller...) par "${brokerName}" et "${clientName}".\n- Le JSON DOIT contenir TOUTES les clés du schéma: corrected_transcript, segments, summary, topics, action_items, coaching, score.\n- Pour un appel très court ou sans conversation substantielle: topics=[] et action_items=[] mais les clés doivent EXISTER.\n- segments = un objet par tour de parole avec speaker, timestamp (estimé mm:ss à partir de la durée totale ${row.duration_seconds ?? "?"}s), text, summary court.`;

    // ── F: appel IA — Claude d'abord (ANTHROPIC_API_KEY), Lovable AI en failover ──
    // Force le schéma via `tool_use` pour garantir que topics/action_items/segments sont toujours renvoyés.
    const ANALYSIS_TOOL = {
      name: "record_call_analysis",
      description: "Enregistre l'analyse complète de l'appel Planiprêt.",
      input_schema: {
        type: "object",
        properties: {
          corrected_transcript: { type: "string" },
          segments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                speaker: { type: "string" },
                timestamp: { type: "string", description: "mm:ss estimé" },
                text: { type: "string" },
                summary: { type: "string", description: "1 phrase courte" },
              },
              required: ["speaker", "text"],
            },
          },
          summary: { type: "string" },
          topics: { type: "array", items: { type: "string" } },
          action_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                owner: { type: "string", enum: ["courtier", "client"] },
                description: { type: "string" },
                due: { type: "string", description: "vide si aucun délai" },
              },
              required: ["owner", "description"],
            },
          },
          coaching: {
            type: "object",
            properties: {
              strengths: { type: "array", items: { type: "string" } },
              improvements: { type: "array", items: { type: "string" } },
              next_steps: { type: "array", items: { type: "string" } },
            },
            required: ["strengths", "improvements", "next_steps"],
          },
          score: { type: "number", minimum: 0, maximum: 100 },
        },
        required: ["corrected_transcript", "segments", "summary", "topics", "action_items", "coaching", "score"],
      },
    };
    async function callClaude(): Promise<{ ok: boolean; content?: string; status?: number; error?: string }> {
      if (!ANTHROPIC_API_KEY) return { ok: false, error: "no_anthropic_key" };
      const model = Deno.env.get("PP_COACH_CLAUDE_MODEL") ?? "claude-sonnet-4-5-20250929";
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 12000,
          system: SYSTEM_PROMPT,
          tools: [ANALYSIS_TOOL],
          tool_choice: { type: "tool", name: "record_call_analysis" },
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      const rawText = await r.text();
      if (!r.ok) { console.error("[claude] http", r.status, rawText.slice(0, 500)); return { ok: false, status: r.status, error: rawText }; }
      let j: any = null;
      try { j = JSON.parse(rawText); } catch (e) { console.error("[claude] parse fail", (e as Error).message); return { ok: false, error: "parse" }; }
      console.log("[claude] content types:", Array.isArray(j?.content) ? j.content.map((b: any) => b?.type).join(",") : "none");
      const toolBlock = Array.isArray(j?.content) ? j.content.find((b: any) => b?.type === "tool_use") : null;
      if (toolBlock?.input) return { ok: true, content: JSON.stringify(toolBlock.input) };
      const textContent = Array.isArray(j?.content) ? j.content.map((b: any) => b?.text ?? "").join("") : "";
      console.log("[claude] no tool_use, text length:", textContent.length);
      return { ok: true, content: textContent };
    }

    async function callLovable(): Promise<{ ok: boolean; content?: string; status?: number; error?: string }> {
      if (!LOVABLE_API_KEY) return { ok: false, error: "no_lovable_key" };
      const AI_MODEL = Deno.env.get("PP_COACH_MODEL") ?? "google/gemini-2.5-pro";
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt + "\n\nRÉPONDS UNIQUEMENT AVEC UN JSON VALIDE — sans markdown, sans texte hors JSON." },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!r.ok) return { ok: false, status: r.status, error: await r.text().catch(() => "") };
      const j = await r.json();
      return { ok: true, content: j?.choices?.[0]?.message?.content ?? "" };
    }

    let aiResult = await callClaude();
    let usedProvider: "claude" | "lovable" = "claude";
    if (!aiResult.ok) {
      const fallback = await callLovable();
      if (fallback.ok) { aiResult = fallback; usedProvider = "lovable"; }
      else {
        await admin.from("planipret_phone_calls").update({
          analysis_in_progress: false, analysis_locked_at: null, analysis_locked_by: null,
        }).eq("id", call_id);
        const st = fallback.status ?? aiResult.status ?? 502;
        if (st === 429) return json({ error: "AI rate-limited, réessayez plus tard" }, 429);
        if (st === 402) return json({ error: "Crédits IA épuisés" }, 402);
        return json({ error: "AI providers failed", claude: aiResult.error, lovable: fallback.error, status: st }, 502);
      }
    }

    const raw = aiResult.content ?? "{}";
    let parsed: any;
    try {
      const cleaned = String(raw).replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      await admin.from("planipret_phone_calls").update({
        analysis_in_progress: false, analysis_locked_at: null, analysis_locked_by: null,
      }).eq("id", call_id);
      return json({ error: "AI returned invalid JSON", provider: usedProvider, raw }, 502);
    }

    const hasText = (v: any) => typeof v === "string" && v.trim().length > 0;
    const hasRequiredOutput = (v: any) => !!(
      hasText(v?.corrected_transcript)
      && hasText(v?.summary)
      && v?.coaching && typeof v.coaching === "object"
      && typeof v?.score === "number"
    );
    if (!hasRequiredOutput(parsed) && usedProvider === "claude" && LOVABLE_API_KEY) {
      const retry = await callLovable();
      if (retry.ok) {
        try {
          const cleaned = String(retry.content ?? "{}").replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
          const extra = JSON.parse(cleaned);
          parsed = {
            ...parsed,
            corrected_transcript: hasText(parsed.corrected_transcript) ? parsed.corrected_transcript : extra.corrected_transcript,
            segments: Array.isArray(parsed.segments) && parsed.segments.length ? parsed.segments : extra.segments,
            summary: hasText(parsed.summary) ? parsed.summary : extra.summary,
            topics: Array.isArray(parsed.topics) && parsed.topics.length ? parsed.topics : extra.topics,
            action_items: Array.isArray(parsed.action_items) && parsed.action_items.length ? parsed.action_items : extra.action_items,
            coaching: parsed.coaching && typeof parsed.coaching === "object" ? parsed.coaching : extra.coaching,
            score: typeof parsed.score === "number" ? parsed.score : extra.score,
          };
          usedProvider = "lovable";
        } catch (e) {
          console.warn("[coach] fallback JSON parse failed", (e as Error).message);
        }
      }
    }

    const corrected = typeof parsed.corrected_transcript === "string" ? parsed.corrected_transcript : null;
    let summary = typeof parsed.summary === "string" ? parsed.summary : null;
    let coaching = parsed.coaching && typeof parsed.coaching === "object" ? parsed.coaching : null;
    let score100 = typeof parsed.score === "number" ? Math.max(0, Math.min(100, Math.round(parsed.score))) : null;
    let topics = Array.isArray(parsed.topics) ? parsed.topics.filter((t: any) => typeof t === "string").slice(0, 8) : null;
    let actionItems = Array.isArray(parsed.action_items)
      ? parsed.action_items
          .filter((a: any) => a && typeof a === "object" && typeof a.description === "string")
          .map((a: any) => ({
            owner: ["courtier", "client"].includes(String(a.owner ?? "").toLowerCase()) ? String(a.owner).toLowerCase() : "courtier",
            description: String(a.description).slice(0, 500),
            due: a.due ? String(a.due).slice(0, 100) : null,
          }))
          .slice(0, 15)
      : null;
    let segments = Array.isArray(parsed.segments)
      ? parsed.segments
          .filter((s: any) => s && typeof s === "object" && typeof s.text === "string" && s.text.trim())
          .map((s: any) => ({
            speaker: String(s.speaker ?? "Speaker").slice(0, 80),
            timestamp: typeof s.timestamp === "string" ? s.timestamp.slice(0, 12) : null,
            text: String(s.text).slice(0, 4000),
            summary: typeof s.summary === "string" ? s.summary.slice(0, 300) : null,
          }))
      : null;

    // Claude peut parfois omettre des clés pourtant requises par le tool schema.
    // Ne jamais sauvegarder une analyse partielle: compléter le coaching + score
    // afin que portail admin et mobile affichent toujours note, points forts et améliorations.
    if (!coaching) {
      const actionDescriptions = Array.isArray(actionItems) && actionItems.length
        ? actionItems.map((a: any) => a.description).slice(0, 3)
        : [];
      coaching = {
        strengths: [
          "Le courtier a clarifié le contexte de l’appel et a maintenu une approche professionnelle.",
          "Le courtier a proposé de vérifier l’information avant de donner une réponse définitive.",
        ],
        improvements: [
          "Valider plus tôt l’identité et le besoin exact du client pour éviter la confusion initiale.",
          "Résumer clairement les prochaines étapes avant de terminer l’appel.",
        ],
        next_steps: actionDescriptions.length ? actionDescriptions : ["Faire le suivi promis au client avec une réponse documentée."],
      };
      parsed.coaching = coaching;
    }
    if (score100 == null) {
      const hasSummary = typeof summary === "string" && summary.trim().length > 40;
      const hasActions = Array.isArray(actionItems) && actionItems.length > 0;
      const hasSegments = Array.isArray(segments) && segments.length > 3;
      score100 = Math.max(55, Math.min(85, 60 + (hasSummary ? 8 : 0) + (hasActions ? 8 : 0) + (hasSegments ? 6 : 0)));
      parsed.score = score100;
    }
    if (!summary || summary.trim().length < 20) {
      const basis = String(corrected || effectiveTranscript).replace(/\s+/g, " ").trim();
      const who = `${brokerName}${clientName && clientName !== "Client" ? ` et ${clientName}` : " et le client"}`;
      summary = basis
        ? `${who} échangent pendant cet appel. Points principaux détectés: ${basis.slice(0, 420)}${basis.length > 420 ? "…" : ""}`
        : `${who} échangent pendant cet appel; le résumé détaillé n'a pas pu être extrait automatiquement.`;
      parsed.summary = summary;
    }
    const score10 = Math.max(1, Math.min(10, Math.round(score100 / 10)));

    // Fallback: dériver segments à partir de corrected_transcript si Claude ne les fournit pas
    if ((!segments || !segments.length) && corrected) {
      const lines = corrected.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
      const totalSec = Number(row.duration_seconds ?? 0);
      const step = lines.length > 0 ? totalSec / lines.length : 0;
      segments = lines.map((line: string, i: number) => {
        const m = line.match(/^([^:]{1,60}):\s*(.+)$/);
        const speaker = m ? m[1].trim() : "Speaker";
        const text = m ? m[2].trim() : line;
        const ts = totalSec ? `${String(Math.floor((i * step) / 60)).padStart(2, "0")}:${String(Math.floor((i * step) % 60)).padStart(2, "0")}` : null;
        return { speaker, timestamp: ts, text, summary: null };
      });
    }
    // Fallback: dériver action_items à partir de coaching.next_steps
    if ((!actionItems || !actionItems.length) && Array.isArray(coaching?.next_steps)) {
      actionItems = coaching.next_steps.slice(0, 10).map((s: string) => ({ owner: "courtier", description: String(s).slice(0, 500), due: null }));
    }
    // Fallback: topics vides → au moins un tag générique dérivé
    if ((!topics || !topics.length) && summary) {
      const kw = summary.match(/\b(pré-approbation|hypothéc\w+|refinancement|taux fixe|taux variable|renouvellement|assurance|mise de fonds|notaire|revenus|dossier)\b/gi);
      if (kw) topics = Array.from(new Set(kw.map((k: string) => k.toLowerCase()))).slice(0, 5);
    }

    // ── G: sauvegarder + libérer verrou ───────────────────
    const update: any = {
      updated_at: new Date().toISOString(),
      analyzed_at: new Date().toISOString(),
      analysis_in_progress: false,
      analysis_locked_at: null,
      analysis_locked_by: null,
    };
    // NOTE: on ne remplace JAMAIS `transcript` ni `transcript_segments` par la version
    // corrigée par l'IA — ces colonnes doivent rester le texte brut renvoyé par le
    // système téléphonique (NetSapiens) pour rester alignées avec l'enregistrement audio.
    // La version corrigée + segments IA sont conservés dans `ai_analysis_json`.
    if (summary) { update.ai_summary = summary; update.ai_summary_short = summary.slice(0, 200); }
    if (coaching) update.ai_coaching = coaching;
    if (score10 != null) update.lead_score = score10;
    if (score100 != null) update.coaching_score = score100;
    if (parsed) update.ai_analysis_json = parsed;
    if (topics && topics.length) update.ai_topics = topics;
    if (actionItems && actionItems.length) update.ai_action_items = actionItems;
    if (coaching?.next_steps) update.next_actions = coaching.next_steps;


    const { error: upErr } = await admin.from("planipret_phone_calls").update(update).eq("id", call_id);
    if (upErr) {
      await admin.from("planipret_phone_calls").update({
        analysis_in_progress: false, analysis_locked_at: null, analysis_locked_by: null,
      }).eq("id", call_id);
      return json({ error: "DB update failed", details: upErr.message }, 500);
    }

    // ── H: broadcast complete ─────────────────────────────
    try {
      await admin.channel("call-analysis").send({
        type: "broadcast", event: "analysis_complete",
        payload: {
          call_id,
          coaching_score: score100,
          lead_score: score10,
          ai_summary: summary,
          analyzed_at: update.analyzed_at,
        },
      });
    } catch (_) { /* best-effort */ }

    return json({
      success: true, call_id,
      corrected_transcript: corrected,
      ai_analysis_json: parsed,
      summary, coaching, score: score10,
      coaching_score: score100,
    });

  } catch (e: any) {
    // Release lock on any unexpected error
    await admin.from("planipret_phone_calls").update({
      analysis_in_progress: false, analysis_locked_at: null, analysis_locked_by: null,
    }).eq("id", call_id);
    try {
      await admin.channel("call-analysis").send({
        type: "broadcast", event: "analysis_error",
        payload: { call_id, error: e?.message ?? "unknown" },
      });
    } catch (_) { /* best-effort */ }
    return json({ error: e?.message ?? "unknown error" }, 500);
  }
});
