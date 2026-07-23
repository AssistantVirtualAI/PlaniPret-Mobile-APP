// AVA — Analyse un courriel Outlook via Claude et propose des actions concrètes.
// Input : { ms_message_id: string }
// Auth : JWT du courtier. Retourne l'analyse et l'insère dans planipret_ava_email_analyses.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MS365_DELEGATED_SCOPES, refreshMicrosoftAccessToken } from "../_shared/ms365.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";

async function getMsConfig(admin: any) {
  const { data } = await admin.from("planipret_integration_secrets").select("config").eq("provider", "microsoft").maybeSingle();
  const c = (data?.config ?? {}) as Record<string, string>;
  return {
    clientId: c.client_id ?? Deno.env.get("MICROSOFT_CLIENT_ID") ?? "",
    clientSecret: c.client_secret ?? Deno.env.get("MICROSOFT_CLIENT_SECRET") ?? "",
    tenant: c.tenant_id ?? Deno.env.get("MICROSOFT_TENANT_ID") ?? Deno.env.get("MS365_TENANT_ID") ?? "common",
  };
}

async function getAppAccessToken(admin: any): Promise<string | null> {
  const cfg = await getMsConfig(admin);
  if (!cfg.clientId || !cfg.clientSecret || !cfg.tenant || cfg.tenant === "common") return null;
  const r = await fetch(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!r.ok) {
    console.error("[ava-email-analyzer] app token failed", await r.text());
    return null;
  }
  const d = await r.json();
  return d.access_token as string;
}

async function refreshToken(admin: any, profile: any) {
  return await refreshMicrosoftAccessToken(admin, profile, MS365_DELEGATED_SCOPES);
}

async function graph(admin: any, profile: any, path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const r = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${profile.ms365_access_token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (r.status === 401 && retry) {
    const t = await refreshToken(admin, profile);
    if (t) { profile.ms365_access_token = t; return graph(admin, profile, path, init, false); }
  }
  return r;
}

async function graphApp(appToken: string, mailbox: string, messageId: string): Promise<Response> {
  return fetch(`${GRAPH}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}?$select=id,subject,from,toRecipients,receivedDateTime,body,bodyPreview,hasAttachments,importance,conversationId`, {
    headers: { Authorization: `Bearer ${appToken}`, "Content-Type": "application/json" },
  });
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "")
             .replace(/<script[\s\S]*?<\/script>/gi, "")
             .replace(/<[^>]+>/g, " ")
             .replace(/\s+/g, " ")
             .trim()
             .slice(0, 8000);
}

const SYSTEM_PROMPT = `Tu es AVA, la secrétaire IA personnelle d'un courtier hypothécaire québécois (Planiprêt).
Analyse le courriel entrant et retourne UNIQUEMENT un JSON valide avec cette structure exacte :
{
  "intent": "contrat_signe" | "nouveau_lead" | "demande_rdv" | "documents_recus" | "question_info" | "autre",
  "urgency": "high" | "medium" | "low",
  "client_name": string,
  "client_email": string,
  "key_info": string[],
  "lead_score": number,
  "notification_summary": string,
  "proposed_actions": [
    {
      "id": "a1" | "a2" | ...,
      "type": "email_reply" | "maestro_task" | "maestro_note" | "calendar_event" | "maestro_client_create" | "maestro_status_update",
      "title": string,
      "description": string,
      "draft_content": string,
      "params": object
    }
  ]
}

Règles:
- Tout en FRANÇAIS professionnel.
- Maximum 4 actions, priorisées par impact.
- Les brouillons (draft_content) doivent être prêts à envoyer/utiliser tels quels.
- lead_score entre 0 et 10 (0 si non applicable).
- notification_summary : phrase courte pour push notification (<=100 chars).
- Ton chaleureux et professionnel.
- Aucun texte hors du JSON.`;

