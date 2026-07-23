// pp-ns-auth — Diagnostic/auth endpoint for Planiprêt NS-API integration.
// AVA-only. Verifies Supabase JWT, then checks NS-API reachability.
import {
  corsHeaders,
  jsonResponse,
  requirePlanipretBroker,
  getNsJwt,
} from "../_shared/planipret-ns.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await requirePlanipretBroker(req);
  if (guard instanceof Response) return guard;

  try {
    const token = await getNsJwt();
    return jsonResponse({
      ok: true,
      ns_api_authenticated: true,
      token_preview: token.slice(0, 12) + "…",
      extension: guard.ctx.extension,
      ns_domain: guard.ctx.nsDomain,
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: (e as Error).message }, 502);
  }
});
