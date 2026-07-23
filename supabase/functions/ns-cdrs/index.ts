import { authBroker, corsHeaders, jsonResponse, nsBrokerFetch, nsEnv, nsPath } from "../_shared/ns-broker.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authBroker(req);
    if ("error" in auth) return auth.error;
    const { admin, userId, profile } = auth;
    const env = nsEnv();

    const url = new URL(req.url);
    const params = new URLSearchParams();
    params.set("limit", url.searchParams.get("limit") ?? "50");
    params.set("offset", url.searchParams.get("offset") ?? "0");
    const sd = url.searchParams.get("start_date");
    const ed = url.searchParams.get("end_date");
    if (sd) params.set("start_date", sd);
    if (ed) params.set("end_date", ed);

    const res = await nsBrokerFetch(
      admin,
      profile,
      `${nsPath(env.domain, profile.extension, "/cdrs")}?${params.toString()}`,
      { method: "GET" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return jsonResponse({ success: false, error: data?.message ?? "NS-API error", code: res.status }, 200);

    const cdrs: any[] = Array.isArray(data) ? data : (data.cdrs ?? data.data ?? []);
    if (cdrs.length) {
      const rows = cdrs.map((c) => ({
        user_id: userId,
        call_id: c.call_id ?? c.id ?? c.uuid,
        direction: c.direction ?? null,
        caller_number: c.caller_number ?? c.from ?? null,
        callee_number: c.callee_number ?? c.to ?? null,
        duration_seconds: c.duration ?? c.duration_seconds ?? null,
        status: "completed",
      })).filter((r) => r.call_id);
      if (rows.length) {
        await admin.from("planipret_phone_calls").upsert(rows, { onConflict: "call_id" });
      }
    }
    return jsonResponse({ success: true, data: cdrs, count: cdrs.length });
  } catch (e) {
    console.error("ns-cdrs error", e);
    return jsonResponse({ success: false, error: "Connexion perdue", code: 0 }, 200);
  }
});
