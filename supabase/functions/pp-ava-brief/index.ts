// pp-ava-brief: structured daily/weekly/monthly brief for the Planipret mobile home.
// Aggregates real broker data (calls, missed, sms, voicemails, leads, meetings, tasks)
// and asks Lovable AI Gateway for a French, actionable summary.
// Cached 30 min per (user, period) in `planipret_ai_insights`.
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

const BriefSchema = z.object({
  headline: z.string(),
  overview: z.string().optional(),
  priorities: z.array(z.string()).max(5),
  risks: z.array(z.string()).max(3),
  highlights: z.array(z.string()).max(5).optional(),
  metrics: z.array(z.object({ label: z.string(), value: z.string() })).max(8).optional(),
  tips: z.array(z.object({ title: z.string(), detail: z.string() })).max(5).optional(),
  focus: z.string().optional(),
  suggestions: z.array(z.object({
    label: z.string(),
    kind: z.enum(["call", "sms", "email", "reminder"]),
    number: z.string().optional(),
  })).max(3),
});

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const period: Period = (["day","week","month","shift"].includes(body?.period) ? body.period : "day") as Period;
    const force = !!body?.force;
    const requestedLang: Lang | null =
      body?.language === "en" || body?.language === "fr" ? body.language : null;


    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Mode service (cron scheduler) : accepte broker_user_id via header/body si appelé avec service_role.
    const serviceHeader = req.headers.get("x-ava-service");
    let effectiveUserId: string | null = null;
    if (serviceHeader) {
      effectiveUserId = req.headers.get("x-broker-user-id") ?? body?.broker_user_id ?? null;
    } else {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: u } = await sb.auth.getUser();
      if (!u?.user) return json({ error: "unauthorized" }, 401);
      effectiveUserId = u.user.id;
    }
    if (!effectiveUserId) return json({ error: "no_user" }, 400);

    const { data: profile } = await admin.from("planipret_profiles")
      .select("id, user_id, full_name, extension, organization_id, language")
      .eq("user_id", effectiveUserId).maybeSingle();
    if (!profile) return json({ error: "no_profile" }, 404);

    // Language: explicit request wins (mobile app sends the active UI language),
    // otherwise fall back to the broker profile (used by the 08:30 / 17:30 schedulers).
    const lang: Lang = requestedLang ?? ((profile as any).language === "en" ? "en" : "fr");


    // Caching is handled by React Query on the client; force flag is accepted for future use.
    void force;

    const { since, until } = periodRange(period);
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();

    // Telephony rows are keyed either by the profile id or the auth user id
    // depending on the ingestion path — match both.
    const ids = Array.from(new Set([profile.id, profile.user_id, effectiveUserId].filter(Boolean))) as string[];

    const [callRows, smsRows, voicemails, meetings, tasks] = await Promise.all([
      admin.from("planipret_phone_calls")
        .select("id, direction, status, from_number, from_name, to_number, to_name, started_at, duration_seconds, lead_score, lead_temperature, ai_summary, ai_coaching")
        .in("user_id", ids).gte("started_at", sinceIso).lte("started_at", untilIso)
        .order("started_at", { ascending: false }).limit(500),
      admin.from("planipret_phone_messages")
        .select("id, direction, from_number, to_number, body, read_at, created_at")
        .in("user_id", ids).gte("created_at", sinceIso).lte("created_at", untilIso)
        .order("created_at", { ascending: false }).limit(300),
      admin.from("planipret_voicemails").select("id, from_number, from_name, received_at, is_read, transcript")
        .in("user_id", ids).eq("folder", "inbox").order("received_at", { ascending: false }).limit(20),
      admin.from("appointments").select("title, start_time, attendee_name")
        .eq("host_user_id", effectiveUserId).gte("start_time", sinceIso).lte("start_time", until.toISOString())
        .order("start_time", { ascending: true }).limit(10),
      admin.from("planipret_reminders").select("note, contact_name, contact_number, scheduled_at")
        .in("user_id", ids).eq("status", "pending")
        .order("scheduled_at", { ascending: true }).limit(10),
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
Génère un brief DÉTAILLÉ, professionnel et actionnable, ENTIÈREMENT en français du Québec (aucun mot en anglais).
- headline: 1 phrase percutante citant les chiffres clés réels (appels, manqués, minutes, textos, leads chauds, rendez-vous).
- overview: 3 à 5 phrases qui analysent la performance: volume d'appels entrants vs sortants, taux de réponse, durée moyenne, activité texto, messages vocaux en attente, tendance et qualité des conversations (résumés IA, score de coaching).
- metrics: 5 à 8 indicateurs { label, value } tirés des chiffres exacts (appels, répondus/manqués, temps au téléphone, durée moyenne, textos, non lus, leads chauds, rendez-vous, score de coaching).
- highlights: jusqu'à 5 faits saillants nommant les vrais contacts/clients les plus actifs et ce qui s'est passé.
- priorities: 3 actions concrètes ordonnées par urgence (max 12 mots chacune), en nommant la personne ou le numéro.
- risks: jusqu'à 3 risques ou points d'attention.
- tips: 3 à 5 conseils de coaching { title, detail } — chaque "detail" = 1 à 2 phrases concrètes basées sur les chiffres (relances, plages horaires les plus productives, durée des appels, suivi des leads chauds, textos non lus, boîtes vocales).
- focus: 1 phrase « objectif du jour » chiffré et mesurable.
- suggestions: jusqu'à 3 actions cliquables (call/sms/email/reminder) avec si pertinent un numéro extrait des données.`
      : `You are AVA, the assistant of a mortgage broker in Quebec. You receive the real statistics of broker ${profile.full_name ?? ""} for ${periodLabelEn}.
Generate a DETAILED, professional and actionable brief, ENTIRELY in English (no French words at all).
- headline: 1 punchy sentence quoting the real key numbers (calls, missed, minutes, texts, hot leads, meetings).
- overview: 3 to 5 sentences analysing performance: inbound vs outbound volume, answer rate, average duration, texting activity, pending voicemails, trend and conversation quality (AI summaries, coaching score).
- metrics: 5 to 8 indicators { label, value } from the exact numbers (calls, answered/missed, talk time, average duration, texts, unread, hot leads, meetings, coaching score).
- highlights: up to 5 highlights naming the real most active contacts/clients and what happened.
- priorities: 3 concrete actions ordered by urgency (max 12 words each), naming the person or number.
- risks: up to 3 risks or watch-outs.
- tips: 3 to 5 coaching tips { title, detail } — each "detail" = 1 to 2 concrete sentences based on the numbers (follow-ups, most productive time slots, call duration, hot-lead nurturing, unread texts, voicemails).
- focus: 1 measurable "goal of the day" sentence with a number.
- suggestions: up to 3 clickable actions (call/sms/email/reminder) with a number extracted from the data when relevant.`;

    const userPrompt = lang === "fr"
      ? `Statistiques réelles (JSON):\n${JSON.stringify(stats).slice(0, 12000)}\n\nUtilise ces chiffres exacts (appels, manqués, minutes, textos, boîtes vocales, leads chauds, rendez-vous, contacts actifs). N'invente rien. Réponds uniquement en français.`
      : `Real statistics (JSON):\n${JSON.stringify(stats).slice(0, 12000)}\n\nUse these exact numbers (calls, missed, minutes, texts, voicemails, hot leads, meetings, active contacts). Do not invent anything. Answer in English only.`;

    let result: any;
    try {
      const r = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system,
        prompt: userPrompt,
        experimental_output: Output.object({ schema: BriefSchema }),
      });
      const out = (r as any).experimental_output ?? (r as any).output;
      result = BriefSchema.parse(out);
      const fb = buildFallbackBrief(stats, period, lang);
      if (!result.metrics?.length) result.metrics = fb.metrics;
      if (!result.overview) result.overview = fb.overview;
    } catch (e) {
      console.error("pp-ava-brief AI failed", e);
      result = buildFallbackBrief(stats, period, lang);
    }


    return json({ ...result, stats, language: lang, cached: false });

  } catch (e) {
    console.error("pp-ava-brief error", e);
    return json({ error: String(e) }, 500);
  }
});
