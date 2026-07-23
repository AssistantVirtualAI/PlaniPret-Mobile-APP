// pp-performance-report: Generates a detailed performance report for a broker
// using Claude AI via the Lovable AI Gateway.
// Supports daily, weekly, and monthly periods.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateText } from "npm:ai";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Period = "day" | "week" | "month";

function periodRange(period: Period): { since: Date; until: Date; label: string; labelFr: string } {
  const now = new Date();
  const until = new Date(now);
  let since = new Date(now);
  let label = period;
  let labelFr = period;
  if (period === "day") {
    since.setHours(0, 0, 0, 0);
    label = "today";
    labelFr = "aujourd'hui";
  } else if (period === "week") {
    since.setDate(since.getDate() - 7);
    label = "this week";
    labelFr = "cette semaine";
  } else if (period === "month") {
    since.setMonth(since.getMonth() - 1);
    label = "this month";
    labelFr = "ce mois-ci";
  }
  return { since, until, label, labelFr };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const period: Period = (["day", "week", "month"].includes(body?.period) ? body.period : "day") as Period;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const { data: profile } = await admin.from("planipret_profiles")
      .select("id, user_id, full_name, extension, organization_id")
      .eq("user_id", u.user.id).maybeSingle();
    if (!profile) return json({ error: "no_profile" }, 404);

    const { since, until, label, labelFr } = periodRange(period);
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();

    // Aggregate all performance data in parallel
    const [
      callsTotal,
      callsMissed,
      callsInbound,
      callsOutbound,
      callsConnected,
      hotLeads,
      smsOutbound,
      smsInbound,
      voicemails,
      meetings,
      tasksDone,
      tasksPending,
      recentCalls,
    ] = await Promise.all([
      admin.from("planipret_phone_calls").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).gte("started_at", sinceIso).lte("started_at", untilIso),
      admin.from("planipret_phone_calls").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).eq("direction", "missed")
        .gte("started_at", sinceIso).lte("started_at", untilIso),
      admin.from("planipret_phone_calls").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).eq("direction", "inbound")
        .gte("started_at", sinceIso).lte("started_at", untilIso),
      admin.from("planipret_phone_calls").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).eq("direction", "outbound")
        .gte("started_at", sinceIso).lte("started_at", untilIso),
      admin.from("planipret_phone_calls").select("id, duration_seconds", { count: "exact" })
        .eq("user_id", profile.user_id).gte("duration_seconds", 30)
        .gte("started_at", sinceIso).lte("started_at", untilIso),
      admin.from("planipret_phone_calls").select("from_number, from_name, lead_score, lead_temperature, ai_summary, started_at")
        .eq("user_id", profile.user_id).gte("lead_score", 7)
        .gte("started_at", sinceIso).order("lead_score", { ascending: false }).limit(10),
      admin.from("planipret_phone_messages").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).eq("direction", "outbound")
        .gte("created_at", sinceIso),
      admin.from("planipret_phone_messages").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).eq("direction", "inbound")
        .gte("created_at", sinceIso),
      admin.from("planipret_voicemails").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).gte("created_at", sinceIso),
      admin.from("appointments").select("title, start_time, attendee_name, location_type")
        .eq("host_user_id", u.user.id).gte("start_time", sinceIso).lte("start_time", untilIso)
        .order("start_time", { ascending: true }).limit(20),
      admin.from("planipret_reminders").select("id", { count: "exact", head: true })
        .eq("user_id", profile.user_id).eq("status", "done")
        .gte("updated_at", sinceIso),
      admin.from("planipret_reminders").select("note, contact_name, scheduled_at")
        .eq("user_id", profile.user_id).eq("status", "pending")
        .order("scheduled_at", { ascending: true }).limit(10),
      admin.from("planipret_phone_calls")
        .select("from_number, from_name, to_number, to_name, direction, duration_seconds, started_at, lead_score, ai_summary")
        .eq("user_id", profile.user_id).gte("started_at", sinceIso)
        .order("started_at", { ascending: false }).limit(20),
    ]);

    const connectedCalls = callsConnected.data ?? [];
    const avgDuration = connectedCalls.length > 0
      ? Math.round(connectedCalls.reduce((sum: number, c: any) => sum + (c.duration_seconds ?? 0), 0) / connectedCalls.length)
      : 0;

    const total = callsTotal.count ?? 0;
    const connected = connectedCalls.length;
    const connectionRate = total > 0 ? Math.round((connected / total) * 100) : 0;

    const stats = {
      period,
      broker_name: profile.full_name ?? "Courtier",
      calls: {
        total,
        missed: callsMissed.count ?? 0,
        inbound: callsInbound.count ?? 0,
        outbound: callsOutbound.count ?? 0,
        connected,
        connection_rate_pct: connectionRate,
        avg_duration_seconds: avgDuration,
      },
      sms: {
        sent: smsOutbound.count ?? 0,
        received: smsInbound.count ?? 0,
      },
      voicemails: voicemails.count ?? 0,
      meetings: (meetings.data ?? []).length,
      tasks: {
        done: tasksDone.count ?? 0,
        pending: (tasksPending.data ?? []).length,
      },
      hot_leads: (hotLeads.data ?? []).slice(0, 5),
      recent_calls: (recentCalls.data ?? []).slice(0, 10),
      pending_tasks: tasksPending.data ?? [],
    };

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      // Graceful fallback without AI
      const report = generateFallbackReport(stats, labelFr);
      return json({ report, period, degraded: true });
    }

    const gateway = createLovableAiGatewayProvider(lovableKey);

    const system = `Tu es AVA, l'assistante IA d'un courtier hypothécaire au Québec.
Tu génères un rapport de performance détaillé, professionnel et actionnable en français du Québec.

Format du rapport :
1. **Résumé exécutif** — 2-3 phrases avec les chiffres clés les plus importants
2. **Performance des appels** — analyse détaillée (volume, taux de connexion, durée moyenne, appels manqués)
3. **Communications** — SMS envoyés/reçus, messagerie vocale
4. **Leads chauds** — liste des prospects à fort potentiel avec recommandations
5. **Réunions & Rendez-vous** — bilan des rencontres
6. **Tâches** — complétées vs en attente
7. **Points d'attention** — risques ou opportunités à ne pas manquer
8. **Recommandations prioritaires** — 3 actions concrètes pour améliorer la performance

Sois concis mais complet. Utilise des emojis pour les titres de section. Ton professionnel mais accessible.`;

    let report: string;
    try {
      const r = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system,
        prompt: `Génère un rapport de performance pour ${stats.broker_name} pour la période : ${labelFr}.\n\nDonnées:\n${JSON.stringify(stats, null, 2).slice(0, 8000)}`,
        maxTokens: 1500,
      });
      report = r.text ?? generateFallbackReport(stats, labelFr);
    } catch (e) {
      console.error("pp-performance-report AI failed", e);
      report = generateFallbackReport(stats, labelFr);
    }

    return json({ report, period, stats });
  } catch (e: any) {
    console.error("pp-performance-report error", e);
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});

