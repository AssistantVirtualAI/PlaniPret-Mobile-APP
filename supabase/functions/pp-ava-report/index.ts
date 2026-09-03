// pp-ava-report — génère un rapport détaillé de performance (jour/semaine/mois)
// pour un courtier Planiprêt, via Lovable AI Gateway (Claude / GPT-5.5).
// Retourne { report, period, stats }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateText } from "npm:ai";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function fallbackReport(language: "fr" | "en", period: "day" | "week" | "month", profile: any, stats: any, calls: any[], sms: any[], voicemails: any[]) {
  const labelFr = period === "day" ? "de la journée" : period === "week" ? "de la semaine" : "du mois";
  const labelEn = period === "day" ? "for today" : period === "week" ? "for the week" : "for the month";
  if (language === "en") {
    return `## 📊 Performance report ${labelEn}\n\n### Overview\n${profile?.full_name ?? "The broker"} has ${stats.calls_total} calls, ${stats.sms_total} text messages and ${stats.voicemails_total} voicemails in this period. Answer rate is ${stats.calls_total ? Math.round((stats.calls_answered / stats.calls_total) * 100) : 0}%.\n\n### 📞 Telephony\n- Inbound: ${stats.calls_inbound}\n- Outbound: ${stats.calls_outbound}\n- Missed: ${stats.calls_missed}\n- Average duration: ${stats.avg_duration_sec}s\n\n### 🔥 Hot leads\n${stats.hot_leads} hot leads detected.${calls.find((c: any) => c.ai_summary) ? `\nRecent insight: ${calls.find((c: any) => c.ai_summary).ai_summary}` : ""}\n\n### 📩 Client follow-up\n- SMS sent: ${stats.sms_outbound}\n- Unread voicemails: ${stats.voicemails_unread}\n- Pending reminders: ${stats.reminders_pending}\n\n### ✅ Recommendations\n- Call back missed calls first.\n- Follow up with hot leads today.\n- Clear unread voicemail and text conversations.`;
  }
  return `## 📊 Rapport ${labelFr}\n\n### Vue d'ensemble\n${profile?.full_name ?? "Le courtier"} a ${stats.calls_total} appels, ${stats.sms_total} textos et ${stats.voicemails_total} messages vocaux sur cette période. Le taux de réponse est de ${stats.calls_total ? Math.round((stats.calls_answered / stats.calls_total) * 100) : 0}%.\n\n### 📞 Téléphonie\n- Entrants: ${stats.calls_inbound}\n- Sortants: ${stats.calls_outbound}\n- Manqués: ${stats.calls_missed}\n- Durée moyenne: ${stats.avg_duration_sec}s\n\n### 🔥 Leads chauds\n${stats.hot_leads} leads chauds détectés.${calls.find((c: any) => c.ai_summary) ? `\nInsight récent: ${calls.find((c: any) => c.ai_summary).ai_summary}` : ""}\n\n### 📩 Suivi client\n- Textos envoyés: ${stats.sms_outbound}\n- Boîtes vocales non lues: ${stats.voicemails_unread}\n- Rappels en attente: ${stats.reminders_pending}\n\n### ✅ Recommandations\n- Rappeler les appels manqués en priorité.\n- Relancer les leads chauds aujourd'hui.\n- Traiter les voicemails et textos non lus.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const period: "day" | "week" | "month" = ["day", "week", "month"].includes(body?.period) ? body.period : "day";
    const language: "fr" | "en" = body?.language === "en" ? "en" : "fr";

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Mode service (voice agent / scheduler) : accepte broker_user_id via header/body si appelé avec service_role.
    const serviceHeader = req.headers.get("x-ava-service");
    let effectiveUserId: string | null = null;
    if (serviceHeader) {
      effectiveUserId = req.headers.get("x-broker-user-id") ?? body?.broker_user_id ?? body?._user_id ?? null;
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
      .select("id, user_id, full_name, extension")
      .eq("user_id", effectiveUserId).maybeSingle();

    const daysBack = period === "day" ? 1 : period === "week" ? 7 : 30;
    const since = new Date(Date.now() - daysBack * 86400000).toISOString();

    const orgFilter = profile?.id
      ? `user_id.eq.${profile.id},user_id.eq.${effectiveUserId}`
      : `user_id.eq.${effectiveUserId}`;

    const [callsRes, smsRes, vmRes, remRes] = await Promise.all([
      admin.from("planipret_phone_calls")
        .select("id, direction, status, from_number, to_number, from_name, to_name, started_at, duration_seconds, lead_score, lead_temperature, ai_summary")
        .or(orgFilter).gte("started_at", since).order("started_at", { ascending: false }).limit(200),
      admin.from("planipret_phone_messages")
        .select("id, direction, from_number, to_number, body, created_at, read_at")
        .eq("user_id", effectiveUserId).gte("created_at", since).order("created_at", { ascending: false }).limit(200),
      admin.from("planipret_voicemails")
        .select("id, from_number, from_name, duration_seconds, transcript, is_read, created_at")
        .or(orgFilter).gte("created_at", since).order("created_at", { ascending: false }).limit(100),
      admin.from("planipret_reminders")
        .select("id, contact_name, note, scheduled_at, status")
        .or(orgFilter).gte("scheduled_at", since).order("scheduled_at", { ascending: false }).limit(100),
    ]);

    const calls = callsRes.data ?? [];
    const sms = smsRes.data ?? [];
    const voicemails = vmRes.data ?? [];
    const reminders = remRes.data ?? [];

    const stats = {
      calls_total: calls.length,
      calls_inbound: calls.filter((c: any) => c.direction === "inbound").length,
      calls_outbound: calls.filter((c: any) => c.direction === "outbound").length,
      calls_missed: calls.filter((c: any) => c.status === "missed").length,
      calls_answered: calls.filter((c: any) => (c.duration_seconds ?? 0) > 10).length,
      avg_duration_sec: calls.length
        ? Math.round(calls.reduce((a: number, c: any) => a + (c.duration_seconds ?? 0), 0) / calls.length)
        : 0,
      sms_total: sms.length,
      sms_outbound: sms.filter((s: any) => s.direction === "outbound").length,
      voicemails_total: voicemails.length,
      voicemails_unread: voicemails.filter((v: any) => !v.is_read).length,
      hot_leads: calls.filter((c: any) => (c.lead_score ?? 0) >= 7).length,
      reminders_pending: reminders.filter((r: any) => r.status === "pending").length,
    };

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ report: fallbackReport(language, period, profile, stats, calls, sms, voicemails), period, stats, degraded: true });
    const gateway = createLovableAiGatewayProvider(key);

    const periodLabelFr = period === "day" ? "de la journée" : period === "week" ? "de la semaine (7 jours)" : "du mois (30 jours)";
    const periodLabelEn = period === "day" ? "for today" : period === "week" ? "for this week (7 days)" : "for this month (30 days)";

    const promptFr = `Tu es AVA, l'assistante d'un courtier hypothécaire au Québec. Génère un rapport de performance détaillé ${periodLabelFr} pour ${profile?.full_name ?? "le courtier"} (extension ${profile?.extension ?? "n/d"}).

