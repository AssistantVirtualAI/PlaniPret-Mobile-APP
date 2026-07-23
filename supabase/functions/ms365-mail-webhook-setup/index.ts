// AVA — Crée un abonnement Microsoft Graph pour les nouveaux courriels du courtier.
// Auth : JWT du courtier. Stocke dans planipret_ava_mail_subscriptions.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MS365_DELEGATED_SCOPES, refreshMicrosoftAccessToken } from "../_shared/ms365.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";
const MAX_MINUTES = 4230; // ~2.95 days, max pour /messages
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

const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return j({ success: false, error: "Unauthorized" }, 401);

    const { data: profile } = await admin
      .from("planipret_profiles")
      .select("id, user_id, ms365_access_token, ms365_refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile?.ms365_access_token) return j({ success: false, error: "Microsoft 365 non connecté" }, 400);

    const projectId = Deno.env.get("SUPABASE_URL")!.replace("https://", "").split(".")[0];
    const notificationUrl = `https://${projectId}.functions.supabase.co/ms365-mail-webhook-receiver`;
    const clientState = crypto.randomUUID();
    const expiration = new Date(Date.now() + MAX_MINUTES * 60_000).toISOString();
    const resource = "/me/mailFolders('Inbox')/messages";

    // Remove old subs for this broker+resource to avoid duplicates
    const { data: existing } = await admin
      .from("planipret_ava_mail_subscriptions")
      .select("id, ms_subscription_id")
      .eq("broker_user_id", userId);
    for (const old of existing ?? []) {
      try { await graph(admin, profile, `/subscriptions/${old.ms_subscription_id}`, { method: "DELETE" }); } catch {}
      await admin.from("planipret_ava_mail_subscriptions").delete().eq("id", old.id);
    }

    const r = await graph(admin, profile, `/subscriptions`, {
      method: "POST",
      body: JSON.stringify({
        changeType: "created",
        notificationUrl,
        resource,
        expirationDateTime: expiration,
        clientState,
        latestSupportedTlsVersion: "v1_2",
      }),
    });
    const d = await r.json();
    if (!r.ok) return j({ success: false, error: `Graph subscription ${r.status}`, detail: d }, 500);

    const { data: inserted, error: iErr } = await admin.from("planipret_ava_mail_subscriptions").insert({
      broker_user_id: userId,
      broker_id: profile.id,
      ms_subscription_id: d.id,
      resource,
      client_state: clientState,
      notification_url: notificationUrl,
      expiration_datetime: d.expirationDateTime ?? expiration,
    }).select().single();
    if (iErr) throw iErr;

    return j({ success: true, subscription: inserted });
  } catch (e: any) {
    console.error("[ms365-mail-webhook-setup]", e);
    return j({ success: false, error: e?.message ?? "Erreur serveur" }, 500);
  }
});
