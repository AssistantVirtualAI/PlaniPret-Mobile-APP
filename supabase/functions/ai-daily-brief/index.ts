import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub;
    if (!userId) return json({ success: false, error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("planipret_profiles").select("id, user_id, full_name, ms365_access_token").eq("user_id", userId).maybeSingle();
    if (!profile) return json({ success: false, error: "Profil introuvable" }, 404);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86400000);

    // Parallel fetches
    const ms365Promise = profile.ms365_access_token
      ? Promise.all([
          fetchMs365(authHeader, "read_emails", {}),
          fetchMs365(authHeader, "list_calendar_events", { start: today.toISOString(), end: tomorrow.toISOString() }),
        ])
      : Promise.resolve([{ emails: [] }, { events: [] }]);

    const [ms365, callsRes, vmRes] = await Promise.all([
      ms365Promise,
      admin.from("planipret_phone_calls").select("direction, caller_number, callee_number, started_at").eq("user_id", userId).gte("started_at", today.toISOString()).order("started_at", { ascending: false }),
      admin.from("planipret_voicemails").select("from_number, duration_seconds, created_at").eq("user_id", userId).eq("is_read", false).eq("folder", "inbox"),
    ]);

    const emails = (ms365[0] as any)?.emails?.slice(0, 5) ?? [];
    const events = (ms365[1] as any)?.events ?? [];
    const calls = callsRes.data ?? [];
    const voicemails = vmRes.data ?? [];

    const summary = {
      unread_emails: emails.length,
      meetings_today: events.length,
      calls_today: calls.length,
      unread_voicemails: voicemails.length,
    };

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    let briefing_text = fallbackBrief(profile.full_name, today, summary);

    if (apiKey) {
      try {
        const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "Tu es AVA, assistante IA des courtiers Planiprêt. Génère un brief matinal concis et professionnel en français canadien. Structure: Bonjour {name}, voici votre journée du {date}. Sections: 📧 Emails importants | 📅 Rendez-vous | 📞 Appels | 📬 Voicemails. Termine avec une suggestion de priorité pour la journée." },
              { role: "user", content: `Courtier: ${profile.full_name ?? "Courtier"}\nDate: ${today.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" })}\nEmails (${emails.length}): ${JSON.stringify(emails.map((e: any) => ({ subject: e.subject, from: e.from?.emailAddress?.address })))}\nRDV (${events.length}): ${JSON.stringify(events.map((ev: any) => ({ subject: ev.subject, start: ev.start?.dateTime })))}\nAppels aujourd'hui: ${calls.length}\nVoicemails non écoutés: ${voicemails.length}` },
            ],
          }),
        });
        if (ai.ok) {
          const d = await ai.json();
          briefing_text = d.choices?.[0]?.message?.content ?? briefing_text;
        }
      } catch (e) { console.error("ai brief error", e); }
    }

    return json({ success: true, briefing_text, summary });
  } catch (e: any) {
    console.error("ai-daily-brief", e);
    return json({ success: false, error: e?.message ?? "Erreur" }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function fetchMs365(authHeader: string, action: string, payload: any) {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ms365-actions`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    return await r.json();
  } catch { return {}; }
}

function fallbackBrief(name: string | null, date: Date, s: any) {
  return `Bonjour ${name ?? "Courtier"}, voici votre journée du ${date.toLocaleDateString("fr-CA")}.\n📧 ${s.unread_emails} emails non lus\n📅 ${s.meetings_today} rendez-vous\n📞 ${s.calls_today} appels aujourd'hui\n📬 ${s.unread_voicemails} voicemails à écouter`;
}
