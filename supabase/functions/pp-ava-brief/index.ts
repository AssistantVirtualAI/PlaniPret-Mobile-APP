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
  priorities: z.array(z.string()).max(5),
  risks: z.array(z.string()).max(3),
  suggestions: z.array(z.object({
    label: z.string(),
    kind: z.enum(["call", "sms", "email", "reminder"]),
    number: z.string().optional(),
  })).max(3),
});

type Period = "day" | "week" | "month" | "shift";

function buildFallbackBrief(stats: any, period: Period) {
  const periodLabel = period === "day" ? "aujourd’hui" : period === "week" ? "cette semaine" : period === "month" ? "ce mois-ci" : "ce quart";
  const priorities = [
    stats.missed_recent?.[0]
      ? `Rappeler ${stats.missed_recent[0].from_name || stats.missed_recent[0].from_number || "l’appel manqué"}`
      : null,
    stats.tasks_pending?.[0]
      ? `Compléter: ${stats.tasks_pending[0].note || stats.tasks_pending[0].contact_name || "rappel client"}`
      : null,
    stats.hot_leads?.[0]
      ? `Relancer ${stats.hot_leads[0].from_name || stats.hot_leads[0].from_number || "le lead chaud"}`
      : null,
    stats.meetings?.[0]
      ? `Préparer le rendez-vous ${stats.meetings[0].title || stats.meetings[0].attendee_name || "à venir"}`
      : null,
  ].filter(Boolean).slice(0, 5) as string[];
  const risks = [
    stats.missed_count > 0 ? `${stats.missed_count} appel${stats.missed_count > 1 ? "s" : ""} manqué${stats.missed_count > 1 ? "s" : ""}` : null,
    stats.sms_unread > 0 ? `${stats.sms_unread} texto${stats.sms_unread > 1 ? "s" : ""} non lu${stats.sms_unread > 1 ? "s" : ""}` : null,
    stats.voicemails_unread > 0 ? `${stats.voicemails_unread} boîte${stats.voicemails_unread > 1 ? "s" : ""} vocale${stats.voicemails_unread > 1 ? "s" : ""} à traiter` : null,
  ].filter(Boolean).slice(0, 3) as string[];
  const suggestions = [
    stats.missed_recent?.[0]?.from_number ? { label: "Rappeler l’appel manqué", kind: "call", number: stats.missed_recent[0].from_number } : null,
    stats.hot_leads?.[0]?.from_number ? { label: "Texter le lead chaud", kind: "sms", number: stats.hot_leads[0].from_number } : null,
  ].filter(Boolean).slice(0, 3);
  const parts = [
    `${stats.calls_total} appel${stats.calls_total > 1 ? "s" : ""} (${stats.calls_answered} répondus, ${stats.missed_count} manqués)`,
    `${stats.talk_minutes} min au téléphone`,
    `${stats.sms_total} texto${stats.sms_total > 1 ? "s" : ""}`,
    `${stats.hot_leads.length} lead${stats.hot_leads.length > 1 ? "s" : ""} chaud${stats.hot_leads.length > 1 ? "s" : ""}`,
    `${stats.meetings.length} rendez-vous`,
  ];
  return {
    headline: `${periodLabel}: ${parts.join(" · ")}.`,
    priorities: priorities.length ? priorities : ["Aucune urgence détectée — garder le suivi client à jour."],
    risks,
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
      .select("id, user_id, full_name, extension, organization_id")
      .eq("user_id", effectiveUserId).maybeSingle();
    if (!profile) return json({ error: "no_profile" }, 404);

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
      const fallback = buildFallbackBrief(stats, period);
      return json({ ...fallback, stats, cached: false, degraded: true });
    }

    const gateway = createLovableAiGatewayProvider(lovableKey);
    const periodLabel = period === "day" ? "la journée" : period === "week" ? "la semaine" : period === "month" ? "le mois" : "votre quart";
    const system = `Tu es AVA, l'assistante d'un courtier hypothécaire au Québec. Tu reçois les statistiques réelles du courtier ${profile.full_name ?? ""} pour ${periodLabel}.
Génère un brief court, professionnel, en français du Québec.
- headline: 1 phrase percutante citant les chiffres clés réels (appels, manqués, minutes, textos, leads chauds, rendez-vous).
- priorities: 3 actions concrètes ordonnées par urgence (max 12 mots chacune).
- risks: jusqu'à 2 risques ou points d'attention.
- suggestions: jusqu'à 3 actions cliquables (call/sms/reminder) avec si pertinent un numéro extrait des données.`;

    let result: any;
    try {
      const r = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system,
        prompt: `Statistiques réelles (JSON):\n${JSON.stringify(stats).slice(0, 12000)}\n\nUtilise ces chiffres exacts (appels, manqués, minutes, textos, boîtes vocales, leads chauds, rendez-vous, contacts actifs). N'invente rien.`,
        experimental_output: Output.object({ schema: BriefSchema }),
      });
      const out = (r as any).experimental_output ?? (r as any).output;
      result = BriefSchema.parse(out);
    } catch (e) {
      console.error("pp-ava-brief AI failed", e);
      result = buildFallbackBrief(stats, period);
    }


    return json({ ...result, stats, cached: false });
  } catch (e) {
    console.error("pp-ava-brief error", e);
    return json({ error: String(e) }, 500);
  }
});
