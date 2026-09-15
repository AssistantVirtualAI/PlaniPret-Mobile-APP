// POST /functions/v1/maestro-appointment
// Body: { maestro_client_id, title, start_at, end_at, notes?, type?, call_id? }
import {
  adminClient,
  corsHeaders,
  getBrokerAuth,
  getMaestroConfig,
  json,
  maestroAudit,
  maestroFetch,
} from "../_shared/maestro.ts";
import { authorizeCallAccess } from "../_shared/planipret-call-access.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const { maestro_client_id, title, start_at, end_at, notes, type, call_id } = body;
    if (!maestro_client_id || !title || !start_at) {
      return json({ success: false, error: "missing_fields" }, 400);
    }
    const admin = adminClient();
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isServiceRole = !!serviceRole && token === serviceRole;
    let authenticatedUserId: string | null = null;
    if (isServiceRole) {
      authenticatedUserId = body?._user_id ? String(body._user_id) : null;
    } else if (token) {
      const { data: authData } = await admin.auth.getUser(token);
      authenticatedUserId = authData?.user?.id ?? null;
    }
    if (!authenticatedUserId) return json({ success: false, error: "unauthorized" }, 401);

    const cfg = await getMaestroConfig(admin);
    if (!cfg.url || !cfg.key) return json({ success: false, error: "maestro_not_configured" }, 200);

    let userId: string | null = authenticatedUserId;
    if (call_id) {
      const { data } = await admin
        .from("planipret_phone_calls")
        .select("user_id")
        .eq("id", call_id)
        .maybeSingle();
      if (!data) return json({ success: false, error: "call_not_found" }, 404);
      const access = await authorizeCallAccess(req, admin, data);
      if (!access.ok) return json({ success: false, error: access.error }, access.status);
      if (isServiceRole) userId = data.user_id ?? authenticatedUserId;
    }
    const auth = await getBrokerAuth(admin, userId);

    const res = await maestroFetch(cfg, {
      method: "POST",
      path: `/api/v1/users/${encodeURIComponent(String(auth.brokerId ?? ""))}/clients/${encodeURIComponent(maestro_client_id)}/appointments`,
      token: auth.token,
      body: {
        title,
        start_at,
        end_at: end_at ?? null,
        notes: notes ?? null,
        type: type ?? "phone",
        broker_id: auth.brokerId,
        related_call_id: call_id ?? null,
      },
    });

    if (!res.ok) {
      await maestroAudit(admin, "appt_create_failed", { client_id: maestro_client_id, status: res.status });
      return json({ success: false, status: res.status, details: res.data }, 200);
    }
    const apptId = res.data?.id ?? res.data?.appointment_id;
    await maestroAudit(admin, "appt_created", { appointment_id: apptId, call_id, client_id: maestro_client_id });

    if (call_id) {
      try {
        const { data: row } = await admin
          .from("planipret_phone_calls")
          .select("maestro_appointments_created")
          .eq("id", call_id)
          .maybeSingle();
        const arr = Array.isArray(row?.maestro_appointments_created) ? row!.maestro_appointments_created : [];
        arr.push({ appointment_id: apptId, title, start_at, created_at: new Date().toISOString() });
        await admin.from("planipret_phone_calls").update({ maestro_appointments_created: arr }).eq("id", call_id);
      } catch (e) { console.warn("append appt to call failed", e); }
    }

    return json({ success: true, appointment_id: apptId });

  } catch (e: any) {
    console.error("maestro-appointment error", e);
    return json({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
