// ms365-full-import — orchestrateur d'import MS365 (contacts, mail, calendrier, Teams)
// Invoqué à la connexion MS365 (mode "initial"), depuis Settings ("manual") ou par cron ("delta").
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MS365_DELEGATED_SCOPES, refreshMicrosoftAccessToken } from "../_shared/ms365.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function graph(admin: any, profile: any, url: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const r = await fetch(url.startsWith("http") ? url : `${GRAPH}${url}`, {
    ...init,
    headers: { Authorization: `Bearer ${profile.ms365_access_token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (r.status === 401 && retry) {
    const t = await refreshMicrosoftAccessToken(admin, profile, MS365_DELEGATED_SCOPES);
    if (t) { profile.ms365_access_token = t; return graph(admin, profile, url, init, false); }
  }
  return r;
}

async function setState(admin: any, user_id: string, resource: string, patch: Record<string, unknown>) {
  await admin.from("planipret_ms_sync_state").upsert({
    user_id, resource, updated_at: new Date().toISOString(), ...patch,
  }, { onConflict: "user_id,resource" });
}

async function sha1(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Dedup key: prefer 1st email, then normalized phone, then normalized name
function computeContactDedupKey(c: any): string | null {
  const email = (c.emailAddresses ?? [])[0]?.address?.toLowerCase().trim();
  if (email) return `e:${email}`;
  const phone = c.mobilePhone ?? (c.businessPhones ?? [])[0] ?? (c.homePhones ?? [])[0];
  if (phone) {
    const digits = String(phone).replace(/[^\d]/g, "");
    if (digits) return `p:${digits.length === 10 ? "1" + digits : digits}`;
  }
  const name = String(c.displayName ?? "").toLowerCase().trim().replace(/\s+/g, " ");
  if (name) return `n:${name}`;
  return null;
}

// ─── Sync contacts ─────────────────────────────────────────────────────
async function syncContacts(admin: any, profile: any) {
  const user_id = profile.user_id;
  await setState(admin, user_id, "contacts", { status: "running", last_error: null });
  const tenantId = String(profile.ms365_tenant_id ?? profile.ms365_tid ?? "");
  const accountEmail = String(profile.ms365_email ?? "").toLowerCase();
  let url = "/me/contacts?$top=100&$select=id,displayName,givenName,surname,emailAddresses,businessPhones,mobilePhone,homePhones,companyName,jobTitle";
  let total = 0;
  const seenKeys = new Set<string>();
  try {
    while (url) {
      const r = await graph(admin, profile, url);
      if (!r.ok) throw new Error(`contacts ${r.status}`);
      const d = await r.json();
      const rows = (d.value ?? []).map((c: any) => {
        const dedup = computeContactDedupKey(c);
        if (dedup) seenKeys.add(dedup);
        return {
          user_id,
          graph_id: c.id,
          source: "ms365_outlook",
          source_tenant_id: tenantId || null,
          source_account_email: accountEmail || null,
          dedup_key: dedup,
          display_name: c.displayName ?? null,
          given_name: c.givenName ?? null,
          surname: c.surname ?? null,
          emails: (c.emailAddresses ?? []).map((e: any) => ({ address: e.address, name: e.name })),
          phones: [
            ...(c.businessPhones ?? []).map((n: string) => ({ type: "business", number: n })),
            ...(c.mobilePhone ? [{ type: "mobile", number: c.mobilePhone }] : []),
            ...(c.homePhones ?? []).map((n: string) => ({ type: "home", number: n })),
          ],
          company: c.companyName ?? null,
          job_title: c.jobTitle ?? null,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });
      if (rows.length) await admin.from("planipret_ms_contacts").upsert(rows, { onConflict: "user_id,graph_id" });
      total += rows.length;
      url = d["@odata.nextLink"] ?? "";
    }
    await setState(admin, user_id, "contacts", { status: "success", last_full_sync_at: new Date().toISOString(), items_synced: total });
    return { ok: true, count: total, unique_keys: seenKeys.size };
  } catch (e) {
    await setState(admin, user_id, "contacts", { status: "error", last_error: String(e) });
    return { ok: false, error: String(e) };
  }
}

// ─── Sync mail (inbox + sent, delta si dispo) ──────────────────────────
async function syncMail(admin: any, profile: any, initial = false) {
  const user_id = profile.user_id;
  await setState(admin, user_id, "mail", { status: "running", last_error: null });
  let total = 0;
  try {
    const { data: state } = await admin.from("planipret_ms_sync_state").select("delta_link").eq("user_id", user_id).eq("resource", "mail").maybeSingle();
    const useDelta = !initial && state?.delta_link;
    const folders = useDelta ? [{ id: "delta", url: state.delta_link }] : [
      { id: "inbox", url: "/me/mailFolders/inbox/messages/delta?$top=50&$select=id,internetMessageId,conversationId,subject,from,toRecipients,ccRecipients,bodyPreview,body,isRead,importance,hasAttachments,sentDateTime,receivedDateTime" },
      { id: "sent",  url: "/me/mailFolders/sentitems/messages/delta?$top=50&$select=id,internetMessageId,conversationId,subject,from,toRecipients,ccRecipients,bodyPreview,body,isRead,importance,hasAttachments,sentDateTime,receivedDateTime" },
    ];
    let deltaLink: string | null = null;
    for (const folder of folders) {
      let url: string | null = folder.url;
      while (url) {
        const r = await graph(admin, profile, url);
        if (!r.ok) throw new Error(`mail ${folder.id} ${r.status}`);
        const d: any = await r.json();
        const myEmail = String(profile.ms365_email ?? "").toLowerCase();
        const rowsRaw = (d.value ?? []).filter((m: any) => m.id && !m["@removed"]);
        const rows = await Promise.all(rowsRaw.map(async (m: any) => {
          const toAddrs = (m.toRecipients ?? []).map((r: any) => (r.emailAddress?.address ?? "").toLowerCase()).filter(Boolean).sort();
          const hashBase = `${(m.subject ?? "").trim().toLowerCase()}|${toAddrs.join(",")}|${(m.bodyPreview ?? "").trim().slice(0, 500)}`;
          const content_hash = await sha1(hashBase);
          return {
            user_id,
            graph_id: m.id,
            internet_message_id: m.internetMessageId ?? null,
            content_hash,
            conversation_id: m.conversationId ?? null,
            folder: folder.id === "sent" ? "sent" : "inbox",
            subject: m.subject ?? null,
            from_email: m?.from?.emailAddress?.address ?? null,
            from_name: m?.from?.emailAddress?.name ?? null,
            to_recipients: (m.toRecipients ?? []).map((r: any) => ({ address: r.emailAddress?.address, name: r.emailAddress?.name })),
            cc_recipients: (m.ccRecipients ?? []).map((r: any) => ({ address: r.emailAddress?.address, name: r.emailAddress?.name })),
            body_preview: m.bodyPreview ?? null,
            body_html: m?.body?.content ?? null,
            is_read: !!m.isRead,
            is_sent_by_me: myEmail && (m?.from?.emailAddress?.address ?? "").toLowerCase() === myEmail,
            has_attachments: !!m.hasAttachments,
            importance: m.importance ?? null,
            sent_at: m.sentDateTime ?? null,
            received_at: m.receivedDateTime ?? null,
            last_synced_at: new Date().toISOString(),
          };
        }));
        if (rows.length) await admin.from("planipret_email_messages").upsert(rows, { onConflict: "user_id,graph_id" });
        total += rows.length;
        if (d["@odata.deltaLink"]) { deltaLink = d["@odata.deltaLink"]; url = null; }
        else url = d["@odata.nextLink"] ?? null;
      }
    }
    // Rewrite $select to include internetMessageId for future delta requests
    await setState(admin, user_id, "mail", {
      status: "success",
      last_full_sync_at: initial ? new Date().toISOString() : undefined,
      last_delta_sync_at: new Date().toISOString(),
      delta_link: deltaLink,
      items_synced: total,
    });
    return { ok: true, count: total };
  } catch (e) {
    await setState(admin, user_id, "mail", { status: "error", last_error: String(e) });
    return { ok: false, error: String(e) };
  }
}

// ─── Sync calendar (delta: create/update/delete) ───────────────────────
async function syncCalendar(admin: any, profile: any, initial = false) {
  const user_id = profile.user_id;
  await setState(admin, user_id, "calendar", { status: "running", last_error: null });
  let total = 0;
  let deleted = 0;
  try {
    const { data: state } = await admin.from("planipret_ms_sync_state").select("delta_link").eq("user_id", user_id).eq("resource", "calendar").maybeSingle();
    const useDelta = !initial && state?.delta_link;
    const start = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const end   = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString();
    let url: string | null = useDelta
      ? state!.delta_link
      : `/me/calendarView/delta?startDateTime=${start}&endDateTime=${end}&$top=100`;
    let deltaLink: string | null = null;
    while (url) {
      const r = await graph(admin, profile, url, { headers: { Prefer: 'odata.maxpagesize=100, outlook.body-content-type="text"' } });
      if (!r.ok) throw new Error(`calendar ${r.status}`);
      const d: any = await r.json();
      const removed: string[] = [];
      const rows: any[] = [];
      for (const e of (d.value ?? [])) {
        if (e["@removed"] || e.removed) { removed.push(e.id); continue; }
        rows.push({
          user_id,
          graph_id: e.id,
          subject: e.subject ?? null,
          body_preview: e.bodyPreview ?? null,
          location: e?.location?.displayName ?? null,
          starts_at: e?.start?.dateTime ? new Date(`${e.start.dateTime}Z`).toISOString() : null,
          ends_at:   e?.end?.dateTime   ? new Date(`${e.end.dateTime}Z`).toISOString()   : null,
          is_all_day: !!e.isAllDay,
          is_online_meeting: !!e.isOnlineMeeting,
          join_url: e?.onlineMeeting?.joinUrl ?? null,
          organizer_email: e?.organizer?.emailAddress?.address ?? null,
          attendees: (e.attendees ?? []).map((a: any) => ({ address: a?.emailAddress?.address, name: a?.emailAddress?.name, type: a?.type })),
          is_deleted: false,
          deleted_at: null,
          last_synced_at: new Date().toISOString(),
        });
      }
      if (rows.length) await admin.from("planipret_calendar_events").upsert(rows, { onConflict: "user_id,graph_id" });
      if (removed.length) {
        await admin.from("planipret_calendar_events")
          .update({ is_deleted: true, deleted_at: new Date().toISOString(), last_synced_at: new Date().toISOString() })
          .eq("user_id", user_id).in("graph_id", removed);
        deleted += removed.length;
      }
      total += rows.length;
      if (d["@odata.deltaLink"]) { deltaLink = d["@odata.deltaLink"]; url = null; }
      else url = d["@odata.nextLink"] ?? null;
    }
    await setState(admin, user_id, "calendar", {
      status: "success",
      last_full_sync_at: initial ? new Date().toISOString() : undefined,
      last_delta_sync_at: new Date().toISOString(),
      delta_link: deltaLink,
      items_synced: total,
    });
    return { ok: true, count: total, deleted };
  } catch (e) {
    await setState(admin, user_id, "calendar", { status: "error", last_error: String(e) });
    return { ok: false, error: String(e) };
  }
}

// ─── Sync Teams chats + derniers messages ──────────────────────────────
async function syncTeams(admin: any, profile: any) {
  const user_id = profile.user_id;
  await setState(admin, user_id, "teams", { status: "running", last_error: null });
  let total = 0;
  try {
    let url: string | null = "/me/chats?$top=50&$expand=members";
    const chats: any[] = [];
    while (url) {
      const r = await graph(admin, profile, url);
      if (!r.ok) throw new Error(`teams chats ${r.status}`);
      const d: any = await r.json();
      chats.push(...(d.value ?? []));
      url = d["@odata.nextLink"] ?? null;
    }
    const convRows = chats.map((c: any) => ({
      user_id,
      chat_id: c.id,
      topic: c.topic ?? null,
      chat_type: c.chatType ?? null,
      members: (c.members ?? []).map((m: any) => ({ name: m.displayName, email: m.email })),
      last_message_at: c.lastMessagePreview?.createdDateTime ?? null,
      last_message_preview: c.lastMessagePreview?.body?.content ?? null,
      last_synced_at: new Date().toISOString(),
    }));
    if (convRows.length) await admin.from("planipret_teams_conversations").upsert(convRows, { onConflict: "user_id,chat_id" });

    // Fetch last 25 messages per chat (limit to first 20 chats to avoid rate limits)
    for (const c of chats.slice(0, 20)) {
      try {
        const r = await graph(admin, profile, `/me/chats/${encodeURIComponent(c.id)}/messages?$top=25`);
        if (!r.ok) continue;
        const d: any = await r.json();
        const rows = (d.value ?? []).filter((m: any) => m.id && m.messageType === "message").map((m: any) => ({
          user_id,
          chat_id: c.id,
          graph_id: m.id,
          from_name: m?.from?.user?.displayName ?? null,
          from_email: m?.from?.user?.email ?? null,
          content: (m?.body?.content ?? "").replace(/<[^>]+>/g, "").slice(0, 4000),
          sent_at: m.createdDateTime ?? null,
        }));
        if (rows.length) await admin.from("planipret_teams_messages").upsert(rows, { onConflict: "user_id,graph_id" });
        total += rows.length;
      } catch { /* continue */ }
    }
    await setState(admin, user_id, "teams", { status: "success", last_full_sync_at: new Date().toISOString(), items_synced: chats.length });
    return { ok: true, chats: chats.length, messages: total };
  } catch (e) {
    await setState(admin, user_id, "teams", { status: "error", last_error: String(e) });
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { mode = "initial", resources: reqResources, _user_id: bodyUserId } = body ?? {};

    let userId: string | undefined;
    if (token && token === serviceKey && bodyUserId) {
      userId = String(bodyUserId);
    } else {
      const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await uc.auth.getUser();
      userId = user?.id;
    }
    if (!userId) return json({ success: false, error: "unauthorized" }, 401);

    const { data: profile } = await admin.from("planipret_profiles")
      .select("id, user_id, full_name, ms365_email, ms365_tenant_id, ms365_access_token, ms365_refresh_token, ms365_scopes, ms365_token_expiry")
      .eq("user_id", userId).maybeSingle();
    if (!profile?.ms365_access_token) return json({ success: false, error: "ms365_not_connected" }, 400);

    const resources: string[] = Array.isArray(reqResources) && reqResources.length
      ? reqResources : ["contacts", "mail", "calendar", "teams"];

    // Run sequentially to avoid saturating Graph rate limits per user.
    const results: Record<string, unknown> = {};
    if (resources.includes("contacts")) results.contacts = await syncContacts(admin, profile);
    if (resources.includes("mail"))     results.mail     = await syncMail(admin, profile, mode === "initial");
    if (resources.includes("calendar")) results.calendar = await syncCalendar(admin, profile, mode === "initial");
    if (resources.includes("teams"))    results.teams    = await syncTeams(admin, profile);

    return json({ success: true, mode, results });
  } catch (e) {
    console.error("[ms365-full-import]", e);
    return json({ success: false, error: String(e) }, 500);
  }
});
