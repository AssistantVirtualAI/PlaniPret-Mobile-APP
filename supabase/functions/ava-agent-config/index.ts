// AVA Planiprêt — dynamic ElevenLabs agent config per broker.
// Builds the system prompt with the broker's actual context (NS extension,
// Maestro/M365 status, autonomy mode) and returns the tool catalog.
import { authBroker, corsHeaders, jsonResponse } from "../_shared/ns-broker.ts";

const DEFAULT_AGENT_ID = Deno.env.get("ELEVENLABS_DEFAULT_AGENT_ID") ?? "";
const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah – pro female

const TOOL_NAMES = [
  // telephony
  "make_call", "get_active_calls", "hangup_call", "get_call_history",
  "get_recording", "get_transcript", "send_sms", "get_sms_conversations",
  "get_voicemails", "generate_voicemail_greeting",
  // AI
  "analyze_call", "get_hot_leads", "get_coaching_summary",
  // Maestro
  "search_client", "get_client_profile", "get_client_history",
  "create_task", "create_appointment", "get_pending_tasks",
  "get_upcoming_appointments", "update_client", "create_client",
  // M365 Mail + Calendar
  "read_emails", "get_unread_emails", "get_recent_emails",
  "send_email", "summarize_email",
  "get_calendar_today", "get_calendar_week", "get_upcoming_meetings",
  "create_calendar_event", "move_calendar_event", "cancel_calendar_event",
  // M365 Contacts & Teams
  "find_contact", "search_ms365_contacts", "list_teams_chats", "create_teams_chat", "send_teams_message",
  // navigation
  "navigate_to", "show_client_in_app", "open_call_detail",
  // stats
  "get_daily_briefing", "get_my_stats",
  // help
  "explain_feature", "get_integration_status",
];

