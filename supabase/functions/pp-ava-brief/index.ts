// pp-ava-brief: structured daily/weekly/monthly brief for the Planipret mobile home.
// Aggregates real broker data (calls, missed, sms, voicemails, leads, meetings, tasks)
// and asks Lovable AI Gateway for a French, actionable summary.
// Cached 30 min per (user, period) in `planipret_ai_insights`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateText } from "npm:ai";
import { z } from "npm:zod";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";
import { MS365_DELEGATED_SCOPES, refreshMicrosoftAccessToken } from "../_shared/ms365.ts";
import { getUserMaestroAccessToken } from "../_shared/maestro-oauth.ts";
import { commissionGet, summarize } from "../_shared/commission-reports.ts";

/**
 * Commissions in the daily brief are OPT-IN only.
 * `planipret_settings.preferences.ava_include_commissions` must be explicitly true.
 * Returns null when disabled, not connected, or on any error (never blocks the brief).
 */
async function buildCommissionStats(admin: any, authUserId: string, sinceIso: string) {
  try {
    const { data: settings } = await admin.from("planipret_settings")
      .select("preferences").eq("user_id", authUserId).maybeSingle();
    const prefs = (settings?.preferences ?? {}) as Record<string, unknown>;
    if (prefs.ava_include_commissions !== true) return null;

    const token = await getUserMaestroAccessToken(admin, authUserId);
    if (!token) return { enabled: true, connected: false };

    const qs = new URLSearchParams({
      commission_type: "base",
      date_from: sinceIso.slice(0, 10),
      date_to: new Date().toISOString().slice(0, 10),
      per_page: "200",
      page: "1",
      order_by: "date_trans",
      sort: "desc",
    });
    const r = await commissionGet(`/api/main/commissions/reports/deposits?${qs}`, token, `brief-${authUserId.slice(0, 8)}`);
    if (!r.ok) return { enabled: true, connected: true, error: true };
    const rows = Array.isArray(r.data?.data) ? r.data.data : [];
    const s = summarize(rows);
    return {
      enabled: true,
      connected: true,
      total_commission: s.total_commission,
      deposit_count: s.deposit_count,
      average_commission: s.average_commission,
      total_loan_volume: s.total_loan_volume,
      top_institutions: s.top_institutions.slice(0, 5),
    };
  } catch {
    return null;
  }
}


const GRAPH = "https://graph.microsoft.com/v1.0";

async function graphGet(admin: any, profile: any, path: string, retry = true): Promise<any[]> {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 7000);
    const r = await fetch(`${GRAPH}${path}`, {
      headers: { Authorization: `Bearer ${profile.ms365_access_token}` },
      signal: ctl.signal,
    }).finally(() => clearTimeout(to));
    if (r.status === 401 && retry) {
      const t = await refreshMicrosoftAccessToken(admin, profile, MS365_DELEGATED_SCOPES);
      if (t) { profile.ms365_access_token = t; return graphGet(admin, profile, path, false); }
      return [];
    }
    if (!r.ok) return [];
    const d = await r.json().catch(() => ({}));
    return d?.value ?? [];
  } catch (_e) {
    return [];
  }
}

