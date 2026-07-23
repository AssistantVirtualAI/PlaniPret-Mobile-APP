// planipret-admin-ava-analytics — Admin AVA + Microsoft 365 analytics.
// Returns real cross-broker AVA activity and, when broker tokens exist, Microsoft Graph email/meeting stats.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MS365_DELEGATED_SCOPES, refreshMicrosoftAccessToken } from "../_shared/ms365.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Profile = {
  id: string;
  user_id: string | null;
  full_name: string | null;
  email: string | null;
  role: string | null;
  ms365_access_token?: string | null;
  ms365_refresh_token?: string | null;
  ms365_token_expiry?: string | null;
  ms365_email?: string | null;
  ms365_display_name?: string | null;
};

const ymd = (input: string | Date) => {
  const d = input instanceof Date ? input : new Date(input);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function getMsConfig(admin: any) {
  const { data } = await admin
    .from("planipret_integration_secrets")
    .select("config")
    .in("provider", ["microsoft", "ms365"])
    .limit(1)
    .maybeSingle();
  const cfg = (data?.config ?? {}) as Record<string, string>;
  return {
    clientId: cfg.client_id ?? Deno.env.get("MICROSOFT_CLIENT_ID") ?? "",
    clientSecret: cfg.client_secret ?? Deno.env.get("MICROSOFT_CLIENT_SECRET") ?? "",
    tenant: cfg.tenant_id ?? Deno.env.get("MICROSOFT_TENANT_ID") ?? "common",
  };
}

async function refreshToken(admin: any, profile: Profile) {
  if (!profile.ms365_refresh_token) return null;
  return await refreshMicrosoftAccessToken(admin, profile, MS365_DELEGATED_SCOPES);
}

async function graph(admin: any, profile: Profile, path: string, retry = true): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${profile.ms365_access_token}` },
  });
  if (res.status === 401 && retry) {
    const token = await refreshToken(admin, profile);
    if (token) {
      profile.ms365_access_token = token;
      return graph(admin, profile, path, false);
    }
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function pageAll(admin: any, profile: Profile, path: string, max = 800): Promise<any[]> {
  const rows: any[] = [];
  let next: string | null = path;
  while (next && rows.length < max) {
    const res = await graph(admin, profile, next);
    if (!res.ok) throw new Error(res.data?.error?.message ?? `Graph ${res.status}`);
    rows.push(...(res.data.value ?? []));
    const nextLink = res.data["@odata.nextLink"] as string | undefined;
    next = nextLink ? nextLink.replace(GRAPH, "") : null;
  }
  return rows.slice(0, max);
}

async function getAppAccessToken(admin: any) {
  const cfg = await getMsConfig(admin);
  if (!cfg.clientId || !cfg.clientSecret || !cfg.tenant || cfg.tenant === "common") return null;
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token as string;
}

async function pageAllApp(accessToken: string, userAddress: string, path: string, max = 800): Promise<any[]> {
  const rows: any[] = [];
  let next: string | null = `/users/${encodeURIComponent(userAddress)}${path}`;
  while (next && rows.length < max) {
    const res = await fetch(`${GRAPH}${next}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message ?? `Graph ${res.status}`);
    rows.push(...(data.value ?? []));
    const nextLink = data["@odata.nextLink"] as string | undefined;
    next = nextLink ? nextLink.replace(GRAPH, "") : null;
  }
  return rows.slice(0, max);
}

