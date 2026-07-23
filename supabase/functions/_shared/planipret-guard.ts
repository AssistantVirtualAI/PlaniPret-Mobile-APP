// Planipret/Lemtel app separation guard for edge functions.
// Rejects requests from users that belong exclusively to the other app.
// Allows super_admin and cross-app members through.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export interface GuardSuccess {
  user: { id: string; email?: string };
  admin: SupabaseClient;
  authHeader: string;
}
export type GuardResult = GuardSuccess | { error: Response };

async function getAuthedUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader) return { error: json(401, { error: "unauthorized" }) };
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { error: json(401, { error: "unauthorized" }) };
  return { user: data.user, admin, authHeader } as GuardSuccess;
}

/** Block Lemtel-only users from Planipret edge functions. */
export async function guardPlanipret(req: Request): Promise<GuardResult> {
  const r = await getAuthedUser(req);
  if ("error" in r) return r;
  const { data: lemtelOnly } = await r.admin.rpc("is_lemtel_only", { _user_id: r.user.id });
  if (lemtelOnly === true) {
    return { error: json(403, { error: "forbidden_wrong_app", app: "lemtel" }) };
  }
  return r;
}

/** Block Planipret-only users from Lemtel edge functions. */
export async function guardLemtel(req: Request): Promise<GuardResult> {
  const r = await getAuthedUser(req);
  if ("error" in r) return r;
  const { data: planipretOnly } = await r.admin.rpc("is_planipret_only", { _user_id: r.user.id });
  if (planipretOnly === true) {
    return { error: json(403, { error: "forbidden_wrong_app", app: "planipret" }) };
  }
  return r;
}
