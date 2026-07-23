// AVA — Exécute une action approuvée par le courtier.
// Input : { analysis_id: string, action_id: string, modified_content?: string, modified_params?: object }
// Auth  : JWT du courtier. Log dans planipret_ava_action_log.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MS365_DELEGATED_SCOPES, refreshMicrosoftAccessToken } from "../_shared/ms365.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";

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

const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return j({ success: false, error: "Unauthorized" }, 401);

    const { analysis_id, action_id, modified_content, modified_params } = await req.json();
    if (!analysis_id || !action_id) return j({ success: false, error: "analysis_id + action_id required" }, 400);

    const { data: analysis, error: aErr } = await admin
      .from("planipret_ava_email_analyses")
      .select("*")
      .eq("id", analysis_id)
      .eq("broker_user_id", userId)
      .maybeSingle();
    if (aErr || !analysis) return j({ success: false, error: "Analysis not found" }, 404);

    const actions = (analysis.proposed_actions ?? []) as any[];
    const action = actions.find((a) => a.id === action_id);
    if (!action) return j({ success: false, error: "Action not found" }, 404);

    const params = { ...(action.params ?? {}), ...(modified_params ?? {}) };
    const content = modified_content ?? action.draft_content ?? "";
    const modifiedByBroker = Boolean(modified_content || modified_params);

    const { data: profile } = await admin
      .from("planipret_profiles")
      .select("id, user_id, ms365_access_token, ms365_refresh_token, full_name")
      .eq("user_id", userId)
      .maybeSingle();

    let executionMode: "live" | "mock" = "live";
    let success = false;
    let result: any = null;
    let errorMsg: string | null = null;

    try {
      switch (action.type) {
        case "email_reply": {
          if (!profile?.ms365_access_token) throw new Error("Microsoft 365 non connecté");
          const to = params.to ?? [analysis.email_from].filter(Boolean);
          const subject = params.subject ?? (analysis.email_subject ? `Re: ${analysis.email_subject}` : "Re:");
          const r = await graph(admin, profile, `/me/sendMail`, {
            method: "POST",
            body: JSON.stringify({
              message: {
                subject,
                body: { contentType: "HTML", content: content.replace(/\n/g, "<br/>") },
                toRecipients: (Array.isArray(to) ? to : [to]).map((e: string) => ({ emailAddress: { address: e } })),
              },
              saveToSentItems: true,
            }),
          });
          if (!r.ok) throw new Error(`Graph sendMail ${r.status}: ${(await r.text()).slice(0, 200)}`);
          success = true;
          result = { sent_to: to, subject };
          break;
        }
        case "calendar_event": {
          if (!profile?.ms365_access_token) throw new Error("Microsoft 365 non connecté");
          const r = await graph(admin, profile, `/me/events`, {
            method: "POST",
            body: JSON.stringify({
              subject: params.subject ?? action.title ?? "Rendez-vous",
              start: params.start,
              end: params.end,
              body: { contentType: "HTML", content: (content || params.description || "").replace(/\n/g, "<br/>") },
              attendees: (params.attendees ?? []).map((e: string) => ({ emailAddress: { address: e }, type: "required" })),
            }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(`Graph events ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
          success = true;
          result = { event_id: d.id, web_link: d.webLink };
          break;
        }
        case "teams_reply": {
          if (!profile?.ms365_access_token) throw new Error("Microsoft 365 non connecté");
          const chatId = params.chat_id;
          const teamId = params.team_id;
          const channelId = params.channel_id;
          const scope = chatId
            ? `/chats/${chatId}/messages`
            : (teamId && channelId) ? `/teams/${teamId}/channels/${channelId}/messages` : null;
          if (!scope) throw new Error("teams_reply: chat_id ou team_id+channel_id requis");
          const r = await graph(admin, profile, scope, {
            method: "POST",
            body: JSON.stringify({ body: { contentType: params.contentType ?? "text", content } }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(`Graph teams ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
          success = true;
          result = { message_id: d.id, scope };
          break;
        }
        case "maestro_task":
        case "maestro_note":
        case "maestro_client_create":
        case "maestro_status_update": {
          // Maestro CRM pas encore branché — journalisation en mode mock
          executionMode = "mock";
          success = true;
          result = {
            mocked: true,
            note: "Maestro CRM non branché — l'action sera synchronisée quand l'intégration sera activée.",
            content_preview: content.slice(0, 500),
            params,
          };
          break;
        }
        default:
          throw new Error(`Type d'action inconnu: ${action.type}`);
      }
    } catch (e: any) {
      success = false;
      errorMsg = e?.message ?? String(e);
    }

    await admin.from("planipret_ava_action_log").insert({
      broker_id: profile?.id ?? null,
      broker_user_id: userId,
      analysis_id,
      action_type: action.type,
      action_params: params,
      modified_content: content,
      execution_mode: executionMode,
      success,
      result,
      error: errorMsg,
      modified_by_broker: modifiedByBroker,
    });

    return j({ success, execution_mode: executionMode, result, error: errorMsg }, success ? 200 : 500);
  } catch (e: any) {
    console.error("[ava-action-executor]", e);
    return j({ success: false, error: e?.message ?? "Erreur serveur" }, 500);
  }
});
