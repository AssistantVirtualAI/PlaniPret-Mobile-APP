import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getMaestroOAuthEnv, getUserMaestroAccessToken, fetchMaestroUserProfile } from "../_shared/maestro-oauth.ts";
import { fetchAllCommissionDeposits, type CommissionDeposit } from "../_shared/maestro-commissions-api.ts";

/**
 * Single entry point that feeds the commission register from Maestro's
 * OFFICIAL Commission Reports API (GET /api/main/commissions/reports/deposits).
 *
 * The dashboards always read `planipret_commission_register`; this function is
 * the only writer for the Maestro source.
 *
 * INCREMENTAL BY DEFAULT: re-pulling 2022→today for every broker means
 * hundreds of thousands of deposit rows on each run. Unless a full rebuild is
 * explicitly requested, each broker is fetched only from their own watermark
 * (the most recent `date_trans` already stored) minus a lookback window that
 * catches late-posted deposits and adjustments.
 *
 * POST {
 *   mode?: "self" | "all" | "brokers",   // "all"/"brokers" require a Planiprêt admin
 *   broker_ids?: string[],               // profile ids or user ids, for mode "brokers"
 *   years?: number[],                    // defaults to 2022..current year
 *   full?: boolean,                      // force a complete re-import (ignores watermarks)
 *   incremental?: boolean,               // defaults to true unless `full` is set
 *   lookback_days?: number,              // re-checked window before the watermark (default 45)
 *   dry_run?: boolean
 * }
 */

const START_YEAR = 2022;

/** Days re-fetched before each broker's watermark, to catch backdated deposits. */
const DEFAULT_LOOKBACK_DAYS = 45;

/** Tolerance (in dollars) below which an amount gap is considered a rounding artefact. */
const AMOUNT_TOLERANCE = 0.05;


type ReconRow = {
  run_id: string;
  profile_id: string | null;
  broker_user_id: string | null;
  broker_name: string;
  maestro_broker_id: string;
  fiscal_year: number;
  source_rows: number;
  source_amount: number;
  source_loan: number;
  db_rows: number;
  db_amount: number;
  db_loan: number;
  rows_diff: number;
  amount_diff: number;
  loan_diff: number;
  status: string;
  details: Record<string, unknown>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Compares, per fiscal year, what Maestro returned with what is actually stored
 * in `planipret_commission_register`, and persists the result so admins can
 * audit every import.
 *
 * `sinceDate` scopes the comparison to the window that was actually re-fetched:
 * on an incremental run the older stored rows were never requested from Maestro
 * and must not be reported as extras.
 */
async function reconcileBroker(
  admin: any,
  runId: string,
  prof: BrokerProfile,
  name: string,
  maestroId: string,
  rows: Array<Record<string, any>>,
  sinceDate: string | null = null,
): Promise<ReconRow[]> {

  const byYear = new Map<number, { rows: number; amount: number; loan: number; keys: Set<string> }>();
  for (const r of rows) {
    // Undated Maestro rows are never part of the totals.
    if (!r.date_trans) continue;
    const y = Number(r.fiscal_year);
    const agg = byYear.get(y) ?? { rows: 0, amount: 0, loan: 0, keys: new Set<string>() };
    agg.rows += 1;
    agg.amount += Number(r.amount) || 0;
    agg.loan += Number(r.loan_amt) || 0;
    agg.keys.add(String(r.row_key));
    byYear.set(y, agg);
  }

  const out: ReconRow[] = [];
  for (const [year, src] of byYear) {
    // Maestro rows can share a deal number: the register is keyed on row_key,
    // so the expected stored count is the number of DISTINCT keys.
    const expectedRows = src.keys.size;

    let storedQuery = admin
      .from("planipret_commission_register")
      .select("row_key, amount, loan_amt, date_trans")
      .eq("maestro_broker_id", maestroId)
      .eq("fiscal_year", year)
      .eq("sheet_name", "maestro");
    if (sinceDate) storedQuery = storedQuery.gte("date_trans", sinceDate);
    const { data: stored, error } = await storedQuery;

    // Only dated rows count: undated Maestro rows are stored for audit but excluded.
    const storedDated = error ? [] : (stored ?? []).filter((x: any) => !!x.date_trans);

    const dbRows = storedDated.length;
    const dbAmount = storedDated.reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0);
    const dbLoan = storedDated.reduce((s: number, x: any) => s + (Number(x.loan_amt) || 0), 0);
    const missing = error ? [] : [...src.keys].filter((k) => !storedDated.some((x: any) => x.row_key === k));

    const rowsDiff = dbRows - expectedRows;
    const amountDiff = round2(dbAmount - src.amount);
    const loanDiff = round2(dbLoan - src.loan);
    const status = error
      ? "error"
      : (missing.length || Math.abs(amountDiff) > AMOUNT_TOLERANCE || rowsDiff < 0)
        ? "mismatch"
        : "ok";

    out.push({
      run_id: runId,
      profile_id: prof.id ?? null,
      broker_user_id: (prof.user_id ?? null) as string | null,
      broker_name: name,
      maestro_broker_id: maestroId,
      fiscal_year: year,
      source_rows: expectedRows,
      source_amount: round2(src.amount),
      source_loan: round2(src.loan),
      db_rows: dbRows,
      db_amount: round2(dbAmount),
      db_loan: round2(dbLoan),
      rows_diff: rowsDiff,
      amount_diff: amountDiff,
      loan_diff: loanDiff,
      status,
      details: {
        duplicates_in_source: src.rows - expectedRows,
        missing_row_keys: missing.slice(0, 25),
        missing_count: missing.length,
        ...(error ? { db_error: error.message } : {}),
      },
    });
  }

  if (out.length) {
    await admin.from("planipret_commission_reconciliation").insert(out);
  }
  return out;
}

