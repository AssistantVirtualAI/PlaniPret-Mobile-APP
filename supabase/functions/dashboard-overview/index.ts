import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

interface Body {
  organizationId: string;
  startDate?: string;
  endDate?: string;
}

function isoDaysAgo(d: number): string {
  const x = new Date();
  x.setDate(x.getDate() - d);
  return x.toISOString();
}

async function countRange(
  table: string,
  orgCol: string,
  orgId: string,
  dateCol: string,
  start: string,
  end: string,
  extra?: (q: any) => any,
): Promise<number> {
  let q = supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(orgCol, orgId)
    .gte(dateCol, start)
    .lte(dateCol, end);
  if (extra) q = extra(q);
  const { count, error } = await q;
  if (error) return 0;
  return count || 0;
}

// Verify the caller is authenticated AND belongs to the requested org.
// This is the critical tenant-isolation gate: without it, any authenticated
// user could pass any organizationId in the body and read another tenant's data.
async function assertOrgAccess(req: Request, orgId: string): Promise<string> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("unauthorized");
  const token = authHeader.replace("Bearer ", "");

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
  if (claimsError || !claims?.claims?.sub) throw new Error("unauthorized");
  const userId = claims.claims.sub as string;

  // Super admin bypass (kept consistent with the rest of the project)
  const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (isSuper === true) return userId;

  // Reuse the project's canonical org-membership function. It already
  // unions organization_members, org_members, and pbx_softphone_users.
  const { data: orgIds, error: orgsError } = await supabase.rpc("get_user_organization_ids", {
    _user_id: userId,
  });
  if (orgsError) throw new Error("unauthorized");
  const allowed = Array.isArray(orgIds)
    ? orgIds.map((r: any) => (typeof r === "string" ? r : r?.get_user_organization_ids))
    : [];
  if (!allowed.includes(orgId)) {
    // Fallback: also accept pbx_softphone_users link, just in case
    const { data: sp } = await supabase
      .from("pbx_softphone_users")
      .select("organization_id")
      .eq("portal_user_id", userId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!sp) throw new Error("forbidden");
  }
  return userId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    const orgId = body.organizationId;
    if (!orgId) {
      return new Response(JSON.stringify({ error: "organizationId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CRITICAL: enforce tenant isolation. The caller MUST belong to orgId
    // (or be a super admin). Without this, any authenticated user could read
    // any other organization's data by passing a different organizationId.
    try {
      await assertOrgAccess(req, orgId);
    } catch (e) {
      const msg = String((e as Error).message || "forbidden");
      const status = msg === "unauthorized" ? 401 : 403;
      return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const end = body.endDate ? new Date(body.endDate).toISOString() : new Date().toISOString();
    const start = body.startDate
      ? new Date(body.startDate).toISOString()
      : isoDaysAgo(7);

    const periodMs = new Date(end).getTime() - new Date(start).getTime();
    const prevEnd = new Date(start).toISOString();
    const prevStart = new Date(new Date(start).getTime() - periodMs).toISOString();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    const [
      convCur,
      convPrev,
      convToday,
      callsCur,
      callsPrev,
      callsToday,
      missedCur,
      voicemailsUnread,
      activeCalls,
      twilioActive,
      leadsCur,
      leadsPrev,
      leadsConverted,
      apptUpcoming,
      apptToday,
      apptNoShow,
      campaignsActive,
      campaignCallsCur,
      handoffsPending,
      handoffsResolved,
      smsCur,
      kbItems,
      teamMembers,
      onlineMembers,
      integrationsErrored,
      orgRow,
      recentConvs,
      recentLeads,
      recentCalls,
      recentAppts,
      convChartRaw,
    ] = await Promise.all([
      countRange("conversations", "organization_id", orgId, "created_at", start, end),
      countRange("conversations", "organization_id", orgId, "created_at", prevStart, prevEnd),
      countRange("conversations", "organization_id", orgId, "created_at", todayIso, end),
      countRange("pbx_call_records", "organization_id", orgId, "start_at", start, end),
      countRange("pbx_call_records", "organization_id", orgId, "start_at", prevStart, prevEnd),
      countRange("pbx_call_records", "organization_id", orgId, "start_at", todayIso, end),
      countRange("pbx_call_records", "organization_id", orgId, "start_at", start, end, (q) =>
        q.eq("missed_call", true),
      ),
      supabase
        .from("pbx_voicemails")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .is("read_at", null),
      supabase
        .from("pbx_call_records")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .is("end_at", null),
      supabase
        .from("twilio_active_calls")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .in("status", ["in-progress", "ringing", "queued"]),
      countRange("leads", "organization_id", orgId, "created_at", start, end),
      countRange("leads", "organization_id", orgId, "created_at", prevStart, prevEnd),
      countRange("leads", "organization_id", orgId, "created_at", start, end, (q) =>
        q.not("converted_at", "is", null),
      ),
      supabase
        .from("appointments")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .gte("start_time", new Date().toISOString())
        .lte("start_time", isoDaysAgo(-7)),
      supabase
        .from("appointments")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .gte("start_time", todayIso)
        .lte("start_time", new Date(todayStart.getTime() + 86400000).toISOString()),
      countRange("appointments", "organization_id", orgId, "start_time", start, end, (q) =>
        q.eq("status", "no_show"),
      ),
      supabase
        .from("outbound_campaigns")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .in("status", ["active", "running", "scheduled"]),
      supabase
        .from("outbound_campaigns")
        .select("total_calls, completed_calls, successful_calls, failed_calls")
        .eq("organization_id", orgId)
        .gte("updated_at", start),
      supabase
        .from("handoff_requests")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .in("status", ["pending", "waiting"]),
      countRange("handoff_requests", "organization_id", orgId, "requested_at", start, end, (q) =>
        q.eq("status", "resolved"),
      ),
      supabase
        .from("pbx_sms_messages")
        .select("direction", { count: "exact" })
        .eq("organization_id", orgId)
        .gte("sent_at", start)
        .lte("sent_at", end),
      supabase
        .from("knowledge_base_items")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId),
      supabase
        .from("org_members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId),
      supabase
        .from("user_presence")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .gte("last_seen_at", new Date(Date.now() - 5 * 60 * 1000).toISOString()),
      supabase
        .from("organization_integrations")
        .select("platform, test_status, test_error")
        .eq("organization_id", orgId)
        .eq("is_active", true),
      supabase.from("organizations").select("id, name, trial_ends_at").eq("id", orgId).maybeSingle(),
      supabase
        .from("conversations")
        .select("id, title, created_at, platform")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("leads")
        .select("id, name, status, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("pbx_call_records")
        .select("id, caller_name, caller_number, start_at, direction")
        .eq("organization_id", orgId)
        .order("start_at", { ascending: false })
        .limit(5),
      supabase
        .from("appointments")
        .select("id, title, start_time, attendee_name")
        .eq("organization_id", orgId)
        .order("start_time", { ascending: false })
        .limit(5),
      supabase
        .from("conversations")
        .select("created_at")
        .eq("organization_id", orgId)
        .gte("created_at", start)
        .lte("created_at", end)
        .limit(2000),
    ]);

    // Campaign aggregates
    const campAgg = (campaignCallsCur.data || []).reduce(
      (acc: any, r: any) => {
        acc.total += r.total_calls || 0;
        acc.completed += r.completed_calls || 0;
        acc.successful += r.successful_calls || 0;
        acc.failed += r.failed_calls || 0;
        return acc;
      },
      { total: 0, completed: 0, successful: 0, failed: 0 },
    );

    // SMS in/out
    let smsIn = 0, smsOut = 0;
    (smsCur.data || []).forEach((m: any) => {
      if (m.direction === "inbound") smsIn++;
      else smsOut++;
    });

    // Daily chart
    const dayMap: Record<string, number> = {};
    (convChartRaw.data || []).forEach((c: any) => {
      const d = new Date(c.created_at).toISOString().slice(0, 10);
      dayMap[d] = (dayMap[d] || 0) + 1;
    });
    const dailyConversations = Object.entries(dayMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Trends
    const trend = (cur: number, prev: number): number =>
      prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);

    // Recent unified activity
    const activity: any[] = [];
    (recentConvs.data || []).forEach((c) =>
      activity.push({
        id: `conv-${c.id}`,
        type: "conversation",
        title: c.title || `Conversation (${c.platform || "chat"})`,
        timestamp: c.created_at,
      }),
    );
    (recentLeads.data || []).forEach((l) =>
      activity.push({
        id: `lead-${l.id}`,
        type: "lead",
        title: `New lead: ${l.name || "Unknown"} (${l.status})`,
        timestamp: l.created_at,
      }),
    );
    (recentCalls.data || []).forEach((c) =>
      activity.push({
        id: `call-${c.id}`,
        type: "call",
        title: `${c.direction === "inbound" ? "Incoming" : "Outgoing"} call · ${c.caller_name || c.caller_number || "Unknown"}`,
        timestamp: c.start_at,
      }),
    );
    (recentAppts.data || []).forEach((a) =>
      activity.push({
        id: `appt-${a.id}`,
        type: "appointment",
        title: `Appointment: ${a.title || a.attendee_name || "Untitled"}`,
        timestamp: a.start_time,
      }),
    );
    activity.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

    // Integration health
    const erroredIntegrations =
      (integrationsErrored.data || []).filter((i: any) => i.test_status === "error" || i.test_error).map((i: any) => ({
        platform: i.platform,
        error: i.test_error,
      }));

    // Billing snapshot
    const trialEndsAt = (orgRow.data as any)?.trial_ends_at || null;
    const trialDaysLeft = trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
      : null;

    return new Response(
      JSON.stringify({
        period: { start, end, prevStart, prevEnd },
        conversations: {
          total: convCur,
          today: convToday,
          previous: convPrev,
          trend: trend(convCur, convPrev),
          daily: dailyConversations,
        },
        voice: {
          callsTotal: callsCur,
          callsToday: callsToday,
          callsTrend: trend(callsCur, callsPrev),
          missed: missedCur,
          voicemailsUnread: voicemailsUnread.count || 0,
          activeNow: (activeCalls.count || 0) + (twilioActive.count || 0),
        },
        leads: {
          new: leadsCur,
          previous: leadsPrev,
          trend: trend(leadsCur, leadsPrev),
          converted: leadsConverted,
          conversionRate: leadsCur > 0 ? Math.round((leadsConverted / leadsCur) * 100) : 0,
        },
        appointments: {
          upcoming7d: apptUpcoming.count || 0,
          today: apptToday.count || 0,
          noShows: apptNoShow,
        },
        campaigns: {
          active: campaignsActive.count || 0,
          dialed: campAgg.completed,
          successful: campAgg.successful,
          failed: campAgg.failed,
          successRate:
            campAgg.completed > 0 ? Math.round((campAgg.successful / campAgg.completed) * 100) : 0,
        },
        handoffs: {
          pending: handoffsPending.count || 0,
          resolved: handoffsResolved,
        },
        messaging: {
          smsIn,
          smsOut,
        },
        team: {
          total: teamMembers.count || 0,
          online: onlineMembers.count || 0,
        },
        knowledge: {
          items: kbItems.count || 0,
        },
        health: {
          erroredIntegrations,
          erroredCount: erroredIntegrations.length,
        },
        billing: {
          orgName: (orgRow.data as any)?.name || null,
          trialEndsAt,
          trialDaysLeft,
        },
        recentActivity: activity.slice(0, 12),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("dashboard-overview error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
