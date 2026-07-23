// AVA — Renouvelle les abonnements Graph qui expirent dans <24h.
// Peut être appelé sans JWT (idempotent, filtre par expiration). Sécurise via header ou tolère cron.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MS365_DELEGATED_SCOPES, refreshMicrosoftAccessToken } from "../_shared/ms365.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";
const MAX_MINUTES = 4230;

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
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const threshold = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: subs } = await admin
      .from("planipret_ava_mail_subscriptions")
      .select("*")
      .lt("expiration_datetime", threshold);

    const results: any[] = [];
    for (const sub of subs ?? []) {
      const { data: profile } = await admin
        .from("planipret_profiles")
        .select("id, user_id, ms365_access_token, ms365_refresh_token")
        .eq("user_id", sub.broker_user_id)
        .maybeSingle();
      if (!profile?.ms365_access_token) { results.push({ sub: sub.id, skipped: "no_token" }); continue; }

      const newExp = new Date(Date.now() + MAX_MINUTES * 60_000).toISOString();
      const r = await graph(admin, profile, `/subscriptions/${sub.ms_subscription_id}`, {
        method: "PATCH",
        body: JSON.stringify({ expirationDateTime: newExp }),
      });
      if (r.ok) {
        const d = await r.json();
        await admin.from("planipret_ava_mail_subscriptions").update({
          expiration_datetime: d.expirationDateTime ?? newExp,
          last_renewed_at: new Date().toISOString(),
        }).eq("id", sub.id);
        results.push({ sub: sub.id, renewed: true, until: d.expirationDateTime ?? newExp });
      } else {
        const txt = await r.text();
        console.warn("[renewer] failed", sub.ms_subscription_id, r.status, txt);
        // Si 404 → sub perdue, on la supprime
        if (r.status === 404) await admin.from("planipret_ava_mail_subscriptions").delete().eq("id", sub.id);
        results.push({ sub: sub.id, error: r.status });
      }
    }
    return j({ success: true, processed: results.length, results });
  } catch (e: any) {
    console.error("[ms365-mail-webhook-renewer]", e);
    return j({ success: false, error: e?.message ?? "Erreur serveur" }, 500);
  }
});
