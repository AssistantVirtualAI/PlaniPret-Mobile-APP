// AVA Proactive — runs every 30 minutes via cron to push intelligent alerts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function push(supa: any, user_id: string, title: string, body: string, url = "/mplanipret", data: any = {}) {
  try {
    await supa.functions.invoke("pp-push-notify", { body: { user_id, title, body, url, data } });
  } catch (e) { console.error("push fail", e); }
}

async function logAudit(supa: any, user_id: string, action: string, metadata: any) {
  await supa.from("planipret_audit_log").insert({ user_id, action, resource_type: "notification", metadata }).then(() => {}, () => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supa = admin();
  const now = new Date();
  const hour = now.getUTCHours() - 4; // approx EST
  const minute = now.getUTCMinutes();
  const dow = now.getUTCDay(); // 0=Sun

  const { data: brokers } = await supa.from("planipret_profiles")
    .select("id, user_id, full_name, role, notif_hot_leads, notif_appointment_reminder, notif_missed_call, notif_morning_brief, notif_eod_summary, last_morning_brief_at, last_eod_summary_at, ms365_access_token")
    .eq("role", "broker");

  const results: any[] = [];
  for (const b of brokers ?? []) {
    const checks: string[] = [];

    // CHECK 1: hot leads sans suivi
    if (b.notif_hot_leads) {
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data: leads } = await supa.from("planipret_phone_calls")
        .select("id, caller_number, callee_number, started_at, lead_score")
        .eq("user_id", b.id).gte("lead_score", 8).lt("started_at", cutoff)
        .order("started_at", { ascending: false }).limit(1);
      if (leads?.length) {
        const l = leads[0];
        const contact = l.caller_number || l.callee_number || "Contact";
        const hours = Math.round((Date.now() - new Date(l.started_at).getTime()) / 3600000);
        await push(supa, b.user_id, "🔥 Lead chaud sans suivi", `${contact} est un lead chaud sans suivi depuis ${hours}h. Voulez-vous appeler maintenant?`, `/mplanipret/calls?id=${l.id}`);
        await logAudit(supa, b.user_id, "PUSH_HOT_LEAD", { contact, hours });
        checks.push("hot_lead");
      }
    }

    // CHECK 2: RDV imminent (30 min)
    if (b.notif_appointment_reminder && b.ms365_access_token) {
      try {
        const start = new Date(); const end = new Date(Date.now() + 30 * 60000);
        const { data: r } = await supa.functions.invoke("ms365-actions", {
          body: { action: "list_calendar_events", payload: { start: start.toISOString(), end: end.toISOString() } },
          headers: { "X-User-Id": b.user_id },
        });
        const events = (r as any)?.events ?? [];
        for (const ev of events.slice(0, 1)) {
          await push(supa, b.user_id, "📅 RDV imminent", `Votre RDV avec ${ev.subject ?? "votre contact"} commence dans 30 minutes. Préparez-vous!`);
          await logAudit(supa, b.user_id, "PUSH_APPT_REMINDER", { event: ev.subject });
          checks.push("appt");
        }
      } catch {}
    }

    // CHECK 3: missed call > 2h
    if (b.notif_missed_call) {
      const since = new Date(Date.now() - 4 * 3600000).toISOString();
      const cutoff = new Date(Date.now() - 2 * 3600000).toISOString();
      const { data: missed } = await supa.from("planipret_phone_calls")
        .select("id, caller_number, started_at")
        .eq("user_id", b.id).eq("status", "missed")
        .gte("started_at", since).lt("started_at", cutoff)
        .order("started_at", { ascending: false }).limit(1);
      if (missed?.length) {
        const m = missed[0];
        const hours = Math.round((Date.now() - new Date(m.started_at).getTime()) / 3600000);
        await push(supa, b.user_id, "📞 Appel manqué", `Appel manqué de ${m.caller_number} il y a ${hours}h. Rappeler maintenant?`, `/mplanipret/calls?id=${m.id}`);
        await logAudit(supa, b.user_id, "PUSH_MISSED_CALL", { number: m.caller_number, hours });
        checks.push("missed");
      }
    }

    // CHECK 4: morning brief (weekday ~08:30)
    if (b.notif_morning_brief && dow >= 1 && dow <= 5 && hour === 8 && minute < 30) {
      const lastBrief = b.last_morning_brief_at ? new Date(b.last_morning_brief_at) : null;
      const sameDay = lastBrief && lastBrief.toDateString() === now.toDateString();
      if (!sameDay) {
        await push(supa, b.user_id, "☀️ Bonjour", `Bonjour ${b.full_name?.split(" ")[0] ?? ""}! Votre brief AVA est prêt.`, "/mplanipret?brief=1");
        await supa.from("planipret_profiles").update({ last_morning_brief_at: now.toISOString() }).eq("id", b.id);
        await logAudit(supa, b.user_id, "PUSH_MORNING_BRIEF", {});
        checks.push("brief");
      }
    }

    // CHECK 5: EOD summary (~17:30)
    if (b.notif_eod_summary && dow >= 1 && dow <= 5 && hour === 17 && minute < 30) {
      const lastEod = b.last_eod_summary_at ? new Date(b.last_eod_summary_at) : null;
      const sameDay = lastEod && lastEod.toDateString() === now.toDateString();
      if (!sameDay) {
        const startDay = new Date(); startDay.setHours(0, 0, 0, 0);
        const { count: calls } = await supa.from("planipret_phone_calls").select("id", { count: "exact", head: true }).eq("user_id", b.id).gte("started_at", startDay.toISOString());
        const { count: leads } = await supa.from("planipret_phone_calls").select("id", { count: "exact", head: true }).eq("user_id", b.id).gte("lead_score", 7).gte("started_at", startDay.toISOString());
        const { count: tasks } = await supa.from("planipret_reminders").select("id", { count: "exact", head: true }).eq("user_id", b.id).eq("status", "done").gte("updated_at", startDay.toISOString());
        await push(supa, b.user_id, "📊 Résumé de votre journée", `${calls ?? 0} appels, ${leads ?? 0} leads, ${tasks ?? 0} tâches complétées.`, "/mplanipret/stats");
        await supa.from("planipret_profiles").update({ last_eod_summary_at: now.toISOString() }).eq("id", b.id);
        await logAudit(supa, b.user_id, "PUSH_EOD_SUMMARY", { calls, leads, tasks });
        checks.push("eod");
      }
    }

    if (checks.length) results.push({ broker: b.id, checks });
  }

  return new Response(JSON.stringify({ success: true, processed: brokers?.length ?? 0, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
