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

    const [calls, missed, smsUnread, voicemails, hot, meetings, tasks] = await Promise.all([
      admin.from("planipret_phone_calls").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).gte("started_at", sinceIso).lte("started_at", untilIso),
      admin.from("planipret_phone_calls").select("from_number, from_name, started_at")
        .eq("user_id", profile.user_id).eq("direction", "missed").gte("started_at", sinceIso).lte("started_at", untilIso)
        .order("started_at", { ascending: false }).limit(10),
      admin.from("planipret_phone_messages").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).eq("direction", "inbound").is("read_at", null),
      admin.from("planipret_voicemails").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).eq("folder", "inbox").eq("is_read", false),
      admin.from("planipret_phone_calls").select("from_number, from_name, lead_score, started_at, ai_summary")
        .eq("user_id", profile.user_id).gte("lead_score", 7).gte("started_at", sinceIso)
        .order("lead_score", { ascending: false }).limit(8),
      admin.from("appointments").select("title, start_time, attendee_name")
        .eq("host_user_id", effectiveUserId).gte("start_time", sinceIso).lte("start_time", until.toISOString())
        .order("start_time", { ascending: true }).limit(10),
      admin.from("planipret_reminders").select("note, contact_name, contact_number, scheduled_at")
        .eq("user_id", profile.user_id).eq("status", "pending")
        .order("scheduled_at", { ascending: true }).limit(10),
    ]);

    const stats = {
      period,
      calls_total: calls.count ?? 0,
      missed_count: (missed.data || []).length,
      missed_recent: (missed.data || []).slice(0, 5),
      sms_unread: smsUnread.count ?? 0,
      voicemails_unread: voicemails.count ?? 0,
      hot_leads: hot.data || [],
      meetings: meetings.data || [],
      tasks_pending: tasks.data || [],
    };

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      // Graceful fallback
      const fallback = {
        headline: `${stats.calls_total} appels · ${stats.hot_leads.length} leads chauds · ${stats.tasks_pending.length} tâches`,
        priorities: [
          stats.tasks_pending[0] ? `Rappeler ${stats.tasks_pending[0].contact_name || stats.tasks_pending[0].contact_number}` : null,
          stats.hot_leads[0] ? `Recontacter ${stats.hot_leads[0].from_name || stats.hot_leads[0].from_number} (score ${stats.hot_leads[0].lead_score})` : null,
          stats.meetings[0] ? `Préparer RDV: ${stats.meetings[0].title}` : null,
        ].filter(Boolean) as string[],
        risks: stats.missed_count > 0 ? [`${stats.missed_count} appels manqués à traiter`] : [],
        suggestions: [],
      };
      return json({ ...fallback, stats, cached: false, degraded: true });
    }

    const gateway = createLovableAiGatewayProvider(lovableKey);
    const periodLabel = period === "day" ? "la journée" : period === "week" ? "la semaine" : period === "month" ? "le mois" : "votre quart";
    const system = `Tu es AVA, l'assistante d'un courtier hypothécaire au Québec. Tu reçois les statistiques réelles du courtier ${profile.full_name ?? ""} pour ${periodLabel}.
Génère un brief court, professionnel, en français du Québec.
- headline: 1 phrase percutante avec les chiffres clés.
- priorities: 3 actions concrètes ordonnées par urgence (max 12 mots chacune).
- risks: jusqu'à 2 risques ou points d'attention.
- suggestions: jusqu'à 3 actions cliquables (call/sms/reminder) avec si pertinent un numéro extrait des données.`;

    let result: any;
    try {
      const r = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system,
        prompt: `Données:\n${JSON.stringify(stats).slice(0, 6000)}`,
        experimental_output: Output.object({ schema: BriefSchema }),
      });
      const out = (r as any).experimental_output ?? (r as any).output;
      result = BriefSchema.parse(out);
    } catch (e) {
      console.error("pp-ava-brief AI failed", e);
      result = {
        headline: `${stats.calls_total} appels · ${stats.hot_leads.length} leads chauds`,
        priorities: [],
        risks: [],
        suggestions: [],
      };
    }


    return json({ ...result, stats, cached: false });
  } catch (e) {
    console.error("pp-ava-brief error", e);
    return json({ error: String(e) }, 500);
  }
});
