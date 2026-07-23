// Persists Microsoft 365 tokens captured from a Supabase Azure SSO session
// onto the planipret_profiles row of the calling user, then triggers identity
// linking against NS-API. Called by the mobile app right after SSO redirect.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claimsData?.claims?.sub as string | undefined;
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { provider_token, provider_refresh_token, expires_in, email, display_name } = await req.json();
    if (!provider_token) return new Response(JSON.stringify({ error: "missing provider_token" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const expiry = new Date(Date.now() + (Number(expires_in) || 3600) * 1000).toISOString();
    const patch: Record<string, unknown> = {
      ms365_access_token: provider_token,
      ms365_token_expiry: expiry,
    };
    if (provider_refresh_token) patch.ms365_refresh_token = provider_refresh_token;
    if (email) patch.ms365_email = String(email).toLowerCase();
    if (display_name) patch.ms365_display_name = display_name;

    const { error: upErr } = await admin.from("planipret_profiles").update(patch).eq("user_id", userId);
    if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Best-effort: try auto-link to NS-API extension by email
    let linked: unknown = null;
    try {
      const linkRes = await admin.functions.invoke("ms365-ns-identity-link", {
        headers: { Authorization: authHeader },
        body: {},
      });
      linked = linkRes.data ?? null;
    } catch (_) { /* ignore */ }

    return new Response(JSON.stringify({ success: true, expiry, linked }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
