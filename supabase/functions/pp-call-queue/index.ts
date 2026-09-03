// pp-call-queue — idempotent job queue for the Maestro call chain.
//
// POST { action: "enqueue" | "process" | "status", call_id?, deal_id?, step?, force? }
//
// enqueue  → inserts a job with idempotency_key = call_id (or deal_id) + step.
//            Duplicate enqueues are no-ops (UPSERT keeps the first row).
// process  → bounded batch: acquires a single-flight lease, picks up to
//            BATCH_SIZE pending jobs, runs maestro-sync-call for each, marks
//            done / error-with-backoff, and pauses the whole queue on 402/403.
// status   → returns queue depth + circuit-breaker state.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BATCH_SIZE = 8;
const LEASE_MS = 90_000; // 90 s single-flight lease
const MAX_BACKOFF_S = 3600; // cap at 1 h
const JOB_NAME = "pp-call-queue";

const CRON_SECRET = Deno.env.get("PP_CRON_TOKEN") ?? Deno.env.get("PP_CRON_SECRET") ?? "";

/** Exponential backoff: 30 s, 1 m, 5 m, 15 m, 30 m … capped at MAX_BACKOFF_S. */
function backoffSeconds(attempts: number): number {
  const base = 30 * Math.pow(2, Math.min(attempts - 1, 6));
  return Math.min(base + Math.floor(Math.random() * 15), MAX_BACKOFF_S);
}

async function invokeSync(callId: string, force?: boolean) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/maestro-sync-call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ call_id: callId, force: !!force }),
    });
    const data = await res.json().catch(() => ({} as any));
    return { ok: res.ok && (data as any)?.success !== false, status: res.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: e?.message ?? "invoke_failed" } };
  }
}

/** Try to acquire a single-flight lease. Returns true if acquired. */
async function acquireLease(admin: any): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: state } = await admin
    .from("planipret_job_state")
    .select("status, locked_until, paused_reason")
    .eq("job_name", JOB_NAME)
    .maybeSingle();

  if (state?.status === "paused") return false;
  if (state?.locked_until && new Date(state.locked_until) > new Date(now)) return false;

  const lockedBy = crypto.randomUUID().slice(0, 8);
  const lockedUntil = new Date(Date.now() + LEASE_MS).toISOString();
  const { error } = await admin
    .from("planipret_job_state")
    .upsert(
      { job_name: JOB_NAME, locked_until: lockedUntil, locked_by: lockedBy, last_run_at: now, updated_at: now },
      { onConflict: "job_name" },
    );
  if (error) return false;

  // Re-read to confirm we won the lease (optimistic locking).
  const { data: after } = await admin
    .from("planipret_job_state")
    .select("locked_by")
    .eq("job_name", JOB_NAME)
    .maybeSingle();
  return after?.locked_by === lockedBy;
}

async function releaseLease(admin: any, paused?: boolean, reason?: string) {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { locked_until: null, locked_by: null, updated_at: now };
  if (paused) {
    patch.status = "paused";
    patch.paused_reason = reason ?? "circuit_breaker";
    patch.paused_at = now;
  }
  await admin.from("planipret_job_state").update(patch).eq("job_name", JOB_NAME);
}

async function pauseQueue(admin: any, reason: string) {
  const now = new Date().toISOString();
  await admin
    .from("planipret_job_state")
    .upsert(
      { job_name: JOB_NAME, status: "paused", paused_reason: reason, paused_at: now, locked_until: null, locked_by: null, updated_at: now },
      { onConflict: "job_name" },
    );
}

