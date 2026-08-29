// Single source of truth for AVA actions that mutate data. Shared by the chat
// (MAvaChat) and the voice agent (AvaVoiceAgent) so both enforce the exact same
// confirmation barrier. Deletions ALWAYS require an explicit confirmation.

/** Chat-side mutating actions (server-driven `action` names). */
export const AVA_MUTATING_ACTIONS = new Set<string>([
  "send_email",
  "create_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
  "send_teams_message",
  "reply_teams_message",
  "create_task",
  "update_task",
  "delete_task",
]);

/** Voice-side tools that require an explicit verbal confirmation. */
export const AVA_CONFIRM_REQUIRED = new Set<string>([
  "make_call", "send_sms", "send_email",
  "create_task", "update_task", "delete_task", "create_appointment", "generate_voicemail_greeting",
  "update_client",
  "create_calendar_event", "move_calendar_event", "cancel_calendar_event",
]);

/** Never mutate without confirmation, whatever the mode. */
export const AVA_ALWAYS_CONFIRM = new Set<string>(["delete_task", "delete_calendar_event", "cancel_calendar_event"]);

export const isAvaMutatingAction = (name: string) => AVA_MUTATING_ACTIONS.has(String(name));
export const requiresVoiceConfirmation = (tool: string) =>
  AVA_CONFIRM_REQUIRED.has(String(tool)) || AVA_ALWAYS_CONFIRM.has(String(tool));