function generateFallbackReport(stats: any, labelFr: string): string {
  const cr = stats.calls.connection_rate_pct;
  const avgMin = Math.round(stats.calls.avg_duration_seconds / 60);
  return `📊 Rapport de performance — ${labelFr}

📞 **Appels**
• Total : ${stats.calls.total} appels
• Connectés : ${stats.calls.connected} (${cr}% de taux de connexion)
• Entrants : ${stats.calls.inbound} | Sortants : ${stats.calls.outbound}
• Manqués : ${stats.calls.missed}
• Durée moyenne : ${avgMin} min

💬 **Messages**
• SMS envoyés : ${stats.sms.sent}
• SMS reçus : ${stats.sms.received}
• Messageries vocales : ${stats.voicemails}

🔥 **Leads chauds** : ${stats.hot_leads.length} prospects à fort potentiel

📅 **Réunions** : ${stats.meetings}

✅ **Tâches** : ${stats.tasks.done} complétées · ${stats.tasks.pending} en attente

${stats.calls.missed > 3 ? `⚠️ Attention : ${stats.calls.missed} appels manqués à rappeler en priorité.` : ""}
${cr < 30 && stats.calls.total > 0 ? `⚠️ Taux de connexion faible (${cr}%) — revoir les plages horaires d'appel.` : ""}`;
}