async function brokerM365Stats(admin: any, profile: Profile, sinceIso: string, nowIso: string, futureIso: string) {
  const [received, sent, events, upcoming] = await Promise.all([
    pageAll(admin, profile, `/me/messages?$filter=receivedDateTime ge ${sinceIso}&$select=receivedDateTime,from,isRead,subject&$top=100`, 1000),
    pageAll(admin, profile, `/me/mailFolders/sentitems/messages?$filter=sentDateTime ge ${sinceIso}&$select=sentDateTime,toRecipients&$top=100`, 1000),
    pageAll(admin, profile, `/me/events?$filter=start/dateTime ge '${sinceIso}' and start/dateTime le '${nowIso}'&$select=subject,start,end,attendees,isOnlineMeeting&$top=100`, 400),
    pageAll(admin, profile, `/me/events?$filter=start/dateTime ge '${nowIso}' and start/dateTime le '${futureIso}'&$select=subject,start,end,attendees,isOnlineMeeting,onlineMeeting&$orderby=start/dateTime&$top=5`, 10),
  ]);

  const daily: Record<string, { emails_received: number; emails_sent: number; emails_unread: number; meetings: number; meeting_minutes: number }> = {};
  const senders: Record<string, number> = {};
  for (const message of received) {
    const key = ymd(message.receivedDateTime);
    daily[key] ??= { emails_received: 0, emails_sent: 0, emails_unread: 0, meetings: 0, meeting_minutes: 0 };
    daily[key].emails_received++;
    if (message.isRead === false) daily[key].emails_unread++;
    const from = message.from?.emailAddress?.name || message.from?.emailAddress?.address;
    if (from) senders[from] = (senders[from] ?? 0) + 1;
  }
  for (const message of sent) {
    const key = ymd(message.sentDateTime);
    daily[key] ??= { emails_received: 0, emails_sent: 0, emails_unread: 0, meetings: 0, meeting_minutes: 0 };
    daily[key].emails_sent++;
  }
  for (const event of events) {
    const key = ymd(event.start?.dateTime ?? "");
    daily[key] ??= { emails_received: 0, emails_sent: 0, emails_unread: 0, meetings: 0, meeting_minutes: 0 };
    daily[key].meetings++;
    const start = new Date(event.start?.dateTime ?? 0).getTime();
    const end = new Date(event.end?.dateTime ?? 0).getTime();
    daily[key].meeting_minutes += Math.max(0, Math.round((end - start) / 60000));
  }

  const totals = Object.values(daily).reduce(
    (acc, day) => ({
      emails_received: acc.emails_received + day.emails_received,
      emails_sent: acc.emails_sent + day.emails_sent,
      emails_unread: acc.emails_unread + day.emails_unread,
      meetings: acc.meetings + day.meetings,
      meeting_minutes: acc.meeting_minutes + day.meeting_minutes,
    }),
    { emails_received: 0, emails_sent: 0, emails_unread: 0, meetings: 0, meeting_minutes: 0 },
  );

  return {
    broker_user_id: profile.user_id,
    broker_name: profile.full_name || profile.ms365_display_name || profile.ms365_email || profile.email || "Courtier",
    email: profile.ms365_email || profile.email,
    daily,
    totals,
    topSenders: Object.entries(senders).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
    upcomingMeetings: upcoming.map((event: any) => ({
      broker: profile.full_name || profile.ms365_email || profile.email,
      subject: event.subject,
      start: event.start?.dateTime,
      end: event.end?.dateTime,
      attendees: (event.attendees ?? []).length,
      is_online: !!event.isOnlineMeeting,
      join_url: event.onlineMeeting?.joinUrl ?? null,
    })),
  };
}

