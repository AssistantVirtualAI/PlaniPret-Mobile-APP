// Live regression harness for the Planiprêt Task API (POST / PUT / DELETE).
// Guarded by the PLANIPRET_E2E_KEY secret — never exposed to the mobile app.
// Uses the broker's real Maestro OAuth token, server side only, and returns the
// full request/response payloads (token never echoed).
import { corsHeaders, jsonResponse, supaAdmin } from "../_shared/ns-broker.ts";
import { getUserMaestroAccessToken } from "../_shared/maestro-oauth.ts";
import { buildCreatePayload, buildUpdateBody } from "../_shared/planipret-tasks.ts";
import { handleTaskRequest } from "../_shared/planipret-task-handler.ts";

const API_BASE = (Deno.env.get("PLANIPRET_API_BASE_URL") ?? "https://client.planipret.com").replace(/\/$/, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const key = Deno.env.get("PLANIPRET_E2E_KEY") ?? "";
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  let bearerRole = "";
  try { bearerRole = JSON.parse(atob(bearer.split(".")[1] ?? "")).role ?? ""; } catch { /* not a jwt */ }
  const authorized = (key && req.headers.get("x-e2e-key") === key) || (svc && bearer === svc) || bearerRole === "service_role";
  if (!authorized) return jsonResponse({ success: false, error: "forbidden", seen_role: bearerRole || null, has_bearer: !!bearer }, 403);

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "");
  if (!email) return jsonResponse({ success: false, error: "email_required" }, 400);

  const admin = supaAdmin();
  const { data: profile } = await admin.from("planipret_profiles")
    .select("id, email, role, maestro_broker_id, maestro_telecom_user_id, maestro_connected")
    .eq("email", email).maybeSingle();
  if (!profile) return jsonResponse({ success: false, error: "profile_not_found" }, 404);

  const token = await getUserMaestroAccessToken(admin, profile.id).catch((e) => { throw e; });
  if (!token) return jsonResponse({ success: false, error: "no_maestro_token" }, 409);

  // Probe mode: discover the official GET listing route for a user.
  if (body?.mode === "probe_list") {
    const xid = String(profile.maestro_broker_id ?? "");
    const tid = String(profile.maestro_telecom_user_id ?? xid);
    const paths = [
      `/api/main/tasks?xid=${xid}&type=user`,
      `/api/main/tasks/user/${xid}`,
      `/api/main/tasks/list?xid=${xid}&type=user`,
      `/api/main/users/${xid}/tasks`,
      `/api/main/tasks/index?xid=${xid}&type=user`,
      `/api/main/task?xid=${xid}&type=user`,
      `/api/main/tasks?user_id=${xid}`,
      `/telecom/api/v1/users/${tid}/tasks`,
      `/telecom/api/v1/tasks?user_id=${tid}`,
      `/api/v1/tasks?xid=${xid}&type=user`,
    ];
    const results: unknown[] = [];
    for (const path of paths) {
      const r = await callWithToken(token, path, "GET");
      results.push({ path, status: (r.response as any).status, body: (r.response as any).body });
    }
    return jsonResponse({ success: true, api_base: API_BASE, xid, telecom_user_id: tid, results });
  }

  // Create-only mode: leaves the task in Maestro and mirrors it into the
  // projection so it shows up on the mobile home screen.
  if (body?.mode === "create_only") {
    const when = String(body?.date ?? "");
    const n = new Date(Date.now() + 24 * 3600 * 1000);
    const p2 = (x: number) => String(x).padStart(2, "0");
    const date = when || `${n.getUTCFullYear()}-${p2(n.getUTCMonth() + 1)}-${p2(n.getUTCDate())} 09:30:00`;
    const notes = String(body?.notes ?? "Tâche de test créée depuis l'application Planiprêt");
    const b = buildCreatePayload({
      xid: String(profile.maestro_broker_id ?? ""),
      type: "user",
      date,
      notes,
      description: String(body?.description ?? notes),
    });
    if (!b.ok) return jsonResponse({ success: false, error: "local_validation_failed", built: b }, 200);
    const res = await callWithToken(token, "/api/main/tasks", "POST", b.payload);
    const rd: any = (res.response as any).body;
    const id = String(rd?.data?.task_id ?? rd?.data?.id ?? rd?.task?.id ?? rd?.task_id ?? rd?.id ?? "").trim();
    if (id) {
      const task = { ...b.payload, id, status: "pending", due_at: new Date(date.replace(" ", "T") + "-04:00").toISOString() };
      await admin.from("planipret_tasks_projection").upsert({
        user_id: profile.id,
        task_id: id,
        due_at: task.due_at,
        status: "pending",
        payload: task,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,task_id" });
    }
    return jsonResponse({ success: true, task_id: id || null, create: res });
  }

  // AVA flow mode: exercises the exact gateway logic used by the chatbot and
  // the voicebot (auto-assignment, assignment to a colleague, update, delete).
  if (body?.mode === "ava_flow") {
    const n = new Date(Date.now() + 24 * 3600 * 1000);
    const p2 = (x: number) => String(x).padStart(2, "0");
    const due = `${n.getUTCFullYear()}-${p2(n.getUTCMonth() + 1)}-${p2(n.getUTCDate())} 10:15:00`;
    const deps = {
      admin,
      userId: profile.id,
      profile,
      token,
      apiFetch: async (path: string, init: { method: string; body?: string }) => {
        const r = await callWithToken(token, path, init.method, init.body ? JSON.parse(init.body) : undefined);
        const resp = r.response as any;
        return { status: resp.status, ok: resp.status >= 200 && resp.status < 300, data: resp.body };
      },
      listFetch: async () => ({ ok: false, tasks: [], endpoint: null, status: 405 }),
      resolveTelecomUserId: async (c: string | null) => c ?? String(profile.maestro_telecom_user_id ?? profile.maestro_broker_id ?? ""),
    } as any;

    const source = String(body?.source ?? "ava");
    const steps: Record<string, unknown> = {};

    // 1) create with NO target → auto-target + auto-assign to the creator
    const c1 = await handleTaskRequest({
      action: "create", source, notes: `AVA auto-assign ${new Date().toISOString()}`,
      description: "Test AVA — auto-assignation au créateur", due_at: due,
      idempotency_key: `ava_auto_${Date.now()}`,
    }, deps);
    steps.create_auto_assign = c1.body;
    const id1 = String((c1.body as any)?.task_id ?? "");

    // 2) create assigned to someone else
    const other = body?.assignee_id ?? null;
    if (other) {
      const c2 = await handleTaskRequest({
        action: "create", source, notes: `AVA assigné à ${other}`, due_at: due,
        assignee_id: other, idempotency_key: `ava_other_${Date.now()}`,
      }, deps);
      steps.create_assigned_other = c2.body;
    }

    // 3) update + 4) delete on the first task
    if (id1) {
      const u = await handleTaskRequest({
        action: "update", source, task_id: id1,
        changes: { notes: "AVA — tâche modifiée", date: due },
        idempotency_key: `ava_upd_${Date.now()}`,
      }, deps);
      steps.update = u.body;
      const d = await handleTaskRequest({
        action: "delete", source, task_id: id1, idempotency_key: `ava_del_${Date.now()}`,
      }, deps);
      steps.delete = d.body;
    }

    return jsonResponse({ success: true, broker_xid: profile.maestro_broker_id, steps });
  }


  const steps: Record<string, unknown> = {};
  const now = new Date(Date.now() + 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const due = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} 09:30:00`;

  // 1) CREATE — required fields + required_without status slug
  const built = buildCreatePayload({
    xid: String(profile.maestro_broker_id ?? ""),
    type: "user",
    date: due,
    notes: `E2E regression ${new Date().toISOString()}`,
    description: "Automated doc-alignment check (create/update/delete).",
  });
  if (!built.ok) return jsonResponse({ success: false, error: "local_validation_failed", built }, 200);
  const created = await callWithToken(token, "/api/main/tasks", "POST", built.payload);
  steps.create = created;

  const cdata: any = created.response.body;
  const taskId = String(cdata?.data?.task_id ?? cdata?.data?.id ?? cdata?.task?.id ?? cdata?.task_id ?? cdata?.id ?? "").trim();
  steps.resolved_task_id = taskId || null;

  if (taskId) {
    // 2) UPDATE — task_id in path AND body
    const upd = buildUpdateBody(taskId, { notes: "E2E regression — updated", date: due });
    steps.update = upd.ok
      ? await callWithToken(token, `/api/main/tasks/${taskId}`, "PUT", upd.payload)
      : { local_validation: upd };

    // 3) DELETE — task_id in path AND body (soft delete)
    steps.delete = await callWithToken(token, `/api/main/tasks/${taskId}`, "DELETE", {
      task_id: Number.isNaN(Number(taskId)) ? taskId : Number(taskId),
    });
  }

  return jsonResponse({
    success: true,
    broker: {
      email: profile.email,
      role: profile.role,
      maestro_broker_id: profile.maestro_broker_id,
      maestro_telecom_user_id: profile.maestro_telecom_user_id,
    },
    api_base: API_BASE,
    steps,
  });
});

async function callWithToken(token: string, path: string, method: string, payload?: unknown) {
  const url = `${API_BASE}${path}`;
  const started = Date.now();
  let status = 599;
  let data: unknown = null;
  try {
    const res = await fetch(url, {
      method,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    status = res.status;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = text.slice(0, 1500); }
  } catch (e) {
    data = { error: String(e) };
  }
  return {
    request: {
      method,
      url,
      headers: { Authorization: "Bearer <redacted>", "Content-Type": "application/json", Accept: "application/json" },
      body: payload ?? null,
    },
    response: { status, ms: Date.now() - started, body: data },
  };
}
