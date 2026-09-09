// Shared admin guard for diagnostic / audit edge functions.
// Requires a valid user JWT belonging to a Planiprêt admin or super admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function deny(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Returns `null` when the caller is an authenticated admin, otherwise a
 * ready-to-return 401/403 Response.
 */
export async function requirePlanipretAdmin(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return deny("Unauthorized", 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return deny("Unauthorized", 401);

  const [{ data: isPlanipretAdmin }, { data: isSuperAdmin }] = await Promise.all([
    admin.rpc("is_planipret_admin", { _user_id: user.id }),
    admin.rpc("is_super_admin", { _user_id: user.id }),
  ]);

  if (isPlanipretAdmin === true || isSuperAdmin === true) return null;
  return deny("Forbidden", 403);
}
