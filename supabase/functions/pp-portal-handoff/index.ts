// Pont d'authentification « app mobile → portail AVA Statistic ».
//
// Le courtier est déjà authentifié dans l'application mobile. Cette fonction
// vérifie son JWT, s'assure qu'il possède bien un profil Planiprêt, puis émet
// un lien magique à usage unique (valide quelques minutes) vers son propre
// portail — admin ou courtier selon son rôle. Aucun jeton n'est jamais émis
// pour un autre utilisateur : la cible est toujours `auth.uid()`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const PORTAL_ORIGIN = (Deno.env.get("PP_PORTAL_URL") ?? "https://avastatistic.ca").replace(/\/+$/, "");

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ ok: false, error: "not_authenticated" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    const user = u?.user;
    if (!user?.email) return json({ ok: false, error: "not_authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: profile } = await admin
      .from("planipret_profiles")
      .select("id, user_id, role, email, full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile) return json({ ok: false, error: "no_planipret_profile" }, 403);

    let isAdmin = String((profile as any).role ?? "").toLowerCase().includes("admin");
    if (!isAdmin) {
      const { data: sa } = await admin.rpc("is_super_admin", { _user_id: user.id });
      isAdmin = sa === true;
    }

    // Destination demandée (optionnelle) — toujours restreinte au portail.
    const body = await req.json().catch(() => ({}));
    const home = isAdmin ? "/planipret/admin/overview" : "/planipret/broker/overview";
    let target = typeof body?.path === "string" ? body.path : home;
    if (!/^\/planipret\/(admin|broker)\//.test(target)) target = home;

    // Le courtier est DÉJÀ authentifié dans l'app mobile : on estampille la
    // session comme « pont mobile vérifié » pour que le garde du portail
    // l'accepte sans repasser par Microsoft.
    const { error: stampError } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...(user.user_metadata ?? {}),
          portal_handoff_at: new Date().toISOString(),
        },
      });
    if (stampError) return json({ ok: false, error: "handoff_stamp_failed" }, 500);

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      return json({ ok: false, error: linkErr?.message ?? "link_failed" }, 500);
    }

    const hash = new URLSearchParams({
      th: String(link.properties.hashed_token),
      em: user.email,
      to: target,
    }).toString();

    return json({
      ok: true,
      portal: isAdmin ? "admin" : "broker",
      email: user.email,
      url: `${PORTAL_ORIGIN}/planipret/portal-handoff#${hash}`,
      expires_in: 300,
    });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
