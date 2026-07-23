// mobile-home-stats: aggregated Home dashboard stats + AI summary/insights.
// Scopes strictly to the signed-in softphone user's extension + organization.
// Returns counts for period (today | week | month) plus AI summary + insights.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Period = "today" | "week" | "month";

function periodStartISO(p: Period): string {
  const now = new Date();
  if (p === "today") { const d = new Date(now); d.setHours(0,0,0,0); return d.toISOString(); }
  if (p === "week") return new Date(Date.now() - 7 * 86400_000).toISOString();
  return new Date(Date.now() - 30 * 86400_000).toISOString();
}
function priorRangeISO(p: Period): { start: string; end: string } {
  const now = Date.now();
  if (p === "today") {
    const start = new Date(now); start.setHours(0,0,0,0);
    const prevEnd = start.toISOString();
    const prevStart = new Date(start.getTime() - 86400_000).toISOString();
    return { start: prevStart, end: prevEnd };
  }
  if (p === "week") return { start: new Date(now - 14*86400_000).toISOString(), end: new Date(now - 7*86400_000).toISOString() };
  return { start: new Date(now - 60*86400_000).toISOString(), end: new Date(now - 30*86400_000).toISOString() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const url = new URL(req.url);
    const period = (url.searchParams.get("period") as Period) || "today";
    const lang = (url.searchParams.get("lang") || "fr").toLowerCase().startsWith("en") ? "en" : "fr";

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const { data: sp } = await sb
      .from("pbx_softphone_users")
      .select("organization_id, extension, sip_domain, display_name")
      .eq("portal_user_id", u.user.id)
      .maybeSingle();

    if (!sp || !sp.extension || !sp.organization_id) {
      return json({
        period, lang,
        scope: { organizationId: null, extension: null },
        stats: emptyStats(),
        prior: emptyStats(),
        summary: lang === "fr" ? "Configurez votre extension pour voir vos statistiques." : "Configure your extension to see your stats.",
        insights: [],
      });
    }

    const orgId = sp.organization_id;
    const ext = sp.extension;
    const sinceISO = periodStartISO(period);
    const prior = priorRangeISO(period);

    const [
      { data: calls }, { data: threads }, { data: recs }, { data: vms },
      { data: priorCalls }, { data: priorRecs }, { data: priorVms },
    ] = await Promise.all([
      sb.from("pbx_call_records")
        .select("direction, call_status, missed_call, duration_seconds, start_at")
        .eq("organization_id", orgId).eq("extension", ext).gte("start_at", sinceISO).limit(2000),
      sb.from("pbx_sms_threads")
        .select("unread_count, last_message_at")
        .eq("organization_id", orgId).eq("extension", ext).limit(500),
      sb.from("pbx_call_recordings")
        .select("id, transcript_status, start_at, created_at")
        .eq("organization_id", orgId).eq("extension", ext).gte("created_at", sinceISO).limit(2000),
      sb.from("pbx_voicemails")
        .select("id, is_new, created_at")
        .eq("organization_id", orgId).eq("extension", ext).gte("created_at", sinceISO).limit(1000),
      sb.from("pbx_call_records")
        .select("direction, missed_call, call_status")
        .eq("organization_id", orgId).eq("extension", ext).gte("start_at", prior.start).lt("start_at", prior.end).limit(2000),
      sb.from("pbx_call_recordings")
        .select("id")
        .eq("organization_id", orgId).eq("extension", ext).gte("created_at", prior.start).lt("created_at", prior.end).limit(2000),
      sb.from("pbx_voicemails")
        .select("id")
        .eq("organization_id", orgId).eq("extension", ext).gte("created_at", prior.start).lt("created_at", prior.end).limit(1000),
    ]);

    const stats = computeStats(calls || [], threads || [], recs || [], vms || [], sinceISO);
    const priorStats = computeStats(priorCalls || [], [], priorRecs || [], priorVms || [], prior.start);

    const { summary, insights } = await generateAI({
      lang, period, stats, prior: priorStats, name: sp.display_name || "",
    });

    return json({
      period, lang,
      scope: { organizationId: orgId, extension: ext, sipDomain: sp.sip_domain || null },
      stats, prior: priorStats, summary, insights,
    });
  } catch (e) {
    console.error("[mobile-home-stats]", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});

function emptyStats() {
  return {
    calls: { received: 0, missed: 0, outbound: 0, avgDurationSec: 0 },
    sms: { unread: 0, activeThreads: 0 },
    recordings: { total: 0, transcribed: 0, pending: 0, failed: 0 },
    voicemails: { new: 0, total: 0 },
  };
}

function computeStats(calls: any[], threads: any[], recs: any[], vms: any[], sinceISO: string) {
  const sinceTs = new Date(sinceISO).getTime();
  const received = calls.filter((c) => c.direction === "inbound" && !c.missed_call && c.call_status !== "voicemail").length;
  const missed = calls.filter((c) => c.missed_call).length;
  const outbound = calls.filter((c) => c.direction === "outbound").length;
  const durs = calls.map((c) => Number(c.duration_seconds || 0)).filter((n) => n > 0);
  const avgDurationSec = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;

  const unread = threads.reduce((s, t) => s + (t.unread_count || 0), 0);
  const activeThreads = threads.filter((t) => {
    const ts = t.last_message_at ? new Date(t.last_message_at).getTime() : 0;
    return ts >= sinceTs;
  }).length;

  const total = recs.length;
  const transcribed = recs.filter((r) => r.transcript_status === "completed" || r.transcript_status === "done").length;
  const failed = recs.filter((r) => r.transcript_status === "failed" || r.transcript_status === "error").length;
  const pending = Math.max(0, total - transcribed - failed);

  const vmNew = vms.filter((v) => v.is_new).length;
  const vmTotal = vms.length;

  return {
    calls: { received, missed, outbound, avgDurationSec },
    sms: { unread, activeThreads },
    recordings: { total, transcribed, pending, failed },
    voicemails: { new: vmNew, total: vmTotal },
  };
}

async function generateAI(args: { lang: "fr" | "en"; period: Period; stats: any; prior: any; name: string }) {
  const { lang, period, stats, prior, name } = args;
  const fallbackSummary = lang === "fr"
    ? `Sur cette période: ${stats.calls.received} reçus, ${stats.calls.missed} manqués, ${stats.calls.outbound} sortants. ${stats.voicemails.new} nouvelle(s) messagerie(s), ${stats.sms.unread} SMS non lu(s).`
    : `This period: ${stats.calls.received} answered, ${stats.calls.missed} missed, ${stats.calls.outbound} outbound. ${stats.voicemails.new} new voicemail(s), ${stats.sms.unread} unread SMS.`;
  const insights = buildInsights(stats, prior, lang);

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return { summary: fallbackSummary, insights };

  try {
    const periodLabel = lang === "fr"
      ? { today: "aujourd'hui", week: "cette semaine", month: "ce mois-ci" }[period]
      : { today: "today", week: "this week", month: "this month" }[period];
    const sys = lang === "fr"
      ? "Tu es AVA, assistante des utilisateurs de téléphonie Lemtel. Génère un résumé quotidien concis (1-2 phrases) en français naturel à partir des statistiques fournies. Pas d'emojis."
      : "You are AVA, assistant for Lemtel phone users. Generate a concise 1-2 sentence natural-language summary in English from the provided stats. No emojis.";
    const user = JSON.stringify({ name, period: periodLabel, stats });
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { summary: fallbackSummary, insights };
    const j = await res.json();
    const text = j?.choices?.[0]?.message?.content?.trim();
    return { summary: text || fallbackSummary, insights };
  } catch {
    return { summary: fallbackSummary, insights };
  }
}

function pct(cur: number, prev: number): number | null {
  if (!prev) return cur > 0 ? 100 : null;
  return Math.round(((cur - prev) / prev) * 100);
}

function buildInsights(stats: any, prior: any, lang: "fr" | "en") {
  const out: { id: string; tone: "danger" | "success" | "cyan" | "gold"; text: string }[] = [];
  const missedPct = pct(stats.calls.missed, prior.calls.missed);
  if (missedPct != null && Math.abs(missedPct) >= 20) {
    out.push({
      id: "missed-trend",
      tone: missedPct > 0 ? "danger" : "success",
      text: lang === "fr"
        ? `Appels manqués ${missedPct > 0 ? "en hausse" : "en baisse"} de ${Math.abs(missedPct)}% vs période précédente.`
        : `Missed calls ${missedPct > 0 ? "up" : "down"} ${Math.abs(missedPct)}% vs prior period.`,
    });
  }
  if (stats.voicemails.new > 0) {
    out.push({
      id: "vm-new",
      tone: "gold",
      text: lang === "fr"
        ? `${stats.voicemails.new} nouvelle(s) messagerie(s) à écouter.`
        : `${stats.voicemails.new} new voicemail(s) to review.`,
    });
  }
  if (stats.recordings.pending > 0) {
    out.push({
      id: "rec-pending",
      tone: "cyan",
      text: lang === "fr"
        ? `${stats.recordings.pending} enregistrement(s) en attente de transcription.`
        : `${stats.recordings.pending} recording(s) awaiting transcription.`,
    });
  }
  return out.slice(0, 3);
}
