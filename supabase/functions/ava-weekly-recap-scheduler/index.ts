// ava-weekly-recap-scheduler — Invoquée par pg_cron toutes les 15 min.
// Le dimanche vers 18h heure locale, envoie un récap hebdo au courtier.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DEFAULT_TZ = "America/Toronto";
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function localParts(tz: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: String(parts.weekday || "").toLowerCase(), // sun, mon…
  };
}

function weekStart(tz: string): Date {
  // Lundi 00:00 heure locale (semaine ISO)
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  const wd = String(parts.weekday || "").toLowerCase();
  const map: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
  const offset = map[wd] ?? 0;
  const d = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00`);
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: profiles, error } = await admin
      .from("planipret_profiles")
      .select("id, user_id, full_name, metadata, notif_eod_summary, status, ava_last_session_at")
      .eq("notif_eod_summary", true)
      .eq("status", "active");
    if (error) return j({ error: error.message }, 500);

    const now = new Date();
    const targets: any[] = [];
    for (const p of profiles ?? []) {
      const tz = (p.metadata as any)?.timezone || DEFAULT_TZ;
      const { hour, minute, weekday, date } = localParts(tz);
      // Fenêtre : dimanche 18:00 → 18:29
      if (weekday !== "sun") continue;
      if (!(hour === 18 && minute <= 29)) continue;
      // Anti-doublon : last_weekly_recap_at dans metadata
      const last = (p.metadata as any)?.last_weekly_recap_at ? new Date((p.metadata as any).last_weekly_recap_at) : null;
      if (last && (now.getTime() - last.getTime()) < 6 * 24 * 3600_000) continue;
      targets.push({ ...p, tz, localDate: date });
    }

    let sent = 0;
    const errors: any[] = [];
    for (const t of targets) {
      try {
        const wkStart = weekStart(t.tz).toISOString();

        const [{ count: totalCalls }, { count: outbound }, { count: emailsAnalyzed }, { count: notifs }, { count: newLeads }] = await Promise.all([
          admin.from("planipret_phone_calls").select("id", { count: "exact", head: true }).eq("broker_user_id", t.user_id).gte("started_at", wkStart),
          admin.from("planipret_phone_calls").select("id", { count: "exact", head: true }).eq("broker_user_id", t.user_id).eq("direction", "outbound").gte("started_at", wkStart),
          admin.from("planipret_ava_email_analyses").select("id", { count: "exact", head: true }).eq("broker_user_id", t.user_id).gte("created_at", wkStart),
          admin.from("planipret_ava_notifications").select("id", { count: "exact", head: true }).eq("user_id", t.user_id).gte("created_at", wkStart),
          admin.from("planipret_maestro_clients").select("id", { count: "exact", head: true }).eq("broker_user_id", t.user_id).gte("created_at", wkStart),
        ]);

        const bits: string[] = [];
        bits.push(`📞 ${totalCalls ?? 0} appels (${outbound ?? 0} sortants)`);
        if ((emailsAnalyzed ?? 0) > 0) bits.push(`✉️ ${emailsAnalyzed} courriels analysés`);
        if ((newLeads ?? 0) > 0) bits.push(`🆕 ${newLeads} nouveaux dossiers`);
        if ((notifs ?? 0) > 0) bits.push(`🔔 ${notifs} notifs AVA`);
        const body = bits.join(" · ");

        await fetch(`${SUPABASE_URL}/functions/v1/pp-push-notify`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: t.user_id,
            title: "📊 Récap de la semaine",
            body,
            data: { deepLink: "/mplanipret/home?recap=week", kind: "weekly_recap" },
          }),
        });

        await admin.from("planipret_ava_notifications").insert({
          user_id: t.user_id,
          type: "weekly_recap",
          title: "Récap de la semaine",
          body,
          deep_link: "/mplanipret/home?recap=week",
          metadata: { totalCalls, outbound, emailsAnalyzed, notifs, newLeads, week_start: wkStart },
        });

        const meta = { ...(t.metadata || {}), last_weekly_recap_at: new Date().toISOString() };
        await admin.from("planipret_profiles").update({ metadata: meta }).eq("id", t.id);
        sent++;
      } catch (e: any) {
        errors.push({ user_id: t.user_id, error: e?.message ?? String(e) });
      }
    }

    return j({ ok: true, considered: targets.length, sent, errors });
  } catch (e: any) {
    console.error("[ava-weekly-recap-scheduler]", e);
    return j({ error: e?.message ?? "server_error" }, 500);
  }
});
