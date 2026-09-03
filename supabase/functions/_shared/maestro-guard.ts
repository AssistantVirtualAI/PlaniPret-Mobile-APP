/**
 * Guard rails for every Maestro call-scoped write.
 *
 * The `maestro_put_404` / `maestro_404` storms came from stale or foreign
 * `maestro_call_id` values: once a local call stored an id Maestro does not
 * own, every downstream PUT (recording, AI summary, transcript) retried the
 * same dead id forever.
 *
 * `ensureMaestroCall()` is the single entry point downstream functions must
 * use before touching `/calls/{id}`:
 *   1. verify the stored id still exists in Maestro (GET),
 *   2. invalidate + release the dedupe claim when it does not,
 *   3. re-run `maestro-cdr` once to recreate the record,
 *   4. give up permanently after MAX_STRIKES so nothing loops.
 *
 * Every step is logged with a shared correlation id (call id based) so a
 * failure can be traced end to end in `planipret_pipeline_logs`.
 */
import {
  getMaestroConfig,
  maestroFetch,
  pipelineLog,
  telecomAuth,
} from "./maestro.ts";

const MAX_STRIKES = 3;

export function callCorrelationId(callId: string): string {
  return `call_${callId}`;
}

export interface EnsureResult {
  ok: boolean;
  maestroCallId: string | null;
  brokerId: string | null;
  token?: string | null;
  reason?: string;
  permanent?: boolean;
  strikes?: number;
}

async function bumpStrikes(admin: any, call: any, reason: string): Promise<number> {
  const meta = (call.metadata ?? {}) as Record<string, unknown>;
  const strikes = Number(meta.maestro_404_strikes ?? 0) + 1;
  await admin
    .from("planipret_phone_calls")
    .update({
      maestro_call_id: null,
      maestro_synced: false,
      metadata: { ...meta, maestro_404_strikes: strikes, maestro_404_reason: reason, maestro_404_at: new Date().toISOString() },
    })
    .eq("id", call.id);
  // Release the dedupe claim so the CDR publisher can recreate the record.
  try {
    await admin.from("planipret_maestro_call_dedupe").delete().eq("local_call_id", call.id);
  } catch (_e) { /* dedupe row may not exist */ }
  return strikes;
}

async function runCdr(callId: string): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) return;
  try {
    await fetch(`${url}/functions/v1/maestro-cdr`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ call_id: callId, force: true }),
    });
  } catch (e) {
    console.warn("[maestro-guard] cdr retrigger failed", e);
  }
}

/**
 * Returns a Maestro call id that is guaranteed to exist server-side, or
 * `ok:false` with the reason the caller must not proceed.
 */
export async function ensureMaestroCall(
  admin: any,
  args: { callId: string; step: string; allowCreate?: boolean },
): Promise<EnsureResult> {
  const correlation_id = callCorrelationId(args.callId);
  const { data: call } = await admin
    .from("planipret_phone_calls")
    .select("id, user_id, maestro_call_id, metadata")
    .eq("id", args.callId)
    .maybeSingle();
  if (!call) return { ok: false, maestroCallId: null, brokerId: null, reason: "call_not_found", permanent: true };

  const meta = (call.metadata ?? {}) as Record<string, unknown>;
  const strikes = Number(meta.maestro_404_strikes ?? 0);
  if (strikes >= MAX_STRIKES) {
    await pipelineLog(admin, {
      call_id: call.id, user_id: call.user_id, step: args.step, status: "skipped",
      error_message: "maestro_call_unrecoverable", correlation_id, entity_type: "call",
      payload: { strikes },
    });
    return { ok: false, maestroCallId: null, brokerId: null, reason: "maestro_call_unrecoverable", permanent: true, strikes };
  }

  const cfg = await getMaestroConfig(admin);
  const auth = await telecomAuth(admin, call.user_id ?? "", false);
  if (!cfg.url || !auth.brokerId) {
    return { ok: false, maestroCallId: null, brokerId: auth.brokerId ?? null, reason: "maestro_auth_missing" };
  }

  const verify = async (id: string) => {
    const path = `/api/v1/users/${encodeURIComponent(String(auth.brokerId))}/calls/${encodeURIComponent(String(id))}`;
    const r: any = await maestroFetch(cfg, { method: "GET", path, token: auth.token, machine: auth.machine });
    await pipelineLog(admin, {
      call_id: call.id, user_id: call.user_id, step: `${args.step}_verify`,
      status: r.ok ? "success" : "error", correlation_id, entity_type: "call", entity_id: String(id),
      endpoint: path, http_status: r.status, error_message: r.ok ? undefined : `maestro_${r.status}`,
    });
    return r;
  };

  let id: string | null = call.maestro_call_id ?? null;

  if (id) {
    const r = await verify(id);
    if (r.ok) return { ok: true, maestroCallId: String(id), brokerId: String(auth.brokerId), token: auth.token };
    if (r.status !== 404) {
      // Transient (5xx/429): let the caller retry later without burning a strike.
      return { ok: false, maestroCallId: String(id), brokerId: String(auth.brokerId), reason: `maestro_${r.status}` };
    }
    const n = await bumpStrikes(admin, call, "verify_404");
    id = null;
    if (n >= MAX_STRIKES || args.allowCreate === false) {
      return { ok: false, maestroCallId: null, brokerId: String(auth.brokerId), reason: "maestro_call_missing", permanent: n >= MAX_STRIKES, strikes: n };
    }
  }

  if (args.allowCreate === false) {
    return { ok: false, maestroCallId: null, brokerId: String(auth.brokerId), reason: "maestro_call_id_missing" };
  }

  // Recreate the Maestro record, then re-read the freshly stored id.
  await runCdr(call.id);
  const { data: after } = await admin
    .from("planipret_phone_calls")
    .select("maestro_call_id")
    .eq("id", call.id)
    .maybeSingle();
  const fresh = after?.maestro_call_id ?? null;
  if (!fresh) {
    await pipelineLog(admin, {
      call_id: call.id, user_id: call.user_id, step: args.step, status: "error",
      error_message: "maestro_call_id_missing_after_cdr", correlation_id, entity_type: "call",
    });
    return { ok: false, maestroCallId: null, brokerId: String(auth.brokerId), reason: "maestro_call_id_missing_after_cdr" };
  }
  const r2 = await verify(fresh);
  if (!r2.ok) {
    return { ok: false, maestroCallId: String(fresh), brokerId: String(auth.brokerId), reason: `maestro_${r2.status}` };
  }
  return { ok: true, maestroCallId: String(fresh), brokerId: String(auth.brokerId), token: auth.token };
}
