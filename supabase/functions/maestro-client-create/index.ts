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
    const admin = adminClient();
    let userIdHeader = req.headers.get("x-user-id");
    if (!userIdHeader) {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (authHeader) {
        const { data: u } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
        userIdHeader = u?.user?.id ?? null;
      }
    }

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
      path: `/api/v1/users/${encodeURIComponent(String(auth.brokerId ?? ""))}/clients`,
      token: auth.token,
      body: payload,
    });

    if (!res.ok) {
      await maestroAudit(admin, "client_create_failed", { phone, status: res.status, data: res.data });
      // The Maestro API is read-only for client creation (405/403/404). Fall back
      // to a prefilled web form URL the broker can open to finish the creation,
      // and mirror the contact into their Outlook address book right away.
      const readOnly = [403, 404, 405, 501].includes(Number(res.status));
      if (readOnly) {
        const portal = (Deno.env.get("MAESTRO_PORTAL_URL") ?? "https://courtier.planipret.com").replace(/\/$/, "");
        const q = new URLSearchParams({
          phone,
          ...(body.first_name ? { first_name: String(body.first_name) } : {}),
          ...(body.last_name ? { last_name: String(body.last_name) } : {}),
          ...(body.email ? { email: String(body.email) } : {}),
        });
        let m365: any = null;
        if (userIdHeader) {
          try {
            const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ms365-actions`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                action: "upsert_contact",
                _user_id: userIdHeader,
                payload: {
                  first_name: body.first_name ?? null,
                  last_name: body.last_name ?? null,
                  email: body.email ?? null,
                  mobile_phone: phone,
                },
              }),
            });
            m365 = await r.json().catch(() => null);
          } catch (_) { /* non blocking */ }
        }
        return json({
          success: false,
          error: "maestro_read_only",
          message: "L'API Maestro ne permet pas la création de client. Ouvrez le formulaire prérempli pour terminer.",
          web_url: `${portal}/fr/clients/new?${q.toString()}`,
          m365_contact: m365?.success ? { id: m365.contact_id, updated: m365.updated } : null,
          status: res.status,
        }, 200);
      }
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
