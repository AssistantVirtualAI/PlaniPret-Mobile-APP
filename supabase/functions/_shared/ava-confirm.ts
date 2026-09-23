// Barrière de confirmation + idempotence côté serveur pour toutes les actions
// sensibles proposées par AVA (chatbot, agent vocal ElevenLabs, mobile).
//
// Règle : AVA prépare et suggère, le courtier confirme, le serveur exécute.
// Un client mobile ancien, une requête directe ou un tool call ElevenLabs ne
// peuvent PAS contourner cette validation : elle vit ici, pas dans le React.

/** Outils qui modifient le monde extérieur : jamais sans confirmation explicite. */
export const AVA_SENSITIVE_TOOLS = new Set<string>([
  "send_sms",
  "send_email",
  "propose_email_reply_send",
  "make_call",
  "start_call",
  "hangup_call",
  "send_teams_message",
  "create_teams_chat",
  "reply_teams_message",
  "create_task",
  "update_task",
  "delete_task",
  "create_appointment",
  "create_calendar_event",
  "move_calendar_event",
  "update_calendar_event",
  "cancel_calendar_event",
  "delete_calendar_event",
  "create_client",
  "update_client",
  "generate_voicemail_greeting",
  "push_call_summary",
  "push_client_note",
  "push_communication_log",
  "submit_feedback",
]);

export const isSensitiveAvaTool = (tool: string) => AVA_SENSITIVE_TOOLS.has(String(tool));

/** Actions Microsoft 365 sortantes : jamais sans confirmation explicite. */
export const MS365_SENSITIVE_ACTIONS = new Set<string>([
  "send_email",
  "reply_email",
  "reply_all_email",
  "forward_email",
  "delete_email",
  "create_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
  "send_teams_message",
  "reply_teams_message",
  "create_teams_chat",
  "upsert_contact",
]);

export const isSensitiveMs365Action = (action: string) => MS365_SENSITIVE_ACTIONS.has(String(action));

/** Compatibility confirmation for established flows. New Feedback actions use
 * an opaque, single-use server token instead of trusting this client boolean. */
export function isConfirmed(params: any): boolean {
  return params?.confirmed === true || params?.approved === true;
}

/** Un envoi préparé par AVA (brouillon, suivi post-appel, tool call vocal). */
export function isAvaOriginated(params: any): boolean {
  const origin = String(params?.origin ?? params?.surface ?? "").toLowerCase();
  return origin.includes("ava") ||
    params?.ava_generated === true ||
    params?.draft === true ||
    params?.proposal === true;
}


export function confirmationRequiredResult(tool: string, params: any) {
  const feedback = tool === "submit_feedback";
  return {
    success: false,
    needs_confirmation: true,
    error: "confirmation_required",
    tool_name: tool,
    proposal: params ?? {},
    message: feedback
      ? "Ce signalement doit être confirmé par le courtier. Présente le titre, le résumé, la gravité et la page, sans destinataire externe."
      : "Cette action doit être confirmée par le courtier. Présente le canal, le destinataire et le texte complet.",
  };
}

function stable(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${k}:${stable(o[k])}`).join(",")}}`;
}