async function brokerM365AppStats(accessToken: string, profile: Profile, sinceIso: string, nowIso: string, futureIso: string) {
  const userAddress = profile.ms365_email || profile.email;
  if (!userAddress) throw new Error("Aucune adresse Microsoft pour ce courtier");
  const [received, sent, events, upcoming] = await Promise.all([
    pageAllApp(accessToken, userAddress, `/messages?$filter=receivedDateTime ge ${sinceIso}&$select=receivedDateTime,from,isRead,subject&$top=100`, 1000),
    pageAllApp(accessToken, userAddress, `/mailFolders/sentitems/messages?$filter=sentDateTime ge ${sinceIso}&$select=sentDateTime,toRecipients&$top=100`, 1000),
    pageAllApp(accessToken, userAddress, `/events?$filter=start/dateTime ge '${sinceIso}' and start/dateTime le '${nowIso}'&$select=subject,start,end,attendees,isOnlineMeeting&$top=100`, 400),
    pageAllApp(accessToken, userAddress, `/events?$filter=start/dateTime ge '${nowIso}' and start/dateTime le '${futureIso}'&$select=subject,start,end,attendees,isOnlineMeeting,onlineMeeting&$orderby=start/dateTime&$top=5`, 10),
  ]);

  const daily: Record<string, { emails_received: number; emails_sent: number; emails_unread: number; meetings: number; meeting_minutes: number }> = {};
  const senders: Record<string, number> = {};
  for (const message of received) {
    const key = ymd(message.receivedDateTime);
    daily[key] ??= { emails_received: 0, emails_sent: 0, emails_unread: 0, meetings: 0, meeting_minutes: 0 };
    daily[key].emails_received++;
    if (message.isRead === false) daily[key].emails_unread++;
    const from = message.from?.emailAddress?.name || message.from?.emailAddress?.address;
    if (from) senders[from] = (senders[from] ?? 0) + 1;
  }
  for (const message of sent) {
    const key = ymd(message.sentDateTime);
    daily[key] ??= { emails_received: 0, emails_sent: 0, emails_unread: 0, meetings: 0, meeting_minutes: 0 };
    daily[key].emails_sent++;
  }
  for (const event of events) {
    const key = ymd(event.start?.dateTime ?? "");
    daily[key] ??= { emails_received: 0, emails_sent: 0, emails_unread: 0, meetings: 0, meeting_minutes: 0 };
    daily[key].meetings++;
    const start = new Date(event.start?.dateTime ?? 0).getTime();
    const end = new Date(event.end?.dateTime ?? 0).getTime();
    daily[key].meeting_minutes += Math.max(0, Math.round((end - start) / 60000));
  }
  const totals = Object.values(daily).reduce(
    (acc, day) => ({
      emails_received: acc.emails_received + day.emails_received,
      emails_sent: acc.emails_sent + day.emails_sent,
      emails_unread: acc.emails_unread + day.emails_unread,
      meetings: acc.meetings + day.meetings,
      meeting_minutes: acc.meeting_minutes + day.meeting_minutes,
    }),
    { emails_received: 0, emails_sent: 0, emails_unread: 0, meetings: 0, meeting_minutes: 0 },
  );
  return {
    broker_user_id: profile.user_id,
    broker_name: profile.full_name || profile.ms365_display_name || userAddress,
    email: userAddress,
    daily,
    totals,
    topSenders: Object.entries(senders).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
    upcomingMeetings: upcoming.map((event: any) => ({
      broker: profile.full_name || userAddress,
      subject: event.subject,
      start: event.start?.dateTime,
      end: event.end?.dateTime,
      attendees: (event.attendees ?? []).length,
      is_online: !!event.isOnlineMeeting,
      join_url: event.onlineMeeting?.joinUrl ?? null,
    })),
  };
}

