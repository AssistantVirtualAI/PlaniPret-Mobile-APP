// GET /functions/v1/maestro-client-history?client_id=...&limit=20
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
    const url = new URL(req.url);
    const clientId = url.searchParams.get("client_id");
    const limit = Number(url.searchParams.get("limit") ?? "20");
    if (!clientId) return json({ error: "client_id_required" }, 400);
    const userIdHeader = req.headers.get("x-user-id");

    const admin = adminClient();
    const cfg = await getMaestroConfig(admin);
    if (!cfg.url || !cfg.key) return json({ items: [], error: "maestro_not_configured" }, 200);

    const auth = await getBrokerAuth(admin, userIdHeader);
    const [comms, ai] = await Promise.all([
      maestroFetch(cfg, {
        path: `/api/v1/clients/${encodeURIComponent(clientId)}/communications?limit=${limit}`,
        token: auth.token,
      }),
      maestroFetch(cfg, {
        path: `/api/v1/clients/${encodeURIComponent(clientId)}/ai_history?limit=${limit}`,
        token: auth.token,
      }),
    ]);

    const merged = [
      ...((comms.data?.items ?? comms.data ?? []) as any[]).map((x) => ({ ...x, kind: x.kind ?? x.type ?? "communication" })),
      ...((ai.data?.items ?? ai.data ?? []) as any[]).map((x) => ({ ...x, kind: "ai_insight" })),
    ].sort((a, b) => {
      const da = new Date(a.created_at ?? a.date ?? 0).getTime();
      const db = new Date(b.created_at ?? b.date ?? 0).getTime();
      return db - da;
    });

    return json({ items: merged.slice(0, limit) });
  } catch (e: any) {
    console.error("maestro-client-history error", e);
    return json({ items: [], error: e?.message ?? "server_error" }, 500);
  }
});
