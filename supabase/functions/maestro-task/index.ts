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
import { guardPlanipret } from "../_shared/planipret-guard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const guard = await guardPlanipret(req);
  if ("error" in guard) return guard.error;
  try {
    const body = await req.json().catch(() => ({}));
    const { maestro_client_id, title, due_date, priority, call_id, source } = body;
    if (!maestro_client_id || !title) {
      return json({ success: false, error: "missing_fields" }, 400);
    }

    const admin = adminClient();
    const cfg = await getMaestroConfig(admin);
    if (!cfg.url || !cfg.key) return json({ success: false, error: "maestro_not_configured" }, 200);

    // The authenticated broker is the sole identity source. Never honor a
    // caller-controlled header, and never create a task on another broker's call.
    const userId = guard.user.id;
    if (call_id) {
      const { data } = await admin
        .from("planipret_phone_calls")
        .select("user_id")
        .eq("id", call_id)
        .maybeSingle();
      if (!data) return json({ success: false, error: "call_not_found" }, 404);
      if (data.user_id !== userId) {
        const { data: profile } = await admin
          .from("planipret_profiles")
          .select("id, user_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (!profile || (data.user_id !== profile.id && data.user_id !== profile.user_id)) {
          return json({ success: false, error: "forbidden_call_scope" }, 403);
        }
      }
    }
    const auth = await getBrokerAuth(admin, userId);
    if (!auth.brokerId) {
      return json({ success: false, error: "maestro_broker_unresolved" }, 200);
    }

    const res = await maestroFetch(cfg, {
      method: "POST",
      path: `/api/v1/users/${encodeURIComponent(String(auth.brokerId ?? ""))}/clients/${encodeURIComponent(maestro_client_id)}/tasks`,
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
