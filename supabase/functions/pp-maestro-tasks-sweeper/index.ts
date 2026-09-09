// Synchronise les tâches Maestro de TOUS les courtiers dans la projection
// locale (planipret_tasks_projection), pour le tableau admin et l'app mobile.
import { corsHeaders, jsonResponse, supaAdmin } from "../_shared/ns-broker.ts";
import { getUserMaestroAccessToken } from "../_shared/maestro-oauth.ts";
import { normalizeTask } from "../_shared/planipret-tasks.ts";

const API_BASE = (Deno.env.get("PLANIPRET_API_BASE_URL") ?? "https://client.planipret.com").replace(/\/$/, "");
const TELECOM_BASE = (Deno.env.get("MAESTRO_TELECOM_BASE_URL") ?? "https://client.planipret.com/telecom/api/v1").replace(/\/$/, "");
const TIMEOUT_MS = 15_000;

function extract(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  for (const k of ["data", "tasks", "results", "items", "rows"]) {
    const v = payload?.[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      for (const k2 of ["data", "tasks", "results", "items", "rows"]) {
        if (Array.isArray(v?.[k2])) return v[k2];
      }
    }
  }
  return [];
}

async function listTasks(token: string, maestroId: string): Promise<any[]> {
  const urls = [
    `${API_BASE}/api/main/tasks?limit=200&user_id=${maestroId}`,
    `${API_BASE}/api/main/tasks?limit=200&users_id=${maestroId}`,
    `${TELECOM_BASE}/users/${maestroId}/tasks?limit=200`,
  ];
  for (const url of urls) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: ctrl.signal,
      });
      if (!res.ok) continue;
      const j = await res.json().catch(() => null);
      const tasks = extract(j).map(normalizeTask).filter((t: any) => t?.id);
      if (tasks.length) return tasks;
    } catch { /* essaie la route suivante */ } finally { clearTimeout(timer); }
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await req.json().catch(() => ({} as any));
  const limit = Math.min(Number(body?.limit ?? 250), 500);
  const admin = supaAdmin();

  const { data: profiles } = await admin
    .from("planipret_profiles")
    .select("user_id, maestro_broker_id, full_name")
    .not("user_id", "is", null)
    .not("maestro_broker_id", "is", null)
    .limit(limit);

  const envToken = Deno.env.get("PLANIPRET_ACCESS_TOKEN") ?? "";
  const results: any[] = [];
  let synced = 0;
  let totalTasks = 0;

  for (const p of (profiles ?? []) as any[]) {
    const userId = String(p.user_id);
    const brokerId = String(p.maestro_broker_id);
    const token = (await getUserMaestroAccessToken(admin, userId).catch(() => null)) || envToken;
    if (!token) {
      results.push({ broker: brokerId, name: p.full_name, ok: false, reason: "no_token" });
      continue;
    }
    const tasks = await listTasks(token, brokerId);
    if (tasks.length) {
      const rows = tasks.map((t: any) => ({
        user_id: userId,
        task_id: String(t.id),
        due_at: t.due_at,
        status: t.status,
        payload: t,
        updated_at: new Date().toISOString(),
      }));
      await admin.from("planipret_tasks_projection").upsert(rows, { onConflict: "user_id,task_id" });
      synced++;
      totalTasks += rows.length;
    }
    results.push({ broker: brokerId, name: p.full_name, tasks: tasks.length, ok: true });
  }

  return jsonResponse({
    success: true,
    brokers: (profiles ?? []).length,
    brokers_with_tasks: synced,
    tasks: totalTasks,
    results: results.slice(0, 300),
  }, 200);
});
