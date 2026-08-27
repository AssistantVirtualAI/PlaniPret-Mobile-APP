// maestro-oauth-state-info — public, read-only. Given an OAuth `state`, tells the
// web callback page whether the flow was started from the mobile app so it can
// hand the code back to the app via the planipret:// deep link instead of
// rendering a dead-end page in the browser.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({} as any));
    const state = typeof body?.state === "string" ? body.state : "";
    if (!state) return j({ error: "missing_state" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data } = await admin
      .from("planipret_maestro_oauth_states")
      .select("platform, redirect_uri")
      .eq("state", state)
      .maybeSingle();

    if (!data) return j({ found: false, platform: "web" });
    const platform = (data as any).platform === "mobile" ||
      String((data as any).redirect_uri ?? "").startsWith("planipret://")
      ? "mobile"
      : "web";
    return j({ found: true, platform });
  } catch (e) {
    return j({ error: (e as Error).message }, 500);
  }
});
