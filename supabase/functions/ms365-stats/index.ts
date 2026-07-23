// ms365-stats — Microsoft 365 usage stats (emails + meetings) with AI insights.
// Auth: user JWT. Body: { days?: 7|30|90, insights?: boolean }
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MS365_DELEGATED_SCOPES, refreshMicrosoftAccessToken } from "../_shared/ms365.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function refreshToken(admin: any, profile: any) {
  return await refreshMicrosoftAccessToken(admin, profile, MS365_DELEGATED_SCOPES);
}
async function graph(admin: any, profile: any, path: string, retry = true): Promise<any> {
  const r = await fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${profile.ms365_access_token}` } });
  if (r.status === 401 && retry) {
    const t = await refreshToken(admin, profile);
    if (t) { profile.ms365_access_token = t; return graph(admin, profile, path, false); }
  }
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: d };
}

async function pageAll(admin: any, profile: any, path: string, max = 2000): Promise<any[]> {
  const out: any[] = [];
  let next: string | null = path;
  while (next && out.length < max) {
    const r = await graph(admin, profile, next);
    if (!r.ok) break;
    out.push(...(r.data.value ?? []));
    const nl: string | undefined = r.data["@odata.nextLink"];
    next = nl ? nl.replace("https://graph.microsoft.com/v1.0", "") : null;
  }
  return out;
}

function ymd(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return j({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const days = Math.min(90, Math.max(1, Number(body?.days ?? 7)));
    const wantInsights = body?.insights !== false;

    const { data: profile } = await admin
      .from("planipret_profiles")
      .select("id, user_id, ms365_access_token, ms365_refresh_token, ms365_email")
      .eq("user_id", uid).maybeSingle();
    if (!profile?.ms365_access_token) return j({ connected: false });

    const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();
    const nowIso = new Date().toISOString();
    const inFutureIso = new Date(Date.now() + 14 * 86400_000).toISOString();

    // Parallel Graph queries
    const [received, sent, events, upcoming] = await Promise.all([
      pageAll(admin, profile, `/me/messages?$filter=receivedDateTime ge ${sinceIso}&$select=receivedDateTime,from,isRead,subject&$top=200`, 2000),
      pageAll(admin, profile, `/me/mailFolders/sentitems/messages?$filter=sentDateTime ge ${sinceIso}&$select=sentDateTime,toRecipients&$top=200`, 2000),
      pageAll(admin, profile, `/me/events?$filter=start/dateTime ge '${sinceIso}' and start/dateTime le '${nowIso}'&$select=subject,start,end,attendees,isOnlineMeeting&$top=200`, 500),
      pageAll(admin, profile, `/me/events?$filter=start/dateTime ge '${nowIso}' and start/dateTime le '${inFutureIso}'&$select=subject,start,end,attendees,isOnlineMeeting,onlineMeeting&$orderby=start/dateTime&$top=10`, 20),
    ]);

    // Build daily buckets
    const buckets: Record<string, { date: string; emails_received: number; emails_sent: number; emails_unread: number; meetings: number; meeting_minutes: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 86400_000);
      const k = ymd(d.toISOString());
      buckets[k] = { date: k, emails_received: 0, emails_sent: 0, emails_unread: 0, meetings: 0, meeting_minutes: 0 };
    }
    const senders: Record<string, number> = {};
    for (const m of received) {
      const k = ymd(m.receivedDateTime);
      if (buckets[k]) {
        buckets[k].emails_received++;
        if (m.isRead === false) buckets[k].emails_unread++;
      }
      const from = m.from?.emailAddress?.name || m.from?.emailAddress?.address;
      if (from) senders[from] = (senders[from] ?? 0) + 1;
    }
    for (const m of sent) {
      const k = ymd(m.sentDateTime);
      if (buckets[k]) buckets[k].emails_sent++;
    }
    for (const e of events) {
      const k = ymd(e.start?.dateTime ?? "");
      if (buckets[k]) {
        buckets[k].meetings++;
        const s = new Date(e.start?.dateTime ?? 0).getTime();
        const en = new Date(e.end?.dateTime ?? 0).getTime();
        buckets[k].meeting_minutes += Math.max(0, Math.round((en - s) / 60000));
      }
    }
    const daily = Object.values(buckets);
    const totals = daily.reduce((a, b) => ({
      emails_received: a.emails_received + b.emails_received,
      emails_sent: a.emails_sent + b.emails_sent,
      emails_unread: a.emails_unread + b.emails_unread,
      meetings: a.meetings + b.meetings,
      meeting_minutes: a.meeting_minutes + b.meeting_minutes,
    }), { emails_received: 0, emails_sent: 0, emails_unread: 0, meetings: 0, meeting_minutes: 0 });

    const topSenders = Object.entries(senders).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
    const upcomingMeetings = upcoming.map((e: any) => ({
      subject: e.subject, start: e.start?.dateTime, end: e.end?.dateTime,
      attendees: (e.attendees ?? []).length, is_online: !!e.isOnlineMeeting,
      join_url: e.onlineMeeting?.joinUrl ?? null,
    }));

    let insights: string[] = [];
    if (wantInsights) {
      try {
        const key = Deno.env.get("LOVABLE_API_KEY");
        if (key) {
          const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: "Tu es AVA, coach du courtier. Produis 3 à 5 insights concis en français à partir des stats Microsoft 365. Format: liste JSON de strings courtes (≤120 chars). Sois factuel, actionnable, chaleureux." },
                { role: "user", content: JSON.stringify({ days, totals, daily, topSenders, upcomingMeetings }) },
              ],
              response_format: { type: "json_object" },
            }),
          });
          if (r.ok) {
            const d = await r.json();
            const raw = d.choices?.[0]?.message?.content ?? "{}";
            const parsed = JSON.parse(raw);
            insights = Array.isArray(parsed) ? parsed : (parsed.insights ?? parsed.items ?? []);
            insights = insights.filter((x) => typeof x === "string").slice(0, 5);
          }
        }
      } catch (e) { console.error("insights failed", e); }
    }

    return j({ connected: true, days, totals, daily, topSenders, upcomingMeetings, insights });
  } catch (e) {
    return j({ error: String((e as Error).message ?? e) }, 500);
  }
});
