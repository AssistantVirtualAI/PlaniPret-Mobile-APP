// List Lemtel softphone invitations for the caller's org (admin only).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://avastatistic.ca";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "UNAUTHENTICATED" }, 401);

    const { data: canGrant } = await admin.rpc("lemtel_can_grant_app_access", { _uid: user.id });
    if (!canGrant) return json({ error: "FORBIDDEN" }, 403);

    const url = new URL(req.url);
    const softphoneId = url.searchParams.get("softphone_user_id");

    let q = admin.from("lemtel_softphone_invites")
      .select("id, token, softphone_user_id, email, created_at, expires_at, consumed_at, revoked_at, view_count, last_viewed_at, email_sent, email_error")
      .order("created_at", { ascending: false })
      .limit(200);
    if (softphoneId) q = q.eq("softphone_user_id", softphoneId);

    const { data, error } = await q;
    if (error) return json({ error: "QUERY_FAILED", detail: error.message }, 500);

    const now = Date.now();
    const rows = (data || []).map((r: any) => {
      const expired = new Date(r.expires_at).getTime() < now;
      const status = r.revoked_at ? "revoked"
        : r.consumed_at ? "used"
        : expired ? "expired"
        : r.view_count > 0 ? "viewed"
        : r.email_sent ? "sent"
        : "pending";
      return {
        id: r.id,
        softphone_user_id: r.softphone_user_id,
        email: r.email,
        status,
        created_at: r.created_at,
        expires_at: r.expires_at,
        consumed_at: r.consumed_at,
        revoked_at: r.revoked_at,
        last_viewed_at: r.last_viewed_at,
        view_count: r.view_count,
        email_sent: r.email_sent,
        email_error: r.email_error,
        setup_url: `${APP_ORIGIN}/lemtel/redeem/${r.token}`,
      };
    });

    return json({ ok: true, invites: rows });
  } catch (e: any) {
    return json({ error: "INTERNAL", detail: e?.message || String(e) }, 500);
  }
});
