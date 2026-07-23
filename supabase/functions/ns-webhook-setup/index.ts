import { corsHeaders, jsonResponse, nsBrokerFetch, requirePlanipretAdmin } from "../_shared/ns-broker.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await requirePlanipretAdmin(req);
    if ("error" in auth) return auth.error;
    const { admin, profile } = auth;

    const target = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ns-webhook-receiver`;
    const desired = ["cdr", "message", "voicemail"];

    // FIX 5 — check existing subscriptions first
    const listRes = await nsBrokerFetch(admin, profile, "/subscriptions", { method: "GET" });
    const listData = await listRes.json().catch(() => ({}));
    const existing: any[] = Array.isArray(listData) ? listData : (listData.subscriptions ?? listData.data ?? []);

    const matches = (s: any, ev: string) => {
      const e = s.event ?? s.event_type ?? s.type;
      const u = s.target_url ?? s.url ?? s.callback_url;
      return e === ev && (!u || u === target);
    };

    const created: any[] = [];
    const kept: any[] = [];
    for (const event of desired) {
      const hit = existing.find((s) => matches(s, event));
      if (hit) { kept.push({ event, id: hit.id ?? null }); continue; }
      const res = await nsBrokerFetch(admin, profile, "/subscriptions", {
        method: "POST",
        body: JSON.stringify({ event, target_url: target }),
      });
      const data = await res.json().catch(() => ({}));
      created.push({ event, ok: res.ok, status: res.status, data });
    }

    console.log("ns-webhook-setup", { existing: kept.length, created: created.length });
    return jsonResponse({
      success: true,
      existing: kept.length,
      created: created.length,
      subscriptions: [...kept, ...created],
    });
  } catch (e) {
    console.error("ns-webhook-setup error", e);
    return jsonResponse({ success: false, error: "Connexion perdue", code: 0 }, 200);
  }
});
