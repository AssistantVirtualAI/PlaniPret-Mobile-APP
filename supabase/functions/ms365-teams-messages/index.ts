// ms365-teams-messages — GET messages d'un chat/canal ou POST envoi.
// Auth: JWT courtier.
// Body:
//   GET  { action:"list", chat_id?, team_id?, channel_id?, top? }
//   POST { action:"send", chat_id?, team_id?, channel_id?, content, contentType?:"text"|"html" }
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MS365_DELEGATED_SCOPES, refreshMicrosoftAccessToken } from "../_shared/ms365.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function refreshToken(admin: any, profile: any) {
  return await refreshMicrosoftAccessToken(admin, profile, MS365_DELEGATED_SCOPES);
}
async function graph(admin: any, profile: any, path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const r = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${profile.ms365_access_token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (r.status === 401 && retry) {
    const t = await refreshToken(admin, profile);
    if (t) { profile.ms365_access_token = t; return graph(admin, profile, path, init, false); }
  }
  return r;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return j({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { action, chat_id, team_id, channel_id, content, contentType = "html", top = 30, user_ids, topic, attachments, filename, mimeType, contentBase64 } = body ?? {};
    if (!action) return j({ error: "action_required" }, 400);

    const { data: profile } = await admin
      .from("planipret_profiles")
      .select("id, user_id, ms365_access_token, ms365_refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile?.ms365_access_token) return j({ connected: false, messages: [], error: "ms365_not_connected" });

    // Create or reuse a chat (1:1 or group)
    if (action === "create_chat") {
      if (!Array.isArray(user_ids) || user_ids.length === 0) return j({ error: "user_ids_required" }, 400);
      const meRes = await graph(admin, profile, "/me?$select=id");
      const meBody = await meRes.json();
      if (!meRes.ok) return j({ error: "graph_me", detail: meBody }, meRes.status);
      const meId = meBody.id as string;
      const allIds = Array.from(new Set([meId, ...user_ids]));
      const isGroup = allIds.length > 2;
      const payload: any = {
        chatType: isGroup ? "group" : "oneOnOne",
        members: allIds.map((id: string) => ({
          "@odata.type": "#microsoft.graph.aadUserConversationMember",
          roles: ["owner"],
          "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${id}')`,
        })),
      };
      if (isGroup && topic) payload.topic = topic;
      const cr = await graph(admin, profile, "/chats", { method: "POST", body: JSON.stringify(payload) });
      const cb = await cr.json();
      if (!cr.ok) return j({ error: "graph_create_chat", detail: cb }, cr.status);
      return j({ ok: true, chat_id: cb.id, chatType: cb.chatType, topic: cb.topic ?? null });
    }

    // Upload attachment to OneDrive and return sharing link + driveItem info
    if (action === "upload_attachment") {
      if (!filename || !contentBase64) return j({ error: "filename_and_contentBase64_required" }, 400);
      const bin = Uint8Array.from(atob(contentBase64), (c) => c.charCodeAt(0));
      const safeName = String(filename).replace(/[\\/:*?"<>|]/g, "_");
      const folder = "PlanipretTeams";
      const upPath = `/me/drive/root:/${encodeURIComponent(folder)}/${encodeURIComponent(safeName)}:/content`;
      const upRes = await fetch(`${GRAPH}${upPath}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${profile.ms365_access_token}`,
          "Content-Type": mimeType || "application/octet-stream",
        },
        body: bin,
      });
      let upBody = await upRes.json().catch(() => ({}));
      if (upRes.status === 401) {
        const nt = await refreshToken(admin, profile);
        if (nt) {
          profile.ms365_access_token = nt;
          const r2 = await fetch(`${GRAPH}${upPath}`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${nt}`, "Content-Type": mimeType || "application/octet-stream" },
            body: bin,
          });
          upBody = await r2.json().catch(() => ({}));
          if (!r2.ok) return j({ error: "graph_upload", detail: upBody }, r2.status);
        }
      } else if (!upRes.ok) {
        return j({ error: "graph_upload", detail: upBody }, upRes.status);
      }
      // Create org-scoped view link so recipients can open the file
      const lk = await graph(admin, profile, `/me/drive/items/${upBody.id}/createLink`, {
        method: "POST",
        body: JSON.stringify({ type: "view", scope: "organization" }),
      });
      const lkBody = await lk.json().catch(() => ({}));
      const webUrl = lkBody?.link?.webUrl ?? upBody.webUrl;
      return j({
        ok: true,
        attachment: {
          id: upBody.id,
          name: upBody.name,
          webUrl,
          contentType: mimeType || "application/octet-stream",
          size: upBody.size,
        },
      });
    }

    const scope = chat_id
      ? `/chats/${chat_id}/messages`
      : (team_id && channel_id)
        ? `/teams/${team_id}/channels/${channel_id}/messages`
        : null;
    if (!scope) return j({ error: "chat_id_or_team_channel_required" }, 400);

    if (action === "list") {
      const meRes = await graph(admin, profile, "/me?$select=id,displayName");
      const meBody = await meRes.json().catch(() => ({}));
      const meId = meRes.ok ? meBody.id : null;
      const r = await graph(admin, profile, `${scope}?$top=${Math.min(50, Number(top) || 30)}`);
      const d = await r.json();
      if (!r.ok) return j({ error: "graph_list", detail: d }, r.status);
      const messages = (d.value ?? []).map((m: any) => ({
        id: m.id,
        from: m.from?.user?.displayName ?? m.from?.application?.displayName ?? "Unknown",
        fromId: m.from?.user?.id ?? null,
        isMe: !!(meId && m.from?.user?.id === meId),
        createdAt: m.createdDateTime,
        contentType: m.body?.contentType,
        content: m.body?.content ?? "",
        attachments: (m.attachments ?? []).map((a: any) => ({
          id: a.id, name: a.name, contentUrl: a.contentUrl, contentType: a.contentType,
        })),
      }));
      return j({ messages, me_id: meId, me_name: meBody?.displayName ?? null });
    }

    if (action === "send") {
      const hasAtt = Array.isArray(attachments) && attachments.length > 0;
      if (!content && !hasAtt) return j({ error: "content_or_attachments_required" }, 400);
      let finalContent = content ?? "";
      let finalContentType = contentType;
      const msgAttachments: any[] = [];
      if (hasAtt) {
        finalContentType = "html";
        const parts: string[] = [];
        for (const a of attachments) {
          if (!a?.id || !a?.name || !a?.webUrl) continue;
          msgAttachments.push({
            id: a.id,
            contentType: "reference",
            contentUrl: a.webUrl,
            name: a.name,
          });
          parts.push(`<attachment id="${a.id}"></attachment>`);
        }
        finalContent = `${finalContent ? `<p>${finalContent}</p>` : ""}${parts.join("")}`;
      }
      const payload: any = { body: { contentType: finalContentType, content: finalContent } };
      if (msgAttachments.length) payload.attachments = msgAttachments;
      const r = await graph(admin, profile, scope, { method: "POST", body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) return j({ error: "graph_send", detail: d }, r.status);
      return j({ ok: true, id: d.id });
    }

    return j({ error: "unknown_action" }, 400);
  } catch (e: any) {
    console.error("[ms365-teams-messages]", e);
    return j({ error: e?.message ?? "server_error" }, 500);
  }
});
