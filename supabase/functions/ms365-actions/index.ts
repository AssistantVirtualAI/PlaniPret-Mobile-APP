import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MS365_DELEGATED_SCOPES, refreshMicrosoftAccessToken } from "../_shared/ms365.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";

async function refreshToken(admin: any, profile: any) {
  return await refreshMicrosoftAccessToken(admin, profile, MS365_DELEGATED_SCOPES);
}

async function graph(admin: any, profile: any, path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = profile.ms365_access_token;
  const r = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (r.status === 401 && retry) {
    const newToken = await refreshToken(admin, profile);
    if (newToken) { profile.ms365_access_token = newToken; return graph(admin, profile, path, init, false); }
  }
  return r;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    const body = await req.json();
    const { action, payload = {}, _user_id: bodyUserId } = body ?? {};

    // Trusted server-to-server call (service role) may pass _user_id in body.
    let userId: string | undefined;
    if (token && token === serviceKey && bodyUserId) {
      userId = String(bodyUserId);
    } else {
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: claims } = await userClient.auth.getClaims(token);
      userId = claims?.claims?.sub;
    }
    if (!userId) return new Response(JSON.stringify({ success: false, error: "Unauthorized", code: 401 }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: profile } = await admin.from("planipret_profiles").select("id, user_id, full_name, ms365_access_token, ms365_refresh_token, ms365_scopes, ms365_token_expiry, ms365_email").eq("user_id", userId).maybeSingle();
    if (!profile?.ms365_access_token) {
      return new Response(JSON.stringify({ success: false, error: "Microsoft 365 non connecté pour ce courtier" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    switch (action) {
      case "connection_status": {
        return j({
          success: true,
          connected: !!profile?.ms365_access_token,
          email: profile?.ms365_email ?? null,
          scopes: profile?.ms365_scopes ?? null,
          expires_at: profile?.ms365_token_expiry ?? null,
        });
      }
      case "read_emails": {
        const top = Math.min(Number(payload.top ?? 25), 50);
        const skip = Math.max(0, Number(payload.skip ?? 0));
        // Map frontend folder names to Microsoft Graph well-known folder names
        const folderMap: Record<string, string> = {
          inbox: "inbox",
          sent: "sentitems",
          drafts: "drafts",
          deleted: "deleteditems",
          archive: "archive",
          unread: "inbox",
        };
        const requestedFolder = String(payload.folder ?? "inbox");
        const folderName = folderMap[requestedFolder] ?? "inbox";
        const filter = requestedFolder === "unread" ? "&$filter=isRead%20eq%20false" : "";
        // For sent items, order by sentDateTime; for others use receivedDateTime
        const orderBy = (requestedFolder === "sent" || requestedFolder === "drafts")
          ? "lastModifiedDateTime%20desc"
          : "receivedDateTime%20desc";
        // Select sentDateTime for sent items so the date displays correctly
        const selectFields = (requestedFolder === "sent" || requestedFolder === "drafts")
          ? "id,subject,toRecipients,sentDateTime,receivedDateTime,bodyPreview,isRead,hasAttachments,importance,flag"
          : "id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead,hasAttachments,importance,flag";
        // Note: $count=true requires ConsistencyLevel: eventual header in Graph API.
        // To avoid silent failures, we use $count only when filtering (unread),
        // and always pass ConsistencyLevel when $count is present.
        const useCount = requestedFolder === "unread";
        const countParam = useCount ? "&$count=true" : "";
        const consistencyHeader = useCount ? { "ConsistencyLevel": "eventual" } : {};
        const r = await graph(admin, profile,
          `/me/mailFolders/${folderName}/messages?$top=${top}&$skip=${skip}&$orderby=${orderBy}${countParam}&$select=${selectFields}${filter}`,
          { headers: consistencyHeader }
        );
        const d = await r.json();
        if (!r.ok) {
          console.error("[ms365-actions] read_emails Graph error", r.status, JSON.stringify(d?.error ?? d).slice(0, 300));
        }
        const emails = d.value ?? [];
        return j({ success: r.ok, emails, hasMore: emails.length === top, nextSkip: skip + emails.length, total: d["@odata.count"] ?? null, error: d?.error?.message, details: d?.error, code: r.status }, 200);
      }
      case "list_attachments": {
        const id = String(payload.message_id ?? "");
        if (!id) return j({ success: false, error: "message_id requis" }, 400);
        const r = await graph(admin, profile, `/me/messages/${encodeURIComponent(id)}/attachments?$select=id,name,contentType,size,isInline`);
        const d = await r.json().catch(() => ({}));
        return j({ success: r.ok, attachments: d.value ?? [], error: d?.error?.message, code: r.status }, r.ok ? 200 : 500);
      }
      case "get_attachment": {
        const id = String(payload.message_id ?? "");
        const attId = String(payload.attachment_id ?? "");
        if (!id || !attId) return j({ success: false, error: "message_id + attachment_id requis" }, 400);
        const r = await graph(admin, profile, `/me/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attId)}`);
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return j({ success: false, error: d?.error?.message ?? "get_attachment failed", code: r.status }, 500);
        return j({
          success: true,
          attachment: {
            id: d.id, name: d.name, contentType: d.contentType, size: d.size,
            contentBytes: d.contentBytes ?? null,
          },
        });
      }
      case "list_folders": {
        const r = await graph(admin, profile, `/me/mailFolders?$top=50&$select=id,displayName,totalItemCount,unreadItemCount`);
        const d = await r.json().catch(() => ({}));
        return j({ success: r.ok, folders: d.value ?? [], error: d?.error?.message, details: d?.error, code: r.status }, r.ok ? 200 : 500);
      }
      case "read_email_detail": {
        const id = String(payload.message_id ?? "");
        if (!id) return j({ success: false, error: "message_id required" }, 400);
        const r = await graph(admin, profile, `/me/messages/${encodeURIComponent(id)}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,body,bodyPreview,hasAttachments,importance,conversationId,flag`);
        const d = await r.json();
        return j({ success: r.ok, email: d }, r.ok ? 200 : 500);
      }
      case "send_email": {
        const to = Array.isArray(payload.to) ? payload.to : [payload.to].filter(Boolean);
        if (!to.length || !payload.subject || !payload.body) return j({ success: false, error: "to, subject, body requis" }, 400);
        const cc = Array.isArray(payload.cc) ? payload.cc : [];
        const bcc = Array.isArray(payload.bcc) ? payload.bcc : [];
        const attachments = Array.isArray(payload.attachments) ? payload.attachments.map((a: any) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: String(a.name ?? "file"),
          contentType: String(a.contentType ?? "application/octet-stream"),
          contentBytes: String(a.contentBytes ?? ""),
        })) : [];
        const message: any = {
          subject: payload.subject,
          body: { contentType: "HTML", content: String(payload.body).replace(/\n/g, "<br/>") },
          toRecipients: to.map((e: string) => ({ emailAddress: { address: e } })),
          ccRecipients: cc.map((e: string) => ({ emailAddress: { address: e } })),
          bccRecipients: bcc.map((e: string) => ({ emailAddress: { address: e } })),
        };
        if (attachments.length) message.attachments = attachments;
        const r = await graph(admin, profile, `/me/sendMail`, { method: "POST", body: JSON.stringify({ message, saveToSentItems: true }) });
        const txt = await r.text().catch(() => "");
        return j({ success: r.ok, error: r.ok ? null : txt, code: r.status }, r.ok ? 200 : 500);
      }
      case "reply_email":
      case "reply_all_email": {
        const id = String(payload.message_id ?? "");
        if (!id) return j({ success: false, error: "message_id requis" }, 400);
        const path = action === "reply_all_email" ? "replyAll" : "reply";
        const attachments = Array.isArray(payload.attachments) ? payload.attachments.map((a: any) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: String(a.name ?? "file"),
          contentType: String(a.contentType ?? "application/octet-stream"),
          contentBytes: String(a.contentBytes ?? ""),
        })) : [];
        // If attachments provided, use createReply/createReplyAll → PATCH → send flow (Graph limitation).
        if (attachments.length) {
          const cr = await graph(admin, profile, `/me/messages/${encodeURIComponent(id)}/create${path === "replyAll" ? "ReplyAll" : "Reply"}`, {
            method: "POST",
            body: JSON.stringify({ message: { body: { contentType: "HTML", content: String(payload.body ?? "").replace(/\n/g, "<br/>") } } }),
          });
          const draft = await cr.json().catch(() => ({}));
          if (!cr.ok || !draft?.id) return j({ success: false, error: draft?.error?.message ?? "createReply failed", code: cr.status }, 500);
          const pr = await graph(admin, profile, `/me/messages/${encodeURIComponent(draft.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ attachments }),
          });
          if (!pr.ok) return j({ success: false, error: await pr.text().catch(() => ""), code: pr.status }, 500);
          const sr = await graph(admin, profile, `/me/messages/${encodeURIComponent(draft.id)}/send`, { method: "POST" });
          return j({ success: sr.ok, error: sr.ok ? null : await sr.text().catch(() => ""), code: sr.status }, sr.ok ? 200 : 500);
        }
        const r = await graph(admin, profile, `/me/messages/${encodeURIComponent(id)}/${path}`, {
          method: "POST",
          body: JSON.stringify({
            message: { body: { contentType: "HTML", content: String(payload.body ?? "").replace(/\n/g, "<br/>") } },
            comment: payload.comment ?? "",
          }),
        });
        const txt = await r.text().catch(() => "");
        return j({ success: r.ok, error: r.ok ? null : txt, code: r.status }, r.ok ? 200 : 500);
      }
      case "delete_email": {
        const id = String(payload.message_id ?? "");
        if (!id) return j({ success: false, error: "message_id requis" }, 400);
        // Default: move to Deleted Items (like a normal inbox). Set payload.hard=true to permanently delete.
        if (payload.hard) {
          const r = await graph(admin, profile, `/me/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
          return j({ success: r.ok, code: r.status, error: r.ok ? null : await r.text().catch(() => "") }, r.ok ? 200 : 500);
        }
        const r = await graph(admin, profile, `/me/messages/${encodeURIComponent(id)}/move`, { method: "POST", body: JSON.stringify({ destinationId: "deleteditems" }) });
        const d = await r.json().catch(() => ({}));
        return j({ success: r.ok, code: r.status, error: r.ok ? null : (d?.error?.message ?? "") }, r.ok ? 200 : 500);
      }
      case "archive_email": {
        const id = String(payload.message_id ?? "");
        if (!id) return j({ success: false, error: "message_id requis" }, 400);
        // Try the well-known "archive" folder first; if it fails (404/400), fall back to "clutter" then to a PATCH isRead approach
        const r = await graph(admin, profile, `/me/messages/${encodeURIComponent(id)}/move`, { method: "POST", body: JSON.stringify({ destinationId: "archive" }) });
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          return j({ success: true, code: r.status }, 200);
        }
        // Fallback: look up the Archive folder ID dynamically
        const foldersResp = await graph(admin, profile, `/me/mailFolders?$filter=displayName%20eq%20'Archive'&$select=id,displayName`);
        const foldersData = await foldersResp.json().catch(() => ({}));
        const archiveFolderId = (foldersData?.value ?? [])[0]?.id;
        if (archiveFolderId) {
          const r2 = await graph(admin, profile, `/me/messages/${encodeURIComponent(id)}/move`, { method: "POST", body: JSON.stringify({ destinationId: archiveFolderId }) });
          const d2 = await r2.json().catch(() => ({}));
          return j({ success: r2.ok, code: r2.status, error: r2.ok ? null : (d2?.error?.message ?? "") }, r2.ok ? 200 : 500);
        }
        // Last resort: move to deleteditems
        const r3 = await graph(admin, profile, `/me/messages/${encodeURIComponent(id)}/move`, { method: "POST", body: JSON.stringify({ destinationId: "deleteditems" }) });
        const d3 = await r3.json().catch(() => ({}));
        return j({ success: r3.ok, code: r3.status, error: r3.ok ? null : (d3?.error?.message ?? "Archive non disponible") }, r3.ok ? 200 : 500);
      }
      case "flag_email": {
        const id = String(payload.message_id ?? "");
        if (!id) return j({ success: false, error: "message_id requis" }, 400);
        const flagStatus = payload.unflag ? "notFlagged" : (payload.flagStatus ?? "flagged");
        const r = await graph(admin, profile, `/me/messages/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ flag: { flagStatus } }) });
        const d = await r.json().catch(() => ({}));
        return j({ success: r.ok, code: r.status, error: r.ok ? null : (d?.error?.message ?? "") }, r.ok ? 200 : 500);
      }
      case "mark_read_email": {
        const id = String(payload.message_id ?? "");
        if (!id) return j({ success: false, error: "message_id requis" }, 400);
        const r = await graph(admin, profile, `/me/messages/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ isRead: payload.isRead !== false }) });
        const d = await r.json().catch(() => ({}));
        return j({ success: r.ok, code: r.status, error: r.ok ? null : (d?.error?.message ?? "") }, r.ok ? 200 : 500);
      }
      case "forward_email": {
        const id = String(payload.message_id ?? "");
        const to = Array.isArray(payload.to) ? payload.to : [payload.to].filter(Boolean);
        if (!id || !to.length) return j({ success: false, error: "message_id + to requis" }, 400);
        const attachments = Array.isArray(payload.attachments) ? payload.attachments.map((a: any) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: String(a.name ?? "file"),
          contentType: String(a.contentType ?? "application/octet-stream"),
          contentBytes: String(a.contentBytes ?? ""),
        })) : [];
        if (attachments.length) {
          const cr = await graph(admin, profile, `/me/messages/${encodeURIComponent(id)}/createForward`, {
            method: "POST",
            body: JSON.stringify({
              toRecipients: to.map((e: string) => ({ emailAddress: { address: e } })),
              message: { body: { contentType: "HTML", content: String(payload.comment ?? "").replace(/\n/g, "<br/>") } },
            }),
          });
          const draft = await cr.json().catch(() => ({}));
          if (!cr.ok || !draft?.id) return j({ success: false, error: draft?.error?.message ?? "createForward failed", code: cr.status }, 500);
          const pr = await graph(admin, profile, `/me/messages/${encodeURIComponent(draft.id)}`, {
            method: "PATCH", body: JSON.stringify({ attachments }),
          });
          if (!pr.ok) return j({ success: false, error: await pr.text().catch(() => ""), code: pr.status }, 500);
          const sr = await graph(admin, profile, `/me/messages/${encodeURIComponent(draft.id)}/send`, { method: "POST" });
          return j({ success: sr.ok, error: sr.ok ? null : await sr.text().catch(() => ""), code: sr.status }, sr.ok ? 200 : 500);
        }
        const r = await graph(admin, profile, `/me/messages/${encodeURIComponent(id)}/forward`, {
          method: "POST",
          body: JSON.stringify({
            comment: payload.comment ?? "",
            toRecipients: to.map((e: string) => ({ emailAddress: { address: e } })),
          }),
        });
        const txt = await r.text().catch(() => "");
        return j({ success: r.ok, code: r.status, error: r.ok ? null : txt }, r.ok ? 200 : 500);
      }
      case "create_calendar_event": {
        if (!payload.subject || !payload.start || !payload.end) return j({ success: false, error: "subject, start, end requis" }, 400);
        const r = await graph(admin, profile, `/me/events`, { method: "POST", body: JSON.stringify({ subject: payload.subject, start: payload.start, end: payload.end, body: { contentType: "HTML", content: payload.body ?? "" }, attendees: (payload.attendees ?? []).map((e: string) => ({ emailAddress: { address: e }, type: "required" })), isOnlineMeeting: payload.isOnlineMeeting ?? true, onlineMeetingProvider: payload.onlineMeetingProvider ?? "teamsForBusiness" }) });
        const d = await r.json();
        return j({ success: r.ok, event_id: d.id, event: d, error: d?.error?.message, code: r.status }, r.ok ? 200 : 500);
      }
      case "list_calendar_events": {
        const start = payload.start ?? new Date().toISOString();
        const end = payload.end ?? new Date(Date.now() + 7 * 86400000).toISOString();
        const r = await graph(admin, profile, `/me/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}&$orderby=start/dateTime&$top=${Math.min(Number(payload.top ?? 20), 50)}&$select=id,subject,bodyPreview,start,end,location,attendees,organizer,onlineMeeting,webLink,isOnlineMeeting`);
        const d = await r.json();
        return j({ success: r.ok, events: d.value ?? [], error: d?.error?.message, details: d?.error, code: r.status }, r.ok ? 200 : 500);
      }
      case "update_calendar_event": {
        const id = String(payload.event_id ?? "");
        if (!id) return j({ success: false, error: "event_id requis" }, 400);
        const patch: Record<string, unknown> = {};
        if (payload.subject) patch.subject = payload.subject;
        if (payload.start) patch.start = payload.start;
        if (payload.end) patch.end = payload.end;
        if (payload.body) patch.body = { contentType: "HTML", content: payload.body };
        if (payload.location) patch.location = { displayName: String(payload.location) };
        if (Array.isArray(payload.attendees)) patch.attendees = payload.attendees.map((e: string) => ({ emailAddress: { address: e }, type: "required" }));
        const r = await graph(admin, profile, `/me/events/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
        const d = await r.json().catch(() => ({}));
        return j({ success: r.ok, event: d, error: d?.error?.message, code: r.status }, r.ok ? 200 : 500);
      }
      case "delete_calendar_event": {
        const id = String(payload.event_id ?? "");
        if (!id) return j({ success: false, error: "event_id requis" }, 400);
        const r = await graph(admin, profile, `/me/events/${encodeURIComponent(id)}`, { method: "DELETE" });
        const txt = await r.text().catch(() => "");
        return j({ success: r.ok, error: r.ok ? null : txt, code: r.status }, r.ok ? 200 : 500);
      }
      case "reply_teams_message":
      case "send_teams_message": {
        const chatId = payload.chat_id;
        const teamId = payload.team_id;
        const channelId = payload.channel_id;
        const content = payload.content ?? payload.message;
        if (!content) return j({ success: false, error: "content requis" }, 400);
        const scope = chatId
          ? `/chats/${encodeURIComponent(chatId)}/messages`
          : (teamId && channelId)
            ? `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`
            : null;
        if (!scope) return j({ success: false, error: "chat_id ou team_id+channel_id requis" }, 400);
        const r = await graph(admin, profile, scope, { method: "POST", body: JSON.stringify({ body: { contentType: payload.contentType ?? "text", content } }) });
        const d = await r.json().catch(() => ({}));
        return j({ success: r.ok, message_id: d.id, error: d?.error?.message, details: d?.error, code: r.status }, r.ok ? 200 : 500);
      }
      case "daily_briefing": {
        const emailsR = await graph(admin, profile, `/me/messages?$top=5&$filter=isRead%20eq%20false&$select=subject,from,bodyPreview`);
        const emails = (await emailsR.json()).value ?? [];
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 86400000);
        const eventsR = await graph(admin, profile, `/me/calendarView?startDateTime=${today.toISOString()}&endDateTime=${tomorrow.toISOString()}`);
        const events = (await eventsR.json()).value ?? [];

        const { data: ant } = await admin.from("planipret_integration_secrets").select("config").eq("provider", "anthropic").maybeSingle();
        const apiKey = (ant?.config as any)?.api_key ?? Deno.env.get("ANTHROPIC_API_KEY");
        let briefing = `Bonjour ${profile.full_name ?? ""}, voici votre résumé du ${today.toLocaleDateString("fr-CA")}. Vous avez ${emails.length} courriels non lus et ${events.length} rendez-vous aujourd'hui.`;
        if (apiKey) {
          const cr = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({
              model: "claude-sonnet-4-5-20250929",
              max_tokens: 600,
              system: "Tu es un assistant pour courtier hypothécaire. Génère un briefing matinal court et professionnel en français.",
              messages: [{ role: "user", content: `Courtier: ${profile.full_name}\nDate: ${today.toLocaleDateString("fr-CA")}\nCourriels non lus: ${JSON.stringify(emails)}\nRendez-vous: ${JSON.stringify(events)}\n\nGénère un briefing oral de 3-4 phrases.` }],
            }),
          });
          if (cr.ok) { const cd = await cr.json(); briefing = cd.content?.[0]?.text ?? briefing; }
        }
        return j({ success: true, briefing_text: briefing, emails_count: emails.length, events_count: events.length });
      }
      case "search_contact": {
        const q = String(payload.query ?? "").trim();
        if (!q) return j({ success: false, error: "query requis" }, 400);
        const enc = encodeURIComponent(q);
        // /me/people uses relevance-ranked people (emails, colleagues, contacts).
        // /me/contacts covers the personal address book. Query both in parallel.
        const [peopleR, contactsR] = await Promise.all([
          graph(admin, profile, `/me/people?$search="${enc}"&$top=10&$select=displayName,scoredEmailAddresses,phones,jobTitle,companyName`),
          graph(admin, profile, `/me/contacts?$search="${enc}"&$top=10&$select=displayName,emailAddresses,mobilePhone,businessPhones,companyName`),
        ]);
        const pd = await peopleR.json().catch(() => ({}));
        const cd = await contactsR.json().catch(() => ({}));
        const people = (pd.value ?? []).map((p: any) => ({
          name: p.displayName,
          email: p.scoredEmailAddresses?.[0]?.address ?? null,
          phone: p.phones?.[0]?.number ?? null,
          job: p.jobTitle, company: p.companyName, source: "people",
        }));
        const contacts = (cd.value ?? []).map((c: any) => ({
          name: c.displayName,
          email: c.emailAddresses?.[0]?.address ?? null,
          phone: c.mobilePhone ?? c.businessPhones?.[0] ?? null,
          company: c.companyName, source: "contacts",
        }));
        return j({ success: peopleR.ok || contactsR.ok, results: [...people, ...contacts].filter(r => r.email || r.phone).slice(0, 15), error: (!peopleR.ok && !contactsR.ok) ? (pd?.error?.message || cd?.error?.message) : undefined });
      }
      case "resolve_user_id": {
        const email = String(payload.email ?? "").trim();
        if (!email) return j({ success: false, error: "email required" }, 400);
        const enc = encodeURIComponent(email);
        const r = await graph(admin, profile, `/users?$filter=${encodeURIComponent(`mail eq '${email}' or userPrincipalName eq '${email}'`)}&$select=id,displayName,mail,userPrincipalName&$top=1`);
        const d = await r.json().catch(() => ({}));
        const u = d?.value?.[0];
        if (!u) {
          // Fallback: /me/people
          const pr = await graph(admin, profile, `/me/people?$search="${enc}"&$top=1&$select=displayName,scoredEmailAddresses,userPrincipalName`);
          const pd = await pr.json().catch(() => ({}));
          const p2 = pd?.value?.[0];
          if (p2?.userPrincipalName) {
            const r2 = await graph(admin, profile, `/users/${encodeURIComponent(p2.userPrincipalName)}?$select=id,displayName,mail`);
            const d2 = await r2.json().catch(() => ({}));
            if (d2?.id) return j({ success: true, user_id: d2.id, display_name: d2.displayName, email: d2.mail });
          }
          return j({ success: false, error: d?.error?.message ?? "user_not_found" });
        }
        return j({ success: true, user_id: u.id, display_name: u.displayName, email: u.mail ?? u.userPrincipalName });
      }
      case "create_teams_chat": {
        const userIds: string[] = Array.isArray(payload.user_ids) ? payload.user_ids : [];
        if (!userIds.length) return j({ success: false, error: "user_ids required" }, 400);
        const meR = await graph(admin, profile, "/me?$select=id");
        const meB = await meR.json().catch(() => ({}));
        if (!meR.ok || !meB?.id) return j({ success: false, error: "graph_me", details: meB }, meR.status);
        const allIds = Array.from(new Set([meB.id, ...userIds]));
        const isGroup = allIds.length > 2;
        const body: any = {
          chatType: isGroup ? "group" : "oneOnOne",
          members: allIds.map((id: string) => ({
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            roles: ["owner"],
            "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${id}')`,
          })),
        };
        if (isGroup && payload.topic) body.topic = payload.topic;
        const cr = await graph(admin, profile, "/chats", { method: "POST", body: JSON.stringify(body) });
        const cd = await cr.json().catch(() => ({}));
        if (!cr.ok) return j({ success: false, error: cd?.error?.message ?? "create_chat_failed", details: cd }, 200);
        return j({ success: true, chat_id: cd.id, chatType: cd.chatType });
      }
      default:
        return j({ success: false, error: "Action inconnue" }, 400);
    }

  } catch (e: any) {
    console.error("ms365-actions error", e);
    return new Response(JSON.stringify({ success: false, error: e?.message ?? "Erreur serveur", code: 0 }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
