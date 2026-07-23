import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type AppRole = "super_admin" | "org_admin" | "manager" | "agent" | "viewer";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Authorization required" });

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userRes.user) return json(401, { error: "Unauthorized" });

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const callingUser = userRes.user;
    const body = await req.json().catch(() => ({}));
    const action = (body?.action as string | undefined) ?? "list";

    const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", {
      _user_id: callingUser.id,
    });

    // Helper: caller must be org_admin for given org (or super admin)
    async function ensureCanManage(organization_id: string) {
      if (isSuperAdmin) return true;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("organization_id", organization_id)
        .eq("user_id", callingUser.id)
        .maybeSingle();
      return data?.role === "org_admin";
    }

    // ────────────────── LIST ──────────────────
    if (action === "list") {
      const organization_id = body?.organization_id as string | undefined;
      if (!organization_id) return json(400, { error: "organization_id is required" });

      const { data: callerRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("organization_id", organization_id)
        .eq("user_id", callingUser.id)
        .maybeSingle();

      const canView =
        Boolean(isSuperAdmin) ||
        callerRole?.role === "org_admin" ||
        callerRole?.role === "manager";
      if (!canView) return json(403, { error: "Forbidden" });

      const { data: members, error: membersError } = await supabase
        .from("organization_members")
        .select("user_id, invited_at, accepted_at")
        .eq("organization_id", organization_id);
      if (membersError) throw membersError;

      const memberIds = (members ?? []).map((m) => m.user_id);
      if (!memberIds.length) return json(200, { members: [] });

      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, avatar_url").in("id", memberIds),
        supabase
          .from("user_roles")
          .select("user_id, role")
          .eq("organization_id", organization_id)
          .in("user_id", memberIds),
      ]);

      const profilesMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
      const rolesMap = new Map((rolesRes.data ?? []).map((r) => [r.user_id, r]));

      return json(200, {
        members: (members ?? []).map((m) => ({
          user_id: m.user_id,
          invited_at: m.invited_at,
          accepted_at: m.accepted_at,
          profile: profilesMap.get(m.user_id) ?? null,
          role: rolesMap.get(m.user_id)?.role ?? "viewer",
        })),
      });
    }

    // ────────────────── UPDATE ROLE ──────────────────
    if (action === "update_role") {
      const organization_id = body?.organization_id as string | undefined;
      const user_id = body?.user_id as string | undefined;
      const new_role = body?.new_role as AppRole | undefined;
      if (!organization_id || !user_id || !new_role)
        return json(400, { error: "organization_id, user_id and new_role are required" });

      if (!(await ensureCanManage(organization_id))) return json(403, { error: "Forbidden" });
      if (new_role === "super_admin")
        return json(400, { error: "Cannot assign super_admin at org level" });

      const { data: currentRoleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("organization_id", organization_id)
        .eq("user_id", user_id)
        .maybeSingle();
      const currentRole = (currentRoleRow?.role as AppRole | undefined) ?? "viewer";

      if (currentRole === "org_admin" && new_role !== "org_admin") {
        const { count } = await supabase
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("organization_id", organization_id)
          .eq("role", "org_admin");
        if ((count ?? 0) <= 1)
          return json(400, { error: "Cannot remove the last organization admin" });
      }

      if (currentRoleRow) {
        const { error } = await supabase
          .from("user_roles")
          .update({ role: new_role })
          .eq("organization_id", organization_id)
          .eq("user_id", user_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .insert({ organization_id, user_id, role: new_role });
        if (error) throw error;
      }

      await supabase.from("audit_logs").insert({
        organization_id,
        user_id: callingUser.id,
        action: "update",
        resource_type: "user_roles",
        resource_id: user_id,
        metadata: { actor_user_id: callingUser.id, target_user_id: user_id, old_role: currentRole, new_role },
      });
      return json(200, { success: true });
    }

    // ────────────────── UPDATE PROFILE ──────────────────
    if (action === "update_profile") {
      const organization_id = body?.organization_id as string | undefined;
      const user_id = body?.user_id as string | undefined;
      const full_name = body?.full_name as string | undefined;
      const email = body?.email as string | undefined;
      if (!organization_id || !user_id)
        return json(400, { error: "organization_id and user_id are required" });
      if (!(await ensureCanManage(organization_id))) return json(403, { error: "Forbidden" });

      const patch: Record<string, unknown> = {};
      if (typeof full_name === "string") patch.full_name = full_name;
      if (typeof email === "string") patch.email = email;
      if (Object.keys(patch).length) {
        const { error } = await supabase.from("profiles").update(patch).eq("id", user_id);
        if (error) throw error;
      }
      if (typeof email === "string") {
        const { error: authErr } = await supabase.auth.admin.updateUserById(user_id, { email });
        if (authErr) return json(400, { error: authErr.message });
      }
      return json(200, { success: true });
    }

    // ────────────────── RESET PASSWORD ──────────────────
    if (action === "reset_password") {
      const organization_id = body?.organization_id as string | undefined;
      const user_id = body?.user_id as string | undefined;
      const new_password = body?.new_password as string | undefined;
      if (!organization_id || !user_id || !new_password)
        return json(400, { error: "organization_id, user_id and new_password are required" });
      if (new_password.length < 8)
        return json(400, { error: "Le mot de passe doit contenir au moins 8 caractères" });
      if (!(await ensureCanManage(organization_id))) return json(403, { error: "Forbidden" });

      const { error } = await supabase.auth.admin.updateUserById(user_id, {
        password: new_password,
      });
      if (error) return json(400, { error: error.message });

      await supabase.from("audit_logs").insert({
        organization_id,
        user_id: callingUser.id,
        action: "reset_password",
        resource_type: "auth.users",
        resource_id: user_id,
        metadata: { actor_user_id: callingUser.id, target_user_id: user_id },
      });
      return json(200, { success: true });
    }

    // ────────────────── LIST USER ORGS ──────────────────
    if (action === "list_user_orgs") {
      const user_id = body?.user_id as string | undefined;
      if (!user_id) return json(400, { error: "user_id is required" });

      // Caller must actually share an org with the target user (or be super admin).
      // Always restrict returned orgs to the intersection of caller ∩ target memberships.
      const { data: targetMemberships } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user_id);
      const targetOrgIds = (targetMemberships ?? []).map((m) => m.organization_id);
      if (!targetOrgIds.length) return json(200, { organizations: [] });

      let orgIds = targetOrgIds;
      if (!isSuperAdmin) {
        const { data: callerShared } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", callingUser.id)
          .in("organization_id", targetOrgIds);
        orgIds = (callerShared ?? []).map((s) => s.organization_id);
        if (!orgIds.length) return json(403, { error: "Forbidden" });
      }

      const [orgsRes, rolesRes] = await Promise.all([
        supabase.from("organizations").select("id, name, slug").in("id", orgIds),
        supabase
          .from("user_roles")
          .select("organization_id, role")
          .eq("user_id", user_id)
          .in("organization_id", orgIds),
      ]);
      const roleMap = new Map((rolesRes.data ?? []).map((r) => [r.organization_id, r.role]));
      return json(200, {
        organizations: (orgsRes.data ?? []).map((o) => ({
          id: o.id,
          name: o.name,
          slug: o.slug,
          role: roleMap.get(o.id) ?? "viewer",
        })),
      });
    }

    // ────────────────── ADD TO ORG ──────────────────
    if (action === "add_to_org") {
      const organization_id = body?.organization_id as string | undefined;
      const user_id = body?.user_id as string | undefined;
      const role = (body?.role as AppRole | undefined) ?? "viewer";
      if (!organization_id || !user_id)
        return json(400, { error: "organization_id and user_id are required" });
      if (role === "super_admin")
        return json(400, { error: "Cannot assign super_admin at org level" });
      if (!(await ensureCanManage(organization_id))) return json(403, { error: "Forbidden" });

      const { data: existing } = await supabase
        .from("organization_members")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("user_id", user_id)
        .maybeSingle();
      if (existing) return json(400, { error: "Membre déjà dans cette organisation" });

      const { error: mErr } = await supabase.from("organization_members").insert({
        organization_id,
        user_id,
        invited_by: callingUser.id,
        accepted_at: new Date().toISOString(),
      });
      if (mErr) throw mErr;

      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("user_id", user_id)
        .maybeSingle();
      if (!existingRole) {
        const { error: rErr } = await supabase
          .from("user_roles")
          .insert({ organization_id, user_id, role });
        if (rErr) throw rErr;
      }
      return json(200, { success: true });
    }

    // ────────────────── REMOVE FROM ORG ──────────────────
    if (action === "remove_from_org") {
      const organization_id = body?.organization_id as string | undefined;
      const user_id = body?.user_id as string | undefined;
      if (!organization_id || !user_id)
        return json(400, { error: "organization_id and user_id are required" });
      if (!(await ensureCanManage(organization_id))) return json(403, { error: "Forbidden" });

      // Don't allow removing the last admin
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("organization_id", organization_id)
        .eq("user_id", user_id)
        .maybeSingle();
      if (roleRow?.role === "org_admin") {
        const { count } = await supabase
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("organization_id", organization_id)
          .eq("role", "org_admin");
        if ((count ?? 0) <= 1)
          return json(400, { error: "Cannot remove the last organization admin" });
      }

      await supabase
        .from("user_roles")
        .delete()
        .eq("organization_id", organization_id)
        .eq("user_id", user_id);
      const { error } = await supabase
        .from("organization_members")
        .delete()
        .eq("organization_id", organization_id)
        .eq("user_id", user_id);
      if (error) throw error;
      return json(200, { success: true });
    }

    return json(400, { error: "Unknown action" });
  } catch (err) {
    console.error("manage-org-roles error", err);
    return json(500, { error: "Internal error" });
  }
});
