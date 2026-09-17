// Sonde NON DESTRUCTIVE du contrat d'authentification Maestro "machine + utilisateur agissant".
//
// GET uniquement. Aucune écriture Maestro, aucune écriture NetSapiens, aucun secret retourné.
// Admin-only (JWT).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BASE = (Deno.env.get("MAESTRO_MAIN_BASE_URL") ?? "https://client.planipret.com").replace(/\/$/, "");

async function probeGet(path: string, secret: string, actingId: string) {
  const t = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        "X-Acting-User-ID": actingId,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
    const ct = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { /* non-JSON */ }
    const rows = Array.isArray(parsed?.data) ? parsed.data.length : Array.isArray(parsed) ? parsed.length : null;
    return {
      http: res.status,
      ms: Date.now() - t,
      content_type: ct.split(";")[0] || null,
      is_json: parsed !== null,
      business_ok: parsed ? parsed.success !== false : false,
      rows,
      total: Number(parsed?.meta?.total ?? parsed?.total ?? NaN) || null,
      message: parsed
        ? String(parsed?.message ?? parsed?.error ?? "").slice(0, 200) || null
        : raw.slice(0, 120).replace(/\s+/g, " "),
    };
  } catch (e) {
    return { http: 0, ms: Date.now() - t, content_type: null, is_json: false, business_ok: false, rows: null, total: null, message: String((e as Error)?.message ?? e).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json({ error: "unauthorized" }, 401);
  const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([
    admin.rpc("is_planipret_admin", { _user_id: user.id }),
    admin.rpc("is_super_admin", { _user_id: user.id }),
  ]);
  if (!isAdmin && !isSuper) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({} as any));
  const profileId = String(body?.profile_id ?? "").trim();
  if (!profileId) return json({ error: "profile_id_required" }, 400);

  const { data: prof } = await admin
    .from("planipret_profiles")
    .select("id, full_name, maestro_broker_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!prof) return json({ error: "profile_not_found" }, 404);

  const brokerId = String((prof as any).maestro_broker_id ?? "").trim();
  const secret = (Deno.env.get("MAESTRO_MACHINE_API_KEY") ?? "").trim();
  const name = String((prof as any).full_name ?? "");
  const pseudonym = name ? `${name.slice(0, 1)}•••${name.trim().split(/\s+/).pop()?.slice(0, 1) ?? ""}` : "•••";

  const preconditions = {
    broker: pseudonym,
    machine_secret_present: secret.length > 0,
    crm_id_present: brokerId.length > 0,
    crm_id_numeric: /^\d+$/.test(brokerId),
    base_url: BASE,
  };
  if (!preconditions.machine_secret_present || !preconditions.crm_id_numeric) {
    return json({ success: false, preconditions, error: "preconditions_failed" }, 200);
  }

  const tasksQs = `status=pending&delegate_users_id=${encodeURIComponent(brokerId)}&page=1&per_page=20&order_by=date&sort=desc`;
  const results = {
    agents: await probeGet("/api/main/commissions/reports/agents", secret, brokerId),
    tasks: await probeGet(`/api/main/tasks?${tasksQs}`, secret, brokerId),
    contracts: await probeGet("/api/main/contracts?page=1&per_page=5", secret, brokerId),
    invalid_acting_id: await probeGet("/api/main/commissions/reports/agents", secret, "0"),
  };

  const readsOk = ["agents", "tasks", "contracts"].every((k) => {
    const r = (results as any)[k];
    return r.http >= 200 && r.http < 300 && r.is_json && r.business_ok;
  });
  const isolationOk = [401, 403].includes(results.invalid_acting_id.http);

  return json({
    success: true,
    read_only: true,
    mutations_performed: 0,
    preconditions,
    results,
    verdict: {
      contract_proven_for_reads: readsOk && isolationOk,
      reads_ok: readsOk,
      isolation_ok: isolationOk,
    },
  });
});
