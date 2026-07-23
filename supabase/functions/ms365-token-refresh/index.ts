// Refreshes Microsoft 365 access tokens for Planiprêt brokers.
// - Without body: refreshes the calling user (mobile app on 401 retry).
// - With { all: true } via service role / cron: refreshes every profile whose
//   token expires within 10 minutes.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MS365_DELEGATED_SCOPES, refreshMicrosoftAccessToken } from "../_shared/ms365.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({} as any));

    if (body?.all === true) {
      const cutoff = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { data: rows } = await admin.from("planipret_profiles")
        .select("id, user_id, ms365_refresh_token, ms365_token_expiry")
        .not("ms365_refresh_token", "is", null)
        .or(`ms365_token_expiry.is.null,ms365_token_expiry.lt.${cutoff}`);
      let ok = 0, fail = 0;
      for (const r of rows ?? []) {
        try {
          const accessToken = await refreshMicrosoftAccessToken(admin, r, MS365_DELEGATED_SCOPES);
          if (!accessToken) throw new Error("refresh failed");
          ok++;
        } catch (_) { fail++; }
      }
      return j({ success: true, refreshed: ok, failed: fail });
    }

    // Per-user (authenticated) refresh
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return j({ error: "Unauthorized" }, 401);

    const { data: profile } = await admin.from("planipret_profiles")
      .select("id, ms365_refresh_token").eq("user_id", userId).maybeSingle();
    if (!profile?.ms365_refresh_token) return j({ error: "no_refresh_token" }, 400);

    const accessToken = await refreshMicrosoftAccessToken(admin, { ...profile, user_id: userId }, MS365_DELEGATED_SCOPES);
    if (!accessToken) return j({ error: "refresh_failed" }, 400);
    return j({ success: true, expires_in: 3600 });
  } catch (e) {
    return j({ error: (e as Error).message }, 500);
  }
});

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
