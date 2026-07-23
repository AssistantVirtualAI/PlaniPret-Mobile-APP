// mobile-domain-stats: aggregated domain-wide stats for the mobile dashboard.
// Supports ?range=today|7d|30d
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SELECT_VARIANTS = [
  "id, call_status, missed_call, duration_seconds, voicemail_message, extension, start_at, direction, hangup_cause, caller_number, source_number, destination_number, destination",
  "id, call_status, missed_call, duration_seconds, voicemail_message, start_at, direction, hangup_cause, caller_number, source_number, destination_number, destination",
  "id, call_status, missed_call, duration_seconds, voicemail_message, start_at, direction, hangup_cause, caller_number, destination",
];

function isMissingColumn(error: any) {
  const msg = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  return error?.code === "42703"
    || (msg.includes("column") && msg.includes("does not exist"))
    || (msg.includes("could not find") && msg.includes("column"))
    || msg.includes("schema cache");
}

function text(v: unknown) {
  return String(v ?? "").trim();
}

function extensionForRow(row: any, extSet: Set<string>) {
  const direct = text(row?.extension);
  if (direct) return direct;
  const candidates = [row?.caller_number, row?.source_number, row?.destination_number, row?.destination]
    .map(text)
    .filter(Boolean);
  for (const c of candidates) if (extSet.has(c)) return c;
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const { data: sp } = await sb
      .from("pbx_softphone_users")
      .select("organization_id, extension, domain_uuid")
      .eq("portal_user_id", u.user.id)
      .maybeSingle();

    const empty = (range: string) => ({
      range, totalCalls: 0, answered: 0, missed: 0, voicemails: 0,
      totalTalkSec: 0, avgDurationSec: 0, answerRate: 0, peakHour: null,
      buckets: [], topExtensions: [], activeExtensions: 0,
      callsToday: 0, answeredToday: 0, missedToday: 0, voicemailsToday: 0,
      last7Days: [0,0,0,0,0,0,0], noSoftphone: !sp?.organization_id,
    });

    const url = new URL(req.url);
    const range = (url.searchParams.get("range") || "today") as "today" | "7d" | "30d";
    if (!sp?.organization_id) return json(empty(range));

    const orgId = sp.organization_id;
    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0,0,0,0);
    const days = range === "30d" ? 30 : range === "7d" ? 7 : 1;
    const since = new Date(startOfToday);
    since.setDate(since.getDate() - (days - 1));

    // Page through all rows to bypass the 1000-row PostgREST default cap.
    // Some legacy Lemtel schemas do not expose pbx_call_records.extension;
    // retry with compatible projections instead of returning 500 to Home.
    const PAGE = 1000;
    let list: any[] = [];
    let lastError: any = null;
    for (const selectCols of SELECT_VARIANTS) {
      const out: any[] = [];
      let failed = false;
      for (let from = 0; from < 100000; from += PAGE) {
        let q = sb.from("pbx_call_records")
          .select(selectCols)
          .eq("organization_id", orgId)
          .gte("start_at", since.toISOString())
          .order("start_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (sp.domain_uuid) q = q.eq("domain_uuid", sp.domain_uuid);
        const { data: page, error } = await q;
        if (error) {
          lastError = error;
          failed = true;
          break;
        }
        const chunk = page ?? [];
        out.push(...chunk);
        if (chunk.length < PAGE) break;
      }
      if (!failed) { list = out; lastError = null; break; }
      if (!isMissingColumn(lastError)) break;
    }
    if (lastError) throw lastError;
    const totalCalls = list.length;
    const missed = list.filter((r: any) => r.missed_call || r.call_status === "missed").length;
    const voicemails = list.filter((r: any) => !!r.voicemail_message || r.call_status === "voicemail").length;
    const answered = Math.max(0, totalCalls - missed - voicemails);
    const totalTalkSec = list.reduce((sum: number, r: any) => sum + Number(r.duration_seconds || 0), 0);
    const durations = list.map((r: any) => Number(r.duration_seconds || 0)).filter((n: number) => n > 0);
    const avgDurationSec = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const answerRate = totalCalls ? Math.round((answered / totalCalls) * 100) : 0;

    // Outbound dial stats
    const outboundCalls = list.filter((r: any) => r.direction === "outbound" || r.direction === "out").length;
    const dialFailedCount = list.filter((r: any) => {
      const isOut = r.direction === "outbound" || r.direction === "out";
      if (!isOut) return false;
      const cause = String(r.hangup_cause || "").toUpperCase();
      const failed = ["NO_ANSWER","USER_BUSY","CALL_REJECTED","NO_ROUTE_DESTINATION","NORMAL_TEMPORARY_FAILURE","RECOVERY_ON_TIMER_EXPIRE","ORIGINATOR_CANCEL"].includes(cause);
      return failed || Number(r.duration_seconds || 0) === 0;
    }).length;
    const dialSuccessRate = outboundCalls ? Math.round(((outboundCalls - dialFailedCount) / outboundCalls) * 100) : 0;

    // Peak hour (0-23)
    const hourMap = Array(24).fill(0);
    for (const r of list) {
      const h = new Date((r as any).start_at).getHours();
      hourMap[h]++;
    }
    let peakHour: number | null = null; let peakMax = 0;
    hourMap.forEach((c, h) => { if (c > peakMax) { peakMax = c; peakHour = h; } });

    // Per-day buckets (oldest -> newest)
    const buckets = Array(days).fill(0);
    for (const r of list) {
      const d = new Date((r as any).start_at);
      const dayStart = new Date(d); dayStart.setHours(0,0,0,0);
      const idx = days - 1 - Math.floor((startOfToday.getTime() - dayStart.getTime()) / (24 * 36e5));
      if (idx >= 0 && idx < days) buckets[idx]++;
    }

    let extNames: Record<string, string> = {};
    try {
      const { data: exts } = await sb.from("pbx_extensions_safe")
        .select("extension, effective_cid_name")
        .eq("organization_id", orgId)
        .limit(1000);
      for (const e of exts ?? []) {
        const ext = text((e as any).extension);
        if (ext) extNames[ext] = text((e as any).effective_cid_name);
      }
    } catch (_) {}
    const extSet = new Set(Object.keys(extNames));

    // Top extensions. Prefer the extension column when present, otherwise
    // infer it from caller/source/destination fields that match known extensions.
    const extMap: Record<string, number> = {};
    for (const r of list) {
      const k = extensionForRow(r, extSet); if (!k) continue;
      extMap[k] = (extMap[k] || 0) + 1;
    }
    const topExtNumbers = Object.entries(extMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topExtensions = topExtNumbers.map(([extension, calls]) => ({ extension, name: extNames[extension], calls }));

    const activeExtensions = Object.keys(extMap).length;

    // Legacy "today" fields for backwards compat with old dashboard
    const todayList = list.filter((r: any) => new Date(r.start_at) >= startOfToday);
    const missedToday = todayList.filter((r: any) => r.missed_call || r.call_status === "missed").length;
    const voicemailsToday = todayList.filter((r: any) => !!r.voicemail_message || r.call_status === "voicemail").length;
    const callsToday = todayList.length;
    const answeredToday = Math.max(0, callsToday - missedToday - voicemailsToday);

    // Last 7 days bar chart (always returned for legacy UI)
    const last7Days = Array(7).fill(0);
    if (range === "7d") {
      buckets.forEach((v, i) => { last7Days[i] = v; });
    } else {
      const since7 = new Date(startOfToday); since7.setDate(since7.getDate() - 6);
      for (const r of list) {
        const d = new Date((r as any).start_at);
        if (d < since7) continue;
        const dayStart = new Date(d); dayStart.setHours(0,0,0,0);
        const idx = 6 - Math.floor((startOfToday.getTime() - dayStart.getTime()) / (24 * 36e5));
        if (idx >= 0 && idx < 7) last7Days[idx]++;
      }
    }

    return json({
      range,
      totalCalls, answered, missed, voicemails,
      totalTalkSec, avgDurationSec, answerRate, peakHour,
      outboundCalls, dialFailedCount, dialSuccessRate,
      buckets, topExtensions, activeExtensions,
      // legacy fields
      callsToday, answeredToday, missedToday, voicemailsToday, last7Days,
    });
  } catch (e: any) {
    return json({ error: e.message || "error" }, 500);
  }
});
