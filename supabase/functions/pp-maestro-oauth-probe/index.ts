// pp-maestro-oauth-probe — diagnostic: calls the Maestro Telecom API with the
// broker's OAuth access token (NO machine=1) and reports what each endpoint
// returns. Used to answer Scott's question about GET /user.
//
// POST body: { reveal_token?: boolean, broker_id?: string }
// Auth: requires a signed-in user (their own OAuth token is used).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getUserMaestroAccessToken } from "../_shared/maestro-oauth.ts";
import { getMaestroTelecomConfig } from "../_shared/maestro-telecom.ts";

function mask(t: string) {
  if (t.length <= 24) return "***";
  return `${t.slice(0, 12)}…${t.slice(-8)} (len=${t.length})`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: u } = await admin.auth.getUser(auth.slice(7));
  const userId = u?.user?.id ?? null;
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }

  const cfg = await getMaestroTelecomConfig(admin);
  const token = await getUserMaestroAccessToken(admin, userId);
  if (!token) {
    return new Response(JSON.stringify({ error: "no_oauth_token", hint: "Connect Maestro in Settings first." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: prof } = await admin
    .from("planipret_profiles")
    .select("maestro_broker_id, maestro_email, maestro_token_expires_at, maestro_scope")
    .or(`user_id.eq.${userId},id.eq.${userId}`)
    .maybeSingle();
  const brokerId = String(body.broker_id ?? prof?.maestro_broker_id ?? "").trim();

  const probe = async (path: string) => {
    const url = `${cfg.url}${path}`;
    const t0 = Date.now();
    try {
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const text = await r.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* non-json */ }
      return {
        path,
        status: r.status,
        ms: Date.now() - t0,
        content_type: r.headers.get("content-type"),
        empty_object: json !== null && typeof json === "object" && !Array.isArray(json) && Object.keys(json).length === 0,
        body_preview: (json ? JSON.stringify(json) : text).slice(0, 600),
      };
    } catch (e) {
      return { path, status: 0, ms: Date.now() - t0, error: (e as Error).message };
    }
  };

  const paths = ["/user", "/users/me", "/me", "/users"];
  if (brokerId) paths.push(`/users/${brokerId}`, `/users/${brokerId}/sip`);
  const results = [];
  for (const p of paths) results.push(await probe(p));

  return new Response(JSON.stringify({
    base_url: cfg.url,
    broker_id: brokerId || null,
    maestro_email: prof?.maestro_email ?? null,
    token_expires_at: prof?.maestro_token_expires_at ?? null,
    scope: prof?.maestro_scope ?? null,
    access_token: body.reveal_token === true ? token : mask(token),
    note: "All calls use the per-broker OAuth access token, no machine=1 query param.",
    results,
  }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
