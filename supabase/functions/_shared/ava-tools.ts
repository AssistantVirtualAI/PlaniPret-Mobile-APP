// Shared definition of the 29 AVA tools pushed to the ElevenLabs agent.
// Used by elevenlabs-manage-agent (sync_all_tools) and the admin UI status table.
//
// Two output shapes are exposed:
//  - buildAvaToolsArray(): legacy inline webhook tools (kept for back-compat
//    with older agent payloads that accepted `prompt.tools`).
//  - buildAvaToolConfigs(): registry-shaped `tool_config` payloads compatible
//    with the current ElevenLabs Convai Tools API
//    (POST/PATCH /v1/convai/tools → reference by `tool_ids` on the agent).

type ToolSpec = {
  name: string;
  description: string;
  properties: Record<string, any>;
  required: string[];
};

function specs(): ToolSpec[] {
  const list: ToolSpec[] = [];
  const add = (name: string, description: string, properties: Record<string, any> = {}, required: string[] = []) =>
    list.push({ name, description, properties, required });
  buildSpecs(add);
  return list;
}

export function buildAvaToolsArray(supabaseUrl: string, anonKey: string) {
  const SUPABASE_TOOL_URL = `${supabaseUrl}/functions/v1/ava-tool-executor`;
  const TOOL_HEADERS = [
    { key: "Content-Type", value: "application/json" },
    { key: "Authorization", value: `Bearer ${anonKey}` },
    { key: "X-Ava-Session", value: "{{secret__ava_session_token}}" },
    { key: "X-Ava-Session-Fallback", value: "{{ava_session_token}}" },
  ];

  const mk = (name: string, description: string, properties: Record<string, any> = {}, required: string[] = []) => ({
    type: "webhook",
    name,
    description,
    api: {
      url: SUPABASE_TOOL_URL,
      method: "POST",
      headers: TOOL_HEADERS,
      request_body_schema: {
        type: "object",
        properties: {
          tool_name: { type: "string", value: name, description: "Tool identifier" },
          parameters: { type: "object", properties, ...(required.length ? { required } : {}) },
        },
        required: ["tool_name", "parameters"],
      },
    },
  });

  const arr: any[] = [];
  buildSpecs((name, description, properties = {}, required = []) => arr.push(mk(name, description, properties, required)));
  return arr;
}

/** Registry-shaped tool configs (ElevenLabs Convai Tools API).
 *  Params are flat in `request_body_schema.properties`; tool routing is
 *  done via the `X-Ava-Tool-Name` request header (no `constant_value`). */
export function buildAvaToolConfigs(supabaseUrl: string, anonKey: string) {
  const url = `${supabaseUrl}/functions/v1/ava-tool-executor`;
  const avaSessionHeader = { variable_name: "secret__ava_session_token" };
  const avaSessionFallbackHeader = { variable_name: "ava_session_token" };
  return specs().map((s) => {
    const request_body_schema: Record<string, any> = {
      type: "object",
      properties: s.properties ?? {},
    };
    if (s.required && s.required.length) request_body_schema.required = s.required;
    return {
      tool_config: {
        type: "webhook",
        name: s.name,
        description: s.description,
        response_timeout_secs: 20,
        api_schema: {
          url,
          method: "POST",
          request_headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
            "X-Ava-Tool-Name": s.name,
            "X-Ava-Session": avaSessionHeader,
            "X-Ava-Session-Fallback": avaSessionFallbackHeader,
          },
          request_body_schema,
        },
      },
    };
  });
}


