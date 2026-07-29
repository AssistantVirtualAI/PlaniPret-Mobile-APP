// maestro-cdr-retry-job — background worker for the Maestro CDR retry queue.
//
// POST body (all optional): { limit?: number, sweep?: boolean, dry_run?: boolean }
//
// 1. Sweep: finds calls whose recording upload was skipped because
//    `maestro_call_id_missing` (or that simply have no `maestro_call_id`) and
//    enqueues them in `planipret_maestro_cdr_retries`.
// 2. Drain: replays `maestro-cdr` for every due `pending` entry. Each failure
//    reschedules with exponential backoff until `abandoned`; each success marks
//    `succeeded` and re-triggers the recording upload.
//
// Intended to be called by a cron job every 5 minutes.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { CDR_MAX_ATTEMPTS, CDR_RETRY_TABLE } from "../_shared/maestro-cdr-retry.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({} as any));
  const limit = Math.min(50, Math.max(1, Number(body?.limit ?? 15)));
  const dryRun = body?.dry_run === true;
  const doSweep = body?.sweep !== false;

  const enqueued: string[] = [];
  const processed: Array<Record<string, unknown>> = [];

  try {
    // ── 1. Sweep: recording uploads blocked by a missing maestro_call_id ────
    if (doSweep) {
      const candidates = new Map<string, string | null>();

      const { data: skipped } = await admin
        .from("planipret_recording_uploads")
        .select("call_id, user_id, status, error_message")
        .eq("status", "skipped")
        .order("updated_at", { ascending: false })
        .limit(200);
      for (const r of skipped ?? []) {
        const msg = String((r as any).error_message ?? "");
        if (msg.includes("maestro_call_id") || msg.includes("no_upload_endpoint")) {
          candidates.set((r as any).call_id, (r as any).user_id ?? null);
        }
      }

      // Calls with a recording but no Maestro call id yet (last 7 days).
      const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const { data: orphans } = await admin
        .from("planipret_phone_calls")
        .select("id, user_id, maestro_call_id, recording_url, started_at")
        .is("maestro_call_id", null)
        .not("recording_url", "is", null)
        .gte("started_at", since)
        .limit(200);
      for (const c of orphans ?? []) candidates.set((c as any).id, (c as any).user_id ?? null);

      if (candidates.size) {
        const ids = [...candidates.keys()];
        // Skip the ones already synced or already tracked as succeeded.
        const { data: calls } = await admin
          .from("planipret_phone_calls")
          .select("id, maestro_call_id")
          .in("id", ids);
        const synced = new Set((calls ?? []).filter((c: any) => c.maestro_call_id).map((c: any) => c.id));
        const { data: tracked } = await admin
          .from(CDR_RETRY_TABLE)
          .select("call_id, status")
          .in("call_id", ids);
        const known = new Map((tracked ?? []).map((t: any) => [t.call_id, t.status]));

        for (const [callId, userId] of candidates) {
          if (synced.has(callId)) continue;
          const st = known.get(callId);
          if (st === "pending" || st === "succeeded" || st === "abandoned") continue;
          enqueued.push(callId);
          if (!dryRun) {
            await admin.from(CDR_RETRY_TABLE).upsert({
              call_id: callId,
              user_id: userId,
              attempts: 0,
              max_attempts: CDR_MAX_ATTEMPTS,
              next_attempt_at: new Date().toISOString(),
              status: "pending",
              last_reason: "recording_upload_blocked_maestro_call_id_missing",
              updated_at: new Date().toISOString(),
            }, { onConflict: "call_id" });
          }
        }
      }
      console.log(`[cdr-retry-job] sweep enqueued=${enqueued.length}`);
    }

    // ── 2. Drain the due queue ─────────────────────────────────────────────
    const { data: due } = await admin
      .from(CDR_RETRY_TABLE)
      .select("call_id, user_id, attempts, max_attempts, status")
      .eq("status", "pending")
      .lte("next_attempt_at", new Date().toISOString())
      .order("next_attempt_at", { ascending: true })
      .limit(limit);

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    for (const row of due ?? []) {
      const callId = (row as any).call_id as string;
      if (dryRun) { processed.push({ call_id: callId, dry_run: true }); continue; }

      // Already synced meanwhile → close it out.
      const { data: call } = await admin
        .from("planipret_phone_calls")
        .select("id, maestro_call_id, maestro_synced")
        .eq("id", callId)
        .maybeSingle();
      if (!call) {
        await admin.from(CDR_RETRY_TABLE).update({
          status: "abandoned",
          last_reason: "call_deleted",
          abandoned_at: new Date().toISOString(),
        }).eq("call_id", callId);
        processed.push({ call_id: callId, final: "abandoned", reason: "call_deleted" });
        continue;
      }
      if ((call as any).maestro_call_id) {
        await admin.from(CDR_RETRY_TABLE).update({
          status: "succeeded",
          succeeded_at: new Date().toISOString(),
          last_reason: "already_synced",
        }).eq("call_id", callId);
        fetch(`${supaUrl}/functions/v1/maestro-recording-upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${svc}` },
          body: JSON.stringify({ call_id: callId, force: true }),
        }).catch(() => {});
        processed.push({ call_id: callId, final: "succeeded", reason: "already_synced" });
        continue;
      }

      // maestro-cdr refuses already-synced calls, so reset the flag first.
      await admin.from("planipret_phone_calls").update({ maestro_synced: false }).eq("id", callId);

      const t0 = Date.now();
      let out: any = null;
      try {
        const r = await fetch(`${supaUrl}/functions/v1/maestro-cdr`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${svc}` },
          body: JSON.stringify({ call_id: callId }),
        });
        out = await r.json().catch(() => null);
      } catch (e) {
        out = { success: false, error: (e as Error)?.message ?? "fetch_failed" };
      }

      // maestro-cdr itself schedules the next attempt / abandons the entry.
      const { data: after } = await admin
        .from(CDR_RETRY_TABLE)
        .select("status, attempts, next_attempt_at, last_reason")
        .eq("call_id", callId)
        .maybeSingle();

      processed.push({
        call_id: callId,
        ms: Date.now() - t0,
        success: !!out?.success,
        error: out?.error ?? null,
        final: (after as any)?.status ?? "pending",
        attempts: (after as any)?.attempts ?? null,
        next_attempt_at: (after as any)?.next_attempt_at ?? null,
        reason: (after as any)?.last_reason ?? null,
      });
      console.log(`[cdr-retry-job] call=${callId} success=${!!out?.success} final=${(after as any)?.status ?? "pending"}`);
    }

    return json({
      ok: true,
      enqueued: enqueued.length,
      enqueued_ids: enqueued.slice(0, 25),
      processed_count: processed.length,
      processed,
    });
  } catch (e) {
    console.error("[cdr-retry-job] fatal", e);
    return json({ ok: false, error: (e as Error)?.message ?? "server_error" }, 500);
  }
});
