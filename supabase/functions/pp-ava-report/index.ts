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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const period: "day" | "week" | "month" = ["day", "week", "month"].includes(body?.period) ? body.period : "day";

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("planipret_profiles")
      .select("id, user_id, full_name, extension")
      .eq("user_id", u.user.id).maybeSingle();

    const daysBack = period === "day" ? 1 : period === "week" ? 7 : 30;
    const since = new Date(Date.now() - daysBack * 86400000).toISOString();

    const orgFilter = profile?.id
      ? `user_id.eq.${profile.id},user_id.eq.${u.user.id}`
      : `user_id.eq.${u.user.id}`;

    const [callsRes, smsRes, vmRes, remRes] = await Promise.all([
      admin.from("planipret_phone_calls")
        .select("id, direction, status, from_number, to_number, from_name, to_name, started_at, duration_seconds, lead_score, lead_temperature, ai_summary")
        .or(orgFilter).gte("started_at", since).order("started_at", { ascending: false }).limit(200),
      admin.from("planipret_phone_messages")
        .select("id, direction, from_number, to_number, body, created_at, read_at")
        .eq("user_id", u.user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(200),
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

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "ai_not_configured" }, 500);
    const gateway = createLovableAiGatewayProvider(key);

    const periodLabel = period === "day" ? "de la journée" : period === "week" ? "de la semaine (7 jours)" : "du mois (30 jours)";
    const prompt = `Tu es AVA, l'assistante d'un courtier hypothécaire au Québec. Génère un rapport de performance détaillé ${periodLabel} pour ${profile?.full_name ?? "le courtier"} (extension ${profile?.extension ?? "n/d"}).

Statistiques agrégées:
${JSON.stringify(stats, null, 2)}

Échantillon d'appels (max 20):
${JSON.stringify(calls.slice(0, 20), null, 2)}

Échantillon de SMS (max 10):
${JSON.stringify(sms.slice(0, 10), null, 2)}

Messagerie vocale (max 5):
${JSON.stringify(voicemails.slice(0, 5), null, 2)}

Structure ATTENDUE en Markdown, en français, ton professionnel et actionnable:
## 📊 Rapport ${periodLabel}
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

    const { text } = await generateText({
      model: gateway("openai/gpt-5.5"),
      prompt,
    });

    return json({ report: text, period, stats });
  } catch (e: any) {
    console.error("pp-ava-report error", e);
    return json({ error: e?.message ?? "unknown" }, 500);
  }
});