async function buildMicrosoftStats(admin: any, profile: any, sinceIso: string) {
  if (!profile?.ms365_access_token) return { connected: false };
  const nowIso = new Date().toISOString();
  const futureIso = new Date(Date.now() + 7 * 86400_000).toISOString();

  const [received, sent, unread, flagged, pastEvents, upcoming, todos] = await Promise.all([
    graphGet(admin, profile, `/me/messages?$filter=receivedDateTime ge ${sinceIso}&$select=receivedDateTime,from,subject,isRead,bodyPreview&$top=100`),
    graphGet(admin, profile, `/me/mailFolders/sentitems/messages?$filter=sentDateTime ge ${sinceIso}&$select=sentDateTime,toRecipients,subject&$top=100`),
    graphGet(admin, profile, `/me/messages?$filter=isRead eq false&$select=receivedDateTime,from,subject,bodyPreview&$orderby=receivedDateTime desc&$top=15`),
    graphGet(admin, profile, `/me/messages?$filter=flag/flagStatus eq 'flagged'&$select=receivedDateTime,from,subject&$top=10`),
    graphGet(admin, profile, `/me/events?$filter=start/dateTime ge '${sinceIso}' and start/dateTime le '${nowIso}'&$select=subject,start,end,attendees,isOnlineMeeting&$top=50`),
    graphGet(admin, profile, `/me/events?$filter=start/dateTime ge '${nowIso}' and start/dateTime le '${futureIso}'&$select=subject,start,end,attendees,isOnlineMeeting,location&$orderby=start/dateTime&$top=15`),
    graphGet(admin, profile, `/me/todo/lists`),
  ]);

  let tasks: any[] = [];
  const firstList = todos?.[0]?.id;
  if (firstList) {
    const t = await graphGet(admin, profile, `/me/todo/lists/${firstList}/tasks?$filter=status ne 'completed'&$top=15`);
    tasks = t.map((x: any) => ({ title: x.title, due: x.dueDateTime?.dateTime ?? null, importance: x.importance }));
  }

  const senderTally = new Map<string, { name?: string; address?: string; count: number }>();
  for (const m of received) {
    const a = m?.from?.emailAddress;
    const key = (a?.address || a?.name || "").toLowerCase();
    if (!key) continue;
    const e = senderTally.get(key) ?? { name: a?.name, address: a?.address, count: 0 };
    e.count++; senderTally.set(key, e);
  }

  const meetingMinutes = pastEvents.reduce((acc: number, e: any) => {
    const s = e?.start?.dateTime ? new Date(e.start.dateTime).getTime() : 0;
    const en = e?.end?.dateTime ? new Date(e.end.dateTime).getTime() : 0;
    return acc + (s && en && en > s ? Math.round((en - s) / 60000) : 0);
  }, 0);

  return {
    connected: true,
    mailbox: profile.ms365_email ?? null,
    emails_received: received.length,
    emails_sent: sent.length,
    emails_unread: unread.length,
    emails_flagged: flagged.length,
    unread_recent: unread.slice(0, 8).map((m: any) => ({
      from: m?.from?.emailAddress?.name || m?.from?.emailAddress?.address,
      subject: m.subject,
      received_at: m.receivedDateTime,
      preview: (m.bodyPreview || "").slice(0, 180),
    })),
    flagged_recent: flagged.slice(0, 5).map((m: any) => ({
      from: m?.from?.emailAddress?.name || m?.from?.emailAddress?.address,
      subject: m.subject,
      received_at: m.receivedDateTime,
    })),
    top_senders: [...senderTally.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    meetings_held: pastEvents.length,
    meeting_minutes: meetingMinutes,
    upcoming_meetings: upcoming.slice(0, 8).map((e: any) => ({
      subject: e.subject,
      start: e?.start?.dateTime ?? null,
      end: e?.end?.dateTime ?? null,
      online: !!e.isOnlineMeeting,
      location: e?.location?.displayName ?? null,
      attendees: (e.attendees ?? []).slice(0, 5).map((a: any) => a?.emailAddress?.name || a?.emailAddress?.address),
    })),
    tasks_open: tasks,
  };
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const stripNulls = (v: any): any =>
  Array.isArray(v) ? v.map(stripNulls)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, stripNulls(x)]))
      : v;

const BriefSchema = z.preprocess(stripNulls, z.object({
  headline: z.string(),
  overview: z.string().optional(),
  priorities: z.array(z.string()).optional().default([]),
  risks: z.array(z.string()).optional().default([]),
  highlights: z.array(z.string()).optional().default([]),
  metrics: z.array(z.object({ label: z.string(), value: z.coerce.string() })).optional().default([]),
  tips: z.array(z.object({ title: z.string(), detail: z.string() })).optional().default([]),
  focus: z.string().optional(),
  suggestions: z.array(z.object({
    label: z.string(),
    kind: z.string().optional(),
    number: z.coerce.string().optional(),
  })).optional().default([]),
}).passthrough()) as any;

type Period = "day" | "week" | "month" | "shift";
type Lang = "fr" | "en";

const plural = (n: number, s: string) => (n > 1 ? `${s}s` : s);

