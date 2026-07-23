// POST /functions/v1/maestro-client-create
// Body: { phone, first_name?, last_name?, notes?, call_id? }
import {
  adminClient,
  corsHeaders,
  getBrokerAuth,
  getMaestroConfig,
  json,
  maestroAudit,
  maestroFetch,
  normalizePhone,
} from "../_shared/maestro.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const phone = normalizePhone(body.phone);
    if (!phone) return json({ success: false, error: "phone_required" }, 400);
    const userIdHeader = req.headers.get("x-user-id");

    const admin = adminClient();
    const cfg = await getMaestroConfig(admin);
    if (!cfg.url || !cfg.key) return json({ success: false, error: "maestro_not_configured" }, 200);

    const auth = await getBrokerAuth(admin, userIdHeader);
    const payload = {
      phone,
      first_name: body.first_name ?? null,
      last_name: body.last_name ?? null,
      notes: body.notes ?? null,
      created_by: auth.brokerId,
    };

    const res = await maestroFetch(cfg, {
      method: "POST",
      path: "/api/v1/clients",
      token: auth.token,
      body: payload,
    });

    if (!res.ok) {
      await maestroAudit(admin, "client_create_failed", { phone, status: res.status, data: res.data });
      return json({ success: false, error: "create_failed", status: res.status, details: res.data }, 200);
    }

    const clientId = res.data?.id ?? res.data?.client_id;
    if (body.call_id && clientId) {
      await admin
        .from("planipret_phone_calls")
        .update({ maestro_client_id: String(clientId) })
        .eq("id", body.call_id);
    }
    await maestroAudit(admin, "client_created", { phone, client_id: clientId });

    return json({ success: true, client_id: clientId, client: res.data });
  } catch (e: any) {
    console.error("maestro-client-create error", e);
    return json({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
