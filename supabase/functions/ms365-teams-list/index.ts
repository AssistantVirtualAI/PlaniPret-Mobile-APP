// ms365-teams-list — Liste chats récents + équipes/canaux du courtier via MS Graph
// Auth: JWT du courtier. Retourne { chats: [...], teams: [{team, channels: [...]}] }
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
    const body = await req.json().catch(() => ({}));
    const mode = ["summary", "teams", "people", "full"].includes(body?.mode) ? body.mode : "full";
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return j({ error: "Unauthorized" }, 401);

    const { data: profile } = await admin
      .from("planipret_profiles")
      .select("id, user_id, ms365_access_token, ms365_refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile?.ms365_access_token) return j({ connected: false, chats: [], teams: [], error: "ms365_not_connected" });

    const diagnostics: any = {};

    // Chats récents — tolerate errors
    let chats: any[] = [];
    if (mode === "summary" || mode === "full") try {
      const chatsRes = await graph(admin, profile, "/me/chats?$top=25&$expand=members&$orderby=lastMessagePreview/createdDateTime desc");
      const chatsBody = await chatsRes.json().catch(() => ({}));
      if (!chatsRes.ok) {
        diagnostics.chats_error = chatsBody?.error?.message ?? `HTTP ${chatsRes.status}`;
      } else {
        chats = (chatsBody.value ?? []).map((c: any) => ({
          id: c.id,
          topic: c.topic ?? ((c.members ?? []).filter((m: any) => m.userId).map((m: any) => m.displayName).join(", ") || "Chat"),
          chatType: c.chatType,
          lastUpdated: c.lastUpdatedDateTime,
          members: (c.members ?? []).map((m: any) => ({ id: m.userId, name: m.displayName, email: m.email })),
          preview: c.lastMessagePreview?.body?.content ?? null,
          previewFrom: c.lastMessagePreview?.from?.user?.displayName ?? null,
        }));
      }
    } catch (e: any) { diagnostics.chats_error = e?.message; }

    if (mode === "summary") return j({ connected: true, chats, diagnostics });

    // Teams + channels
    const teams: any[] = [];
    if (mode === "teams" || mode === "full") try {
      const teamsRes = await graph(admin, profile, "/me/joinedTeams?$select=id,displayName,description");
      const teamsBody = await teamsRes.json().catch(() => ({}));
      if (!teamsRes.ok) {
        diagnostics.teams_error = teamsBody?.error?.message ?? `HTTP ${teamsRes.status}`;
      } else {
        const teamRows = (teamsBody.value ?? []).slice(0, 15);
        const channelRows = await Promise.all(teamRows.map(async (t: any) => {
          try {
            const chRes = await graph(admin, profile, `/teams/${t.id}/channels?$select=id,displayName`);
            const chBody = await chRes.json().catch(() => ({}));
            return {
              id: t.id,
              displayName: t.displayName,
              description: t.description ?? null,
              channels: (chBody.value ?? []).map((c: any) => ({ id: c.id, displayName: c.displayName })),
            };
          } catch {
            return { id: t.id, displayName: t.displayName, description: t.description ?? null, channels: [] };
          }
        }));
        teams.push(...channelRows);
      }
    } catch (e: any) { diagnostics.teams_error = e?.message; }

    if (mode === "teams") return j({ connected: true, teams, diagnostics });

    // Tenant users (people to chat with directly) + presence
    // Paginate through ALL tenant users and keep only enabled accounts with at least one Microsoft license.
    const people: any[] = [];
    if (mode === "people" || mode === "full") try {
      const collected: any[] = [];
      const peopleLimit = Math.min(Math.max(Number(body?.peopleLimit ?? 500), 50), 999);
      let nextPath: string | null =
        `/users?$top=${peopleLimit}&$select=id,displayName,mail,userPrincipalName,jobTitle,accountEnabled,assignedLicenses,userType`;
      let pages = 0;
      while (nextPath && pages < 4 && collected.length < peopleLimit) {
        const uRes = await graph(admin, profile, nextPath);
        const uBody = await uRes.json().catch(() => ({}));
        if (!uRes.ok) {
          diagnostics.people_error = uBody?.error?.message ?? `HTTP ${uRes.status}`;
          break;
        }
        for (const u of (uBody.value ?? [])) {
          collected.push(u);
          if (collected.length >= peopleLimit) break;
        }
        const next = uBody["@odata.nextLink"] as string | undefined;
        nextPath = collected.length < peopleLimit && next ? next.replace(GRAPH, "") : null;
        pages++;
      }
      diagnostics.people_fetched = collected.length;

      const licensed = collected.filter((u: any) => {
        if (!u.id) return false;
        if (u.accountEnabled === false) return false;
        const lic = Array.isArray(u.assignedLicenses) ? u.assignedLicenses.length : 0;
        return lic > 0;
      });
      diagnostics.people_licensed = licensed.length;

      const list = licensed
        .map((u: any) => ({
          id: u.id,
          name: u.displayName,
          email: u.mail ?? u.userPrincipalName,
          title: u.jobTitle ?? null,
          userType: u.userType ?? null,
          presence: null as null | { availability: string; activity: string },
        }))
        .sort((a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? "", "fr", { sensitivity: "base" }));

      const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
      await Promise.all(chunk(list, 20).map(async (grp) => {
        try {
          const pr = await graph(admin, profile, "/communications/getPresencesByUserId", {
            method: "POST",
            body: JSON.stringify({ ids: grp.map((p) => p.id) }),
          });
          const pb = await pr.json().catch(() => ({}));
          if (pr.ok) {
            const byId: Record<string, any> = {};
            for (const p of (pb.value ?? [])) byId[p.id] = p;
            for (const p of grp) {
              const pr2 = byId[p.id];
              if (pr2) p.presence = { availability: pr2.availability, activity: pr2.activity };
            }
          } else if (!diagnostics.presence_error) {
            diagnostics.presence_error = pb?.error?.message ?? `HTTP ${pr.status}`;
          }
        } catch (e: any) { if (!diagnostics.presence_error) diagnostics.presence_error = e?.message; }
      }));
      people.push(...list);
    } catch (e: any) { diagnostics.people_error = e?.message; }

    if (mode === "people") return j({ connected: true, people, diagnostics });

    return j({ connected: true, chats, teams, people, diagnostics });
  } catch (e: any) {
    console.error("[ms365-teams-list]", e);
    return j({ error: e?.message ?? "server_error" }, 500);
  }
});
