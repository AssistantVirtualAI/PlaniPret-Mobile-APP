// GET /functions/v1/maestro-counts
// Returns badge counts: missed_calls, pending_tasks, upcoming_appts.
import {
  adminClient,
  corsHeaders,
  getBrokerAuth,
  getMaestroConfig,
  json,
  maestroFetch,
} from "../_shared/maestro.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const userIdHeader = req.headers.get("x-user-id");
    const admin = adminClient();
    const cfg = await getMaestroConfig(admin);
    if (!cfg.url || !cfg.key) {
      return json({ missed_calls: 0, pending_tasks: 0, upcoming_appts: 0, configured: false });
    }
    const auth = await getBrokerAuth(admin, userIdHeader);
    if (!auth.brokerId) {
      return json({ missed_calls: 0, pending_tasks: 0, upcoming_appts: 0, no_broker_id: true });
    }

    const res = await maestroFetch(cfg, {
      path: `/api/v1/brokers/${encodeURIComponent(auth.brokerId)}/counts`,
      token: auth.token,
    });
    if (!res.ok) {
      return json({ missed_calls: 0, pending_tasks: 0, upcoming_appts: 0, error: `status_${res.status}` });
    }
    return json({
      missed_calls: res.data?.missed_calls ?? 0,
      pending_tasks: res.data?.pending_tasks ?? 0,
      upcoming_appts: res.data?.upcoming_appts ?? 0,
    });
  } catch (e: any) {
    console.error("maestro-counts error", e);
    return json({ missed_calls: 0, pending_tasks: 0, upcoming_appts: 0, error: e?.message }, 200);
  }
});
