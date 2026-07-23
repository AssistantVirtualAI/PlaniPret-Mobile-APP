// POST /functions/v1/maestro-task
// Body: { maestro_client_id, title, due_date, priority, call_id?, source? }
import {
  adminClient,
  corsHeaders,
  getBrokerAuth,
  getMaestroConfig,
  json,
  maestroAudit,
  maestroFetch,
} from "../_shared/maestro.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const { maestro_client_id, title, due_date, priority, call_id, source } = body;
    if (!maestro_client_id || !title) {
      return json({ success: false, error: "missing_fields" }, 400);
    }
    const userIdHeader = req.headers.get("x-user-id");

    const admin = adminClient();
    const cfg = await getMaestroConfig(admin);
    if (!cfg.url || !cfg.key) return json({ success: false, error: "maestro_not_configured" }, 200);

    // Resolve user from call if not provided
    let userId = userIdHeader;
    if (!userId && call_id) {
      const { data } = await admin
        .from("planipret_phone_calls")
        .select("user_id")
        .eq("id", call_id)
        .maybeSingle();
      userId = data?.user_id ?? null;
    }
    const auth = await getBrokerAuth(admin, userId);

    const res = await maestroFetch(cfg, {
      method: "POST",
      path: `/api/v1/clients/${encodeURIComponent(maestro_client_id)}/tasks`,
      token: auth.token,
      body: {
        title,
        due_date,
        priority: priority ?? "medium",
        assigned_to: auth.brokerId,
        source: source ?? "ai_summary",
        related_call_id: call_id ?? null,
      },
    });

    if (!res.ok) {
      await maestroAudit(admin, "task_create_failed", { client_id: maestro_client_id, status: res.status });
      return json({ success: false, status: res.status, details: res.data }, 200);
    }
    const taskId = res.data?.id ?? res.data?.task_id;
    await maestroAudit(admin, "task_created", { task_id: taskId, call_id, client_id: maestro_client_id });

    // Append to maestro_tasks_created on the call row
    if (call_id) {
      try {
        const { data: row } = await admin
          .from("planipret_phone_calls")
          .select("maestro_tasks_created")
          .eq("id", call_id)
          .maybeSingle();
        const arr = Array.isArray(row?.maestro_tasks_created) ? row!.maestro_tasks_created : [];
        arr.push({ task_id: taskId, title, created_at: new Date().toISOString() });
        await admin.from("planipret_phone_calls").update({ maestro_tasks_created: arr }).eq("id", call_id);
      } catch (e) { console.warn("append task to call failed", e); }
    }

    return json({ success: true, task_id: taskId });

  } catch (e: any) {
    console.error("maestro-task error", e);
    return json({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
