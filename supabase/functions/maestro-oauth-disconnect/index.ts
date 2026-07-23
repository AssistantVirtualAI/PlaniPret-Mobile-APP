// maestro-oauth-disconnect — clears the caller's Maestro OAuth tokens.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return j({ error: "unauthorized" }, 401);

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return j({ error: "unauthorized" }, 401);

    const { error } = await admin.from("planipret_profiles").update({
      maestro_broker_token: null,
      maestro_refresh_token: null,
      maestro_token_expires_at: null,
      maestro_scope: null,
      maestro_connected: false,
      maestro_oauth_client: null,
    }).eq("user_id", u.user.id);
    if (error) return j({ error: error.message }, 500);

    return j({ ok: true });
  } catch (e) {
    return j({ error: (e as Error).message }, 500);
  }
});
