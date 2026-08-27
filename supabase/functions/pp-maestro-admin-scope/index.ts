// Reports whether a firm-wide ("admin scope") Maestro credential is configured,
// and optionally probes the Commission Reports API with it.
//
// Admin-only. Never returns the token itself.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getMaestroAdminAccessToken } from "../_shared/maestro-admin-token.ts";
import { buildDepositQuery, commissionGet } from "../_shared/commission-reports.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json({ error: "unauthorized" }, 401);
  const [{ data: isAdminData }, { data: isSuperData }] = await Promise.all([
    admin.rpc("is_planipret_admin", { _user_id: user.id }),
    admin.rpc("is_super_admin", { _user_id: user.id }),
  ]);
  if (!isAdminData && !isSuperData) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const wantProbe = body?.probe === true;

  const env = {
    MAESTRO_ADMIN_ACCESS_TOKEN: !!(Deno.env.get("MAESTRO_ADMIN_ACCESS_TOKEN") ?? "").trim(),
    MAESTRO_ADMIN_CLIENT_ID: !!(Deno.env.get("MAESTRO_ADMIN_CLIENT_ID") ?? "").trim(),
    MAESTRO_ADMIN_CLIENT_SECRET: !!(Deno.env.get("MAESTRO_ADMIN_CLIENT_SECRET") ?? "").trim(),
    MAESTRO_ADMIN_SCOPE: (Deno.env.get("MAESTRO_ADMIN_SCOPE") ?? "api"),
  };

  const tok = await getMaestroAdminAccessToken();
  const cid = crypto.randomUUID().slice(0, 8);

  let probe: any = null;
  if (wantProbe && tok.token) {
    const year = new Date().getFullYear();
    const qs = buildDepositQuery({
      date_from: `${year - 1}-01-01 00:00:00`,
      date_to: `${year}-12-31 23:59:59`,
      page: 1,
      per_page: 5,
    } as any);
    const r = await commissionGet(`/api/main/commissions/reports/deposits?${qs}`, tok.token, cid);
    probe = {
      status: r.status,
      ok: r.ok,
      rows: Array.isArray(r.data?.data) ? r.data.data.length : 0,
      total: Number(r.data?.meta?.total ?? 0) || null,
      message: r.ok ? null : String(r.data?.message ?? r.data?.error ?? `HTTP ${r.status}`).slice(0, 300),
      distinct_agents: Array.isArray(r.data?.data)
        ? Array.from(new Set(r.data.data.map((x: any) => String(x?.agent_name ?? "")).filter(Boolean))).slice(0, 10)
        : [],
    };
  }

  // Broker connection coverage, so the page can explain what the scope unlocks.
  const { count: total } = await admin
    .from("planipret_profiles").select("user_id", { count: "exact", head: true });
  const { count: connected } = await admin
    .from("planipret_commission_sync_diag").select("broker_user_id", { count: "exact", head: true })
    .eq("connected", true);

  return json({
    configured: tok.source !== "none",
    source: tok.source,
    reason: tok.reason ?? null,
    env,
    probe,
    brokers: { total: total ?? 0, connected: connected ?? 0 },
  });
});