Statistiques agrégées:
${JSON.stringify(stats, null, 2)}

Échantillon d'appels (max 20):
${JSON.stringify(calls.slice(0, 20), null, 2)}

Échantillon de SMS (max 10):
${JSON.stringify(sms.slice(0, 10), null, 2)}

Messagerie vocale (max 5):
${JSON.stringify(voicemails.slice(0, 5), null, 2)}

Structure ATTENDUE en Markdown, en français, ton professionnel et actionnable:
## 📊 Rapport ${periodLabelFr}
### Vue d'ensemble
(3-4 lignes: activité globale, tendances, points forts/faibles)
### 📞 Téléphonie
(volume entrant/sortant, taux de réponse, appels manqués, durée moyenne)
### 🔥 Leads chauds
(nombre, principales opportunités identifiées à partir des ai_summary)
### 📩 Suivi client
(SMS envoyés, messagerie vocale non traitée, rappels en attente)
### ✅ Recommandations
(3 à 5 actions concrètes à prendre)

Sois précis, chiffré, et ne fabrique aucune donnée qui n'est pas dans les stats fournies.`;

    const promptEn = `You are AVA, the assistant of a Quebec mortgage broker. Generate a detailed performance report ${periodLabelEn} for ${profile?.full_name ?? "the broker"} (extension ${profile?.extension ?? "n/a"}).

Aggregated statistics:
${JSON.stringify(stats, null, 2)}

Call sample (max 20):
${JSON.stringify(calls.slice(0, 20), null, 2)}

SMS sample (max 10):
${JSON.stringify(sms.slice(0, 10), null, 2)}

Voicemails (max 5):
${JSON.stringify(voicemails.slice(0, 5), null, 2)}

EXPECTED structure in Markdown, in English, professional and actionable tone:
## 📊 Report ${periodLabelEn}
### Overview
(3-4 lines: overall activity, trends, strengths/weaknesses)
### 📞 Telephony
(inbound/outbound volume, answer rate, missed calls, average duration)
### 🔥 Hot leads
(count, main opportunities identified from ai_summary)
### 📩 Client follow-up
(sent SMS, unread voicemail, pending reminders)
### ✅ Recommendations
(3 to 5 concrete actions to take)

Be precise, quantified, and never fabricate data not present in the provided stats.`;

    const prompt = language === "en" ? promptEn : promptFr;

    let text = "";
    try {
      const result = await generateText({
        model: gateway("google/gemini-2.5-flash"),
        prompt,
      });
      text = result.text;
    } catch (e) {
      console.error("pp-ava-report AI failed", e);
      text = fallbackReport(language, period, profile, stats, calls, sms, voicemails);
    }

    return json({ report: text, period, stats });
  } catch (e: any) {
    console.error("pp-ava-report error", e);
    return json({ error: e?.message ?? "unknown" }, 500);
  }
});
