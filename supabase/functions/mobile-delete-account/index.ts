// mobile-delete-account: GDPR/store-compliance account deletion from the mobile app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const userId = u.user.id;

    // Best-effort: revoke push tokens, unlink extension, drop roles, anonymize profile.
    await admin.from("mobile_push_tokens").delete().eq("user_id", userId).then(() => {}, () => {});
    await admin.from("pbx_softphone_users").update({ portal_user_id: null, status: "deleted" }).eq("portal_user_id", userId).then(() => {}, () => {});
    await admin.from("user_roles").delete().eq("user_id", userId).then(() => {}, () => {});
    await admin.from("profiles").update({ full_name: "[deleted]", avatar_url: null, email: null }).eq("id", userId).then(() => {}, () => {});

    // Audit trail (90-day retention per compliance memory).
    await admin.from("audit_logs").insert({
      user_id: userId,
      action: "mobile.account.deleted",
      metadata: { source: "mobile-delete-account" },
    }).then(() => {}, () => {});

    // Finally remove the auth user.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json({ error: delErr.message }, 500);

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e.message || "error" }, 500);
  }
});
