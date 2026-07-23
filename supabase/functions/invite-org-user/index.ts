// Invite an existing or new user to an organization with granular permissions.
// Sends a magic link / invite email and creates the org_members row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const {
      email, full_name, organization_id, role = "user", permissions = {},
      redirect_to = "https://avastatistic.ca/reset-password",
    } = body;

    if (!email || !organization_id) return json({ error: "email and organization_id required" }, 400);

    // Caller must be able to manage users in this org
    const { data: canAccess } = await admin.rpc("can_access_org", { _user_id: caller.id, _org_id: organization_id });
    const { data: isMaster } = await admin.rpc("is_master_admin", { _user_id: caller.id });
    if (!canAccess && !isMaster) return json({ error: "forbidden" }, 403);

    // Create or reuse auth user
    let userId: string; let created = false;
    const { data: list } = await admin.auth.admin.listUsers();
    const existing = list?.users?.find((u: any) => u.email?.toLowerCase() === String(email).toLowerCase());
    if (existing) {
      userId = existing.id;
    } else {
      const { data: c, error } = await admin.auth.admin.createUser({
        email, email_confirm: false,
        user_metadata: { full_name },
      });
      if (error || !c?.user) return json({ error: "AUTH_CREATE_FAILED", details: error?.message }, 400);
      userId = c.user.id;
      created = true;
    }

    const legacyRole = String(role || "user");
    const modernRole = ["master_admin", "ava_admin"].includes(legacyRole)
      ? "super_admin"
      : ["customer_admin", "reseller_admin", "admin"].includes(legacyRole)
        ? "org_admin"
        : legacyRole === "manager"
          ? "manager"
          : legacyRole === "agent"
            ? "agent"
            : "viewer";

    // Upsert org_members with legacy permissions for backward compatibility.
    const member: any = {
      user_id: userId,
      org_id: organization_id,
      role,
      ...permissions,
    };
    const { error: memErr } = await admin.from("org_members").upsert(member, { onConflict: "user_id,org_id" });
    if (memErr) return json({ error: "MEMBER_UPSERT_FAILED", details: memErr.message }, 400);

    // Mirror to the modern organization/user_roles model used by the AVA portal user list.
    const { error: modernMemberErr } = await admin.from("organization_members").upsert(
      { user_id: userId, organization_id, accepted_at: new Date().toISOString() },
      { onConflict: "user_id,organization_id" },
    );
    if (modernMemberErr) return json({ error: "ORG_MEMBER_UPSERT_FAILED", details: modernMemberErr.message }, 400);

    const { data: currentRoleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", organization_id)
      .maybeSingle();

    const { error: roleErr } = currentRoleRow
      ? await admin
          .from("user_roles")
          .update({ role: modernRole })
          .eq("user_id", userId)
          .eq("organization_id", organization_id)
      : await admin
          .from("user_roles")
          .insert({ user_id: userId, organization_id, role: modernRole });
    if (roleErr) return json({ error: "USER_ROLE_UPSERT_FAILED", details: roleErr.message }, 400);

    // Generate invite/magic link
    let actionLink: string | null = null;
    try {
      const { data: link } = await admin.auth.admin.generateLink({
        type: created ? "invite" : "magiclink",
        email,
        options: { redirectTo: redirect_to },
      });
      actionLink = (link as any)?.properties?.action_link || null;
    } catch (e) { console.warn("generateLink failed", e); }

    // Audit
    await admin.from("audit_logs").insert({
      organization_id,
      user_id: caller.id,
      action: created ? "user_invited" : "user_added_to_org",
      resource_type: "org_members",
      resource_id: userId,
      metadata: { email, role, permissions, link_sent: !!actionLink },
    });

    return json({ success: true, user_id: userId, created, invite_link: actionLink });
  } catch (e: any) {
    return json({ error: "INVITE_FAILED", message: e?.message || String(e) }, 500);
  }
});
