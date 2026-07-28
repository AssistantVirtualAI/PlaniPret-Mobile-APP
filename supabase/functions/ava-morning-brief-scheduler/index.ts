// ava-morning-brief-scheduler — Invoquée par pg_cron toutes les 15 min.
// Deux briefs par jour (heure locale du courtier) :
//   - 08:30 → brief du matin (period=day)
//   - 17:30 → résumé de fin de journée (period=day, eod)
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
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

function localDateOf(iso: string | null, tz: string) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const payload = await req.json().catch(() => ({} as any));
    // Permet un test manuel : { force_kind: "morning" | "eod", user_id?: "..." }
    const forceKind: "morning" | "eod" | null = payload?.force_kind ?? null;
    const forceUser: string | null = payload?.user_id ?? null;

    const { data: profiles, error } = await admin
      .from("planipret_profiles")
      .select("id, user_id, full_name, metadata, last_morning_brief_at, last_eod_summary_at, notif_morning_brief, notif_eod_summary, status")
      .not("user_id", "is", null);
    if (error) return j({ error: error.message }, 500);

    const targets: any[] = [];
    for (const p of profiles ?? []) {
      if (!p.user_id) continue;
      if (String(p.status ?? "").toLowerCase() === "inactive") continue;
      if (forceUser && p.user_id !== forceUser) continue;
      const tz = (p.metadata as any)?.timezone || DEFAULT_TZ;
      const { date, hour, minute } = localParts(tz);
      const inSlot = minute >= 25 && minute <= 44;

      const wantMorning = p.notif_morning_brief !== false;
      const wantEod = p.notif_eod_summary !== false;

      const morningDue = forceKind === "morning"
        || (!forceKind && wantMorning && hour === 8 && inSlot && localDateOf(p.last_morning_brief_at, tz) !== date);
      const eodDue = forceKind === "eod"
        || (!forceKind && wantEod && hour === 17 && inSlot && localDateOf(p.last_eod_summary_at, tz) !== date);

      if (morningDue) targets.push({ ...p, tz, localDate: date, kind: "morning" });
      if (eodDue) targets.push({ ...p, tz, localDate: date, kind: "eod" });
    }

    let sent = 0;
    const errors: any[] = [];
    for (const t of targets) {
      try {
        const briefRes = await fetch(`${SUPABASE_URL}/functions/v1/pp-ava-brief`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
            "x-ava-service": t.kind === "eod" ? "eod-summary" : "morning-brief",
            "x-broker-user-id": t.user_id,
          },
          body: JSON.stringify({ period: "day", force: true, broker_user_id: t.user_id, kind: t.kind }),
        });
        const brief = await briefRes.json().catch(() => ({}));
        const fallbackHeadline = t.kind === "eod" ? "Résumé de votre journée" : "Bonjour, voici votre journée";
        const headline = brief?.headline ?? fallbackHeadline;
        const first = Array.isArray(brief?.priorities) && brief.priorities.length
          ? brief.priorities[0]
          : (t.kind === "eod" ? "Consultez le résumé de vos appels et messages." : "Consultez vos priorités du jour.");

        await fetch(`${SUPABASE_URL}/functions/v1/pp-push-notify`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: t.user_id,
            title: `${t.kind === "eod" ? "🌙" : "☀️"} ${headline}`,
            body: first,
            category: t.kind === "eod" ? "eod_summary" : "morning_brief",
            deep_link: "/mplanipret/home?brief=today",
            data: { deepLink: "/mplanipret/home?brief=today", kind: t.kind === "eod" ? "eod_summary" : "morning_brief" },
          }),
        });

        const col = t.kind === "eod" ? "last_eod_summary_at" : "last_morning_brief_at";
        await admin.from("planipret_profiles").update({ [col]: new Date().toISOString() }).eq("id", t.id);
        sent++;
      } catch (e: any) {
        errors.push({ user_id: t.user_id, kind: t.kind, error: e?.message ?? String(e) });
      }
    }

    return j({ ok: true, considered: targets.length, sent, errors });
  } catch (e: any) {
    console.error("[ava-morning-brief-scheduler]", e);
    return j({ error: e?.message ?? "server_error" }, 500);
  }
});
