// pp-ava-chat: Planipret AVA chatbot with structured suggestions.
// Returns { reply, suggestions[], openCoach?, openVoice? } for the mobile UI.
// Uses Lovable AI Gateway. Does NOT alter pp-ava-proactive (cron push) or any other function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateText, Output } from "npm:ai";
import { z } from "npm:zod";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SuggestionSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["call", "sms", "email", "reminder", "maestro_action", "ms365_action", "open_voice", "open_coach"]),
  payload: z.record(z.string(), z.any()).optional(),
});

const OutputSchema = z.object({
  reply: z.string(),
  suggestions: z.array(SuggestionSchema).max(4).optional(),
  openCoach: z.boolean().optional(),
  openVoice: z.boolean().optional(),
});

const MUTATING_MS365 = new Set(["send_email", "create_calendar_event", "update_calendar_event", "delete_calendar_event", "send_teams_message", "reply_teams_message"]);
const MS365_ACTIONS = new Set(["connection_status", "read_emails", "read_email_detail", "list_calendar_events", "send_email", "create_calendar_event", "update_calendar_event", "delete_calendar_event", "send_teams_message", "reply_teams_message", "search_contact"]);

async function invokeFunction(name: string, authHeader: string, body: Record<string, unknown>) {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

function wantsEmailSummary(text: string) {
  return /courriels?|emails?|inbox|bo[îi]te|mail/i.test(text);
}

function wantsCalendar(text: string) {
  return /calendrier|calendar|rendez[- ]?vous|meeting|rencontre|agenda|horaire|today|week|upcoming|semaine|prochain|aujourd/i.test(text);
}

function wantsCalls(text: string) {
  return /appels?|calls?|t[ée]l[ée]phon|manqu[eé]s?|missed|derniers? appels?/i.test(text);
}

function wantsSms(text: string) {
  return /\bsms\b|texto|message texte|messages? non lus?/i.test(text);
}

function wantsVoicemail(text: string) {
  return /messagerie|voicemail|vm\b|bo[îi]te vocale/i.test(text);
}

function wantsLeads(text: string) {
  return /leads?|prospects?|clients? potentiels?|hot leads?|pipeline|dossiers?/i.test(text);
}

function wantsReminders(text: string) {
  return /rappels?|reminders?|t[âa]ches?|tasks?|todo|à faire/i.test(text);
}

function wantsReport(text: string): "day" | "week" | "month" | null {
  if (!/rapport|report|brief|briefing|bilan|r[ée]sum[ée] de (ma |la )?(journ[ée]e|semaine|mois)|performance|comment (s'est|c'est|c'était) (pass[ée]e? )?(ma |la )?(journ[ée]e|semaine|mois)|how (was|did) (my |the )?(day|week|month)/i.test(text)) return null;
  if (/mois|month/i.test(text)) return "month";
  if (/semaine|week|7 jours/i.test(text)) return "week";
  return "day";
}

function wantsSendEmail(text: string) {
  return /(envoie|envoyer|envoi|send)\s+(un\s+)?(courriel|email|mail)|(courriel|email|mail)\s+(à|a|to)\s+/i.test(text);
}

function wantsContactLookup(text: string) {
  return /(contact|répertoire|repertoire|directory|courriel de|email de|adresse de|coordonn[ée]es|num[ée]ro de)/i.test(text)
    || wantsSendEmail(text);
}

function extractNameTokens(text: string): { emails: string[]; names: string[] } {
  const emails = Array.from(text.matchAll(/[\w.+-]+@[\w.-]+\.\w+/g)).map(m => m[0]);
  const quoted = Array.from(text.matchAll(/["“']([^"”']{2,60})["”']/g)).map(m => m[1]);
  const caps = Array.from(text.matchAll(/\b([A-ZÉÈÀÂÊÎÔÛÇ][a-zéèàâêîôûç'\-]{1,}(?:\s+[A-ZÉÈÀÂÊÎÔÛÇ][a-zéèàâêîôûç'\-]{1,}){0,2})\b/g)).map(m => m[1]);
  const stop = new Set(["Bonjour", "Salut", "Hello", "Envoie", "Envoyer", "Envoi", "Courriel", "Email", "Mail", "Contact", "Ava", "AVA", "Microsoft", "Teams", "Outlook"]);
  const names = Array.from(new Set([...quoted, ...caps.filter(n => !stop.has(n.split(" ")[0]))])).slice(0, 5);
  return { emails: Array.from(new Set(emails)).slice(0, 5), names };
}

async function searchDirectory(
  admin: ReturnType<typeof createClient>,
  userId: string,
  tokens: { emails: string[]; names: string[] },
) {
  const results: any[] = [];
  const seen = new Set<string>();
  const push = (r: any) => {
    const k = `${(r.email ?? "").toLowerCase()}|${(r.phone ?? "").toString()}|${(r.full_name ?? "").toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k);
    results.push(r);
  };
  for (const em of tokens.emails) {
    const { data } = await admin.from("planipret_contacts")
      .select("full_name, email, phone_display")
      .eq("user_id", userId).ilike("email", em).limit(3);
    (data ?? []).forEach((r: any) => push({ full_name: r.full_name, email: r.email, phone: r.phone_display, source: "contacts" }));
  }
  for (const name of tokens.names) {
    const pattern = `%${name}%`;
    const [{ data: c }, { data: mc }] = await Promise.all([
      admin.from("planipret_contacts")
        .select("full_name, email, phone_display")
        .eq("user_id", userId).ilike("full_name", pattern).limit(3),
      admin.from("planipret_maestro_clients")
        .select("first_name, last_name, email, phone, mobile")
        .or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`)
        .limit(3),
    ]);
    (c ?? []).forEach((r: any) => push({ full_name: r.full_name, email: r.email, phone: r.phone_display, source: "contacts" }));
    (mc ?? []).forEach((r: any) => push({
      full_name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
      email: r.email,
      phone: r.phone ?? r.mobile,
      source: "maestro",
    }));
  }
  return results.slice(0, 10);
}