function buildSpecs(mk: (name: string, description: string, properties?: Record<string, any>, required?: string[]) => any) {


  return [
    // Telephony
    mk("make_call", "Lance un appel téléphonique vers un numéro ou contact. Demande toujours confirmation avant d'appeler.", {
      to_number: { type: "string", description: "Numéro E.164 (ex: +15145551234)" },
      contact_name: { type: "string", description: "Nom du contact (optionnel)" },
    }, ["to_number"]),
    mk("get_active_calls", "Récupère la liste des appels en cours actifs."),
    mk("hangup_call", "Raccroche et termine un appel actif.", { call_id: { type: "string", description: "ID de l'appel" } }, ["call_id"]),
    mk("get_call_history", "Récupère l'historique des appels avec scores IA et températures de leads.", {
      limit: { type: "number", description: "Nombre d'appels (défaut: 10)" },
      days: { type: "number", description: "Jours dans le passé (défaut: 7)" },
      direction: { type: "string", description: "inbound, outbound ou missed" },
    }),
    mk("get_recording", "Récupère l'URL d'un enregistrement d'appel.", { call_id: { type: "string", description: "ID de l'appel" } }, ["call_id"]),
    mk("get_transcript", "Récupère la transcription textuelle d'un appel.", { call_id: { type: "string", description: "ID de l'appel" } }, ["call_id"]),
    mk("send_sms", "Envoie un SMS. Demande confirmation avant d'envoyer.", {
      to: { type: "string", description: "Numéro destinataire E.164" },
      message: { type: "string", description: "Contenu du message" },
      contact_name: { type: "string", description: "Nom du contact (optionnel)" },
    }, ["to", "message"]),
    mk("get_voicemails", "Récupère les messages vocaux.", {
      folder: { type: "string", description: "inbox ou saved (défaut: inbox)" },
      limit: { type: "number", description: "Nombre (défaut: 10)" },
    }),

    // AI analysis
    mk("analyze_call", "Analyse une transcription d'appel avec Claude pour coaching et score lead.", { call_id: { type: "string", description: "ID de l'appel" } }, ["call_id"]),
    mk("get_hot_leads", "Récupère les leads chauds (score >= 8) sans suivi depuis 24h.", { limit: { type: "number", description: "Nombre (défaut: 5)" } }),
    mk("get_coaching_summary", "Résumé des performances de coaching.", { period: { type: "string", description: "today, week ou month (défaut: week)" } }),

    // Maestro CRM
    mk("search_client", "Cherche un client dans Maestro CRM.", { query: { type: "string", description: "Nom, téléphone ou email" } }, ["query"]),
    mk("get_client_profile", "Profil complet d'un client Maestro.", { client_id: { type: "string", description: "ID du client" } }, ["client_id"]),
    mk("get_client_history", "Historique des communications client.", {
      client_id: { type: "string", description: "ID du client" },
      limit: { type: "number", description: "Nombre d'entrées (défaut: 20)" },
    }, ["client_id"]),
    mk("create_task", "Crée une tâche de suivi dans Maestro. Demande confirmation.", {
      client_id: { type: "string", description: "ID du client" },
      title: { type: "string", description: "Description de la tâche" },
      due_date: { type: "string", description: "ISO 8601 (optionnel)" },
      priority: { type: "string", description: "low, medium ou high" },
      notes: { type: "string", description: "Notes (optionnel)" },
    }, ["client_id", "title"]),
    mk("create_appointment", "Crée un rendez-vous dans Maestro + M365.", {
      client_id: { type: "string", description: "ID du client" },
      title: { type: "string", description: "Titre" },
      start_datetime: { type: "string", description: "ISO 8601" },
      duration_minutes: { type: "number", description: "Durée (défaut: 60)" },
      type: { type: "string", description: "phone, in-person ou video" },
      notes: { type: "string", description: "Notes (optionnel)" },
    }, ["client_id", "title", "start_datetime"]),
    mk("get_pending_tasks", "Liste des tâches en attente.", {
      limit: { type: "number", description: "Nombre (défaut: 10)" },
      priority: { type: "string", description: "Filtre (optionnel)" },
    }),
    mk("get_upcoming_appointments", "Prochains rendez-vous.", { days: { type: "number", description: "Jours en avant (défaut: 7)" } }),
    mk("create_client", "Crée un prospect dans Maestro. Demande confirmation.", {
      phone: { type: "string", description: "Numéro E.164" },
      first_name: { type: "string", description: "Prénom (optionnel)" },
      last_name: { type: "string", description: "Nom (optionnel)" },
      notes: { type: "string", description: "Notes (optionnel)" },
    }, ["phone"]),

    // Microsoft 365
    mk("read_emails", "Lit les derniers courriels M365.", {
      limit: { type: "number", description: "Nombre (défaut: 10)" },
      unread_only: { type: "boolean", description: "Seulement non lus" },
    }),
    mk("send_email", "Envoie un courriel via M365. Demande confirmation.", {
      to_email: { type: "string", description: "Destinataire" },
      to_name: { type: "string", description: "Nom (optionnel)" },
      subject: { type: "string", description: "Sujet" },
      body: { type: "string", description: "Corps" },
    }, ["to_email", "subject", "body"]),
    mk("search_contact", "Cherche un contact dans le répertoire M365 (People + Contacts) par nom ou email.", {
      query: { type: "string", description: "Nom ou fragment d'email" },
    }, ["query"]),
    mk("propose_email_reply", "Résume un courriel et propose un brouillon de réponse (Claude). Toujours demander confirmation avant d'envoyer.", {
      message_id: { type: "string", description: "ID du courriel M365" },
      tone: { type: "string", description: "ex: professionnel, chaleureux, direct" },
      language: { type: "string", description: "fr-CA (défaut) ou en" },
    }, ["message_id"]),
    mk("summarize_inbox", "Résume la boîte de réception avec priorités et actions requises.", {
      limit: { type: "number", description: "Nombre de courriels à analyser (défaut 10)" },
      folder: { type: "string", description: "inbox, unread (défaut: inbox)" },
    }),
    mk("update_calendar_event", "Modifie un rendez-vous M365 (déplacer/changer sujet).", {
      event_id: { type: "string", description: "ID de l'événement" },
      start: { type: "string", description: "Nouveau début ISO 8601" },
      end: { type: "string", description: "Nouvelle fin ISO 8601" },
      subject: { type: "string", description: "Nouveau titre (optionnel)" },
    }, ["event_id"]),
    mk("delete_calendar_event", "Annule un rendez-vous M365. Toujours confirmer avant.", {
      event_id: { type: "string", description: "ID de l'événement" },
    }, ["event_id"]),
    mk("get_calendar_today", "Rendez-vous du calendrier M365 aujourd'hui."),
    mk("get_calendar_week", "Rendez-vous des 7 prochains jours."),
    mk("get_upcoming_meetings", "Prochains rendez-vous M365 (Teams ou Outlook) dans les X prochaines heures.", {
      hours: { type: "number", description: "Horizon en heures (défaut: 24)" },
    }),
    mk("search_ms365_contacts", "Cherche un contact dans l'annuaire Microsoft 365 (People/Contacts). Utilise pour trouver un email, un numéro de téléphone ou vérifier si quelqu'un existe.", {
      query: { type: "string", description: "Nom, prénom ou email à rechercher" },
    }, ["query"]),
    mk("find_contact", "Cherche un contact dans les contacts Planiprêt ET l'annuaire M365. Retourne nom, email, téléphone.", {
      query: { type: "string", description: "Nom ou email à chercher" },
    }, ["query"]),

    // Navigation & stats
    mk("navigate_to", "Navigue vers une page de l'app Planiprêt.", {
      route: { type: "string", description: "Route ex: /mplanipret/home, /mplanipret/calls, /mplanipret/messages?tab=sms, /mplanipret/voicemail, /mplanipret/stats" },
    }, ["route"]),
    mk("get_daily_briefing", "Brief quotidien: emails, rendez-vous, appels, leads chauds, tâches."),
    mk("get_my_stats", "Statistiques d'appels et performance.", { period: { type: "string", description: "today, week ou month" } }),
    mk("generate_voicemail_greeting", "Génère un nouveau message de boîte vocale avec ElevenLabs. Demande confirmation.", {
      text: { type: "string", description: "Texte à générer" },
      voice_id: { type: "string", description: "ID voix (optionnel)" },
    }, ["text"]),
    mk("explain_feature", "Explique une fonctionnalité Planiprêt.", {
      feature: { type: "string", description: "calls, recordings, transcripts, ai_coaching, maestro, ms365, voicemail_greeting, sms, team_chat, contacts, stats, voice_agent, pipeline" },
    }, ["feature"]),
        mk("get_integration_status", "Statut de toutes les intégrations: NS-API, Maestro, M365, ElevenLabs."),
    // Teams
    mk("list_teams_chats", "Liste les chats Teams et les équipes Microsoft 365 de l'utilisateur."),
    mk("create_teams_chat", "Crée un nouveau chat Teams avec un contact. Demande confirmation.", {
      contact_name: { type: "string", description: "Nom du contact" },
      contact_email: { type: "string", description: "Email du contact (optionnel)" },
      topic: { type: "string", description: "Sujet du chat (optionnel)" },
    }),
    mk("send_teams_message", "Envoie un message Teams dans un chat ou canal. Demande confirmation.", {
      chat_id: { type: "string", description: "ID du chat Teams (optionnel si contact_name fourni)" },
      team_id: { type: "string", description: "ID de l'équipe (optionnel)" },
      channel_id: { type: "string", description: "ID du canal (optionnel)" },
      contact_name: { type: "string", description: "Nom du contact (crée le chat si nécessaire)" },
      contact_email: { type: "string", description: "Email du contact (optionnel)" },
      content: { type: "string", description: "Contenu du message" },
    }, ["content"]),
    // Push-back to Maestro
    mk("push_call_summary", "Pousse un résumé IA + coaching + notes d'un appel dans le dossier communication Maestro. Demande confirmation.", {
      call_id: { type: "string", description: "ID de l'appel" },
      summary: { type: "string", description: "Résumé de l'appel" },
      coaching: { type: "string", description: "Feedback coaching (optionnel)" },
      notes: { type: "string", description: "Notes additionnelles (optionnel)" },
      sentiment: { type: "string", description: "positive, neutral, negative (optionnel)" },
      next_steps: { type: "string", description: "Prochaines étapes (optionnel)" },
    }, ["call_id"]),
    mk("push_client_note", "Ajoute une note libre au timeline de communications d'un client Maestro.", {
      client_id: { type: "string", description: "ID du client Maestro" },
      note: { type: "string", description: "Contenu de la note" },
      type: { type: "string", description: "Type de note (défaut: general)" },
    }, ["client_id", "note"]),
    mk("push_communication_log", "Enregistre une entrée de communication (appel/SMS/courriel) dans Maestro.", {
      client_id: { type: "string", description: "ID du client Maestro" },
      channel: { type: "string", description: "call, sms, email ou note" },
      direction: { type: "string", description: "inbound ou outbound" },
      summary: { type: "string", description: "Résumé (optionnel)" },
      coaching: { type: "string", description: "Coaching (optionnel)" },
      notes: { type: "string", description: "Notes (optionnel)" },
      duration_seconds: { type: "number", description: "Durée en secondes (optionnel)" },
      occurred_at: { type: "string", description: "ISO 8601 (optionnel, défaut: maintenant)" },
    }, ["client_id"]),
  ];
}

export const EXPECTED_TOOL_NAMES = [
  "make_call","get_active_calls","hangup_call","get_call_history","get_recording","get_transcript","send_sms","get_voicemails",
  "analyze_call","get_hot_leads","get_coaching_summary",
  "search_client","get_client_profile","get_client_history","create_task","create_appointment","get_pending_tasks","get_upcoming_appointments","create_client","update_client",
  "read_emails","send_email","search_contact","propose_email_reply","summarize_inbox",
  "update_calendar_event","delete_calendar_event","get_calendar_today","get_calendar_week","get_upcoming_meetings","search_ms365_contacts","find_contact",
  "list_teams_chats","create_teams_chat","send_teams_message",
  "navigate_to","show_client_in_app","open_call_detail",
  "get_daily_briefing","get_my_stats","get_sms_conversations","generate_voicemail_greeting","explain_feature","get_integration_status",
  "push_call_summary","push_client_note","push_communication_log",
  "get_unread_emails","get_recent_emails","summarize_email",
  "create_calendar_event","move_calendar_event","cancel_calendar_event",
];
