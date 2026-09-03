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
    mk("make_call", "Lance un appel téléphonique vers un numéro externe ou un poste interne. Demande toujours confirmation avant d'appeler.", {
      to_number: { type: "string", description: "Numéro externe en E.164 (ex: +15145551234) OU poste interne de 2 à 6 chiffres composé tel quel (ex: 1136 — jamais +11136)" },
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
    // ── Planiprêt Task API (POST/PUT/DELETE /api/main/tasks) ──
    mk("list_tasks", "Liste les tâches du courtier (en retard, aujourd'hui, à venir). Fuseau America/Toronto.", {
      status: { type: "string", description: "pending, done ou all (défaut: pending)" },
      filter: { type: "string", description: "overdue (en retard), today (aujourd'hui), upcoming (à venir), open (toutes les ouvertes, défaut) ou all" },
      from: { type: "string", description: "Date de début ISO (optionnel)" },
      to: { type: "string", description: "Date de fin ISO (optionnel)" },
      page: { type: "number", description: "Page (défaut: 1)" },
      limit: { type: "number", description: "Nombre max par page (défaut: 25)" },
    }),
    mk("get_task", "Détail d'une tâche.", { task_id: { type: "string", description: "ID de la tâche" } }, ["task_id"]),
    mk("list_task_targets", "Cibles de tâche valides (task_targets de l'API Clients) : id utilisateur du client et ids de contrats. À utiliser AVANT create_task pour obtenir le bon xid.", {
      search: { type: "string", description: "Nom ou courriel du client (optionnel)" },
    }),
    mk("create_task", "Crée une tâche Planiprêt. Sans cible, la tâche vise et s'auto-assigne au courtier connecté. Résume et demande TOUJOURS confirmation avant d'appeler.", {
      target: { type: "string", description: "xid Planiprêt (optionnel pour une tâche personnelle) : id utilisateur si target_type=user, id de contrat si target_type=contract" },
      target_type: { type: "string", description: "user (défaut) ou contract" },
      notes: { type: "string", description: "Note de la tâche (obligatoire)" },
      due_at: { type: "string", description: "Échéance, heure America/Toronto (YYYY-MM-DD HH:mm:ss ou ISO)" },
      description: { type: "string", description: "Description longue (optionnel)" },
      assignee_id: { type: "number", description: "users_id assigné — par défaut le Maestro ID du créateur ; fournir pour assigner à quelqu'un d'autre" },
      status: { type: "string", description: "Statut initial (optionnel)" },
      sync_calendar: { type: "boolean", description: "Créer l'événement calendrier — false par défaut" },
      notification: { type: "boolean", description: "Envoyer une notification — false par défaut" },
      recurrence: { type: "object", description: "{ value, pattern: day|week|month|year, on: 0-6 }" },
    }, ["notes", "due_at"]),

    mk("update_task", "Modifie une tâche (date, notes, description, statut, récurrence). Demande confirmation.", {
      task_id: { type: "string", description: "ID de la tâche" },
      changes: { type: "object", description: "Champs modifiés : date, notes, description, status_option_id, update_status, is_recurring, recurring_value, recurring_pattern, next_send_date, recurring_on" },
    }, ["task_id", "changes"]),
    mk("delete_task", "Supprime une tâche (soft delete). Confirmation explicite OBLIGATOIRE : rappeler avec confirmed=true.", {
      task_id: { type: "string", description: "ID de la tâche" },
      confirmed: { type: "boolean", description: "true seulement après confirmation explicite du courtier" },
    }, ["task_id"]),

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

    // Maestro — endpoints production par courtier (/users/{id}/...)
    mk("list_my_clients", "Liste les clients Maestro du courtier connecté (endpoint production /users/{id}/clients).", {
      search: { type: "string", description: "Recherche par nom, téléphone ou email (optionnel)" },
      limit: { type: "number", description: "Nombre (défaut: 25)" },
    }),
    mk("get_maestro_client_profile", "Profil détaillé d'un client Maestro du courtier (/users/{id}/clients/{client_id}/profile).", {
      client_id: { type: "string", description: "ID du client Maestro" },
    }, ["client_id"]),
    mk("list_my_brokers", "Liste les courtiers/collègues Maestro visibles (/users/{id}/brokers).", {
      search: { type: "string", description: "Recherche (optionnel)" },
      limit: { type: "number", description: "Nombre (défaut: 25)" },
    }),
    mk("get_maestro_broker_profile", "Profil d'un courtier Maestro (/users/{id}/brokers/{broker_id}/profile).", {
      broker_id: { type: "string", description: "ID du courtier Maestro" },
    }, ["broker_id"]),

    // Commissions (API officielle Planiprêt — données financières sensibles)
    mk("get_commission_summary", "Résumé agrégé des commissions du courtier connecté (total, nombre de dépôts, moyenne, volume de prêts, top institutions). Ne jamais divulguer de détail client à voix haute. Nécessite que le courtier ait activé « Inclure les commissions dans AVA ».", {
      period: { type: "string", description: "month (défaut), quarter, year, ytd ou custom" },
      date_from: { type: "string", description: "AAAA-MM-JJ si period=custom" },
      date_to: { type: "string", description: "AAAA-MM-JJ si period=custom" },
      commission_type: { type: "string", description: "base (défaut), bonus, bonus2 ou perform" },
    }),
    mk("get_commission_by_lender", "Répartition des commissions par institution financière (prêteur) sur une période.", {
      period: { type: "string", description: "month (défaut), quarter, year, ytd ou custom" },
      date_from: { type: "string", description: "AAAA-MM-JJ si period=custom" },
      date_to: { type: "string", description: "AAAA-MM-JJ si period=custom" },
      limit: { type: "number", description: "Nombre d'institutions (défaut 5)" },
    }),
    mk("compare_commission_periods", "Compare les commissions de la période courante avec la précédente (mois, trimestre ou année).", {
      period: { type: "string", description: "month (défaut), quarter ou year" },
    }),
    mk("list_commission_deposits", "Liste détaillée des dépôts de commissions (contrat, institution, montant, date). Données sensibles : à utiliser seulement sur demande explicite du courtier.", {
      period: { type: "string", description: "month (défaut), quarter, year, ytd ou custom" },
      date_from: { type: "string", description: "AAAA-MM-JJ si period=custom" },
      date_to: { type: "string", description: "AAAA-MM-JJ si period=custom" },
      limit: { type: "number", description: "Nombre de dépôts (défaut 10, max 50)" },
    }),
    mk("list_financial_institutions", "Liste des institutions financières disponibles pour filtrer les rapports de commissions."),

    // Alias conformes au contrat officiel (mêmes schémas chat + ElevenLabs)
    mk("get_commission_deposits", "Dépôts de commissions filtrés (contrat, institution, montant, date). Données sensibles : sur demande explicite seulement.", {
      date_from: { type: "string", description: "AAAA-MM-JJ (avec date_to)" },
      date_to: { type: "string", description: "AAAA-MM-JJ (avec date_from)" },
      financial_inst_id: { type: "string", description: "ID institution financière (optionnel)" },
      commission_type: { type: "string", description: "base (défaut), bonus, bonus2 ou perform" },
      split_type: { type: "string", description: "planipret, planipret_override ou planipret_external" },
      number_prefix: { type: "string", description: "Préfixe de numéro de contrat" },
      order_by: { type: "string", description: "date_trans (défaut), amount, institution, number…" },
      sort: { type: "string", description: "asc ou desc (défaut desc)" },
      limit: { type: "number", description: "Nombre de dépôts (défaut 10, max 50)" },
    }),
    mk("get_commission_agents", "Liste des courtiers disponibles pour filtrer les rapports de commissions (soi-même et son équipe ; tous les courtiers pour un admin)."),
    mk("get_financial_institutions", "Liste des institutions financières (nom français en priorité) pour filtrer les commissions."),
    mk("open_commission_report", "Ouvre la page mobile détaillée des commissions dans l'application avec les filtres demandés.", {
      period: { type: "string", description: "month, quarter, year, ytd ou custom" },
      date_from: { type: "string", description: "AAAA-MM-JJ (optionnel)" },
      date_to: { type: "string", description: "AAAA-MM-JJ (optionnel)" },
      commission_type: { type: "string", description: "base, bonus, bonus2 ou perform" },
      financial_inst_id: { type: "string", description: "ID institution (optionnel)" },
    }),






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
    mk("find_contact", "Cherche une personne PARTOUT : contacts du cellulaire du courtier, annuaire de l'entreprise (extensions et contacts partagés), clients Maestro, contacts Outlook/M365. Accepte prénom seul, nom de famille seul, nom complet dans n'importe quel ordre, courriel, entreprise ou numéro. Utilise cet outil avant d'appeler ou d'écrire à quelqu'un dont tu n'as pas le numéro.", {
      query: { type: "string", description: "Prénom, nom, nom complet, courriel, entreprise ou numéro" },
      limit: { type: "number", description: "Nombre max de résultats (défaut 10)" },
    }, ["query"]),
    mk("search_directory", "Recherche unifiée identique à find_contact, avec filtre optionnel par source.", {
      query: { type: "string", description: "Texte recherché" },
      sources: { type: "string", description: "Filtre optionnel séparé par virgules : device, directory, maestro, microsoft" },
      limit: { type: "number", description: "Nombre max de résultats (défaut 10)" },
    }, ["query"]),
    mk("list_company_directory", "Liste l'annuaire de l'entreprise (collègues, extensions, contacts partagés).", {
      limit: { type: "number", description: "Nombre max d'entrées (défaut 50)" },
    }),

    // Navigation & stats
    mk("navigate_to", "Navigue vers une page de l'app Planiprêt.", {
      route: { type: "string", description: "Route ex: /mplanipret/home, /mplanipret/calls, /mplanipret/messages?tab=sms, /mplanipret/voicemail, /mplanipret/stats, /mplanipret/pipeline, /mplanipret/notifications, /mplanipret/search" },
    }, ["route"]),
    mk("show_client_in_app", "Ouvre la fiche d'un client dans l'app Planiprêt.", {
      client_id: { type: "string", description: "ID du client Maestro ou local" },
      open_tab: { type: "string", description: "Onglet à ouvrir (optionnel)" },
    }, ["client_id"]),
    mk("open_call_detail", "Ouvre le détail d'un appel (enregistrement/transcription).", {
      call_id: { type: "string", description: "ID de l'appel" },
      open_tab: { type: "string", description: "recording | transcript | coaching (optionnel)" },
    }, ["call_id"]),
    mk("open_dialer", "Ouvre le composeur d'appel dans l'app avec un numéro pré-rempli.", {
      phone: { type: "string", description: "Numéro E.164" },
      name: { type: "string", description: "Nom affiché (optionnel)" },
    }, ["phone"]),
    mk("open_sms_composer", "Ouvre l'écran SMS avec destinataire et texte pré-remplis.", {
      phone: { type: "string", description: "Numéro E.164" },
      message: { type: "string", description: "Texte pré-rempli (optionnel)" },
    }, ["phone"]),
    mk("open_email_composer", "Ouvre le composeur de courriel M365 pré-rempli.", {
      to: { type: "string", description: "Adresse courriel" },
      subject: { type: "string", description: "Objet (optionnel)" },
      body: { type: "string", description: "Corps (optionnel)" },
    }, ["to"]),
    mk("create_calendar_event", "Crée un événement dans le calendrier Microsoft 365.", {
      subject: { type: "string", description: "Titre" },
      start_datetime: { type: "string", description: "ISO 8601" },
      duration_minutes: { type: "number", description: "Durée (défaut: 60)" },
      attendees: { type: "string", description: "Courriels séparés par virgule (optionnel)" },
      body: { type: "string", description: "Description (optionnel)" },
    }, ["subject", "start_datetime"]),
    mk("move_calendar_event", "Déplace un événement du calendrier M365.", {
      event_id: { type: "string", description: "ID de l'événement" },
      start_datetime: { type: "string", description: "Nouvelle date/heure ISO 8601" },
      duration_minutes: { type: "number", description: "Durée (optionnel)" },
    }, ["event_id", "start_datetime"]),
    mk("cancel_calendar_event", "Annule un événement du calendrier M365.", {
      event_id: { type: "string", description: "ID de l'événement" },
      comment: { type: "string", description: "Message d'annulation (optionnel)" },
    }, ["event_id"]),
    mk("get_sms_conversations", "Liste les dernières conversations SMS.", {
      limit: { type: "number", description: "Nombre (défaut: 10)" },
    }),
    mk("get_unread_emails", "Liste les courriels non lus.", { limit: { type: "number", description: "Nombre (défaut: 10)" } }),
    mk("get_recent_emails", "Liste les derniers courriels reçus.", { limit: { type: "number", description: "Nombre (défaut: 10)" } }),
    mk("summarize_email", "Résume un courriel spécifique.", {
      message_id: { type: "string", description: "ID du courriel M365 (ou fournir subject+body)" },
      subject: { type: "string", description: "Sujet (si pas de message_id)" },
      body: { type: "string", description: "Corps texte (si pas de message_id)" },
    }),
    mk("update_client", "Met à jour un profil client Maestro.", {
      client_id: { type: "string", description: "ID du client Maestro" },
      updates: { type: "object", description: "Champs à mettre à jour" },
    }, ["client_id", "updates"]),
    mk("list_teams_chats", "Liste les chats et équipes Microsoft Teams."),
    mk("create_teams_chat", "Crée un chat Teams 1:1 ou de groupe.", {
      contact_email: { type: "string", description: "Email destinataire (optionnel)" },
      contact_emails: { type: "array", description: "Emails destinataires (optionnel)" },
      contact_name: { type: "string", description: "Nom (résolu depuis contacts, optionnel)" },
      topic: { type: "string", description: "Sujet du chat (optionnel)" },
    }),
    mk("send_teams_message", "Envoie un message Teams à un chat ou canal. Demande confirmation.", {
      chat_id: { type: "string", description: "ID du chat Teams" },
      team_id: { type: "string", description: "ID de l'équipe (avec channel_id)" },
      channel_id: { type: "string", description: "ID du canal (avec team_id)" },
      contact_name: { type: "string", description: "Nom du contact (fallback)" },
      contact_email: { type: "string", description: "Email du contact (fallback)" },
      content: { type: "string", description: "Message à envoyer" },
    }, ["content"]),
    mk("get_daily_briefing", "Brief quotidien: emails, rendez-vous, appels, leads chauds, tâches."),
    mk("get_my_stats", "Statistiques d'appels et performance.", { period: { type: "string", description: "today, week ou month" } }),
    mk("get_performance_report", "Rapport de performance détaillé (Markdown) généré par IA pour la journée, la semaine ou le mois. Contient vue d'ensemble, téléphonie, leads chauds, suivi client et recommandations.", {
      period: { type: "string", description: "day, week ou month (défaut day)" },
      language: { type: "string", description: "fr ou en (défaut fr)" },
    }),
    mk("generate_voicemail_greeting", "Génère un nouveau message de boîte vocale avec ElevenLabs. Demande confirmation.", {
      text: { type: "string", description: "Texte à générer" },
      voice_id: { type: "string", description: "ID voix (optionnel)" },
    }, ["text"]),
    mk("explain_feature", "Explique une fonctionnalité Planiprêt.", {
      feature: { type: "string", description: "calls, recordings, transcripts, ai_coaching, maestro, ms365, voicemail_greeting, sms, team_chat, contacts, stats, voice_agent, pipeline" },
    }, ["feature"]),
    mk("get_integration_status", "Statut de toutes les intégrations: NS-API, Maestro, M365, ElevenLabs."),

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
  "make_call","get_active_calls","hangup_call","get_call_history","get_recording","get_transcript","send_sms","get_sms_conversations","get_voicemails",
  "analyze_call","get_hot_leads","get_coaching_summary",
  "search_client","get_client_profile","get_client_history","update_client","list_tasks","get_task","list_task_targets","create_task","update_task","delete_task","create_appointment","get_pending_tasks","get_upcoming_appointments","create_client",
  "read_emails","get_unread_emails","get_recent_emails","summarize_email","send_email","search_contact","propose_email_reply","summarize_inbox",
  "update_calendar_event","delete_calendar_event","get_calendar_today","get_calendar_week","get_upcoming_meetings",
  "search_ms365_contacts","find_contact","search_directory","list_company_directory",
  "list_teams_chats","create_teams_chat","send_teams_message",
  "navigate_to","show_client_in_app","open_call_detail",
  "get_daily_briefing","get_my_stats","get_performance_report","generate_voicemail_greeting","explain_feature","get_integration_status",
  "push_call_summary","push_client_note","push_communication_log",
];
