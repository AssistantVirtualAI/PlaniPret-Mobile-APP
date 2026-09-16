// Synchronise les tâches Maestro de TOUS les courtiers dans la projection
// locale (planipret_tasks_projection), pour le tableau admin et l'app mobile.
//
// Source unique : `planipret-task-api` (action "list"), la même route que
// l'app mobile et le portail. Le balayeur ne parle jamais directement à
// Maestro : la résolution d'identifiant, le filtrage par assignation et la
// projection restent dans un seul endroit testé.
import { corsHeaders, jsonResponse, supaAdmin } from "../_shared/ns-broker.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await req.json().catch(() => ({} as any));
  const limit = Math.min(Number(body?.limit ?? 250), 500);
  const admin = supaAdmin();

  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let q = admin
    .from("planipret_profiles")
    .select("user_id, maestro_broker_id, full_name")
    .not("user_id", "is", null)
    .not("maestro_broker_id", "is", null)
    .limit(limit);
  if (body?.user_id) q = q.eq("user_id", String(body.user_id));

  const { data: profiles } = await q;

  const results: any[] = [];
  let synced = 0;
  let totalTasks = 0;

  for (const p of (profiles ?? []) as any[]) {
    const userId = String(p.user_id);
    try {
      const res = await fetch(`${baseUrl}/functions/v1/planipret-task-api`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "list", user_id: userId, source: "tasks_sweeper", limit: 200 }),
      });
      const j: any = await res.json().catch(() => ({}));
      const count = Number(j?.counts?.all ?? 0);
      if (j?.source === "api" && count > 0) { synced++; totalTasks += count; }
      results.push({
        broker: String(p.maestro_broker_id), name: p.full_name,
        ok: j?.success === true, source: j?.source ?? null, tasks: count, status: res.status, error: j?.error ?? null,
      });
    } catch (e) {
      results.push({ broker: String(p.maestro_broker_id), name: p.full_name, ok: false, error: String(e) });
    }
  }

  return jsonResponse({
    success: true,
    brokers: (profiles ?? []).length,
    brokers_with_tasks: synced,
    tasks: totalTasks,
    results: results.slice(0, 300),
  }, 200);
});