const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

type BrokerProfile = {
  id: string;
  user_id: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  maestro_broker_id: string | null;
};

const displayName = (p: BrokerProfile) =>
  String(p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(" ") ?? p.email ?? "Courtier").trim() || "Courtier";

/** Maps an official Maestro deposit row to a `planipret_commission_register` row. */
function mapDeposit(d: CommissionDeposit, i: number, prof: BrokerProfile, maestroId: string, fallbackYear: number) {
  const dateRaw = d.date_trans ? String(d.date_trans).slice(0, 10) : null;
  const date = dateRaw ? new Date(`${dateRaw}T00:00:00Z`) : null;
  const valid = date && !Number.isNaN(date.getTime());
  const brokerName = displayName(prof);
  const dealId = String(d.number ?? d.agent_name_id ?? `${i}`);
  // Gross commission = base + bonus + bonus2 + perform. Each bucket is its own
  // register row (keyed by type), but only the BASE row carries the loan volume
  // so the volume is never counted 2-4x.
  const ctype = String(d.commission_type ?? "base").trim().toLowerCase() || "base";
  const isBase = ctype === "base";
  // A deal can carry SEVERAL deposit rows of the same type (tranches, several
  // bonus payments, adjustments on different dates). The key must therefore
  // include the transaction date and the amount, otherwise those rows collapse
  // into one and both the volume and the deal count are understated.
  const amountKey = num(d.amount).toFixed(2);
  return {
    row_key: `maestro:${maestroId}:${dealId}:${ctype}:${dateRaw ?? "nodate"}:${amountKey}:${num(d.loan_amt).toFixed(2)}`,
    number: String(d.number ?? ""),
    loan_amt: isBase ? num(d.loan_amt) : 0,
    institution: String(d.institution ?? "").trim() || null,
    amount: num(d.amount),
    mortgage_type: String(d.mortgage_type ?? "").trim() || null,
    term: d.term == null ? null : String(d.term).trim(),
    agent_name: String(d.agent_name ?? brokerName).trim() || brokerName,
    target_name: String(d.target_name ?? brokerName).trim() || brokerName,
    date_trans: valid ? date!.toISOString().slice(0, 10) : null,
    commission_type: ctype,
    fiscal_year: valid ? date!.getUTCFullYear() : fallbackYear,
    ym_key: valid ? date!.toISOString().slice(0, 7) : null,
    broker_user_id: (prof.user_id ?? prof.id ?? null) as string | null,
    first_name: prof.first_name ?? null,
    last_name: prof.last_name ?? null,
    maestro_broker_id: maestroId,
    agent_key: brokerName.toLowerCase().replace(/\s+/g, " ").trim(),
    match_method: "maestro_sync",
    sheet_name: "maestro",
    source_row: i + 1,
    raw: d,
    map_status: valid ? "ok" : "missing_date",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const j = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body?.dry_run);
    const mode: "self" | "all" | "brokers" =
      body?.mode === "all" ? "all" : body?.mode === "brokers" ? "brokers" : "self";

    const nowYear = new Date().getUTCFullYear();
    const years: number[] = Array.isArray(body?.years) && body.years.length
      ? body.years.map((y: unknown) => Number(y)).filter((y: number) => Number.isFinite(y))
      : Array.from({ length: Math.max(1, nowYear - START_YEAR + 1) }, (_, i) => START_YEAR + i);
    const yearSet = new Set(years);
    const fallbackYear = Number(body?.fiscal_year) || nowYear;
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const fullDateFrom = `${minYear}-01-01 00:00:00`;
    const dateTo = `${maxYear}-12-31 23:59:59`;

    // Incremental unless a full rebuild is explicitly requested. This is what
    // keeps a routine run from re-downloading the entire 2022→today history
    // (300k+ deposit rows across all brokers) on every single sync.
    const forceFull = Boolean(body?.full) || body?.incremental === false;
    const incremental = !forceFull;
    const lookbackDays = Math.max(0, Number(body?.lookback_days ?? DEFAULT_LOOKBACK_DAYS) || 0);

    /**
     * Per-broker watermark: the most recent deposit date already stored, minus
     * the lookback window. Returns null when the broker has no history yet, in
     * which case the run falls back to the full range (first-time backfill).
     */
    const resolveSince = async (maestroId: string): Promise<string | null> => {
      if (!incremental) return null;
      const { data, error } = await admin
        .from("planipret_commission_register")
        .select("date_trans")
        .eq("maestro_broker_id", maestroId)
        .eq("sheet_name", "maestro")
        .not("date_trans", "is", null)
        .order("date_trans", { ascending: false })
        .limit(1)
        .maybeSingle();
      const watermark = error ? null : (data as any)?.date_trans ?? null;
      if (!watermark) return null;
      const d = new Date(`${String(watermark).slice(0, 10)}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return null;
      d.setUTCDate(d.getUTCDate() - lookbackDays);
      const since = d.toISOString().slice(0, 10);
      // Never reach further back than the requested year range.
      return since < `${minYear}-01-01` ? `${minYear}-01-01` : since;
    };


    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    // Scheduled runs authenticate with the service role key or the shared cron secret.
    const CRON_SECRET = Deno.env.get("PP_CRON_TOKEN") ?? Deno.env.get("PP_CRON_SECRET") ?? "";
    const cronHeader = req.headers.get("x-pp-cron-secret") ?? req.headers.get("x-cron-secret") ?? "";
    const isService = (!!token && token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
      || (!!CRON_SECRET && cronHeader === CRON_SECRET);
    if (!authHeader && !isService) return j({ success: false, error: "unauthorized", code: "unauthorized" }, 401);

    const { data: u } = isService ? { data: null as any } : await admin.auth.getUser(token);
    const callerId = isService ? null : (u?.user?.id ?? null);
    if (!isService && !callerId) return j({ success: false, error: "unauthorized", code: "unauthorized" }, 401);
    if (isService && mode === "self") return j({ success: false, error: "mode self requires a user", code: "bad_mode" }, 400);

    const SELECT = "id, user_id, full_name, first_name, last_name, email, maestro_broker_id";

    let targets: BrokerProfile[] = [];

    if (mode === "self") {
      const { data: prof } = await admin
        .from("planipret_profiles")
        .select(SELECT)
        .or(`user_id.eq.${callerId},id.eq.${callerId}`)
        .limit(1)
        .maybeSingle();
      if (!prof) return j({ success: false, error: "profil introuvable", code: "no_profile" });
      targets = [prof as BrokerProfile];
    } else {
      if (!isService) {
        const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: callerId });
        if (!isAdmin) return j({ success: false, error: "forbidden", code: "forbidden" }, 403);
      }

      let q = admin.from("planipret_profiles").select(SELECT);
      if (mode === "brokers") {
        const ids: string[] = (Array.isArray(body?.broker_ids) ? body.broker_ids : []).map((x: unknown) => String(x));
        if (!ids.length) return j({ success: false, error: "broker_ids requis", code: "no_brokers" }, 400);
        q = q.or(`id.in.(${ids.join(",")}),user_id.in.(${ids.join(",")})`);
      }
      const { data: rows, error } = await q;
      if (error) return j({ success: false, error: error.message }, 500);
      targets = (rows ?? []) as BrokerProfile[];
    }

    const runId = crypto.randomUUID();
    const reconciliation: ReconRow[] = [];
    let reconMismatches = 0;
    const report: Array<Record<string, unknown>> = [];
    const unlinked: string[] = [];
    let totalWritten = 0;
    let totalCandidates = 0;
    let anySuccess = false;

    for (const prof of targets) {
      const name = displayName(prof);
      const keyId = (prof.user_id ?? prof.id) as string | null;

      // 1. Broker must have a live Maestro OAuth token.
      const oauthToken = keyId ? await getUserMaestroAccessToken(admin, keyId).catch(() => null) : null;
      if (!oauthToken) {
        unlinked.push(name);
        report.push({ broker: name, profile_id: prof.id, code: "maestro_not_connected", written: 0 });
        continue;
      }

      // 2. Always re-resolve the Maestro users_id from /user (the official
      // Commission API's users_id is the telecom/internal id, e.g. 93135 — NOT
      // the CRM id that may be cached on the profile).
      let maestroId: string | null = null;
      try {
        const me = await fetchMaestroUserProfile(getMaestroOAuthEnv(), oauthToken);
        const mid = (me as any)?.id ?? (me as any)?.user?.id ?? (me as any)?.user_id ?? null;
        if (mid && /^\d+$/.test(String(mid))) {
          maestroId = String(mid);
          await admin.from("planipret_profiles")
            .update({ maestro_broker_id: maestroId, maestro_connected: true })
            .eq("id", prof.id);
        }
      } catch { /* not connected */ }


      if (!maestroId || !/^\d+$/.test(maestroId)) {
        unlinked.push(name);
        report.push({ broker: name, profile_id: prof.id, code: "maestro_not_connected", written: 0 });
        continue;
      }

      // 3. Fetch the official commission deposit rows for this broker.
      // Incremental runs start at the broker's own watermark, so only the new
      // (and recently adjusted) deposits travel over the wire.
      const since = await resolveSince(maestroId);
      const dateFrom = since ? `${since} 00:00:00` : fullDateFrom;
      const r = await fetchAllCommissionDeposits({
        token: oauthToken,
        usersId: maestroId,
        dateFrom,
        dateTo,
        perPage: 100,
        maxPages: 80,
      });

      if (!r.ok) {
        report.push({ broker: name, profile_id: prof.id, code: "api_error", status: r.status, error: r.error, written: 0 });
        continue;
      }
      anySuccess = true;

      const mapped = r.rows
        .map((d, i) => mapDeposit(d, i, prof, maestroId!, fallbackYear))
        .filter((row) => yearSet.has(row.fiscal_year));
      // The key now includes date + amount, so a collision is an EXACT repeat of
      // the same deposit line: keep it once (workbook rule), never sum it.
      const dedup = new Map<string, typeof mapped[number]>();
      for (const row of mapped) {
        if (!dedup.has(row.row_key)) dedup.set(row.row_key, row);
      }
      const rows = [...dedup.values()];
      totalCandidates += rows.length;


      if (dryRun) {
        report.push({ broker: name, profile_id: prof.id, users_id: maestroId, candidates: rows.length, written: 0 });
        continue;
      }

      let written = 0;
      let failed: string | null = null;
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error } = await admin
          .from("planipret_commission_register")
          .upsert(chunk, { onConflict: "row_key" });
        if (error) { failed = error.message; break; }
        written += chunk.length;
      }
      totalWritten += written;

      // 3b. Drop legacy/stale Maestro rows for this broker (e.g. rows imported
      // before commission_type was part of the key) so nothing is double counted.
      // IMPORTANT: only prune within the scope we actually re-fetched in full —
      // the commission buckets that returned OK, the fiscal years we asked for,
      // and (on an incremental run) the date window starting at the watermark.
      // A partial fetch (failed bucket or paginated truncation) must never
      // delete rows it simply did not see.
      const fullFetch = !r.truncated && (r.failedTypes ?? []).length === 0;
      const prunableTypes = (r.okTypes ?? []).filter(Boolean);
      if (!failed && rows.length && fullFetch && prunableTypes.length) {
        const keep = new Set(rows.map((r) => r.row_key));
        let existingQuery = admin
          .from("planipret_commission_register")
          .select("row_key, commission_type, fiscal_year")
          .eq("maestro_broker_id", maestroId)
          .eq("sheet_name", "maestro")
          .in("commission_type", prunableTypes)
          .in("fiscal_year", [...yearSet]);
        if (since) existingQuery = existingQuery.gte("date_trans", since);
        const { data: existing } = await existingQuery;
        const stale = (existing ?? [])
          .filter((x: any) => !keep.has(String(x.row_key)))
          .map((x: any) => String(x.row_key));
        for (let i = 0; i < stale.length; i += 200) {
          await admin.from("planipret_commission_register").delete().in("row_key", stale.slice(i, i + 200));
        }
      }


      // 4. Post-import reconciliation: Maestro totals vs what is stored in DB.
      const recon = await reconcileBroker(admin, runId, prof, name, maestroId, rows, since);
      reconciliation.push(...recon);
      if (recon.some((r) => r.status !== "ok")) reconMismatches += recon.filter((r) => r.status !== "ok").length;

      report.push({
        broker: name, profile_id: prof.id, users_id: maestroId, written,
        mode: since ? "incremental" : "full",
        since,
        rows_by_type: (r as any).byType ?? null,

        reconciliation: recon.map((r) => ({
          year: r.fiscal_year, source_rows: r.source_rows, db_rows: r.db_rows,
          amount_diff: r.amount_diff, status: r.status,
        })),
        ...(failed ? { error: failed } : {}),
      });
    }

    if (!anySuccess) {
      return j({
        success: false,
        code: "no_data",
        error: "Aucune donnée de commission récupérée depuis Maestro.",
        mode, brokers: targets.length, unlinked, report, written: 0,
      });
    }

    return j({
      success: true,
      source: "maestro",
      mode,
      dry_run: dryRun,
      years,
      brokers: targets.length,
      candidates: totalCandidates,
      written: totalWritten,
      unlinked,
      report,
      run_id: runId,
      reconciliation: {
        checked: reconciliation.length,
        mismatches: reconMismatches,
        status: reconMismatches ? "mismatch" : "ok",
        rows: reconciliation,
      },
      synced_at: new Date().toISOString(),
    });

  } catch (e: any) {
    console.error("pp-maestro-commissions-sync error", e);
    return j({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