// ── Enqueue ──────────────────────────────────────────────
async function doEnqueue(admin: any, body: any) {
  const callId = body?.call_id ?? null;
  const dealId = body?.deal_id ?? null;
  const step = body?.step ?? "full_sync";
  if (!callId && !dealId) return json({ error: "call_id_or_deal_id_required" }, 400);

  const idemKey = [callId ?? dealId, step].join(":");
  const { error } = await admin
    .from("planipret_call_job_queue")
    .upsert(
      {
        idempotency_key: idemKey,
        call_id: callId,
        deal_id: dealId,
        step,
        status: "pending",
        next_run_at: new Date().toISOString(),
        payload: body?.payload ?? {},
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    );
  if (error) return json({ error: error.message }, 500);
  return json({ success: true, idempotency_key: idemKey, enqueued: true });
}

// ── Process ──────────────────────────────────────────────
async function doProcess(admin: any) {
  // Paused-state guard
  const { data: state0 } = await admin
    .from("planipret_job_state")
    .select("status, paused_reason, paused_at, locked_until")
    .eq("job_name", JOB_NAME)
    .maybeSingle();

  if (state0?.status === "paused") {
    // Probe: process at most one job to detect recovery.
    return await probeAndMaybeResume(admin);
  }

  if (!(await acquireLease(admin))) {
    return json({ success: true, skipped: "lease_busy" });
  }

  try {
    const now = new Date().toISOString();
    const { data: jobs } = await admin
      .from("planipret_call_job_queue")
      .select("id, call_id, deal_id, step, attempts, max_attempts, payload")
      .eq("status", "pending")
      .lte("next_run_at", now)
      .is("locked_until", null)
      .order("next_run_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (!jobs || jobs.length === 0) {
      await releaseLease(admin);
      return json({ success: true, processed: 0, idle: true });
    }

    // Lock the batch atomically.
    const ids = jobs.map((j: any) => j.id);
    const lockedUntil = new Date(Date.now() + LEASE_MS).toISOString();
    const lockedBy = crypto.randomUUID().slice(0, 8);
    await admin
      .from("planipret_call_job_queue")
      .update({ locked_until: lockedUntil, locked_by: lockedBy })
      .in("id", ids);

    let done = 0;
    let retried = 0;
    let dead = 0;
    let circuitBreaker = false;

    for (const job of jobs) {
      // Idempotency: skip if already done by a concurrent run.
      const { data: fresh } = await admin
        .from("planipret_call_job_queue")
        .select("status")
        .eq("id", job.id)
        .maybeSingle();
      if (fresh?.status === "done") continue;

      const result = await invokeSync(String(job.call_id), job.payload?.force);

      // Circuit breaker on 402 / 403.
      if (result.status === 402 || result.status === 403) {
        circuitBreaker = true;
        await admin
          .from("planipret_call_job_queue")
          .update({
            status: "pending",
            attempts: job.attempts + 1,
            next_run_at: new Date(Date.now() + MAX_BACKOFF_S * 1000).toISOString(),
            locked_until: null,
            locked_by: null,
            error_message: result.data?.error ?? `http_${result.status}`,
            http_status: result.status,
          })
          .eq("id", job.id);
        break;
      }

      if (result.ok) {
        await admin
          .from("planipret_call_job_queue")
          .update({
            status: "done",
            attempts: job.attempts + 1,
            locked_until: null,
            locked_by: null,
            result: result.data,
          })
          .eq("id", job.id);
        done++;
      } else {
        const attempts = job.attempts + 1;
        if (attempts >= job.max_attempts) {
          await admin
            .from("planipret_call_job_queue")
            .update({
              status: "dead",
              attempts,
              locked_until: null,
              locked_by: null,
              error_message: result.data?.error ?? "max_attempts_reached",
              http_status: result.status,
              result: result.data,
            })
            .eq("id", job.id);
          dead++;
        } else {
          const delay = backoffSeconds(attempts);
          await admin
            .from("planipret_call_job_queue")
            .update({
              status: "pending",
              attempts,
              next_run_at: new Date(Date.now() + delay * 1000).toISOString(),
              locked_until: null,
              locked_by: null,
              error_message: result.data?.error ?? `http_${result.status}`,
              http_status: result.status,
            })
            .eq("id", job.id);
          retried++;
        }
      }
    }

    if (circuitBreaker) {
      await pauseQueue(admin, `http_402_or_403`);
      return json({ success: false, paused: true, done, retried, dead, reason: "circuit_breaker" });
    }

    await releaseLease(admin);
    return json({ success: true, processed: done + retried + dead, done, retried, dead, batch: jobs.length });
  } catch (e: any) {
    await releaseLease(admin);
    return json({ success: false, error: e?.message ?? "process_failed" }, 500);
  }
}

/** While paused, process at most one probe job. If it succeeds, resume. */
async function probeAndMaybeResume(admin: any) {
  const now = new Date().toISOString();
  const { data: job } = await admin
    .from("planipret_call_job_queue")
    .select("id, call_id, attempts, max_attempts, payload")
    .eq("status", "pending")
    .lte("next_run_at", now)
    .is("locked_until", null)
    .order("next_run_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!job) return json({ success: true, paused: true, probe: false, idle: true });

  const result = await invokeSync(String(job.call_id), job.payload?.force);

  if (result.ok) {
    // Probe succeeded — resume the queue.
    await admin
      .from("planipret_call_job_queue")
      .update({ status: "done", attempts: job.attempts + 1, locked_until: null, locked_by: null, result: result.data })
      .eq("id", job.id);
    await admin
      .from("planipret_job_state")
      .update({ status: "active", paused_reason: null, paused_at: null, locked_until: null, locked_by: null, updated_at: new Date().toISOString() })
      .eq("job_name", JOB_NAME);
    return json({ success: true, probe: true, resumed: true });
  }

  // Probe failed — stay paused.
  await admin
    .from("planipret_call_job_queue")
    .update({
      status: "pending",
      attempts: job.attempts + 1,
      next_run_at: new Date(Date.now() + MAX_BACKOFF_S * 1000).toISOString(),
      locked_until: null,
      locked_by: null,
      error_message: result.data?.error ?? "probe_failed",
      http_status: result.status,
    })
    .eq("id", job.id);
  return json({ success: true, paused: true, probe: false, reason: "probe_failed" });
}

// ── Status ──────────────────────────────────────────────
async function doStatus(admin: any) {
  const { data: state } = await admin
    .from("planipret_job_state")
    .select("status, paused_reason, paused_at, last_run_at, updated_at")
    .eq("job_name", JOB_NAME)
    .maybeSingle();

  const { count: pending } = await admin
    .from("planipret_call_job_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  const { count: dead } = await admin
    .from("planipret_call_job_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "dead");

  const { count: done } = await admin
    .from("planipret_call_job_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "done");

  return json({
    success: true,
    state: state?.status ?? "active",
    paused_reason: state?.paused_reason ?? null,
    paused_at: state?.paused_at ?? null,
    last_run_at: state?.last_run_at ?? null,
    queue: { pending: pending ?? 0, dead: dead ?? 0, done: done ?? 0 },
  });
}

// ── Resume (admin) ──────────────────────────────────────
async function doResume(admin: any) {
  await admin
    .from("planipret_job_state")
    .upsert(
      { job_name: JOB_NAME, status: "active", paused_reason: null, paused_at: null, locked_until: null, locked_by: null, updated_at: new Date().toISOString() },
      { onConflict: "job_name" },
    );
  return json({ success: true, resumed: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Auth: cron secret, service role, or planipret admin.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const isCron = !!CRON_SECRET && req.headers.get("x-pp-cron-secret") === CRON_SECRET;
  const isService = !!token && token === SERVICE_ROLE;

  if (!isCron && !isService) {
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: ok } = await admin.rpc("is_planipret_admin", { _user_id: u.user.id });
    const { data: okSuper } = await admin.rpc("is_super_admin", { _user_id: u.user.id });
    if (!ok && !okSuper) return json({ error: "forbidden" }, 403);
  }

  const body = await req.json().catch(() => ({}) as any);
  const action = body?.action ?? "status";

  switch (action) {
    case "enqueue":
      return await doEnqueue(admin, body);
    case "process":
      return await doProcess(admin);
    case "status":
      return await doStatus(admin);
    case "resume":
      return await doResume(admin);
    default:
      return json({ error: "unknown_action", action }, 400);
  }
});
