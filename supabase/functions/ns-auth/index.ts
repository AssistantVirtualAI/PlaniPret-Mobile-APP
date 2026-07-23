import { authBroker, corsHeaders, jsonResponse, obtainBrokerJwt } from "../_shared/ns-broker.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authBroker(req);
    if ("error" in auth) return auth.error;
    const { admin, profile } = auth;

    const body = await req.json().catch(() => ({}));
    const extension = body?.ns_extension ?? profile.extension;
    if (!extension) return jsonResponse({
      success: false,
      error: "Aucune extension NetSapiens liée à ce compte. Demande à un admin de la synchroniser depuis Gestion Utilisateurs.",
      code: 400,
    }, 400);

    const { token, refresh, expiresIn } = await obtainBrokerJwt(extension);
    await admin.from("planipret_profiles").update({
      extension,
      ns_jwt: token,
      ns_refresh_token: refresh,
      ns_jwt_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    }).eq("id", profile.id);

    return jsonResponse({ success: true, expires_in: expiresIn });
  } catch (e) {
    console.error("ns-auth error", e);
    return jsonResponse({ success: false, error: (e as Error).message, code: 0 }, 500);
  }
});
