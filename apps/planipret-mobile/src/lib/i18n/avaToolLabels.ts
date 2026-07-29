// Single, type-safe source of truth for AVA voice/chat tool labels.
// Both FR and EN live in the same record so a tool can never exist in one
// language and be missing in the other.

export type MpLangCode = "fr" | "en";

export const AVA_TOOL_LABELS = {
  make_call: { fr: "Lancement d'un appel", en: "Placing a call" },
  send_sms: { fr: "Envoi d'un SMS", en: "Sending an SMS" },
  send_email: { fr: "Envoi d'un courriel", en: "Sending an email" },
  summarize_email: { fr: "Résumé du courriel", en: "Summarizing the email" },
  read_emails: { fr: "Lecture des courriels", en: "Reading emails" },
  get_unread_emails: { fr: "Courriels non lus", en: "Unread emails" },
  get_recent_emails: { fr: "Derniers courriels", en: "Recent emails" },
  search_client: { fr: "Recherche du client", en: "Searching the client" },
  update_client: { fr: "Mise à jour du client", en: "Updating the client" },
  analyze_call: { fr: "Analyse de l'appel", en: "Analyzing the call" },
  navigate_to: { fr: "Navigation", en: "Navigating" },
  create_task: { fr: "Création d'une tâche Maestro", en: "Creating a Maestro task" },
  create_appointment: { fr: "Création d'un RDV", en: "Creating an appointment" },
  create_calendar_event: { fr: "Création d'un meeting", en: "Creating a meeting" },
  move_calendar_event: { fr: "Déplacement du meeting", en: "Moving the meeting" },
  cancel_calendar_event: { fr: "Annulation du meeting", en: "Cancelling the meeting" },
  get_upcoming_meetings: { fr: "Meetings à venir", en: "Upcoming meetings" },
  generate_voicemail_greeting: { fr: "Génération de boîte vocale", en: "Generating voicemail greeting" },
} as const satisfies Record<string, { fr: string; en: string }>;

export type AvaToolName = keyof typeof AVA_TOOL_LABELS;

export const AVA_TOOL_NAMES = Object.keys(AVA_TOOL_LABELS) as AvaToolName[];

export function isAvaToolName(name: string): name is AvaToolName {
  return Object.prototype.hasOwnProperty.call(AVA_TOOL_LABELS, name);
}

/** Localized label for a tool. Unknown tools fall back to their raw name. */
export function getAvaToolLabel(name: string, lang: MpLangCode): string {
  if (!isAvaToolName(name)) return name;
  const entry = AVA_TOOL_LABELS[name];
  return lang === "en" ? entry.en : entry.fr;
}
