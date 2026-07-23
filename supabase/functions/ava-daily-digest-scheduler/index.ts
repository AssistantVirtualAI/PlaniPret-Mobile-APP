// ava-daily-digest-scheduler — Invoquée par pg_cron toutes les 15 min.
// Envoie un résumé de fin de journée à 17:00 heure locale du courtier.
// Contient: appels manqués, notifications AVA non lues, RDV de demain.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DEFAULT_TZ = "America/Toronto";
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function localParts(tz: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function startOfLocalDay(tz: string, dayOffset = 0): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  const d = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00`);
  d.setUTCDate(d.getUTCDate() + dayOffset);
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
      .select("id, user_id, full_name, metadata, last_eod_summary_at, notif_eod_summary, status")
      .eq("notif_eod_summary", true)
      .eq("status", "active");
    if (error) return j({ error: error.message }, 500);

    const targets: any[] = [];
    for (const p of profiles ?? []) {
      const tz = (p.metadata as any)?.timezone || DEFAULT_TZ;
      const { date, hour, minute } = localParts(tz);
      // Fenêtre 17:00 ± 14 min → 17:00 à 17:29
      const inWindow = (hour === 17 && minute <= 29);
      if (!inWindow) continue;
      const last = p.last_eod_summary_at ? new Date(p.last_eod_summary_at) : null;
      const lastLocal = last ? new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(last) : null;
      if (lastLocal === date) continue;
      targets.push({ ...p, tz, localDate: date });
    }

    let sent = 0;
    const errors: any[] = [];
    for (const t of targets) {
      try {
        const todayStart = startOfLocalDay(t.tz, 0).toISOString();
        const tomorrowStart = startOfLocalDay(t.tz, 1).toISOString();
        const dayAfterStart = startOfLocalDay(t.tz, 2).toISOString();

        // Appels manqués aujourd'hui
        const { count: missed } = await admin
          .from("planipret_phone_calls")
          .select("id", { count: "exact", head: true })
          .eq("broker_user_id", t.user_id)
          .eq("direction", "inbound")
          .in("disposition", ["missed", "no-answer", "busy"])
          .gte("started_at", todayStart)
          .lt("started_at", tomorrowStart);

        // Notifications AVA non lues
        const { count: unread } = await admin
          .from("planipret_ava_notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", t.user_id)
          .is("read_at", null);

        // RDV demain
        const { data: tomorrowAppts } = await admin
          .from("appointments")
          .select("id, title, starts_at")
          .eq("owner_user_id", t.user_id)
          .gte("starts_at", tomorrowStart)
          .lt("starts_at", dayAfterStart)
          .order("starts_at", { ascending: true })
          .limit(5);

        const apptsCount = tomorrowAppts?.length ?? 0;
        const parts: string[] = [];
        if (missed && missed > 0) parts.push(`${missed} appel${missed > 1 ? "s" : ""} manqué${missed > 1 ? "s" : ""}`);
        if (unread && unread > 0) parts.push(`${unread} notif AVA`);
        if (apptsCount > 0) parts.push(`${apptsCount} RDV demain`);
        const body = parts.length ? parts.join(" · ") : "Belle journée, aucun rappel en attente ✅";

        await fetch(`${SUPABASE_URL}/functions/v1/pp-push-notify`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: t.user_id,
            title: "🌇 Résumé de fin de journée",
            body,
            data: { deepLink: "/mplanipret/notifications", kind: "daily_digest" },
          }),
        });

        // Écrire aussi une notification in-app
        await admin.from("planipret_ava_notifications").insert({
          user_id: t.user_id,
          type: "daily_digest",
          title: "Résumé de fin de journée",
          body,
          deep_link: "/mplanipret/notifications",
          metadata: { missed, unread, tomorrow_appts: apptsCount },
        });

        await admin.from("planipret_profiles").update({ last_eod_summary_at: new Date().toISOString() }).eq("id", t.id);
        sent++;
      } catch (e: any) {
        errors.push({ user_id: t.user_id, error: e?.message ?? String(e) });
      }
    }

    return j({ ok: true, considered: targets.length, sent, errors });
  } catch (e: any) {
    console.error("[ava-daily-digest-scheduler]", e);
    return j({ error: e?.message ?? "server_error" }, 500);
  }
});
