// Shared auth helpers for edge functions
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function requireUser(req: Request) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) return { error: jsonResponse(401, { error: "Unauthorized" }) };
  const token = authHeader.replace("Bearer ", "");
  const supabase = getServiceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { error: jsonResponse(401, { error: "Unauthorized" }) };
  return { user: data.user, supabase };
}

export async function requireOrgMember(req: Request, organizationId: string) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth;
  const { data: membership } = await auth.supabase
    .from("organization_members")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  const { data: isSuper } = await auth.supabase.rpc("is_super_admin", { _user_id: auth.user.id });
  if (!membership && !isSuper) return { error: jsonResponse(403, { error: "Forbidden" }) };
  return { ...auth, isSuper: !!isSuper };
}

export async function requireOrgRole(
  req: Request,
  organizationId: string,
  allowedRoles: string[]
) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth;
  const { data: isSuper } = await auth.supabase.rpc("is_super_admin", { _user_id: auth.user.id });
  if (isSuper) return { ...auth, isSuper: true };
  const { data: roleRow } = await auth.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!roleRow || !allowedRoles.includes(roleRow.role)) {
    return { error: jsonResponse(403, { error: "Forbidden" }) };
  }
  return { ...auth, isSuper: false, role: roleRow.role };
}
