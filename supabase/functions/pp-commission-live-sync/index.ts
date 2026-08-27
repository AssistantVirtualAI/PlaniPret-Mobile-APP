// Asynchronous Maestro commission sync.
//
// Runs in the background (cron or manual admin trigger), fans out over every
// broker — using the admin-scoped credential when Planiprêt has issued one,
// otherwise the broker's own OAuth token — and caches the deposits in
// `planipret_commission_live_cache`. Per-broker diagnostics (connected? exact
// failure reason?) land in `planipret_commission_sync_diag`.
//
// The dashboards then read the cache instantly instead of fanning out live.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getUserMaestroAccessToken } from "../_shared/maestro-oauth.ts";
import { buildDepositQuery, commissionGet, type CommissionDepositRow } from "../_shared/commission-reports.ts";
import { getMaestroAdminAccessToken } from "../_shared/maestro-admin-token.ts";
import { agentKey } from "../_shared/broker-identity.ts";

const MAX_PAGES = 15;
const PER_PAGE = 200;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const dedupeKey = (r: { number?: unknown; date_trans?: unknown; amount?: unknown; commission_type?: unknown }) =>
  [
    String(r.number ?? "").trim().toUpperCase(),
    String(r.date_trans ?? "").slice(0, 10),
    num(r.amount).toFixed(2),
    String(r.commission_type ?? "").trim().toLowerCase(),
  ].join("|");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const cid = crypto.randomUUID().slice(0, 8);

  // --- authorization: cron secret, or a signed-in Planiprêt admin -----------
  let trigger = "cron";
  const cronSecret = Deno.env.get("PP_CRON_TOKEN") ?? Deno.env.get("PP_CRON_SECRET") ?? "";
  const provided = req.headers.get("x-pp-cron-secret") ?? req.headers.get("x-cron-secret");
  if (!(cronSecret && provided && provided === cronSecret)) {
    const authz = req.headers.get("Authorization") ?? "";
    const jwt = authz.replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: prof } = await admin
      .from("planipret_profiles").select("role").eq("user_id", user.id).maybeSingle();
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: user.id });
    if (!(prof?.role === "admin" || isSuper === true)) return json({ error: "forbidden" }, 403);
    trigger = "manual";
  }

  const body = await req.json().catch(() => ({}));
  const nowYear = new Date().getFullYear();
  const yearFrom = Number(body?.year_from) || 2022;
  const from = `${yearFrom}-01-01 00:00:00`;
  const to = `${nowYear}-12-31 23:59:59`;

  const { data: run } = await admin
    .from("planipret_commission_sync_runs")
    .insert({ trigger_source: trigger }).select("id").maybeSingle();
  const runId = run?.id ?? null;

  const adminTok = await getMaestroAdminAccessToken();

  const { data: profiles } = await admin
    .from("planipret_profiles")
    .select("user_id, full_name, email, maestro_broker_id, maestro_connected")
    .limit(1000);

  const onlyBrokers = Array.isArray(body?.broker_ids)
    ? new Set((body.broker_ids as unknown[]).map((v) => String(v)))
    : null;
  const list = (profiles ?? [])
    .filter((p: any) => p.user_id)
    .filter((p: any) => !onlyBrokers || onlyBrokers.has(String(p.user_id)));

  // A firm credential can expose Maestro's complete agents directory. Resolve
  // missing local IDs before fan-out so brokers do not remain permanently
  // classified as "not connected" merely because their ID was never cached.
  if (adminTok.token) {
    const directory = await commissionGet("/api/main/commissions/reports/agents", adminTok.token, cid);
    const agentRows: any[] = directory.ok
      ? (Array.isArray(directory.data?.data) ? directory.data.data : Array.isArray(directory.data) ? directory.data : [])
      : [];
    const byName = new Map<string, string>();
    const byEmail = new Map<string, string>();
    for (const a of agentRows) {
      const id = a?.users_id ?? a?.agent_name_id ?? a?.id;
      if (id == null) continue;
      const name = String(a?.agent_name ?? a?.name ?? a?.full_name ?? [a?.first_name, a?.last_name].filter(Boolean).join(" ") ?? "").trim();
      const email = String(a?.email ?? "").trim().toLowerCase();
      const nk = agentKey(name);
      if (nk) byName.set(nk, String(id));
      if (email) byEmail.set(email, String(id));
    }
    const resolved: { user_id: string; maestro_broker_id: string }[] = [];
    for (const p of list as any[]) {
      if (p.maestro_broker_id != null) continue;
      const id = byEmail.get(String(p.email ?? "").trim().toLowerCase())
        ?? (agentKey(String(p.full_name ?? "")) ? byName.get(agentKey(String(p.full_name ?? "")) as string) : undefined);
      if (!id) continue;
      p.maestro_broker_id = id;
      resolved.push({ user_id: p.user_id, maestro_broker_id: id });
    }
    for (const p of resolved) {
      await admin.from("planipret_profiles").update({ maestro_broker_id: p.maestro_broker_id }).eq("user_id", p.user_id);
    }
  }
  let connectedCount = 0;
  let upserted = 0;
  const diagRows: any[] = [];

  // La commission brute = base + bonus + bonus2 + perform. Maestro ne renvoie
  // qu'un bucket par appel, donc on parcourt les quatre; le volume de prêt
  // n'est conservé que sur la ligne "base" pour éviter de le compter 4 fois.
  const COMMISSION_BUCKETS = ["base", "bonus", "bonus2", "perform"] as const;

  const fetchPages = async (token: string, usersId: string | null) => {
    const rows: CommissionDepositRow[] = [];
    let firstError: null | { status: number; message: string } = null;
    for (const ctype of COMMISSION_BUCKETS) {
      let page = 1;
      while (page <= MAX_PAGES) {
        const qs = buildDepositQuery({
          date_from: from, date_to: to, page, per_page: PER_PAGE, commission_type: ctype,
          ...(usersId ? { users_id: usersId } : {}),
        } as any);
        const r = await commissionGet(`/api/main/commissions/reports/deposits?${qs}`, token, cid);
        if (!r.ok) {
          const err = { status: r.status, message: String(r.data?.message ?? r.data?.error ?? `HTTP ${r.status}`) };
          if (ctype === "base") return { rows, error: err };
          firstError = firstError ?? err;
          break;
        }
        const batch: CommissionDepositRow[] = Array.isArray(r.data?.data) ? r.data.data : [];
        for (const row of batch) {
          rows.push({
            ...row,
            commission_type: (row as any).commission_type ?? ctype,
            loan_amt: ctype === "base" ? (row as any).loan_amt : 0,
          } as CommissionDepositRow);
        }
        const lastPage = Number(r.data?.meta?.last_page ?? 1);
        if (page >= lastPage || batch.length === 0) break;
        page += 1;
      }
    }
    return { rows, error: null as null | { status: number; message: string } };
  };

  for (const p of list as any[]) {
    const label = String(p.full_name ?? p.email ?? p.user_id);
    const attemptedAt = new Date().toISOString();
    const mid = p.maestro_broker_id != null ? String(p.maestro_broker_id) : null;

    // Prefer the broker's own token (always correctly scoped); fall back to the
    // admin-scoped credential when the broker never connected.
    let token: string | null = await getUserMaestroAccessToken(admin, p.user_id).catch(() => null);
    let source: "broker_token" | "admin_token" = "broker_token";
    if (!token && adminTok.token && mid) { token = adminTok.token; source = "admin_token"; }

    if (!token) {
      diagRows.push({
        broker_user_id: p.user_id, broker_label: label, broker_email: p.email ?? null,
        maestro_broker_id: mid, connected: false, status: "not_connected",
        reason: adminTok.token
          ? (mid ? "no_broker_token_and_admin_lookup_failed" : "no_broker_token_and_no_maestro_broker_id")
          : `maestro_not_connected (${adminTok.reason ?? "admin_scope_not_configured"})`,
        http_status: null, rows_count: 0, source: null, last_attempt_at: attemptedAt,
      });
      continue;
    }

    const { rows, error } = await fetchPages(token, source === "admin_token" ? mid : null);
    if (error) {
      diagRows.push({
        broker_user_id: p.user_id, broker_label: label, broker_email: p.email ?? null,
        maestro_broker_id: mid, connected: source === "broker_token", status: "error",
        reason: `${source}:${error.message}`.slice(0, 400), http_status: error.status,
        rows_count: 0, source, last_attempt_at: attemptedAt,
      });
      continue;
    }

    if (source === "broker_token") connectedCount += 1;

    const payload = rows.map((row) => {
      const date = row.date_trans ? String(row.date_trans).slice(0, 10) : null;
      return {
        dedupe_key: dedupeKey(row as any),
        broker_user_id: p.user_id,
        broker_label: label,
        maestro_broker_id: row.agent_name_id != null ? String(row.agent_name_id) : mid,
        agent_name: String(row.agent_name ?? row.target_name ?? label).trim() || label,
        date_trans: date,
        fiscal_year: date ? Number(date.slice(0, 4)) : null,
        row_data: {
          number: row.number ?? null,
          loan_amt: num(row.loan_amt),
          institution: row.institution ?? null,
          amount: num(row.amount),
          mortgage_type: row.mortgage_type ?? null,
          term: row.term != null ? String(row.term) : null,
          target_name: row.target_name ?? null,
          commission_type: row.commission_type ?? "base",
          split_type: row.split_type ?? null,
          cabinet: row.cabinet ?? null,
          is_adjustment: row.is_adjustment ?? null,
        },
        synced_at: new Date().toISOString(),
      };
    });

    // Deduplicate inside the batch before upserting (same key can repeat).
    const byKey = new Map<string, any>();
    for (const r of payload) byKey.set(r.dedupe_key, r);
    const unique = [...byKey.values()];

    for (let i = 0; i < unique.length; i += 500) {
      const { error: upErr } = await admin
        .from("planipret_commission_live_cache")
        .upsert(unique.slice(i, i + 500), { onConflict: "dedupe_key" });
      if (upErr) console.error(`[${cid}] upsert failed`, upErr.message);
      else upserted += Math.min(500, unique.length - i);
    }

    diagRows.push({
      broker_user_id: p.user_id, broker_label: label, broker_email: p.email ?? null,
      maestro_broker_id: mid, connected: source === "broker_token", status: "ok",
      reason: unique.length === 0 ? "connected_but_api_returned_no_deposits" : null,
      http_status: 200, rows_count: unique.length, source,
      last_ok_at: new Date().toISOString(), last_attempt_at: attemptedAt,
    });
  }

  for (let i = 0; i < diagRows.length; i += 200) {
    await admin.from("planipret_commission_sync_diag")
      .upsert(diagRows.slice(i, i + 200), { onConflict: "broker_user_id" });
  }

  if (runId) {
    await admin.from("planipret_commission_sync_runs").update({
      finished_at: new Date().toISOString(),
      brokers_total: list.length,
      brokers_connected: connectedCount,
      rows_upserted: upserted,
      admin_token_used: adminTok.source !== "none",
    }).eq("id", runId);
  }

  return json({
    ok: true,
    cid,
    brokers_total: list.length,
    brokers_connected: connectedCount,
    rows_upserted: upserted,
    admin_scope: { configured: adminTok.source !== "none", source: adminTok.source, reason: adminTok.reason ?? null },
  });
});