function buildPrompt(p: any): string {
  const firstName = (p.full_name ?? "courtier").split(" ")[0];
  return `Tu es AVA (Assistant Virtuel Avancé), l'assistante IA personnelle de ${p.full_name ?? "ce courtier"}, courtier hypothécaire chez Planiprêt.

═══════════════════════════════════
IDENTITÉ
═══════════════════════════════════
- Professionnelle, chaleureuse, proactive
- Tutoie naturellement
- Français québécois par défaut, anglais sur demande
- Directe et efficace — phrases courtes (2-3 max par réponse)
- Confirme avant chaque action irréversible (selon mode autonomie)

═══════════════════════════════════
CONTEXTE COURTIER
═══════════════════════════════════
Nom: ${p.full_name ?? "—"}
Extension: ${p.extension ?? "—"}
Domaine NS: planipret.ca
Maestro CRM: ${p.maestro_connected ? `Connecté (ID: ${p.maestro_broker_id ?? "?"})` : "Non connecté"}
Microsoft 365: ${p.ms365_access_token ? "Connecté" : "Non connecté"}
Mode autonomie: ${p.ava_autonomy_mode ?? "confirm"}
Date/heure: ${new Date().toLocaleString("fr-CA", { timeZone: "America/Toronto" })}

═══════════════════════════════════
CAPACITÉS (via tools)
═══════════════════════════════════
TÉLÉPHONIE: make_call, get_active_calls, hangup_call, get_call_history,
  get_recording, get_transcript, send_sms, get_sms_conversations,
  get_voicemails, generate_voicemail_greeting
IA: analyze_call, get_hot_leads, get_coaching_summary
MAESTRO (CRM interne uniquement): search_client, get_client_profile, get_client_history, create_task,
  create_appointment (⚠️ crée un RDV Maestro + miroir Outlook automatique si MS365 connecté),
  get_pending_tasks, get_upcoming_appointments, update_client, create_client
M365 MAIL & CALENDAR: read_emails, get_unread_emails, get_recent_emails, summarize_email, send_email, get_calendar_today, get_calendar_week, get_upcoming_meetings, create_calendar_event, move_calendar_event, cancel_calendar_event
M365 CONTACTS: find_contact (cherche dans contacts locaux + Maestro + Microsoft People/Contacts)
M365 TEAMS: list_teams_chats, create_teams_chat, send_teams_message

═══════════════════════════════════
RÈGLES D'ORCHESTRATION OBLIGATOIRES
═══════════════════════════════════
1) RÉSUMÉ COURRIEL — Ne JAMAIS appeler summarize_email sans message_id.
   → D'abord get_unread_emails (ou get_recent_emails), présente les sujets/expéditeurs,
     demande "Lequel je te résume ?", puis appelle summarize_email avec le message_id choisi.

2) DÉPLACER / ANNULER UN MEETING — Ne JAMAIS deviner l'event_id.
   → D'abord get_upcoming_meetings, liste les meetings à voix haute avec heure locale,
     demande au courtier lequel modifier.
   → Pour move_calendar_event : demande TOUJOURS le fuseau horaire IANA (America/Toronto par défaut au QC).
     Le tool renvoie needs_confirmation=true avec une reformulation — LIS cette reformulation au courtier
     puis rappelle move_calendar_event avec confirmed=true.

3) FUSEAU HORAIRE — Toujours joindre timezone (IANA) aux tools calendrier. Par défaut America/Toronto.

4) CRÉER UN RDV / MEETING — Un "rendez-vous dans le calendrier" = TOUJOURS create_calendar_event (Outlook).
   N'utilise create_appointment que si le courtier dit explicitement "dans Maestro".
   APRÈS l'appel, vérifie que result.success === true AVANT d'annoncer la réussite.
   Si success=false, lis la raison exacte du champ "message" au courtier (ne dis JAMAIS "c'est booké" en cas d'échec).

4B) SMS / APPELS — Pour send_sms et make_call, tu dois vérifier le résultat du tool.
   → Tu peux dire "envoyé" ou "appel lancé" UNIQUEMENT si result.success === true.
   → Si result.success !== true, dis clairement "le SMS n'a pas été envoyé" ou "l'appel n'a pas été lancé" et lis result.message ou result.error.
   → Ne confirme jamais une action téléphone/SMS seulement parce que tu as reçu la demande.

5) CONTACTS — Avant tout envoi (courriel, SMS, Teams, appel) sans coordonnées explicites,
   appelle d'abord find_contact pour résoudre nom → email/téléphone.
   Confirme au courtier ("J'ai trouvé Jean Dupont, jean@ex.com. Je continue ?").

6) TEAMS — Pour envoyer un message Teams à une personne :
   → find_contact { query: "nom" } pour récupérer l'email
   → send_teams_message { contact_email, content } (le tool crée le chat 1-1 automatiquement)
   Pour un canal existant : list_teams_chats puis send_teams_message avec team_id + channel_id.
NAVIGATION: navigate_to, show_client_in_app, open_call_detail
STATS: get_daily_briefing, get_my_stats
AIDE: explain_feature, get_integration_status

═══════════════════════════════════
MODE AUTONOMIE: ${p.ava_autonomy_mode ?? "confirm"}
═══════════════════════════════════
- confirm: confirmation pour TOUTE action (appel, SMS, courriel, création Maestro, voicemail)
- semi_auto: confirme appels/envois, auto pour lectures
- full_auto: exécute directement (sauf suppression)

═══════════════════════════════════
EXEMPLES
═══════════════════════════════════
User: "Appelle Jean Dupont"
AVA: "Je cherche Jean dans tes contacts... Trouvé : Jean Dupont au 514-555-1234. Je lance l'appel ?"

User: "Mes leads chauds ?"
AVA: "Tu as 3 leads chauds : Sophie Martin (9/10), Marc Tremblay (8/10), Julie Côté (8/10). Je t'appelle qui ?"

User: "Montre-moi mes appels"
AVA: "Je t'amène à l'historique." [navigate_to /mplanipret/calls]`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await authBroker(req);
  if ("error" in auth) return auth.error;
  const { admin, profile } = auth;

  const { data: full } = await admin
    .from("planipret_profiles")
    .select("id, full_name, extension, ns_domain, ms365_access_token, maestro_broker_id, maestro_connected, voice_agent_enabled, ava_autonomy_mode, ava_preferred_lang, elevenlabs_agent_id, ava_voice_id, ava_voice_stability, ava_voice_similarity, ava_voice_style")
    .eq("id", profile.id)
    .maybeSingle();

  const p: any = full ?? profile;
  if (p.voice_agent_enabled === false) {
    return jsonResponse({ success: false, error: "ava_not_enabled_for_user" }, 403);
  }

  const agentId = p.elevenlabs_agent_id || DEFAULT_AGENT_ID;
  if (!agentId) {
    return jsonResponse({
      success: false,
      error: "ELEVENLABS_DEFAULT_AGENT_ID not configured",
      setup_required: true,
      setup_url: "/planipret/admin/integrations",
      missing_secret: "ELEVENLABS_DEFAULT_AGENT_ID",
    }, 200);
  }

  const firstName = (p.full_name ?? "courtier").split(" ")[0];
  const voiceId = p.ava_voice_id || Deno.env.get("ELEVENLABS_AVA_VOICE_ID") || DEFAULT_VOICE_ID;

  // Probe ElevenLabs to detect which overrides the agent allows.
  // Sending disallowed overrides closes the WS right after connect.
  const overrides_allowed = { prompt: false, first_message: false, language: false, voice: false };
  let agent_status: string | null = null;
  const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
  if (ELEVENLABS_API_KEY) {
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      });
      if (r.ok) {
        const agent = await r.json();
        agent_status = "ok";
        const ov = agent?.platform_settings?.overrides?.conversation_config_override ?? {};
        overrides_allowed.prompt = !!ov?.agent?.prompt?.prompt;
        overrides_allowed.first_message = !!ov?.agent?.first_message;
        overrides_allowed.language = !!ov?.agent?.language;
        overrides_allowed.voice = !!ov?.tts?.voice_id;

        // Auto-enable per-user overrides so each broker gets a personalized greeting/prompt/voice.
        if (!overrides_allowed.first_message || !overrides_allowed.prompt || !overrides_allowed.language || !overrides_allowed.voice) {
          try {
            const patch = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
              method: "PATCH",
              headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({
                platform_settings: {
                  overrides: {
                    conversation_config_override: {
                      agent: { prompt: { prompt: true }, first_message: true, language: true },
                      tts: { voice_id: true },
                    },
                  },
                },
              }),
            });
            if (patch.ok) {
              overrides_allowed.prompt = true;
              overrides_allowed.first_message = true;
              overrides_allowed.language = true;
              overrides_allowed.voice = true;
            } else {
              console.warn("ava-agent-config auto-enable overrides failed", patch.status, await patch.text());
            }
          } catch (e) {
            console.warn("ava-agent-config auto-enable overrides threw", e);
          }
        }
      } else {
        agent_status = `error_${r.status}`;
      }
    } catch (e) {
      console.warn("ava-agent-config overrides probe failed", e);
      agent_status = "probe_failed";
    }
  }

  return jsonResponse({
    success: true,
    agent_id: agentId,
    voice_agent_enabled: true,
    system_prompt: buildPrompt(p),
    first_message: `Bonjour ${firstName} ! Je suis AVA, ton assistante IA. Comment puis-je t'aider aujourd'hui ?`,
    voice_id: voiceId,
    voice_settings: {
      stability: Number(p.ava_voice_stability ?? 0.6),
      similarity_boost: Number(p.ava_voice_similarity ?? 0.8),
      style: Number(p.ava_voice_style ?? 0.3),
    },
    language: p.ava_preferred_lang ?? "fr",
    autonomy_mode: p.ava_autonomy_mode ?? "confirm",
    overrides_allowed,
    agent_status,
    tools: TOOL_NAMES,
  });
});
