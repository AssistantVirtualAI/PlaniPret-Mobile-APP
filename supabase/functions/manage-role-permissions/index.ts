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

async function canManagePermissions(supabase: any, userId: string, orgId: string) {
  const [{ data: isSuperAdmin }, { data: roleRow }] = await Promise.all([
    supabase.rpc("is_super_admin", { _user_id: userId }),
    supabase.from("user_roles").select("role").eq("organization_id", orgId).eq("user_id", userId).maybeSingle(),
  ]);
  if (isSuperAdmin) return true;
  const role = roleRow?.role as AppRole | undefined;
  if (!role) return false;
  if (role === "org_admin") return true;

  // Allow override-based permission
  const { data: overrides } = await supabase
    .from("org_role_permissions")
    .select("permission, allowed")
    .eq("organization_id", orgId)
    .eq("role", role);

  let allowed = false;
  for (const o of overrides || []) {
    if (o.permission === "manage:permissions") allowed = Boolean(o.allowed);
  }
  return allowed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const action = (body?.action as string | undefined) ?? "list";
    const organization_id = body?.organization_id as string | undefined;

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // list is viewable by org members; upsert is admin-only
    if (action === "list") {
      const [{ data: isSuperAdmin }, { data: membership }] = await Promise.all([
        supabase.rpc("is_super_admin", { _user_id: userRes.user.id }),
        supabase.from("organization_members").select("id").eq("organization_id", organization_id).eq("user_id", userRes.user.id).maybeSingle(),
      ]);
      if (!isSuperAdmin && !membership) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: rows, error } = await supabase
        .from("org_role_permissions")
        .select("role, permission, allowed")
        .eq("organization_id", organization_id);
      if (error) throw error;
      return new Response(JSON.stringify({ overrides: rows || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    if (action === "upsert") {
      const ok = await canManagePermissions(supabase, userRes.user.id, organization_id);
      if (!ok) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const role = body?.role as AppRole | undefined;
      const permission = body?.permission as string | undefined;
      const allowed = Boolean(body?.allowed);
      if (!role || !permission) {
        return new Response(JSON.stringify({ error: "role and permission are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: row, error } = await supabase
        .from("org_role_permissions")
        .upsert(
          {
            organization_id,
            role,
            permission,
            allowed,
            updated_by: userRes.user.id,
          },
          { onConflict: "organization_id,role,permission" },
        )
        .select("id, role, permission, allowed")
        .single();
      if (error) throw error;

      await supabase.from("audit_logs").insert({
        organization_id,
        user_id: userRes.user.id,
        action: "update",
        resource_type: "org_role_permissions",
        resource_id: row.id,
        metadata: { role, permission, allowed },
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("manage-role-permissions error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
