// Retry-with-backoff bookkeeping for the Maestro CDR push (`call.cdr`).
//
// State machine (table `planipret_maestro_cdr_retries`):
//   pending   → the CDR failed and another attempt is scheduled
//   succeeded → the CDR reached Maestro and `maestro_call_id` is known
//   abandoned → max attempts exhausted, no further automatic retry
//
// The recording upload depends on `maestro_call_id`, so as soon as a retry
// succeeds we trigger `maestro-recording-upload` again.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const CDR_RETRY_TABLE = "planipret_maestro_cdr_retries";
export const CDR_MAX_ATTEMPTS = 6;

/** Backoff schedule in minutes, indexed by attempt count already made. */
const BACKOFF_MIN = [1, 5, 15, 60, 180, 360];

export function cdrBackoffMs(attempts: number): number {
  const m = BACKOFF_MIN[Math.min(attempts, BACKOFF_MIN.length - 1)];
  const jitter = Math.floor(Math.random() * 30_000);
  return m * 60_000 + jitter;
}

export interface CdrRetryState {
  status: "pending" | "succeeded" | "abandoned";
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  reason?: string | null;
}

/**
 * Record a CDR failure and schedule the next attempt (or abandon).
 * Returns the resulting final/intermediate state so the caller can surface it.
 */
export async function scheduleCdrRetry(
  admin: SupabaseClient,
  args: {
    call_id: string;
    user_id?: string | null;
    reason: string;
    error?: string | null;
    status?: number | null;
    permanent?: boolean;
  },
): Promise<CdrRetryState> {
  const { data: existing } = await admin
    .from(CDR_RETRY_TABLE)
    .select("id, attempts, max_attempts, status")
    .eq("call_id", args.call_id)
    .maybeSingle();

  const attempts = (existing?.attempts ?? 0) + 1;
  const maxAttempts = existing?.max_attempts ?? CDR_MAX_ATTEMPTS;
  // A "permanent" failure (bad payload, 4xx that will never change) still gets
  // a couple of retries because most of them are caused by a missing broker id
  // that an admin can fix from the Telecom Mapping screen.
  const cap = args.permanent ? Math.min(3, maxAttempts) : maxAttempts;
  const exhausted = attempts >= cap;
  const next = exhausted ? null : new Date(Date.now() + cdrBackoffMs(attempts)).toISOString();
  const status: CdrRetryState["status"] = exhausted ? "abandoned" : "pending";

  const row = {
    call_id: args.call_id,
    user_id: args.user_id ?? null,
    attempts,
    max_attempts: maxAttempts,
    next_attempt_at: next ?? new Date().toISOString(),
    status,
    last_error: args.error ?? args.reason,
    last_status: args.status ?? null,
    last_reason: args.reason,
    abandoned_at: exhausted ? new Date().toISOString() : null,
    succeeded_at: null,
    updated_at: new Date().toISOString(),
  };

  await admin.from(CDR_RETRY_TABLE).upsert(row, { onConflict: "call_id" });

  console.warn(
    `[maestro-cdr.retry] call=${args.call_id} attempt=${attempts}/${cap} reason=${args.reason} ` +
      `status=${status} next=${next ?? "none"}`,
  );

  return { status, attempts, max_attempts: cap, next_attempt_at: next, reason: args.reason };
}

/** Mark the CDR as finally synced and kick the dependent recording upload. */
export async function markCdrRetrySucceeded(
  admin: SupabaseClient,
  call_id: string,
  maestro_call_id: string | null,
): Promise<void> {
  try {
    const { data: existing } = await admin
      .from(CDR_RETRY_TABLE)
      .select("id, attempts")
      .eq("call_id", call_id)
      .maybeSingle();
    if (existing) {
      await admin
        .from(CDR_RETRY_TABLE)
        .update({
          status: "succeeded",
          succeeded_at: new Date().toISOString(),
          last_error: null,
          last_reason: "cdr_synced",
          updated_at: new Date().toISOString(),
        })
        .eq("call_id", call_id);
      console.log(`[maestro-cdr.retry] call=${call_id} SUCCEEDED after ${existing.attempts} retries`);
    }
  } catch (e) {
    console.warn("[maestro-cdr.retry] mark success failed", (e as Error)?.message);
  }

  if (!maestro_call_id) return;
  // The recording upload was likely skipped with `maestro_call_id_missing` —
  // now that we have the id, retrigger it.
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    fetch(`${url}/functions/v1/maestro-recording-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ call_id, force: true }),
    }).catch(() => {});
  } catch { /* ignore */ }
}
