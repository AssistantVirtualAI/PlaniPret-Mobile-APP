// POST /functions/v1/maestro-client-create
// Body: { phone?, first_name, last_name?, email?, company?, language?, call_id? }
// Routes exclusively through the documented POST /api/main/clients endpoint.
import {
  adminClient,
  corsHeaders,
  getMaestroConfig,
  json,
  maestroAudit,
  normalizePhone,
} from "../_shared/maestro.ts";
import { guardPlanipret } from "../_shared/planipret-guard.ts";
import { createClient_ } from "../_shared/maestro-scribe.ts";
import { getUserMaestroAccessToken } from "../_shared/maestro-oauth.ts";
import { getMaestroAdminAccessToken } from "../_shared/maestro-admin-token.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const guard = await guardPlanipret(req);
  if ("error" in guard) return guard.error;

  try {
    const body = await req.json().catch(() => ({} as any));
    const firstName = String(body?.first_name ?? "").trim();
    const lastName = String(body?.last_name ?? "").trim();
    const phone = normalizePhone(body?.phone ?? body?.mobile_number ?? body?.telephone_number);
    if (!firstName) {
      return json({ success: false, error: "validation_failed", errors: { first_name: ["first_name_required"] } }, 422);
    }

    const admin = adminClient();
    const cfg = await getMaestroConfig(admin);
    const ownToken = await getUserMaestroAccessToken(admin, guard.user.id).catch(() => null);
    const firm = ownToken ? { token: null, source: "none" as const } : await getMaestroAdminAccessToken();
    const staticToken = Deno.env.get("PLANIPRET_ACCESS_TOKEN") ?? null;
    const token = ownToken ?? firm.token ?? staticToken;
    const tokenSource = ownToken ? "broker_oauth" : firm.token ? firm.source : staticToken ? "static_env" : "none";
    if (!token) {
      return json({ success: false, error: "maestro_not_connected", token_source: tokenSource }, 200);
    }

    const payload: Record<string, unknown> = {
      first_name: firstName,
      ...(lastName ? { last_name: lastName } : {}),
      ...(body?.email ? { email: String(body.email).trim() } : {}),
      ...(body?.company ? { company: String(body.company).trim() } : {}),
      ...(body?.language ? { language: String(body.language).trim() } : {}),
      ...(phone ? { mobile_number: phone } : {}),
    };

    const res = await createClient_(cfg, payload, { token });
    if (!res.ok) {
      await maestroAudit(admin, "client_create_failed", {
        status: res.status,
        error: res.error,
        token_source: tokenSource,
        fields: Object.keys(payload),
      });

      if ([404, 405, 501].includes(Number(res.status))) {
        const portal = (Deno.env.get("MAESTRO_PORTAL_URL") ?? "https://courtier.planipret.com").replace(/\/$/, "");
        const q = new URLSearchParams({
          first_name: firstName,
          ...(lastName ? { last_name: lastName } : {}),
          ...(phone ? { phone } : {}),
          ...(body?.email ? { email: String(body.email) } : {}),
        });
        return json({
          success: false,
          error: "maestro_endpoint_unavailable",
          message: "Ouvrez le formulaire Maestro prérempli pour terminer la création.",
          web_url: `${portal}/fr/clients/new?${q.toString()}`,
          status: res.status,
        }, 200);
      }

      return json({
        success: false,
        error: res.error ?? "create_failed",
        errors: res.errors ?? null,
        status: res.status,
      }, res.status >= 400 && res.status < 500 ? res.status : 200);
    }

    const client = res.data as any;
    const clientId = client?.id ?? client?.client_id ?? null;
    if (body?.call_id && clientId) {
      await admin
        .from("planipret_phone_calls")
        .update({ maestro_client_id: String(clientId) })
        .eq("id", body.call_id)
        .eq("user_id", guard.user.id);
    }

    await maestroAudit(admin, "client_created", { client_id: clientId, token_source: tokenSource });
    return json({ success: true, client_id: clientId, client, endpoint: res.endpoint }, 201);
  } catch (e: any) {
    console.error("maestro-client-create error", e);
    return json({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