async function logAvaAction(admin: ReturnType<typeof createClient>, profile: any, userId: string, actionType: string, params: Record<string, unknown>, success: boolean, result: unknown, error?: string | null) {
  try {
    await admin.from("planipret_ava_action_log").insert({
      broker_id: profile?.id ?? null,
      broker_user_id: userId,
      analysis_id: null,
      action_type: actionType,
      action_params: params,
      execution_mode: "live",
      success,
      result: result as any,
      error: error ?? null,
      modified_by_broker: true,
    });
  } catch (e) {
    console.error("pp-ava-chat action log fail", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const mode: string = String(body?.mode ?? "chat"); // chat | summarize | recommend
    const userMessage: string = String(body?.user_message ?? body?.message ?? "").slice(0, 6000);
    const sessionId: string | null = body?.session_id ? String(body.session_id) : null;
    let history: { role: "user" | "assistant"; content: string }[] = Array.isArray(body?.history)
      ? body.history.slice(-10).map((h: any) => ({ role: h.role === "assistant" ? "assistant" : "user", content: String(h.content ?? "").slice(0, 4000) }))
      : [];
    const context: Record<string, unknown> = (body?.context && typeof body.context === "object") ? body.context : {};
    const confirmAction = (body?.confirm_action && typeof body.confirm_action === "object") ? body.confirm_action : null;
    const level: string = String(body?.level ?? "standard"); // short | standard | detailed
    const lang: string = (body?.lang === "en" || body?.lang === "fr") ? body.lang : "fr";
    const isEn = lang === "en";

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: lemtelOnly } = await sb.rpc("is_lemtel_only", { _user_id: u.user.id });
    if (lemtelOnly === true) return json({ error: "forbidden_wrong_app", app: "lemtel" }, 403);

    // Light Planipret context
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("planipret_profiles")
      .select("id, user_id, full_name, role, extension, ms365_access_token, ms365_scopes, ms365_email")
      .eq("user_id", u.user.id).maybeSingle();

    if (confirmAction) {
      const kind = String(confirmAction.kind ?? "");
      const payload = (confirmAction.payload && typeof confirmAction.payload === "object") ? confirmAction.payload : {};
      if (kind === "ms365_action") {
        const action = String(payload.action ?? "");
        if (!MS365_ACTIONS.has(action)) return json({ reply: "Action Microsoft inconnue.", suggestions: [] }, 400);
        if (MUTATING_MS365.has(action) && body?.approved !== true) {
          return json({ reply: "Cette action nécessite votre confirmation avant l'envoi.", suggestions: [confirmAction] });
        }
        const exec = await invokeFunction("ms365-actions", authHeader, { action, payload });
        const ok = !!exec.data?.success && exec.ok;
        await logAvaAction(admin, profile, u.user.id, `ms365_${action}`, payload, ok, exec.data, ok ? null : (exec.data?.error ?? `HTTP ${exec.status}`));
        return json({ reply: ok ? "Action Microsoft 365 exécutée." : `Action Microsoft 365 échouée: ${exec.data?.error ?? exec.data?.message ?? exec.status}`, result: exec.data, suggestions: [] }, ok ? 200 : 200);
      }
      if (kind === "sms") {
        const to = String(payload.number ?? payload.to ?? "");
        const message = String(payload.text ?? payload.message ?? "");
        if (!to || !message) return json({ reply: "Numéro ou message SMS manquant.", suggestions: [] }, 400);
        if (body?.approved !== true) return json({ reply: "Confirmez avant l'envoi du SMS.", suggestions: [confirmAction] });
        const exec = await invokeFunction("pp-ns-sms", authHeader, { action: "send", to, message });
        const ok = !!(exec.data?.ok ?? exec.data?.success) && exec.ok;
        await logAvaAction(admin, profile, u.user.id, "sms_send", { to, message }, ok, exec.data, ok ? null : (exec.data?.error ?? `HTTP ${exec.status}`));
        return json({ reply: ok ? "SMS envoyé." : `SMS non envoyé: ${exec.data?.error ?? exec.status}`, result: exec.data, suggestions: [] });
      }
      if (kind === "call") {
        const to = String(payload.number ?? payload.to ?? "");
        if (!to) return json({ reply: "Numéro d'appel manquant.", suggestions: [] }, 400);
        if (body?.approved !== true) return json({ reply: "Confirmez avant de lancer l'appel.", suggestions: [confirmAction] });
        const exec = await invokeFunction("ns-make-call", authHeader, { to_number: to });
        const ok = !!exec.data?.success && exec.ok;
        await logAvaAction(admin, profile, u.user.id, "call_start", { to }, ok, exec.data, ok ? null : (exec.data?.error ?? `HTTP ${exec.status}`));
        return json({ reply: ok ? "Appel lancé." : `Appel non lancé: ${exec.data?.error ?? exec.status}`, result: exec.data, suggestions: [] });
      }
    }

    let appContext = "";
    const integrations: string[] = [
      `Microsoft 365: ${profile?.ms365_access_token ? `connecté${profile?.ms365_email ? ` (${profile.ms365_email})` : ""}` : "non connecté"}`,
      `Scopes Microsoft: ${profile?.ms365_scopes ?? "non détectés"}`,
      `Téléphonie/SMS: ${profile?.extension ? `extension ${profile.extension}` : "non liée"}`,
    ];

    if (userMessage && profile?.id) {
      const dataBlocks: string[] = [];

      if (profile?.ms365_access_token) {
        if (wantsEmailSummary(userMessage)) {
          const emails = await invokeFunction("ms365-actions", authHeader, { action: "read_emails", payload: { top: 12, folder: /non lus?|unread/i.test(userMessage) ? "unread" : "inbox" } });
          dataBlocks.push(`Courriels Microsoft: ${JSON.stringify(emails.data).slice(0, 4000)}`);
        }
        if (wantsCalendar(userMessage)) {
          const start = new Date(); start.setHours(0, 0, 0, 0);
          const end = /semaine|week/i.test(userMessage) ? new Date(Date.now() + 7 * 86400000) : new Date(Date.now() + 2 * 86400000);
          const cal = await invokeFunction("ms365-actions", authHeader, { action: "list_calendar_events", payload: { start: start.toISOString(), end: end.toISOString(), top: 20 } });
          dataBlocks.push(`Calendrier Microsoft: ${JSON.stringify(cal.data).slice(0, 4000)}`);
        }
      }

      if (wantsCalls(userMessage)) {
        const sinceDays = /semaine|week/i.test(userMessage) ? 7 : /mois|month/i.test(userMessage) ? 30 : 2;
        const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
        const { data: calls } = await admin.from("planipret_phone_calls")
          .select("id, direction, status, from_number, from_name, to_number, to_name, started_at, duration_seconds, lead_score, lead_temperature, ai_summary")
          .or(`user_id.eq.${profile.id},user_id.eq.${u.user.id}`)
          .gte("started_at", since).order("started_at", { ascending: false }).limit(20);
        dataBlocks.push(`Appels récents (${sinceDays}j): ${JSON.stringify(calls ?? []).slice(0, 4000)}`);
      }

      if (wantsSms(userMessage)) {
        const { data: sms } = await admin.from("planipret_phone_messages")
          .select("id, direction, from_number, to_number, body, created_at, read_at")
          .eq("user_id", u.user.id).order("created_at", { ascending: false }).limit(15);
        dataBlocks.push(`SMS récents: ${JSON.stringify(sms ?? []).slice(0, 3000)}`);
      }

      if (wantsVoicemail(userMessage)) {
        const { data: vm } = await admin.from("planipret_voicemails")
          .select("id, from_number, from_name, duration_seconds, transcript, is_read, created_at")
          .or(`user_id.eq.${profile.id},user_id.eq.${u.user.id}`)
          .order("created_at", { ascending: false }).limit(10);
        dataBlocks.push(`Messagerie vocale: ${JSON.stringify(vm ?? []).slice(0, 3000)}`);
      }

      if (wantsLeads(userMessage)) {
        const since = new Date(Date.now() - 14 * 86400000).toISOString();
        const { data: hot } = await admin.from("planipret_phone_calls")
          .select("id, from_number, from_name, to_number, to_name, lead_score, lead_temperature, started_at, ai_summary")
          .or(`user_id.eq.${profile.id},user_id.eq.${u.user.id}`)
          .gte("started_at", since).gte("lead_score", 6)
          .order("lead_score", { ascending: false }).limit(10);
        dataBlocks.push(`Leads chauds (14j): ${JSON.stringify(hot ?? []).slice(0, 3000)}`);
      }

      if (wantsReminders(userMessage)) {
        const { data: rem } = await admin.from("planipret_reminders")
          .select("id, contact_name, contact_number, note, scheduled_at, status")
          .or(`user_id.eq.${profile.id},user_id.eq.${u.user.id}`)
          .eq("status", "pending").order("scheduled_at", { ascending: true }).limit(15);
        dataBlocks.push(`Rappels/tâches en attente: ${JSON.stringify(rem ?? []).slice(0, 3000)}`);
      }

      const reportPeriod = wantsReport(userMessage);
      if (reportPeriod) {
        try {
          const rep = await invokeFunction("pp-ava-report", authHeader, { period: reportPeriod, language: "fr" });
          if (rep.ok && rep.data?.report) {
            dataBlocks.push(`Rapport de performance (${reportPeriod}) — Stats: ${JSON.stringify(rep.data.stats ?? {})}\n${String(rep.data.report).slice(0, 6000)}`);
          }
        } catch (e) { console.error("pp-ava-chat report fetch fail", e); }
      }

      // Directory / contact lookup — always try when the message mentions a
      // name, email, or contact-oriented action (e.g. "envoie un email à X").
      const tokens = extractNameTokens(userMessage);
      if (wantsContactLookup(userMessage) || tokens.emails.length || tokens.names.length) {
        try {
          const matches = await searchDirectory(admin, u.user.id, tokens);
          if (matches.length) {
            dataBlocks.push(`Contacts trouvés (répertoire + Maestro): ${JSON.stringify(matches).slice(0, 3000)}`);
          } else {
            dataBlocks.push(`Contacts trouvés: aucun résultat pour ${JSON.stringify([...tokens.names, ...tokens.emails])}. Demande à l'utilisateur de préciser l'adresse courriel exacte.`);
          }
          // If MS365 is connected and we're composing an email, also search the
          // Outlook address book / recent contacts for the same tokens.
          if (profile?.ms365_access_token && wantsSendEmail(userMessage)) {
            const q = [...tokens.emails, ...tokens.names].filter(Boolean).slice(0, 3);
            for (const term of q) {
              const r = await invokeFunction("ms365-actions", authHeader, { action: "search_contact", payload: { query: term } });
              if (r.ok) dataBlocks.push(`Contact Microsoft (${term}): ${JSON.stringify(r.data).slice(0, 1500)}`);
            }
          }
        } catch (e) {
          console.error("pp-ava-chat directory lookup fail", e);
        }
      }

      if (dataBlocks.length) appContext += `\n${dataBlocks.join("\n")}`;
    }


    if (mode === "recommend" && profile?.id) {

      const startDay = new Date(); startDay.setHours(0, 0, 0, 0);
      const [{ data: hot }, { data: missed }, { count: smsUnread }] = await Promise.all([
        admin.from("planipret_phone_calls").select("id, caller_number, started_at, lead_score")
          .eq("user_id", profile.id).gte("lead_score", 7)
          .order("started_at", { ascending: false }).limit(3),
        admin.from("planipret_phone_calls").select("id, caller_number, started_at")
          .eq("user_id", profile.id).eq("status", "missed")
          .order("started_at", { ascending: false }).limit(3),
        admin.from("planipret_phone_messages").select("id", { count: "exact", head: true })
          .eq("user_id", u.user.id).eq("direction", "inbound").is("read_at", null),
      ]);
      appContext += `\nContexte courtier: ${profile.full_name ?? ""} (ext ${profile.extension ?? "?"}).
Hot leads récents: ${JSON.stringify(hot ?? [])}
Appels manqués récents: ${JSON.stringify(missed ?? [])}
SMS non lus: ${smsUnread ?? 0}`;
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ reply: "(Lovable AI non configuré)", suggestions: [] });

    const gateway = createLovableAiGatewayProvider(lovableKey);

    let system = isEn
      ? `You are AVA, the AI assistant for a Quebec mortgage broker (Planiprêt Mobile app).
 You have direct access to the broker's data: calls (planipret_phone_calls), SMS, voicemail, hot leads, reminders/tasks, Microsoft 365 calendar, Microsoft emails, Teams, Maestro pipeline.
 Connected integrations: ${integrations.join(" · ")}.
 IMPORTANT: when data is provided in [Context] below, use it to answer concretely. NEVER say you don't have integration or access — you can consult calls, SMS, emails, calendar and pipeline. If no data appears in the context for the question asked, simply say there is nothing to display for this period.
 Respond in English, concise and actionable. You can suggest up to 4 suggestions (kind: call/sms/email/reminder/maestro_action/ms365_action/open_voice/open_coach).
 For 'call' set payload.number. For 'sms' set payload.number and payload.message. For 'email' prefer ms365_action with payload.action='send_email'. For 'reminder' payload.title/due_at. For 'maestro_action' payload.action and payload.* required.
 For Microsoft use kind='ms365_action' and payload.action among: read_emails, read_email_detail, list_calendar_events, send_email, create_calendar_event, update_calendar_event, delete_calendar_event, send_teams_message, reply_teams_message, search_contact.
 DIRECTORY: when the user asks to send an email/SMS/call to a person by name, first look up their address in [Context] (section "Found Contacts" + "Microsoft Contact"). If you find a unique match, directly propose the ms365_action send_email action for confirmation. If multiple matches, list them and ask which one. If none, propose an ms365_action search_contact with payload.query = name.
 To create an appointment: payload.action='create_calendar_event' with subject, start:{dateTime,timeZone}, end:{dateTime,timeZone}, attendees (array of emails), isOnlineMeeting (default true = auto Teams link).
 To reschedule/modify: payload.action='update_calendar_event' with event_id + fields to change. Use list_calendar_events first.
 To cancel/delete: payload.action='delete_calendar_event' with event_id.
 Actions that send/modify require written user confirmation: propose a clear suggestion and ask the user to reply "Yes" or "Confirmed" to execute.
 IMPORTANT — After executing send_sms, if the response contains fallback:'open_sms_composer' or success:false, clearly tell the broker the SMS was NOT sent. Same for make_call: if fallback:'open_dialer', say the softphone is not registered. NEVER say "SMS sent" or "call started" when success:false.
Set openVoice=true only if the user explicitly asks to speak. Set openCoach=true if a multi-step coaching action would be useful.`
      : `Tu es AVA, l'assistante d'un courtier hypothécaire au Québec (application Planiprêt Mobile).
 Tu as accès en direct aux données du courtier: appels (planipret_phone_calls), SMS, messagerie vocale, leads chauds, rappels/tâches, calendrier Microsoft 365, courriels Microsoft, Teams, pipeline Maestro.
 Intégrations connectées: ${integrations.join(" · ")}.
 IMPORTANT: quand des données sont fournies dans [Contexte] ci-dessous, utilise-les pour répondre concrètement. Ne dis JAMAIS que tu n'as pas d'intégration ou d'accès — tu peux consulter appels, SMS, courriels, calendrier et pipeline. Si aucune donnée n'apparaît dans le contexte pour la question posée, dis simplement qu'il n'y a rien à afficher pour cette période.
 Réponds en français, court et actionnable. Tu peux proposer jusqu'à 4 suggestions (kind: call/sms/email/reminder/maestro_action/ms365_action/open_voice/open_coach).
 Pour 'call' mets payload.number. Pour 'sms' mets payload.number et payload.message. Pour 'email' préfère ms365_action avec payload.action='send_email'. Pour 'reminder' payload.title/due_at. Pour 'maestro_action' payload.action et payload.* requis.
 Pour Microsoft utilise kind='ms365_action' et payload.action parmi: read_emails, read_email_detail, list_calendar_events, send_email, create_calendar_event, update_calendar_event, delete_calendar_event, send_teams_message, reply_teams_message, search_contact.
 RÉPERTOIRE: quand l'utilisateur demande d'envoyer un courriel/SMS/appel à une personne par son nom, cherche d'abord son adresse dans [Contexte] (section "Contacts trouvés" + "Contact Microsoft"). Si tu trouves une correspondance unique, propose directement l'action ms365_action send_email pour confirmation. Si plusieurs correspondances, liste-les et demande laquelle. Si aucune, propose un ms365_action search_contact avec payload.query = nom.
 Pour créer un rendez-vous: payload.action='create_calendar_event' avec subject, start:{dateTime,timeZone}, end:{dateTime,timeZone}, attendees, isOnlineMeeting (défaut true).
 Pour reprogrammer/modifier: payload.action='update_calendar_event' avec event_id + champs à changer. Utilise d'abord list_calendar_events.
 Pour annuler/supprimer: payload.action='delete_calendar_event' avec event_id.
 Les actions qui envoient/modifient exigent une confirmation utilisateur écrite: propose une suggestion claire et demande « Oui » ou « Confirmé ».
 IMPORTANT — Après send_sms, si fallback:'open_sms_composer' ou success:false, dis que le SMS n'est PAS parti. Idem pour make_call: si fallback:'open_dialer', dis que le softphone n'est pas enregistré. Ne dis JAMAIS « SMS envoyé » ou « appel lancé » quand success:false.
Mets openVoice=true seulement si l'utilisateur demande explicitement de parler. Mets openCoach=true si une action de coaching multi-étapes serait utile.`;


    if (mode === "summarize") {
      if (isEn) {
        const len = level === "short" ? "1 sentence" : level === "detailed" ? "detailed summary + key points + next step" : "3 sentences + one recommended action";
        system = `You are AVA. Summarize the provided content in ${len}, professional English. Do not suggest actions unless relevant (max 2).`;
      } else {
        const len = level === "short" ? "1 phrase" : level === "detailed" ? "résumé détaillé + points clés + prochaine étape" : "3 phrases + une action recommandée";
        system = `Tu es AVA. Résume le contenu fourni en ${len}, en français, professionnel. Ne propose pas de suggestions sauf si pertinent (max 2).`;
      }
    }

    const prompt = [
      appContext && `[Contexte]\n${appContext}`,
      context && Object.keys(context).length ? `[Données]\n${JSON.stringify(context).slice(0, 4000)}` : "",
      history.length ? `[Historique]\n${history.map(h => `${h.role}: ${h.content}`).join("\n")}` : "",
      userMessage ? `[Demande]\n${userMessage}` : (mode === "recommend" ? "[Demande]\nDonne-moi 3 recommandations actionnables pour les prochaines heures." : ""),
    ].filter(Boolean).join("\n\n");

    let result: any = { reply: "", suggestions: [] };
    try {
      const r = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system,
        prompt,
        experimental_output: Output.object({ schema: OutputSchema }),
      });
      const out = (r as any).experimental_output ?? (r as any).output;
      result = OutputSchema.parse(out);
    } catch (e) {
      console.error("pp-ava-chat parse fail", e);
      // Fallback: plain text
      try {
        const r2 = await generateText({
          model: gateway("google/gemini-3-flash-preview"),
          system,
          prompt,
        });
        result = { reply: r2.text ?? "Désolé, je n'ai pas pu répondre.", suggestions: [] };
      } catch (e2) {
        return json({ reply: "Désolé, je rencontre un problème. Réessayez.", suggestions: [], error: String(e2) }, 200);
      }
    }

    // Persist chat to planipret_ava_conversations if we have a session
    let finalSessionId = sessionId;
    if (mode === "chat" && userMessage) {
      try {
        if (!finalSessionId) {
          const { data: s } = await admin.from("planipret_ava_chat_sessions")
            .insert({ user_id: u.user.id, title: userMessage.slice(0, 60) })
            .select("id").single();
          finalSessionId = s?.id ?? null;
        } else {
          await admin.from("planipret_ava_chat_sessions")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", finalSessionId).eq("user_id", u.user.id);
        }
        if (finalSessionId) {
          await admin.from("planipret_ava_conversations").insert([
            { user_id: u.user.id, session_id: finalSessionId, role: "user", message: userMessage },
            { user_id: u.user.id, session_id: finalSessionId, role: "assistant", message: result.reply, tool_calls: result.suggestions ?? [] },
          ]);
        }
      } catch (persistErr) {
        console.error("pp-ava-chat persist fail", persistErr);
      }
    }

    return json({ ...result, session_id: finalSessionId });
  } catch (e) {
    console.error("pp-ava-chat error", e);
    return json({ error: String(e) }, 500);
  }
});