async function sha(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

/** broker + action + destinataire + contenu + call_id + fenêtre de 10 minutes. */
export async function buildIdempotencyKey(opts: {
  userId: string;
  action: string;
  destination?: string | null;
  callId?: string | null;
  payload?: unknown;
  windowMs?: number;
  provided?: string | null;
}): Promise<string> {
  if (opts.provided && String(opts.provided).trim()) {
    const supplied = String(opts.provided).trim().slice(0, 160);
    if (supplied.startsWith(`u:${opts.userId}:`)) return supplied;
    return `u:${opts.userId}:${await sha(`provided:${supplied}`)}`.slice(0, 160);
  }
  const win = Math.floor(Date.now() / (opts.windowMs ?? 10 * 60_000));
  const digest = await sha(stable(opts.payload ?? {}));
  const canonical = [
    opts.action,
    (opts.destination ?? "").toString().slice(0, 64),
    opts.callId ?? "",
    digest,
    win,
  ].join("|");
  return `u:${opts.userId}:${await sha(canonical)}`.slice(0, 160);
}

export type Claim =
  | { replay: true; result: any }
  | { replay: false; id: string | null };

/**
 * Réserve la clé d'idempotence. Si la même action a déjà réussi, on renvoie le
 * résultat de la première exécution au lieu d'envoyer une deuxième fois.
 */
export async function claimAction(admin: any, row: {
  userId: string;
  brokerId?: string | null;
  callId?: string | null;
  sessionId?: string | null;
  action: string;
  surface: string;
  destination?: string | null;
  provider?: string | null;
  idempotencyKey: string;
}): Promise<Claim> {
  const { data: existing } = await admin
    .from("planipret_ava_action_confirmations")
    .select("id, status, result")
    .eq("idempotency_key", row.idempotencyKey)
    .eq("user_id", row.userId)
    .maybeSingle();

  if (existing) {
    if (existing.status === "success") return { replay: true, result: { ...(existing.result ?? {}), idempotent_replay: true } };
    if (existing.status === "running") {
      return { replay: true, result: { success: true, pending: true, idempotent_replay: true, message: "Action déjà en cours." } };
    }
    // échec précédent : on autorise un nouvel essai sur la même ligne.
    await admin.from("planipret_ava_action_confirmations")
      .update({ status: "running", decision: "accepted", decided_at: new Date().toISOString(), error_code: null })
      .eq("id", existing.id);
    return { replay: false, id: existing.id };
  }

  const { data: inserted, error } = await admin
    .from("planipret_ava_action_confirmations")
    .insert({
      user_id: row.userId,
      broker_id: row.brokerId ?? null,
      call_id: row.callId ?? null,
      session_id: row.sessionId ?? null,
      action: row.action,
      surface: row.surface,
      destination: row.destination ?? null,
      provider: row.provider ?? null,
      decision: "accepted",
      decided_at: new Date().toISOString(),
      status: "running",
      idempotency_key: row.idempotencyKey,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // Course entre deux taps : la ligne existe déjà, on relit.
    const { data: again } = await admin
      .from("planipret_ava_action_confirmations")
      .select("id, status, result")
      .eq("idempotency_key", row.idempotencyKey)
      .eq("user_id", row.userId)
      .maybeSingle();
    if (again?.status === "success") return { replay: true, result: { ...(again.result ?? {}), idempotent_replay: true } };
    return { replay: true, result: { success: true, pending: true, idempotent_replay: true } };
  }
  return { replay: false, id: inserted?.id ?? null };
}

export async function finishAction(admin: any, id: string | null, ok: boolean, result: any, errorCode?: string | null) {
  if (!id) return;
  await admin.from("planipret_ava_action_confirmations").update({
    status: ok ? "success" : "failed",
    executed_at: new Date().toISOString(),
    error_code: ok ? null : String(errorCode ?? "").slice(0, 120) || "error",
    result: ok ? result ?? {} : { error: String(errorCode ?? "error").slice(0, 200) },
  }).eq("id", id);
}

/** Issues a short-lived token only for a Feedback proposal persisted under the
 * authenticated broker. The client sends this token after a real confirmation tap. */
export async function issueFeedbackConfirmation(admin: any, opts: {
  userId: string;
  sessionId?: string | null;
  idempotencyKey: string;
}): Promise<string | null> {
  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + 10 * 60_000).toISOString();
  const { error } = await admin.from("planipret_ava_action_confirmations").upsert({
    user_id: opts.userId,
    session_id: opts.sessionId ?? null,
    action: "submit_feedback",
    surface: "ava_feedback",
    decision: "proposed",
    status: "pending",
    idempotency_key: opts.idempotencyKey,
    confirmation_token: token,
    confirmation_expires_at: expires,
  }, { onConflict: "idempotency_key" });
  return error ? null : token;
}

/** Atomically consumes the exact broker-bound Feedback token. */
export async function consumeFeedbackConfirmation(admin: any, opts: {
  userId: string;
  token: string;
  idempotencyKey: string;
}): Promise<string | null> {
  const { data, error } = await admin.from("planipret_ava_action_confirmations")
    .update({ decision: "accepted", decided_at: new Date().toISOString(), status: "running", confirmation_token: null, confirmation_expires_at: null })
    .eq("user_id", opts.userId)
    .eq("action", "submit_feedback")
    .eq("idempotency_key", opts.idempotencyKey)
    .eq("confirmation_token", opts.token)
    .gt("confirmation_expires_at", new Date().toISOString())
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  return !error && data?.id ? String(data.id) : null;
}

/** Trace une proposition refusée / annulée / non confirmée (jamais exécutée). */
export async function logProposal(admin: any, row: {
  userId: string;
  callId?: string | null;
  sessionId?: string | null;
  action: string;
  surface: string;
  destination?: string | null;
  decision: "proposed" | "cancelled" | "edited";
  idempotencyKey: string;
}) {
  await admin.from("planipret_ava_action_confirmations").upsert({
    user_id: row.userId,
    call_id: row.callId ?? null,
    session_id: row.sessionId ?? null,
    action: row.action,
    surface: row.surface,
    destination: row.destination ?? null,
    decision: row.decision,
    decided_at: row.decision === "proposed" ? null : new Date().toISOString(),
    status: row.decision === "cancelled" ? "cancelled" : "pending",
    idempotency_key: row.idempotencyKey,
  }, { onConflict: "idempotency_key" }).then(() => null).catch(() => null);
}