function buildFallbackBrief(stats: any, period: Period, lang: Lang) {
  const fr = lang === "fr";
  const periodLabel = fr
    ? (period === "day" ? "aujourd’hui" : period === "week" ? "cette semaine" : period === "month" ? "ce mois-ci" : "ce quart")
    : (period === "day" ? "today" : period === "week" ? "this week" : period === "month" ? "this month" : "this shift");

  const priorities = [
    stats.missed_recent?.[0]
      ? (fr ? `Rappeler ${stats.missed_recent[0].from_name || stats.missed_recent[0].from_number || "l’appel manqué"}`
            : `Call back ${stats.missed_recent[0].from_name || stats.missed_recent[0].from_number || "the missed call"}`)
      : null,
    stats.tasks_pending?.[0]
      ? (fr ? `Compléter: ${stats.tasks_pending[0].note || stats.tasks_pending[0].contact_name || "rappel client"}`
            : `Complete: ${stats.tasks_pending[0].note || stats.tasks_pending[0].contact_name || "client follow-up"}`)
      : null,
    stats.hot_leads?.[0]
      ? (fr ? `Relancer ${stats.hot_leads[0].from_name || stats.hot_leads[0].from_number || "le lead chaud"}`
            : `Follow up with ${stats.hot_leads[0].from_name || stats.hot_leads[0].from_number || "the hot lead"}`)
      : null,
    stats.meetings?.[0]
      ? (fr ? `Préparer le rendez-vous ${stats.meetings[0].title || stats.meetings[0].attendee_name || "à venir"}`
            : `Prepare the meeting ${stats.meetings[0].title || stats.meetings[0].attendee_name || "coming up"}`)
      : null,
  ].filter(Boolean).slice(0, 5) as string[];

  const risks = [
    stats.missed_count > 0
      ? (fr ? `${stats.missed_count} ${plural(stats.missed_count, "appel")} ${plural(stats.missed_count, "manqué")}`
            : `${stats.missed_count} missed ${plural(stats.missed_count, "call")}`)
      : null,
    stats.sms_unread > 0
      ? (fr ? `${stats.sms_unread} ${plural(stats.sms_unread, "texto")} non ${plural(stats.sms_unread, "lu")}`
            : `${stats.sms_unread} unread ${plural(stats.sms_unread, "text")}`)
      : null,
    stats.voicemails_unread > 0
      ? (fr ? `${stats.voicemails_unread} ${plural(stats.voicemails_unread, "boîte")} ${plural(stats.voicemails_unread, "vocale")} à traiter`
            : `${stats.voicemails_unread} ${plural(stats.voicemails_unread, "voicemail")} to handle`)
      : null,
  ].filter(Boolean).slice(0, 3) as string[];

  const suggestions = [
    stats.missed_recent?.[0]?.from_number
      ? { label: fr ? "Rappeler l’appel manqué" : "Call back the missed call", kind: "call", number: stats.missed_recent[0].from_number }
      : null,
    stats.hot_leads?.[0]?.from_number
      ? { label: fr ? "Texter le lead chaud" : "Text the hot lead", kind: "sms", number: stats.hot_leads[0].from_number }
      : null,
  ].filter(Boolean).slice(0, 3);

  const metrics = fr
    ? [
        { label: "Appels", value: `${stats.calls_total} (${stats.calls_inbound} entrants · ${stats.calls_outbound} sortants)` },
        { label: "Répondus / manqués", value: `${stats.calls_answered} / ${stats.missed_count}` },
        { label: "Temps au téléphone", value: `${stats.talk_minutes} min` },
        { label: "Durée moyenne", value: `${stats.avg_call_seconds} s` },
        { label: "Textos", value: `${stats.sms_total} (${stats.sms_received} reçus · ${stats.sms_sent} envoyés)` },
        { label: "Non lus", value: `${stats.sms_unread} textos · ${stats.voicemails_unread} messages vocaux` },
        { label: "Leads chauds", value: `${stats.hot_leads?.length ?? 0}` },
        { label: "Rendez-vous", value: `${stats.meetings?.length ?? 0}` },
        ...(stats.microsoft?.connected ? [
          { label: "Courriels (Microsoft 365)", value: `${stats.microsoft.emails_received} reçus · ${stats.microsoft.emails_sent} envoyés` },
          { label: "Courriels non lus", value: `${stats.microsoft.emails_unread}` },
          { label: "Réunions Outlook", value: `${stats.microsoft.meetings_held} (${stats.microsoft.meeting_minutes} min)` },
          { label: "Réunions à venir", value: `${stats.microsoft.upcoming_meetings?.length ?? 0}` },
        ] : []),
      ]
    : [
        { label: "Calls", value: `${stats.calls_total} (${stats.calls_inbound} inbound · ${stats.calls_outbound} outbound)` },
        { label: "Answered / missed", value: `${stats.calls_answered} / ${stats.missed_count}` },
        { label: "Talk time", value: `${stats.talk_minutes} min` },
        { label: "Average duration", value: `${stats.avg_call_seconds} s` },
        { label: "Texts", value: `${stats.sms_total} (${stats.sms_received} received · ${stats.sms_sent} sent)` },
        { label: "Unread", value: `${stats.sms_unread} texts · ${stats.voicemails_unread} voicemails` },
        { label: "Hot leads", value: `${stats.hot_leads?.length ?? 0}` },
        { label: "Meetings", value: `${stats.meetings?.length ?? 0}` },
        ...(stats.microsoft?.connected ? [
          { label: "Emails (Microsoft 365)", value: `${stats.microsoft.emails_received} received · ${stats.microsoft.emails_sent} sent` },
          { label: "Unread emails", value: `${stats.microsoft.emails_unread}` },
          { label: "Outlook meetings", value: `${stats.microsoft.meetings_held} (${stats.microsoft.meeting_minutes} min)` },
          { label: "Upcoming meetings", value: `${stats.microsoft.upcoming_meetings?.length ?? 0}` },
        ] : []),
      ];

  const parts = fr
    ? [
        `${stats.calls_total} ${plural(stats.calls_total, "appel")} (${stats.calls_answered} répondus, ${stats.missed_count} manqués)`,
        `${stats.talk_minutes} min au téléphone`,
        `${stats.sms_total} ${plural(stats.sms_total, "texto")}`,
        `${stats.hot_leads.length} ${plural(stats.hot_leads.length, "lead")} ${plural(stats.hot_leads.length, "chaud")}`,
        `${stats.meetings.length} ${stats.meetings.length > 1 ? "rendez-vous" : "rendez-vous"}`,
      ]
    : [
        `${stats.calls_total} ${plural(stats.calls_total, "call")} (${stats.calls_answered} answered, ${stats.missed_count} missed)`,
        `${stats.talk_minutes} min on the phone`,
        `${stats.sms_total} ${plural(stats.sms_total, "text")}`,
        `${stats.hot_leads.length} hot ${plural(stats.hot_leads.length, "lead")}`,
        `${stats.meetings.length} ${plural(stats.meetings.length, "meeting")}`,
      ];

  return {
    headline: `${periodLabel}: ${parts.join(" · ")}.`,
    overview: fr
      ? `Résumé ${periodLabel} — ${parts.join(", ")}. Durée moyenne des appels: ${stats.avg_call_seconds} s.`
      : `Summary for ${periodLabel} — ${parts.join(", ")}. Average call duration: ${stats.avg_call_seconds} s.`,
    priorities: priorities.length
      ? priorities
      : [fr ? "Aucune urgence détectée — garder le suivi client à jour." : "No urgent item detected — keep client follow-ups up to date."],
    risks,
    highlights: (stats.top_contacts ?? []).slice(0, 3).map((c: any) =>
      fr
        ? `${c.name || c.number}: ${c.calls} ${plural(c.calls, "appel")}, ${c.sms} ${plural(c.sms, "texto")}`
        : `${c.name || c.number}: ${c.calls} ${plural(c.calls, "call")}, ${c.sms} ${plural(c.sms, "text")}`,
    ),
    metrics,
    suggestions,
  };

}