function fallbackInsights(aggregate: any) {
  const insights: string[] = [];
  if (aggregate.microsoft.scanned_brokers > 0) {
    insights.push(`${aggregate.microsoft.scanned_brokers} courtier(s) Microsoft scanné(s), ${aggregate.microsoft.totals.emails_received} emails reçus et ${aggregate.microsoft.totals.meetings} réunions sur la période.`);
  } else if (aggregate.microsoft.connected_brokers === 0) {
    insights.push("Aucun courtier n'a encore de token Microsoft 365 actif: reconnecter Microsoft pour alimenter emails et réunions.");
  } else {
    insights.push(`${aggregate.microsoft.connected_brokers} courtier(s) Microsoft connecté(s), ${aggregate.microsoft.totals.emails_received} emails reçus et ${aggregate.microsoft.totals.meetings} réunions sur la période.`);
  }
  if (aggregate.ava.analyses === 0 && aggregate.microsoft.scanned_brokers > 0) {
    insights.push("Microsoft est connecté mais AVA n'a pas encore d'analyses: lancer l'analyse des emails maintenant.");
  }
  if (aggregate.ava.errors > 0) insights.push(`${aggregate.ava.errors} action(s) AVA en erreur: vérifier les actions récentes et les autorisations.`);
  if (aggregate.ava.leads > 0) insights.push(`${aggregate.ava.leads} lead(s) détecté(s): prioriser le suivi des courtiers avec le plus d'activité.`);
  if (insights.length < 3) insights.push("Le tableau est connecté aux sources réelles; les compteurs restent à zéro tant qu'aucune activité n'est présente.");
  return insights.slice(0, 5);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userData } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    const user = userData?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: user.id });
    if (isAdmin !== true) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const days = Math.min(90, Math.max(1, Number(body.days ?? 30)));
    const includeGraph = body.includeGraph !== false;
    const includeInsights = body.insights !== false;
    const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();
    const nowIso = new Date().toISOString();
    const futureIso = new Date(Date.now() + 14 * 86400_000).toISOString();

    const [profilesRes, analysesRes, actionsRes, feedbackRes, auditRes] = await Promise.all([
      admin
        .from("planipret_profiles")
        .select("id,user_id,full_name,email,role,ms365_access_token,ms365_refresh_token,ms365_token_expiry,ms365_email,ms365_display_name")
        .not("user_id", "is", null)
        .limit(1000),
      admin
        .from("planipret_ava_email_analyses")
        .select("id,broker_user_id,email_subject,email_from,email_from_name,received_at,intent,urgency,lead_score,created_at")
        .gte("created_at", sinceIso)
        .limit(5000),
      admin
        .from("planipret_ava_action_log")
        .select("id,broker_user_id,analysis_id,action_type,success,error,modified_by_broker,executed_at")
        .gte("executed_at", sinceIso)
        .order("executed_at", { ascending: false })
        .limit(5000),
      admin
        .from("planipret_ava_feedback")
        .select("broker_user_id,rating,created_at")
        .gte("created_at", sinceIso)
        .limit(5000),
      admin
        .from("ai_request_audit_log")
        .select("request_type,metadata,created_at")
        .gte("created_at", sinceIso)
        .limit(2000),
    ]);

    const profiles = ((profilesRes.data ?? []) as Profile[]).filter((p) => p.user_id);
    const brokerProfiles = profiles.filter((p) => (p.role ?? "broker") !== "admin");
    const nameByUser = new Map(profiles.map((p) => [p.user_id, p.full_name || p.ms365_display_name || p.ms365_email || p.email || "Courtier"]));
    const emailByUser = new Map(profiles.map((p) => [p.user_id, p.ms365_email || p.email || null]));

    const daily: Record<string, any> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = ymd(d);
      daily[key] = {
        date: key,
        day: d.toLocaleDateString("fr-CA", { day: "2-digit", month: "2-digit" }),
        analyses: 0,
        leads: 0,
        urgent: 0,
        actions_ok: 0,
        actions_err: 0,
        ms_emails_received: 0,
        ms_emails_sent: 0,
        ms_meetings: 0,
      };
    }

    const rowsByUser = new Map<string, any>();
    for (const profile of brokerProfiles) {
      if (!profile.user_id) continue;
      rowsByUser.set(profile.user_id, {
        user_id: profile.user_id,
        broker_name: nameByUser.get(profile.user_id),
        broker_email: emailByUser.get(profile.user_id),
        analyses_30d: 0,
        urgent_30d: 0,
        leads_30d: 0,
        actions_ok_30d: 0,
        actions_err_30d: 0,
        actions_modified_30d: 0,
        ms365_connected: !!profile.ms365_access_token,
        emails_received: 0,
        emails_sent: 0,
        meetings: 0,
      });
    }

    const analyses = analysesRes.data ?? [];
    for (const item of analyses as any[]) {
      const uid = item.broker_user_id;
      if (!uid) continue;
      const row = rowsByUser.get(uid) ?? {
        user_id: uid,
        broker_name: nameByUser.get(uid) || uid.slice(0, 8),
        broker_email: emailByUser.get(uid),
        analyses_30d: 0,
        urgent_30d: 0,
        leads_30d: 0,
        actions_ok_30d: 0,
        actions_err_30d: 0,
        actions_modified_30d: 0,
        ms365_connected: false,
        emails_received: 0,
        emails_sent: 0,
        meetings: 0,
      };
      row.analyses_30d++;
      if (item.urgency === "high") row.urgent_30d++;
      if (item.intent === "nouveau_lead" || Number(item.lead_score ?? 0) >= 70) row.leads_30d++;
      rowsByUser.set(uid, row);
      const key = ymd(item.created_at);
      if (daily[key]) {
        daily[key].analyses++;
        if (item.urgency === "high") daily[key].urgent++;
        if (item.intent === "nouveau_lead" || Number(item.lead_score ?? 0) >= 70) daily[key].leads++;
      }
    }

    const actions = actionsRes.data ?? [];
    const toolMap: Record<string, number> = {};
    for (const action of actions as any[]) {
      const uid = action.broker_user_id;
      if (!uid) continue;
      const row = rowsByUser.get(uid) ?? {
        user_id: uid,
        broker_name: nameByUser.get(uid) || uid.slice(0, 8),
        broker_email: emailByUser.get(uid),
        analyses_30d: 0,
        urgent_30d: 0,
        leads_30d: 0,
        actions_ok_30d: 0,
        actions_err_30d: 0,
        actions_modified_30d: 0,
        ms365_connected: false,
        emails_received: 0,
        emails_sent: 0,
        meetings: 0,
      };
      if (action.success === false) row.actions_err_30d++;
      else if (action.success === true) row.actions_ok_30d++;
      if (action.modified_by_broker) row.actions_modified_30d++;
      rowsByUser.set(uid, row);
      const key = ymd(action.executed_at);
      if (daily[key]) {
        if (action.success === false) daily[key].actions_err++;
        else if (action.success === true) daily[key].actions_ok++;
      }
      const tool = action.action_type || "action";
      toolMap[tool] = (toolMap[tool] ?? 0) + 1;
    }

    for (const audit of (auditRes.data ?? []) as any[]) {
      const tool = audit.metadata?.tool || audit.metadata?.action || audit.request_type;
      if (tool) toolMap[String(tool).replace(/^elevenlabs_tool:/, "")] = (toolMap[String(tool).replace(/^elevenlabs_tool:/, "")] ?? 0) + 1;
    }

    const feedbackCounts = { up: 0, down: 0, modified: 0, skipped: 0 } as Record<string, number>;
    for (const fb of (feedbackRes.data ?? []) as any[]) {
      const key = String(fb.rating ?? "skipped");
      feedbackCounts[key] = (feedbackCounts[key] ?? 0) + 1;
    }

    const connectedProfiles = profiles.filter((p) => p.ms365_access_token && p.user_id);
    let graphProfiles = includeGraph ? connectedProfiles.slice(0, 40) : [];
    const graphResults: any[] = [];
    const graphErrors: Array<{ broker: string | null; error: string }> = [];
    for (let i = 0; i < graphProfiles.length; i += 5) {
      const chunk = graphProfiles.slice(i, i + 5);
      const settled = await Promise.allSettled(chunk.map((profile) => brokerM365Stats(admin, profile, sinceIso, nowIso, futureIso)));
      settled.forEach((result, idx) => {
        if (result.status === "fulfilled") graphResults.push(result.value);
        else graphErrors.push({ broker: chunk[idx].ms365_email ?? chunk[idx].email, error: result.reason?.message ?? String(result.reason) });
      });
    }

    let graphMode: "delegated" | "application" | "none" = graphProfiles.length ? "delegated" : "none";
    if (includeGraph && graphResults.length === 0) {
      const appToken = await getAppAccessToken(admin);
      const appProfiles = profiles.filter((p) => p.user_id && (p.ms365_email || p.email)).slice(0, 40);
      if (appToken && appProfiles.length) {
        graphMode = "application";
        graphProfiles = appProfiles;
        for (let i = 0; i < appProfiles.length; i += 5) {
          const chunk = appProfiles.slice(i, i + 5);
          const settled = await Promise.allSettled(chunk.map((profile) => brokerM365AppStats(appToken, profile, sinceIso, nowIso, futureIso)));
          settled.forEach((result, idx) => {
            if (result.status === "fulfilled") graphResults.push(result.value);
            else graphErrors.push({ broker: chunk[idx].ms365_email ?? chunk[idx].email, error: result.reason?.message ?? String(result.reason) });
          });
        }
      }
    }

    const microsoftTotals = { emails_received: 0, emails_sent: 0, emails_unread: 0, meetings: 0, meeting_minutes: 0 };
    const topSenders: Record<string, number> = {};
    const upcomingMeetings: any[] = [];
    for (const result of graphResults) {
      const uid = result.broker_user_id;
      const row = uid ? rowsByUser.get(uid) : null;
      microsoftTotals.emails_received += result.totals.emails_received;
      microsoftTotals.emails_sent += result.totals.emails_sent;
      microsoftTotals.emails_unread += result.totals.emails_unread;
      microsoftTotals.meetings += result.totals.meetings;
      microsoftTotals.meeting_minutes += result.totals.meeting_minutes;
      if (row) {
        row.emails_received = result.totals.emails_received;
        row.emails_sent = result.totals.emails_sent;
        row.meetings = result.totals.meetings;
        rowsByUser.set(uid, row);
      }
      for (const [date, day] of Object.entries(result.daily) as any[]) {
        if (!daily[date]) continue;
        daily[date].ms_emails_received += day.emails_received;
        daily[date].ms_emails_sent += day.emails_sent;
        daily[date].ms_meetings += day.meetings;
      }
      for (const sender of result.topSenders) topSenders[sender.name] = (topSenders[sender.name] ?? 0) + sender.count;
      upcomingMeetings.push(...result.upcomingMeetings);
    }

    const rows = Array.from(rowsByUser.values()).sort((a, b) =>
      (b.analyses_30d + b.emails_received + b.meetings) - (a.analyses_30d + a.emails_received + a.meetings),
    );
    const palette = ["#2E9BDC", "#00D4AA", "#9B7FE8", "#F5A623", "#E84C4C", "#F5C842", "#4A7FA5"];
    const toolMix = Object.entries(toolMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([name, value], i) => ({ name, value, color: palette[i % palette.length] }));
    const recentActions = (actions as any[]).slice(0, 15).map((a) => ({
      id: a.id,
      broker_user_id: a.broker_user_id,
      broker_name: nameByUser.get(a.broker_user_id) || a.broker_user_id?.slice(0, 8),
      action_type: a.action_type,
      success: a.success,
      error: a.error,
      modified_by_broker: a.modified_by_broker,
      executed_at: a.executed_at,
    }));

    const aggregate = {
      period_days: days,
      brokers_total: brokerProfiles.length,
      ava: {
        analyses: analyses.length,
        urgent: rows.reduce((s, r) => s + r.urgent_30d, 0),
        leads: rows.reduce((s, r) => s + r.leads_30d, 0),
        actions_ok: rows.reduce((s, r) => s + r.actions_ok_30d, 0),
        errors: rows.reduce((s, r) => s + r.actions_err_30d, 0),
      },
      microsoft: {
        connected_brokers: connectedProfiles.length,
        scanned_brokers: graphProfiles.length,
        graph_mode: graphMode,
        truncated: connectedProfiles.length > graphProfiles.length,
        totals: microsoftTotals,
        graph_errors: graphErrors.length,
      },
      feedback: feedbackCounts,
    };

    let insights = fallbackInsights(aggregate);
    if (includeInsights) {
      try {
        const key = Deno.env.get("LOVABLE_API_KEY");
        if (key) {
          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: "Tu es AVA, analyste opérations Planiprêt. Réponds en français avec 3 à 5 insights courts, factuels et actionnables. Retourne uniquement un JSON {\"insights\":[...]}" },
                { role: "user", content: JSON.stringify({ aggregate, top_brokers: rows.slice(0, 8), daily: Object.values(daily) }) },
              ],
              response_format: { type: "json_object" },
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
            if (Array.isArray(parsed.insights)) insights = parsed.insights.filter((x: unknown) => typeof x === "string").slice(0, 5);
          }
        }
      } catch (error) {
        console.error("admin insights failed", error);
      }
    }

    const lastAnalysisAt = (analyses as any[])
      .map((a) => a.created_at)
      .filter(Boolean)
      .sort()
      .pop() ?? null;

    return json({
      ok: true,
      days,
      summary: aggregate,
      rows,
      feedback: feedbackCounts,
      dailySeries: Object.values(daily),
      toolMix,
      recentActions,
      microsoft: {
        connected_brokers: connectedProfiles.length,
        scanned_brokers: graphProfiles.length,
        graph_mode: graphMode,
        truncated: graphMode === "delegated" ? connectedProfiles.length > graphProfiles.length : profiles.length > graphProfiles.length,
        totals: microsoftTotals,
        topSenders: Object.entries(topSenders).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
        upcomingMeetings: upcomingMeetings.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()).slice(0, 10),
        brokerSummaries: graphResults
          .map((r) => ({ broker_user_id: r.broker_user_id, broker_name: r.broker_name, email: r.email, ...r.totals }))
          .sort((a, b) => (b.emails_received + b.meetings) - (a.emails_received + a.meetings)),
        graphErrors,
      },
      dataHealth: {
        brokers_total: brokerProfiles.length,
        brokers_with_ms365_token: connectedProfiles.length,
        analyses_last_period: analyses.length,
        last_analysis_at: lastAnalysisAt,
        ms_graph_mode: graphMode,
        scanned_brokers: graphProfiles.length,
      },
      insights,
      source: "service-role-admin-aggregate+graph",
    });
  } catch (error) {
    console.error(error);
    return json({ error: (error as Error).message ?? "Unknown error" }, 500);
  }
});