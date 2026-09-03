// Auth helper partagé pour la gestion des mises à jour de l'app mobile.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

export const mobileCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function mjson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...mobileCors, "Content-Type": "application/json" },
  });
}

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Retourne l'utilisateur authentifié depuis le header Authorization. */
export async function getUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

/** Vérifie que l'appelant est admin Planiprêt ou super admin. */
export async function requireMobileAdmin(req: Request) {
  const user = await getUser(req);
  if (!user) return { error: mjson({ error: "unauthorized" }, 401) };
  const admin = adminClient();
  const [a, b] = await Promise.all([
    admin.rpc("is_planipret_admin", { _user_id: user.id }),
    admin.rpc("is_super_admin", { _user_id: user.id }),
  ]);
  if (!(a.data === true || b.data === true)) {
    return { error: mjson({ error: "forbidden" }, 403) };
  }
  return { user, admin };
}