function periodRange(period: Period): { since: Date; until: Date; label: string } {
  const now = new Date();
  const until = new Date(now);
  let since = new Date(now);
  if (period === "day") { since.setHours(0,0,0,0); }
  else if (period === "week") { since.setDate(since.getDate() - 7); }
  else if (period === "month") { since.setMonth(since.getMonth() - 1); }
  else if (period === "shift") { since.setHours(Math.max(0, now.getHours() - 4), 0, 0, 0); }
  return { since, until, label: period };
}

/** Valid, renderable brief used whenever something upstream fails (never a non-2xx for the app). */
function degradedBrief(lang: Lang, reason: string) {
  const fr = lang !== "en";
  return {
    headline: fr
      ? "Brief indisponible pour le moment — données partielles."
      : "Brief temporarily unavailable — partial data.",
    overview: fr
      ? "AVA n'a pas pu récupérer toutes les données (téléphonie, Microsoft 365 ou Maestro). Les indicateurs s'actualiseront automatiquement au prochain rafraîchissement."
      : "AVA could not retrieve all data (telephony, Microsoft 365 or Maestro). Metrics will refresh automatically on the next reload.",
    priorities: [], risks: [], highlights: [], metrics: [], tips: [], suggestions: [],
    stats: null,
    language: fr ? "fr" : "en",
    degraded: true,
    degraded_reason: reason,
    cached: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let requestedLang: Lang | null = null;
  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) return json(degradedBrief("fr", "unauthorized"), 401);
    const body = await req.json().catch(() => ({}));
    const period: Period = (["day","week","month","shift"].includes(body?.period) ? body.period : "day") as Period;
    const force = !!body?.force;
    requestedLang =
      body?.language === "en" || body?.language === "fr" ? body.language : null;


    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Mode service (cron scheduler) : accepte broker_user_id via header/body si appelé avec service_role.
    const serviceHeader = req.headers.get("x-ava-service");
    let effectiveUserId: string | null = null;
    if (serviceHeader) {
      effectiveUserId = req.headers.get("x-broker-user-id") ?? body?.broker_user_id ?? null;
    } else {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: u } = await sb.auth.getUser(token);
      if (!u?.user) return json(degradedBrief(requestedLang ?? "fr", "unauthorized"), 401);
      effectiveUserId = u.user.id;
    }
    if (!effectiveUserId) return json(degradedBrief(requestedLang ?? "fr", "no_user"));

    const { data: profile } = await admin.from("planipret_profiles")
      .select("id, user_id, full_name, extension, ns_extension, organization_id, language, ms365_access_token, ms365_refresh_token, ms365_email")
      .eq("user_id", effectiveUserId).maybeSingle();
    if (!profile) return json(degradedBrief(requestedLang ?? "fr", "no_profile"));

    // Language: explicit request wins (mobile app sends the active UI language),
    // otherwise fall back to the broker profile (used by the 08:30 / 17:30 schedulers).
    const lang: Lang = requestedLang ?? ((profile as any).language === "en" ? "en" : "fr");
    if (requestedLang && (profile as any).language !== requestedLang) {
      admin.from("planipret_profiles").update({ language: requestedLang }).eq("id", profile.id)
        .then(() => {}, () => {});
    }


    // Caching is handled by React Query on the client; force flag is accepted for future use.
    void force;

    const { since, until } = periodRange(period);
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();

    // Telephony rows are keyed either by the profile id or the auth user id
    // depending on the ingestion path — match both.
    const ids = Array.from(new Set([profile.id, profile.user_id, effectiveUserId].filter(Boolean))) as string[];

    const ext = (profile.ns_extension || profile.extension || "").trim();
    const callScope = [
      ids.length ? `user_id.in.(${ids.join(",")})` : null,
      ext ? `extension.eq.${ext}` : null,
    ].filter(Boolean).join(",");

    // Each query is isolated: a single failing table can never break the brief.
    const safeQ = async (q: any) => {
      try {
        const r = await q;
        return { data: r?.data ?? [], error: r?.error ?? null };
      } catch (e) {
        console.error("pp-ava-brief query failed:", (e as Error)?.message);
        return { data: [], error: e };
      }
    };
    const [callRows, smsRows, voicemails, meetings, tasks] = await Promise.all([
      safeQ(admin.from("planipret_phone_calls")
        .select("id, direction, status, from_number, from_name, to_number, to_name, started_at, duration_seconds, lead_score, lead_temperature, ai_summary, ai_coaching")
        .or(callScope).gte("started_at", sinceIso).lte("started_at", untilIso)
        .order("started_at", { ascending: false }).limit(500)),
      safeQ(admin.from("planipret_phone_messages")
        .select("id, direction, from_number, to_number, body, read_at, created_at")
        .in("user_id", ids).gte("created_at", sinceIso).lte("created_at", untilIso)
        .order("created_at", { ascending: false }).limit(300)),
      safeQ(admin.from("planipret_voicemails").select("id, from_number, from_name, received_at, is_read, transcript")
        .in("user_id", ids).eq("folder", "inbox").order("received_at", { ascending: false }).limit(20)),
      safeQ(admin.from("appointments").select("title, start_time, attendee_name")
        .eq("host_user_id", effectiveUserId).gte("start_time", sinceIso).lte("start_time", until.toISOString())
        .order("start_time", { ascending: true }).limit(10)),
      safeQ(admin.from("planipret_reminders").select("note, contact_name, contact_number, scheduled_at")
        .in("user_id", ids).eq("status", "pending")
        .order("scheduled_at", { ascending: true }).limit(10)),
    ]);

    const allCalls = callRows.data || [];

    const isMissed = (c: any) =>
      c.status === "missed" || c.status === "no-answer" || c.status === "cancelled" ||
      (c.direction === "inbound" && !c.duration_seconds);
    const missedCalls = allCalls.filter(isMissed);
    const answered = allCalls.filter((c) => !isMissed(c));
    const inbound = allCalls.filter((c) => c.direction === "inbound");
    const outbound = allCalls.filter((c) => c.direction === "outbound");
    const talkSeconds = allCalls.reduce((a, c) => a + (c.duration_seconds || 0), 0);
    const msgs = smsRows.data || [];
    const smsIn = msgs.filter((m) => m.direction === "inbound");
    const smsOut = msgs.filter((m) => m.direction === "outbound");
    const vms = voicemails.data || [];

    // Contacts les plus actifs (appels + textos)
    const tally = new Map<string, { number: string; name?: string; calls: number; sms: number }>();
    for (const c of allCalls) {
      const n = (c.direction === "outbound" ? c.to_number : c.from_number) || "";
      if (!n) continue;
      const e = tally.get(n) ?? { number: n, name: c.from_name || c.to_name || undefined, calls: 0, sms: 0 };
      e.calls++; e.name = e.name || c.from_name || c.to_name || undefined; tally.set(n, e);
    }
    for (const m of msgs) {
      const n = (m.direction === "outbound" ? m.to_number : m.from_number) || "";
      if (!n) continue;
      const e = tally.get(n) ?? { number: n, calls: 0, sms: 0 };
      e.sms++; tally.set(n, e);
    }
    const top_contacts = [...tally.values()]
      .sort((a, b) => (b.calls + b.sms) - (a.calls + a.sms)).slice(0, 5);

    const hotLeads = allCalls
      .filter((c) => (c.lead_score ?? 0) >= 7 || c.lead_temperature === "hot")
      .sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0))
      .slice(0, 8)
      .map((c) => ({
        from_number: c.from_number || c.to_number,
        from_name: c.from_name || c.to_name,
        lead_score: c.lead_score,
        lead_temperature: c.lead_temperature,
        started_at: c.started_at,
        ai_summary: (c.ai_summary || "").slice(0, 300),
      }));

    const coachingScores = allCalls
      .map((c: any) => Number(c.ai_coaching?.score ?? c.ai_coaching?.coaching_score))
      .filter((n) => Number.isFinite(n));

    const stats = {
      period,
      calls_total: allCalls.length,
      calls_inbound: inbound.length,
      calls_outbound: outbound.length,
      calls_answered: answered.length,
      missed_count: missedCalls.length,
      missed_recent: missedCalls.slice(0, 5).map((c) => ({
        from_number: c.from_number, from_name: c.from_name, started_at: c.started_at,
      })),
      talk_minutes: Math.round(talkSeconds / 60),
      avg_call_seconds: answered.length ? Math.round(talkSeconds / answered.length) : 0,
      sms_total: msgs.length,
      sms_received: smsIn.length,
      sms_sent: smsOut.length,
      sms_unread: smsIn.filter((m) => !m.read_at).length,
      voicemails_unread: vms.filter((v) => !v.is_read).length,
      voicemails_recent: vms.slice(0, 5).map((v) => ({
        from_number: v.from_number, from_name: v.from_name, received_at: v.received_at,
        transcript: (v.transcript || "").slice(0, 200),
      })),
      avg_coaching_score: coachingScores.length
        ? Math.round((coachingScores.reduce((a, b) => a + b, 0) / coachingScores.length) * 10) / 10
        : null,
      top_contacts,
      recent_summaries: allCalls.filter((c) => c.ai_summary).slice(0, 5)
        .map((c) => ({ contact: c.from_name || c.from_number, summary: (c.ai_summary || "").slice(0, 300) })),
      hot_leads: hotLeads,
      meetings: meetings.data || [],
      tasks_pending: tasks.data || [],
      microsoft: await Promise.race([
        buildMicrosoftStats(admin, profile, sinceIso).catch(() => ({ connected: false })),
        new Promise((res) => setTimeout(() => res({ connected: false, timeout: true }), 15000)),
      ]),
      // Opt-in only (planipret_settings.preferences.ava_include_commissions === true)
      commissions: await buildCommissionStats(admin, effectiveUserId ?? profile.user_id, sinceIso),
    };


    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      const fallback = buildFallbackBrief(stats, period, lang);
      return json({ ...fallback, stats, language: lang, cached: false, degraded: true });
    }

    const gateway = createLovableAiGatewayProvider(lovableKey);
    const periodLabelFr = period === "day" ? "la journée" : period === "week" ? "la semaine" : period === "month" ? "le mois" : "votre quart";
    const periodLabelEn = period === "day" ? "today" : period === "week" ? "this week" : period === "month" ? "this month" : "this shift";

    const system = lang === "fr"
      ? `Tu es AVA, l'assistante d'un courtier hypothécaire au Québec. Tu reçois les statistiques réelles du courtier ${profile.full_name ?? ""} pour ${periodLabelFr}.
Génère un brief COURT, professionnel et actionnable, ENTIÈREMENT en français du Québec (aucun mot en anglais). Sois concis : le courtier lit ça en 15 secondes sur son téléphone.
Couvre la téléphonie (appels, textos, boîtes vocales, leads) ET Microsoft 365 (courriels non lus, réunions, tâches) seulement si les chiffres le justifient.
- headline: 1 phrase courte (max 20 mots) avec les 2-3 chiffres clés.
- overview: 2 à 3 phrases MAXIMUM. Pas de paragraphe.
- metrics: 4 à 6 indicateurs { label, value } tirés des chiffres exacts.
- highlights: max 3 faits saillants très courts.
- priorities: exactement 3 actions concrètes, max 10 mots chacune, en nommant la personne ou le sujet.
- risks: max 2 risques, max 8 mots chacun.
- tips: 2 conseils { title, detail } — chaque "detail" = 1 seule phrase.
- focus: 1 phrase courte, chiffrée et mesurable.
- suggestions: jusqu'à 3 actions cliquables (call/sms/email/reminder) avec un numéro si pertinent.`
      : `You are AVA, the assistant of a mortgage broker in Quebec. You receive the real statistics of broker ${profile.full_name ?? ""} for ${periodLabelEn}.
Generate a SHORT, professional and actionable brief, ENTIRELY in English (no French words at all). Be concise: the broker reads this in 15 seconds on a phone.
Cover telephony (calls, texts, voicemails, leads) AND Microsoft 365 (unread emails, meetings, tasks) only when the numbers justify it.
- headline: 1 short sentence (max 20 words) with the 2-3 key numbers.
- overview: 2 to 3 sentences MAXIMUM. No paragraph.
- metrics: 4 to 6 indicators { label, value } from the exact numbers.
- highlights: max 3 very short highlights.
- priorities: exactly 3 concrete actions, max 10 words each, naming the person or subject.
- risks: max 2 risks, max 8 words each.
- tips: 2 coaching tips { title, detail } — each "detail" = a single sentence.
- focus: 1 short, measurable sentence.
- suggestions: up to 3 clickable actions (call/sms/email/reminder) with a number when relevant.`;

    const userPrompt = lang === "fr"
      ? `Statistiques réelles (JSON):\n${JSON.stringify(stats).slice(0, 24000)}\n\nUtilise ces chiffres exacts (appels, manqués, minutes, textos, boîtes vocales, leads chauds, rendez-vous, contacts actifs) ET les données Microsoft 365 du champ "microsoft" (courriels, non lus, expéditeurs, réunions Outlook à venir, tâches To Do). N'invente rien. Réponds uniquement en français du Québec : chaque champ (headline, overview, metrics.label, highlights, priorities, risks, tips.title, tips.detail, focus, suggestions.label) doit être rédigé en français, sans aucun mot anglais.`
      : `Real statistics (JSON):\n${JSON.stringify(stats).slice(0, 24000)}\n\nUse these exact numbers (calls, missed, minutes, texts, voicemails, hot leads, meetings, active contacts) AND the Microsoft 365 data in the "microsoft" field (emails, unread, senders, upcoming Outlook meetings, To Do tasks). Do not invent anything. Answer strictly in English: every field (headline, overview, metrics.label, highlights, priorities, risks, tips.title, tips.detail, focus, suggestions.label) must be written in English, with no French words.`;

    const commissionNote = (stats as any).commissions
      ? (lang === "fr"
        ? `\n\nLe courtier a activé l'inclusion des commissions : utilise stats.commissions (total, nombre de dépôts, moyenne, volume de prêts, top institutions) dans UNE seule courte phrase de l'overview et un indicateur metrics. Ne divulgue aucun nom de client.`
        : `\n\nThe broker enabled commission inclusion: use stats.commissions (total, deposit count, average, loan volume, top lenders) in one overview sentence and one metric. Never disclose client names.`)
      : (lang === "fr" ? `\n\nN'évoque JAMAIS les commissions ou revenus : la préférence est désactivée.` : `\n\nNEVER mention commissions or revenue: the preference is disabled.`);

    let result: any;
    try {
      const r = await generateText({
        model: gateway("google/gemini-2.5-flash"),
        system: `${system}\n\nRéponds UNIQUEMENT avec un objet JSON valide (pas de texte autour, pas de balises markdown) respectant exactement ces clés: headline (string), overview (string), priorities (string[]), risks (string[]), highlights (string[]), metrics ({label,value}[]), tips ({title,detail}[]), focus (string), suggestions ({label,kind,number}[]).`,
        prompt: userPrompt + commissionNote,
      });
      let out: any = (r as any).text;
      if (typeof out === "string") {
        const cleaned = out.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        out = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
      }
      result = BriefSchema.parse(out);
      // Hard caps: keep the mobile brief skimmable even if the model overshoots.
      result.priorities = (result.priorities ?? []).slice(0, 3);
      result.risks = (result.risks ?? []).slice(0, 2);
      result.highlights = (result.highlights ?? []).slice(0, 3);
      result.metrics = (result.metrics ?? []).slice(0, 6);
      result.tips = (result.tips ?? []).slice(0, 2);
      result.suggestions = (result.suggestions ?? [])
        .filter((x: any) => ["call", "sms", "email", "reminder"].includes(x.kind)).slice(0, 3);
      if (typeof result.overview === "string") {
        const sentences = result.overview.split(/(?<=[.!?])\s+/).slice(0, 3);
        result.overview = sentences.join(" ").trim();
      }
      const fb = buildFallbackBrief(stats, period, lang);
      if (!result.metrics?.length) result.metrics = fb.metrics;
      if (!result.overview) result.overview = fb.overview;
    } catch (e) {
      const msg = (e as any)?.message ?? String(e);
      console.error("pp-ava-brief AI failed:", msg);
      result = { ...buildFallbackBrief(stats, period, lang), ai_error: String(msg).slice(0, 300) };
    }


    return json({ ...result, stats, language: lang, cached: false });

  } catch (e) {
    console.error("pp-ava-brief error", e);
    // Never surface a non-2xx to the mobile app: return a degraded but valid brief.
    return json(degradedBrief(requestedLang ?? "fr", String(e).slice(0, 300)));
  }
});
