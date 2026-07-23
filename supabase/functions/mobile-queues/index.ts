// mobile-queues: read-only list of call queues + live stats for the mobile app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const { data: sp } = await sb.from("pbx_softphone_users")
      .select("organization_id").eq("portal_user_id", u.user.id).maybeSingle();
    if (!sp?.organization_id) return json({ error: "NO_SOFTPHONE_ACCOUNT" }, 404);
    const orgId = sp.organization_id;

    const { data: queues } = await sb.from("pbx_call_queues")
      .select("queue_uuid, name, extension, strategy")
      .eq("organization_id", orgId)
      .order("name");

    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);

    const rows = await Promise.all((queues ?? []).map(async (q: any) => {
      const ext = q.extension;
      const { data: calls } = await sb.from("pbx_call_records")
        .select("id, missed_call, duration_seconds, hangup_cause")
        .eq("organization_id", orgId)
        .eq("destination_number", ext)
        .gte("start_at", startOfDay.toISOString());
      const callsToday = calls?.length ?? 0;
      const missed = (calls ?? []).filter((c: any) => c.missed_call).length;
      const slaPct = callsToday > 0 ? Math.max(0, Math.round((1 - missed / callsToday) * 100)) : 0;
      const avgWaitSec = 0;
      const waiting = 0;
      const agentsOnline = 0;
      return {
        id: q.queue_uuid,
        name: q.name,
        extension: q.extension || "",
        strategy: q.strategy || "ring-all",
        waiting, agentsOnline, callsToday, avgWaitSec, slaPct,
      };
    }));

    return json(rows);
  } catch (e: any) {
    return json({ error: e.message || "error" }, 500);
  }
});
