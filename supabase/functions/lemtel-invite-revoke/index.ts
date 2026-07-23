// Revoke a Lemtel softphone invitation (admin only).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

    const { invite_id } = await req.json().catch(() => ({}));
    if (!invite_id) return json({ error: "MISSING_INVITE_ID" }, 400);

    const { data, error } = await admin
      .from("lemtel_softphone_invites")
      .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
      .eq("id", invite_id)
      .is("revoked_at", null)
      .select("id, email")
      .maybeSingle();

    if (error) return json({ error: "UPDATE_FAILED", detail: error.message }, 500);
    if (!data) return json({ error: "ALREADY_REVOKED_OR_NOT_FOUND" }, 404);

    return json({ ok: true, invite_id: data.id, email: data.email });
  } catch (e: any) {
    return json({ error: "INTERNAL", detail: e?.message || String(e) }, 500);
  }
});