async function analyzeWithClaude(email: any, learnedPreferences?: string | null): Promise<any> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const subject = email.subject ?? "(sans objet)";
  const fromName = email.from?.emailAddress?.name ?? "";
  const fromAddr = email.from?.emailAddress?.address ?? "";
  const bodyRaw = email.body?.content ?? email.bodyPreview ?? "";
  const bodyText = email.body?.contentType === "html" ? stripHtml(bodyRaw) : String(bodyRaw).slice(0, 8000);
  const hasAtt = email.hasAttachments ? "OUI" : "NON";

  const userContent = `Expéditeur: ${fromName} <${fromAddr}>
Objet: ${subject}
Pièces jointes: ${hasAtt}
Reçu: ${email.receivedDateTime ?? ""}

Corps:
${bodyText}`;

  const systemFinal = learnedPreferences
    ? `${SYSTEM_PROMPT}\n\nPRÉFÉRENCES APPRISES DE CE COURTIER (à respecter en priorité) :\n${learnedPreferences}`
    : SYSTEM_PROMPT;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      system: systemFinal,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    console.error("[ava-email-analyzer] Claude error", r.status, txt);
    throw new Error(`Claude ${r.status}: ${txt.slice(0, 200)}`);
  }
  const d = await r.json();
  const text = d.content?.[0]?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude did not return JSON");
  return { parsed: JSON.parse(jsonMatch[0]), raw: d };
}


const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const svcHeader = req.headers.get("x-ava-service") ?? "";
    const isService = svcHeader && svcHeader === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const payload = await req.json();
    const { ms_message_id } = payload;
    if (!ms_message_id) return j({ success: false, error: "ms_message_id required" }, 400);

    let userId: string | undefined;
    if (isService) {
      userId = payload.broker_user_id;
      if (!userId) return j({ success: false, error: "broker_user_id required (service)" }, 400);
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
      userId = claims?.claims?.sub as string | undefined;
      if (!userId) return j({ success: false, error: "Unauthorized" }, 401);
    }

    // Check cached analysis first
    const { data: existing } = await admin
      .from("planipret_ava_email_analyses")
      .select("*")
      .eq("broker_user_id", userId)
      .eq("ms_message_id", ms_message_id)
      .maybeSingle();
    if (existing) return j({ success: true, analysis: existing, cached: true });

    const { data: profile } = await admin
      .from("planipret_profiles")
      .select("id, user_id, email, ms365_email, ms365_access_token, ms365_refresh_token, ava_learned_preferences")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile) return j({ success: false, error: "Courtier introuvable" }, 404);

    let emailResp: Response;
    if (isService && payload.graph_mode === "application") {
      const mailbox = payload.mailbox || profile.ms365_email || profile.email;
      if (!mailbox) return j({ success: false, error: "Mailbox manquante pour le mode application" }, 400);
      const appToken = await getAppAccessToken(admin);
      if (!appToken) return j({ success: false, error: "Token application Microsoft indisponible" }, 400);
      emailResp = await graphApp(appToken, mailbox, ms_message_id);
    } else {
      if (!profile.ms365_access_token) return j({ success: false, error: "Microsoft 365 non connecté" }, 400);
      emailResp = await graph(admin, profile, `/me/messages/${encodeURIComponent(ms_message_id)}?$select=id,subject,from,toRecipients,receivedDateTime,body,bodyPreview,hasAttachments,importance,conversationId`);
    }
    if (!emailResp.ok) {
      const t = await emailResp.text();
      return j({ success: false, error: `Graph ${emailResp.status}: ${t.slice(0, 200)}` }, 500);
    }
    const email = await emailResp.json();

    const { parsed, raw } = await analyzeWithClaude(email, profile.ava_learned_preferences);


    const row = {
      broker_id: profile.id,
      broker_user_id: userId,
      ms_message_id,
      email_subject: email.subject ?? null,
      email_from: email.from?.emailAddress?.address ?? null,
      email_from_name: email.from?.emailAddress?.name ?? null,
      received_at: email.receivedDateTime ?? null,
      intent: parsed.intent ?? "autre",
      urgency: parsed.urgency ?? "medium",
      lead_score: Number(parsed.lead_score ?? 0),
      key_info: parsed.key_info ?? [],
      proposed_actions: parsed.proposed_actions ?? [],
      notification_summary: parsed.notification_summary ?? null,
      raw_ai_response: raw,
    };

    const { data: inserted, error: insErr } = await admin
      .from("planipret_ava_email_analyses")
      .upsert(row, { onConflict: "broker_user_id,ms_message_id" })
      .select()
      .single();
    if (insErr) throw insErr;

    return j({ success: true, analysis: inserted, cached: false });
  } catch (e: any) {
    console.error("[ava-email-analyzer]", e);
    return j({ success: false, error: e?.message ?? "Erreur serveur" }, 500);
  }
});
