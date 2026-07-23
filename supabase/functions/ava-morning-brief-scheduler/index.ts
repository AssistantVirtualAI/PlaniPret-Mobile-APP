// ava-morning-brief-scheduler — Invoquée par pg_cron toutes les 15 min.
// Pour chaque courtier avec notif_morning_brief=true, si l'heure locale est ~07:30
// et qu'aucun brief n'a été envoyé pour la date locale, appelle pp-ava-brief (period=day)
// et pousse une notif via pp-push-notify avec deep link.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Courtiers actifs qui veulent le brief matinal
    const { data: profiles, error } = await admin
      .from("planipret_profiles")
      .select("id, user_id, full_name, metadata, last_morning_brief_at, notif_morning_brief, status")
      .eq("notif_morning_brief", true)
      .eq("status", "active");
    if (error) return j({ error: error.message }, 500);

    const targets: any[] = [];
    for (const p of profiles ?? []) {
      const tz = (p.metadata as any)?.timezone || DEFAULT_TZ;
      const { date, hour, minute } = localParts(tz);
      // Fenêtre 07:30 ± 15 min → 07:15 à 07:44
      const inWindow = (hour === 7 && minute >= 15 && minute <= 44);
      if (!inWindow) continue;
      const last = p.last_morning_brief_at ? new Date(p.last_morning_brief_at) : null;
      const lastLocal = last ? new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(last) : null;
      if (lastLocal === date) continue; // déjà envoyé aujourd'hui
      targets.push({ ...p, tz, localDate: date });
    }

    let sent = 0;
    const errors: any[] = [];
    for (const t of targets) {
      try {
        // Générer le brief via pp-ava-brief (mode service via service_role)
        const briefRes = await fetch(`${SUPABASE_URL}/functions/v1/pp-ava-brief`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
            "x-ava-service": "morning-brief",
            "x-broker-user-id": t.user_id,
          },
          body: JSON.stringify({ period: "day", force: true, broker_user_id: t.user_id }),
        });
        const brief = await briefRes.json().catch(() => ({}));
        const headline = brief?.headline ?? "Bonjour, voici votre journée";
        const first = Array.isArray(brief?.priorities) && brief.priorities.length ? brief.priorities[0] : "Consultez vos priorités du jour.";

        await fetch(`${SUPABASE_URL}/functions/v1/pp-push-notify`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: t.user_id,
            title: `☀️ ${headline}`,
            body: first,
            data: { deepLink: "/mplanipret/home?brief=today", kind: "morning_brief" },
          }),
        });

        await admin.from("planipret_profiles").update({ last_morning_brief_at: new Date().toISOString() }).eq("id", t.id);
        sent++;
      } catch (e: any) {
        errors.push({ user_id: t.user_id, error: e?.message ?? String(e) });
      }
    }

    return j({ ok: true, considered: targets.length, sent, errors });
  } catch (e: any) {
    console.error("[ava-morning-brief-scheduler]", e);
    return j({ error: e?.message ?? "server_error" }, 500);
  }
});
